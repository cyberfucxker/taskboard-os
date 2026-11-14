/**
 * A small Express-compatible router that runs inside a Next.js Route Handler.
 *
 * The CRM was ported from the the legacy CRM platform, whose API is a set of Express routers. Rather
 * than rewrite ~6k lines of handlers into Next's (Request) => Response shape — and re-introduce
 * bugs the original had already fixed — the routers run unchanged on this shim. It implements
 * exactly the surface those files use: Router().get/post/put/patch/delete with `:param` paths
 * matched in registration order (Express semantics, so `/ids` declared before `/:id` wins),
 * and the req/res members listed on the interfaces below. Anything else is deliberately absent,
 * so a new route reaching for an unported Express feature fails to compile instead of
 * misbehaving at runtime.
 */

export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface Request {
  method: Method;
  /** Path relative to where the router is mounted, e.g. `/abc123/notes`. */
  path: string;
  originalUrl: string;
  params: Record<string, string>;
  query: Record<string, string | string[] | undefined>;
  body: any;
  /** The unparsed request body — needed for webhook signature verification. */
  rawBody: Buffer;
  headers: Record<string, string | undefined>;
  header(name: string): string | undefined;
  ip: string | undefined;
}

export interface Response {
  status(code: number): Response;
  json(body: unknown): Response;
  send(body?: unknown): Response;
  sendStatus(code: number): Response;
  redirect(statusOrUrl: number | string, url?: string): Response;
}

export type NextFunction = (err?: unknown) => void;
export type Handler = (req: any, res: Response, next: NextFunction) => unknown;

interface Layer {
  method: Method;
  keys: string[];
  regex: RegExp;
  handlers: Handler[];
}

function compile(path: string): { regex: RegExp; keys: string[] } {
  const keys: string[] = [];
  const pattern = path
    .split("/")
    .map((seg) => {
      if (seg.startsWith(":")) {
        keys.push(seg.slice(1));
        return "([^/]+)";
      }
      return seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/");
  // Express matches with or without a trailing slash; "/" alone matches the mount point.
  const body = pattern === "" || pattern === "/" ? "" : pattern.replace(/\/$/, "");
  return { regex: new RegExp(`^${body}/?$`), keys };
}

export class RouterImpl {
  private layers: Layer[] = [];

  private add(method: Method, path: string, handlers: Handler[]) {
    const { regex, keys } = compile(path);
    this.layers.push({ method, regex, keys, handlers });
    return this;
  }

  get(path: string, ...h: Handler[]) { return this.add("GET", path, h); }
  post(path: string, ...h: Handler[]) { return this.add("POST", path, h); }
  put(path: string, ...h: Handler[]) { return this.add("PUT", path, h); }
  patch(path: string, ...h: Handler[]) { return this.add("PATCH", path, h); }
  delete(path: string, ...h: Handler[]) { return this.add("DELETE", path, h); }

  /** First matching layer for this method + path, with its params decoded. */
  match(method: Method, path: string): { layer: Layer; params: Record<string, string> } | null {
    for (const layer of this.layers) {
      if (layer.method !== method) continue;
      const m = layer.regex.exec(path);
      if (!m) continue;
      const params: Record<string, string> = {};
      layer.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      return { layer, params };
    }
    return null;
  }
}

export function Router(): RouterImpl {
  return new RouterImpl();
}

/** What a handler produced, turned into a web Response by the caller. */
export interface Captured {
  status: number;
  body: unknown;
  kind: "json" | "text" | "empty" | "redirect";
  location?: string;
  done: boolean;
}

export function createResponse(): { res: Response; out: Captured } {
  const out: Captured = { status: 200, body: undefined, kind: "empty", done: false };
  const res: Response = {
    status(code) {
      out.status = code;
      return res;
    },
    json(body) {
      out.kind = "json";
      out.body = body;
      out.done = true;
      return res;
    },
    send(body) {
      if (body !== null && typeof body === "object" && !Buffer.isBuffer(body)) return res.json(body);
      out.kind = body === undefined ? "empty" : "text";
      out.body = body;
      out.done = true;
      return res;
    },
    sendStatus(code) {
      out.status = code;
      out.kind = "text";
      out.body = String(code);
      out.done = true;
      return res;
    },
    redirect(statusOrUrl, url) {
      out.kind = "redirect";
      out.status = typeof statusOrUrl === "number" ? statusOrUrl : 302;
      out.location = typeof statusOrUrl === "number" ? url : statusOrUrl;
      out.done = true;
      return res;
    },
  };
  return { res, out };
}

/** Runs a matched layer's handler chain, Express-style (next() advances, next(err) aborts). */
export async function runHandlers(handlers: Handler[], req: Request, res: Response, out: Captured) {
  for (const handler of handlers) {
    let advanced = false;
    let failure: unknown;
    const next: NextFunction = (err) => {
      advanced = true;
      failure = err;
    };
    await handler(req, res, next);
    if (failure) throw failure;
    if (out.done || !advanced) return;
  }
}
