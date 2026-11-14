# CLAUDE.md

Guidance for AI coding agents working on TaskBoard OS.

## Project

Single Next.js 14 (App Router) app with Prisma/PostgreSQL. Tasks, standups, time tracking, CRM, HR,
finance, LMS, automations, integrations and an AI gateway client.

## Commands

- `npm run dev` / `npm run build` / `npm start`
- `npm run typecheck`, `npm test` (Vitest, node environment)
- `npm run db:migrate` (dev), `npm run db:deploy` (apply), `npm run db:seed`, `npm run db:studio`

## Layout

- `src/app/(app)` authenticated pages; `src/app/api` route handlers
- `src/components` UI; `src/crm-ui` CRM React app mounted at `/crm/*`; `src/crm-server` CRM API behind `/api/crm/*`
- `src/lib` shared server logic (auth, rbac, scope, ai, integrations, leads)
- `prisma/schema.prisma`, `prisma/migrations`, `prisma/seed.ts`

## Rules

- Never commit `.env`, secrets, dumps or real personal data. Use `example.com` and fictional names.
- Enforce authorization server-side with `src/lib/rbac.ts` and `src/lib/scope.ts`; do not trust client checks.
- Schema changes go through additive Prisma migrations. Never run `prisma db push` on a real database.
- All AI calls go through `src/lib/ai.ts` / `src/lib/ai-guard.ts` so runs are audited and budgets enforced.
- Configuration comes from environment variables listed in `.env.example`; add new ones there and in the README table.
- Keep changes minimal and covered by tests in `tests/` where logic is involved.
