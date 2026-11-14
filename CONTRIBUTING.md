# Contributing

Thanks for helping improve TaskBoard OS.

## Setup

1. Fork and clone the repository.
2. `npm install`, copy `.env.example` to `.env`, point `DATABASE_URL` at a local PostgreSQL database.
3. `npx prisma migrate deploy && npm run db:seed && npm run dev`.

## Workflow

- Create a branch from `main` (`feat/...`, `fix/...`).
- Keep changes focused; one concern per pull request.
- Run `npm run typecheck` and `npm test` before opening a PR. Add tests for new logic in `tests/`.
- Schema changes need a Prisma migration (`npx prisma migrate dev --name <change>`). Prefer additive migrations.
- Never use `prisma db push` against a database that holds data you care about.

## Code style

- TypeScript strict mode; prefer small, typed modules in `src/lib`.
- Authorize on the server: use the RBAC helpers (`src/lib/rbac.ts`, `src/lib/scope.ts`) in route handlers.
- Do not commit secrets, `.env` files, database dumps or real customer data. Use `example.com` addresses and fictional names in fixtures.

## Commit messages

Short imperative subject line, optional body explaining why. Conventional prefixes (`feat:`, `fix:`, `docs:`) welcome.

## Reporting security issues

Do not open a public issue. Contact the maintainers privately through the repository's security advisory feature.
