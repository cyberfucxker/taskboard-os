import type { AuthedRequest } from "./auth";

/**
 * The legacy CRM wrote an admin audit table. TaskBoard has no equivalent table for configuration changes,
 * so CRM settings changes (connections, telephony, WhatsApp accounts) go to the service journal
 * instead — `journalctl -u taskboard-os | grep crm-audit`. Lead-level history (stage moves,
 * reassignment, notes) is unaffected: it lives in CrmActivity and the history tables exactly
 * as it did in the legacy CRM.
 */
export interface AuditInput {
  action: string;
  entity?: string;
  entityId?: string | null;
  summary?: string;
  [key: string]: unknown;
}

export async function writeAudit(req: AuthedRequest, input: AuditInput): Promise<void> {
  console.log(
    "[crm-audit]",
    JSON.stringify({ actor: req.auth?.sub ?? "system", at: new Date().toISOString(), ...input })
  );
}
