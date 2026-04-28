# TMS v2

TMS v2 is the clean working copy for the transport management platform.

This repository is now treated as the active sandbox and future production base. The older `D:\Ai\TMS` folder remains an archive for historical documentation, tests, release evidence, and the mobile app source until selected assets are migrated here.

## Product

TMS is an operational transport management system with a compliance-first direction.

Core flow:

```text
order -> trip -> waybill -> inspections -> release -> delivery -> document return -> billing
```

Current product contours:

- Web back office for logistics, dispatching, fleet, repairs, finance, analytics, and administration.
- API backend for operational data, RBAC, multi-organization scope, documents, files, and integrations.
- Transport dossier and internal transport document layer.
- ETRN XML/export foundation and provider-style exchange state.
- Production deployment skeleton with Docker Compose, nginx, PostgreSQL, Redis, MinIO, backup, rollback, and readiness checks.
- Mobile driver/field app exists in the archive and must be migrated into this v2 workspace.

## Repository Layout

```text
apps/api        Fastify API, Drizzle schema, migrations, business modules
apps/web        Next.js web application
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

1. Clean production risks and document the current deployment posture.
2. Migrate the mobile app into `apps/mobile`.
3. Rebuild a minimal focused test and release evidence pack.
4. Choose the first market track: compliance-first EPD/ETRN or operational fleet maturity.
