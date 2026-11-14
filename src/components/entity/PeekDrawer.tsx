"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X, Building2, FolderKanban } from "lucide-react";
import { parsePeek } from "@/lib/url";
import { entityUrl } from "@/lib/url";
import { EntityLink } from "./EntityLink";
import type { EntityRef, PeekTarget } from "@/types";

interface PeekClient {
  id: string; name: string; health: string; tier: string | null; industry: string | null;
  owners: { id: string; name: string }[];
  projects: { id: string; name: string; status: string }[];
  tasks: { id: string; code: string; title: string; status: string; priority: string }[];
  description: string | null;
}
interface PeekProject {
  id: string; name: string; status: string; category: string | null;
  client: { id: string; name: string } | null;
  owner: { id: string; name: string } | null;
  tasks: { id: string; code: string; title: string; status: string }[];
}

const HEALTH_COLOR: Record<string, string> = { HEALTHY: "var(--emerald)", WATCH: "var(--amber)", AT_RISK: "var(--crimson)" };

/**
 * PeekDrawer — a universal "open entity detail on top of any page" drawer,
 * driven by `?peek=client:<id>` (or `project:`). Mounted once in the app layout.
 * Closing removes `?peek=` from the URL so browser back works.
 */
export function PeekDrawer() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const peek = parsePeek(searchParams);

  const [client, setClient] = useState<PeekClient | null>(null);
  const [project, setProject] = useState<PeekProject | null>(null);
  const [loading, setLoading] = useState(false);

  // Circuit breaker: some parent re-renders can recompute `peek` faster than
  // this effect's own state updates settle. Bail out whenever the target
  // hasn't actually changed instead of re-fetching every render.
  const lastKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const key = peek ? `${peek.type}:${peek.id}` : null;
    if (key === lastKeyRef.current) return;
    lastKeyRef.current = key;

    setClient(null);
    setProject(null);
    if (!peek) return;
    if (peek.type === "client") {
      setLoading(true);
      fetch(`/api/clients/${peek.id}`).then((r) => r.json()).then((d) => {
        setClient(d.ok ? d.client : null);
      }).finally(() => setLoading(false));
    } else if (peek.type === "project") {
      setLoading(true);
      fetch(`/api/projects/${peek.id}`).then((r) => r.json()).then((d) => {
        setProject(d.ok ? d.project : null);
      }).finally(() => setLoading(false));
    }
  }, [peek?.type, peek?.id]);

  if (!peek) return null;

  function close() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("peek");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const isClient = peek.type === "client";
  const title = isClient ? client?.name : project?.name;

  return (
    <div className="fixed inset-0 z-[70] flex justify-end bg-black/50 anim-fade" onMouseDown={close}>
      <div
        className="flex h-full w-full max-w-md flex-col overflow-hidden border-l border-edge bg-raised shadow-xl anim-right"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 border-b border-edge px-4 py-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal/25 text-tealhi">
            {isClient ? <Building2 className="h-5 w-5" /> : <FolderKanban className="h-5 w-5" />}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold text-ink">{loading ? "Loading…" : title ?? "Detail"}</h2>
            {isClient && client && (
              <p className="mt-0.5 text-[11px] text-muted">
                <span style={{ color: HEALTH_COLOR[client.health] ?? "var(--muted)" }}>{client.health}</span>
                {client.industry ? ` · ${client.industry}` : ""}
                {client.tier ? ` · ${client.tier}` : ""}
              </p>
            )}
            {!isClient && project && (
              <p className="mt-0.5 text-[11px] text-muted">
                {project.category ?? project.status}
                {project.client ? ` · ${project.client.name}` : ""}
              </p>
            )}
          </div>
          <button onClick={close} className="text-muted hover:text-ink" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Open full page */}
          <div className="border-b border-edge px-4 py-3">
            <a
              href={peek.type === "client" && client
                ? entityUrl("client", client.id)
                : peek.type === "project" && project
                  ? entityUrl("project", project.id)
                  : "#"}
              className="text-[13px] text-tealhi hover:underline"
            >
              Open full {isClient ? "client" : "project"} page →
            </a>
          </div>

          {isClient && client && (
            <>
              {/* Owners */}
              <div className="border-b border-edge px-4 py-3">
                <div className="label mb-1.5">Owners</div>
                <div className="flex flex-wrap gap-1.5">
                  {client.owners.length === 0 && <span className="text-[12px] text-muted">None</span>}
                  {client.owners.map((o) => (
                    <span key={o.id} className="rounded-full bg-hover px-2 py-0.5 text-[12px] text-ink">{o.name}</span>
                  ))}
                </div>
              </div>
              {/* Projects */}
              <div className="border-b border-edge px-4 py-3">
                <div className="label mb-1.5">Projects</div>
                <div className="space-y-1.5">
                  {client.projects.map((p) => (
                    <div key={p.id} className="flex items-center justify-between text-[13px]">
                      <EntityLink entity={projectEntityRef(p.id, p.name)} />
                      <span className="text-[11px] text-muted">{p.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
          {!isClient && project && (
            <div className="border-b border-edge px-4 py-3">
              <div className="label mb-1.5">Client</div>
              {project.client ? (
                <EntityLink entity={clientEntityRef(project.client.id, project.client.name)} />
              ) : (
                <span className="text-[12px] text-muted">Internal</span>
              )}
              {project.owner && (
                <>
                  <div className="label mb-1.5 mt-3">Owner</div>
                  <span className="text-[13px] text-ink">{project.owner.name}</span>
                </>
              )}
            </div>
          )}
          {isClient && client && (
            <div className="px-4 py-3">
              <div className="label mb-1.5">Tasks</div>
              <div className="space-y-1">
                {client.tasks.map((t) => (
                  <EntityLink
                    key={t.id}
                    entity={taskEntityRef(t.id, t.code)}
                    className="block truncate text-[13px]"
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function clientEntityRef(id: string, name: string): EntityRef {
  return { type: "client", id, name };
}
function projectEntityRef(id: string, name: string): EntityRef {
  return { type: "project", id, name };
}
function taskEntityRef(id: string, code: string): EntityRef {
  return { type: "task", id, name: code, code };
}