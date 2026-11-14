# TaskBoard OS

An open-source operating system for small agencies and service teams: tasks, daily standups,
time tracking, a full CRM with lead pipelines and automations, HR directory, finance views and an
internal learning module, all in one Next.js app on top of PostgreSQL.

## Features

Derived from the modules in `src/app` and the Prisma schema:

- **Tasks and projects** - task board, list and drawer views, subtasks, comments, dependencies,
  recurring tasks, reschedule requests, work sessions and timers, task reports, projects and clients.
- **Today / Home / Calendar** - personal day plan, focus blocks, wrap-up, calendar view with iCal export,
  role-specific persona dashboards.
- **Daily standup and progress** - standup updates, leaderboard and progress snapshots, blockers, commitments.
- **CRM** (`/crm`) - leads, pipelines and stages, follow-ups, call history, conversations, forms and form
  builder, CSV and Meta lead import, TeleCRM sync, WhatsApp and email settings, automations, AI SDR agents,
  and report center.
- **People and access** - employee directory, departments, teams, role-based access control with
  per-department overrides, page access, per-person capability config.
- **HRMS and finance** - HR employee profiles (devices, performance reviews, tool access), department dashboards, finance views.
- **LMS** - courses, blocks, progress tracking and announcements.
- **Automations and integrations** - rule-based automations, integration hub (Google, Slack, GitHub, Notion,
  Microsoft, Zoom, Meta, WhatsApp), encrypted credential vault, outgoing webhooks.
- **AI** - OpenAI-compatible gateway client with retries, circuit breaker, rate and budget limits, and an audit
  trail of agent runs; an MCP server (`scripts/mcp-server.js`) and `/api/mcp` endpoint to drive the app from AI tools.
- **PWA** - installable, offline page, web push notifications.

## Stack

Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, Radix UI, TanStack Query/Table, Recharts,
NextAuth (credentials and optional Google), Prisma 5 with PostgreSQL, Zod, Vitest.

## Architecture

```
src/app/          Next.js routes: (app)/ authenticated UI, api/ route handlers, login, public forms (f/)
src/components/   Shared UI and feature components (tasks, home personas, settings, ...)
src/crm-ui/       CRM front end (react-router app mounted at /crm/*)
src/crm-server/   CRM API (Express-style routers dispatched behind /api/crm/*)
src/lib/          Auth, RBAC, scope, AI client, integrations, leads, realtime, helpers
prisma/           schema.prisma, migrations, seed.ts
scripts/          CRM bootstrap, Meta lead backfill/CSV import, MCP server
tests/            Vitest unit tests
```

### Repository layout note

The original project was kept as two folders, `frontend/` (UI) and `backend/` (API, CRM server, lib,
Prisma) that had to be merged before building (backend copied last; same-named config files were identical).
This repository ships the **already merged** single-app layout, so no merge step is needed. If you are
porting an older two-folder checkout, merge with:

```
cp -r frontend/. app/ && cp -r backend/. app/   # backend last
```

## Quickstart

Requirements: Node.js 20+, PostgreSQL 14+.

```bash
npm install
cp .env.example .env        # fill in DATABASE_URL, NEXTAUTH_SECRET, SEED_PASSWORD at minimum
npx prisma migrate deploy   # or: npm run db:migrate (dev)
npm run db:seed             # fictional demo org and users (@example.com), password from SEED_PASSWORD
npm run dev                 # http://localhost:3000
```

Optional: `npx tsx scripts/crm-bootstrap.ts --apply` creates the default CRM pipeline and tags.
Scheduled jobs (`/api/cron/crm-tick`, `/api/cron/timer-autostop`, `/api/cron/telecrm-sync`) expect a POST with
header `x-cron-secret: $CRON_SECRET` from your scheduler.

Scripts: `npm run build`, `npm start`, `npm test`, `npm run typecheck`, `npm run db:studio`.

## Environment variables

Complete list with comments in [`.env.example`](.env.example).

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `NEXTAUTH_URL` | yes | Public app URL |
| `NEXTAUTH_SECRET` | yes | Session signing key (also fallback vault key) |
| `SEED_PASSWORD` | for seeding | Password for demo accounts |
| `AUTH_TRUST_HOST` | behind proxy | Trust forwarded host headers |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | no | Google sign-in and Calendar |
| `ALLOWED_EMAIL_DOMAIN` | no | Auto-admit Google accounts from this domain |
| `CRON_SECRET` | for cron | Auth for `/api/cron/*` |
| `AGENT_SECRET` | for agents | Auth for device/agent endpoints |
| `TASKBOARD_AGENT_KEY` / `TASKBOARD_MCP_KEY` | no | Bearer keys for agent context and MCP APIs |
| `INTEGRATION_ENCRYPTION_KEY` | recommended | 32-byte base64 credential vault key |
| `AI_GATEWAY_BASE_URL` / `AI_GATEWAY_API_KEY` / `AI_GATEWAY_MODEL` | for AI | OpenAI-compatible gateway |
| `SMTP_URL`, `SALES_EMAIL_FROM` | for email | Outbound email |
| `WEB_PUSH_VAPID_*` | for push | Web push keys |
| `WHATSAPP_*` | no | WhatsApp Business Cloud API |
| `META_*` | no | Meta lead ads and webhook verification |
| `TELECRM_*` | no | TeleCRM sync |
| `CRM_PIPELINE_OVERRIDES` | no | JSON routing rules from Meta forms to pipelines |
| `ORG_TIME_ZONE` | no | Timezone for CRM reminders (default `Asia/Kolkata`) |
| `DEMO_ROLE_SWITCH` / `NEXT_PUBLIC_DEMO_ROLE_SWITCH` | no | Demo-only role switcher; keep off in production |

## Security notes

- The demo roster is fictional; replace it before real use and never reuse `SEED_PASSWORD` in production.
- The login rate limiter in `src/lib/auth.ts` is a disabled no-op; put a limiter in front of `/api/auth` in production.
- Keep `DEMO_ROLE_SWITCH` unset in production.
- Some dashboards under `src/components/home` render hard-coded sample data for demonstration.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Licensed under the [MIT License](LICENSE).
