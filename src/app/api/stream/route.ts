import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sseEmitter } from "@/lib/emitter";

export const dynamic = "force-dynamic";

/**
 * Server-sent events for live task updates.
 *
 * Auth: requires a valid session. `EventSource` sends cookies on same-origin
 * requests, so the browser client authenticates implicitly; an unauthenticated
 * caller now gets a 401 instead of an open stream.
 *
 * WARNING for whoever wires up the first real emitter: this endpoint
 * broadcasts `task_update` to EVERY connected listener. Payloads must already
 * be scoped to what the receiving session is allowed to see, exactly like
 * every other route in this app - never emit a raw task row.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const encoder = new TextEncoder();
  let finish = () => {};

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let interval: ReturnType<typeof setInterval> | undefined;
      let onEvent: (data: unknown) => void = () => {};
      // Realtime invalidation envelopes from src/lib/realtime.ts — model names only, never rows,
      // so broadcasting them to every signed-in session is safe.
      let onChange: (data: unknown) => void = () => {};

      // Idempotent teardown, shared by the abort listener, the enqueue failure
      // paths and cancel(). Guarded so a double disconnect cannot throw.
      const stop = () => {
        if (closed) return;
        closed = true;
        if (interval) clearInterval(interval);
        sseEmitter.off("task_update", onEvent);
        sseEmitter.off("change", onChange);
      };

      onEvent = (data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode("data: " + JSON.stringify(data) + "\n\n"));
        } catch {
          stop();
        }
      };

      interval = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          stop();
        }
      }, 25000);

      onChange = (data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode("event: change\ndata: " + JSON.stringify(data) + "\n\n"));
        } catch {
          stop();
        }
      };
      sseEmitter.on("task_update", onEvent);
      sseEmitter.on("change", onChange);
      req.signal.addEventListener("abort", stop);

      // Prime the stream straight away. With only the 30s heartbeat the client
      // saw no headers and no bytes for 30s, so an idle-timeout proxy could
      // kill the connection and a browser could not tell "connected" from
      // "hung". An SSE comment is ignored by EventSource.
      try {
        controller.enqueue(encoder.encode(": connected\n\n"));
      } catch {
        stop();
        return;
      }

      finish = stop;
    },
    cancel() {
      // The client is gone. req.signal does not reliably fire on every
      // runtime, so tear down here too - otherwise the listener and the
      // heartbeat timer accumulate for the life of the process.
      finish();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      // Stop reverse proxies buffering the stream, which would withhold the
      // heartbeats and silently kill every connection.
      "X-Accel-Buffering": "no",
    },
  });
}
