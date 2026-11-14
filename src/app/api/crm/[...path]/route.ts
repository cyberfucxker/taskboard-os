import { dispatch } from "@/crm-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The whole CRM API (ported from the the legacy CRM Express server) behind one catch-all route.
 * Auth, capability checks and routing all live in src/crm-server/index.ts.
 */
type Ctx = { params: { path?: string[] } };

const handle = (req: Request, { params }: Ctx) => dispatch(req, params.path ?? []);

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
