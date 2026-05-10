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

## Status

The free-box ("бесплатный контур") is feature-complete: order → trip → waybill → inspections → release → delivery → document-return → billing all work end-to-end without paid integrations. Wialon, ЭДО, fuel cards, ГИБДД, DaData are realistic mocks ready to be swapped for real providers.

What was built in waves W1–W6: see [docs/operations/wave-summary.md](docs/operations/wave-summary.md).

## What's next

See [docs/product/roadmap.md](docs/product/roadmap.md) for the full plan. In short:

1. **Phase 1 — Pilot stabilization (4–6 weeks)**: Playwright E2E happy path, observability, migration cleanup.
2. **Phase 2 — First paid integrations (8–12 weeks)**: signature provider abstraction, DaData live, Diadoc EDI + ETrN, tachograph DDD upload, Wialon live.
3. **Phase 3 — Self-serve onboarding (6–8 weeks)**: sign-up + 6-step wizard, integrations cabinet, bulk import.
4. **Phase 4 — Compliance breadth (8–12 weeks)**: «Честный знак», ОСАГО / страхование, additional EDI operators.
5. **Phase 5 — Monetization (6–10 weeks)**: ЮKassa / Тинькофф / CloudPayments billing, paywall.
6. **Phase 7 — AI dispatcher co-pilot (4 weeks)**: natural-language interface over our API for the most loaded role. Paid-tier killer feature. Window of differentiation vs 1С / АТИ / TopLog: ~12–18 months.

Mock → real provider map: [docs/operations/integrations-status.md](docs/operations/integrations-status.md).
Free-box feature checklist: [docs/operations/free-box-checklist.md](docs/operations/free-box-checklist.md).

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
