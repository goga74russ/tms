# TMS v2

TMS v2 is the clean working copy for the transport management platform.

This repository is now treated as the active sandbox and future production base. The older `D:\Ai\TMS` folder remains an archive for historical documentation and release evidence.

## Product

TMS is an operational transport management system with a compliance-first direction.

Core flow:

```text
order -> trip -> waybill -> inspections -> release -> delivery -> document return -> billing
```

Current product contours:

- Web back office for logistics, dispatching, fleet, repairs, finance, analytics, and administration.
- API backend for operational data, RBAC, multi-organization scope, documents, files, and integrations.
- Mobile driver/field app (Expo + React Native + WatermelonDB) for offline-first field work.
- Transport dossier and internal transport document layer.
- ETRN XML/export foundation and provider-style exchange state.
- Production deployment skeleton with Docker Compose, nginx, PostgreSQL, Redis, MinIO, backup, rollback, and readiness checks.

## Repository Layout

```text
apps/api        Fastify API, Drizzle schema, migrations, business modules
apps/web        Next.js web application
apps/mobile     Expo + React Native + WatermelonDB driver app
packages/shared Shared enums, schemas, and types
nginx           Production nginx configs
scripts         Operational scripts
docs            v2 documentation
```

## Source Of Truth

- `D:\Ai\TMS-prod` is the active v2 workspace.
- `D:\Ai\TMS` is the archive/reference workspace.
- Do not treat old docs as current until they are copied or rewritten into `docs/`.

## Next Priorities

The free-box ("бесплатный контур") is feature-complete: order → trip → waybill → inspections → release → delivery → document-return → billing all work end-to-end without paid integrations (Wialon/EDO/fuel-card/geocoder are realistic mocks). See `docs/operations/free-box-checklist.md`.

1. Pilot deployment + smoke test — stand up a real org on staging and walk one trip through the full chain.
2. Real provider integrations (Wialon, ЭДО, fuel cards) — paid tier; mocks already match the target contracts.
3. Test coverage expansion — currently only RBAC + utils (42/42 passing); add module-level tests for trips, waybills, billing.
4. Performance tuning + observability — replace remaining `console.log` with pino, add metrics/health probes.

## Quick Start

1. Copy `.env.example` to `.env` and fill in `CHANGE_ME_*` values.
2. Install dependencies:
   ```
   pnpm install
   ```
3. Run database migrations (requires `DATABASE_URL`):
   ```
   pnpm --filter @tms/api db:migrate
   ```
4. Seed demo data (requires `SEED_PASSWORD`):
   ```
   pnpm --filter @tms/api db:seed
   ```
5. Start API and web in two terminals:
   ```
   pnpm dev:api
   pnpm dev:web
   ```
