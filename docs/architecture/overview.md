# Architecture Overview

Updated: 2026-04-28

> **ВНИМАНИЕ:** Этот документ — снимок состояния на 2026-04-28. С тех пор прошли волны W2–W6, раунды 1–6, Cockpit v2, Mobile v2, deep audit и десятки других изменений. Текущее состояние см. в [`docs/operations/wave-summary.md`](../operations/wave-summary.md).

## Workspace

TMS v2 is a TypeScript monorepo:

```text
apps/api        Fastify API
apps/web        Next.js web app
packages/shared Shared contracts
```

The archived mobile app currently lives in `D:\Ai\TMS\apps\mobile` and is planned for migration to `apps/mobile`.

## Backend

The API uses:

- Fastify
- Drizzle ORM
- PostgreSQL
- Zod validation through shared schemas and route-local schemas
- Redis and BullMQ
- MinIO/S3-compatible object storage
- JWT with httpOnly cookie auth for web and bearer token contract for mobile

Core backend modules:

- auth
- orders
- trips
- waybills
- inspections
- fleet
- repairs
- finance
- analytics
- settings
- transport documents through the trips domain
- uploads
- integrations

## Frontend

The web app uses:

- Next.js
- React
- Tailwind
- Radix/shadcn-style primitives
- same-origin `/api/*` requests through proxy/rewrite

## Deployment

Production deployment uses:

- Docker Compose
- PostgreSQL 16
- Redis 7
- MinIO
- API container
- Web container
- nginx reverse proxy
- optional certbot profile

Deploy script responsibilities:

- install Docker if missing
- create `.env` with generated secrets when absent
- build images
- start infra
- create pre-migration backup
- apply SQL migrations
- seed fresh database
- start app services
- check `/api/health` and `/api/health/ready`

## Compliance Boundary

Current v2 has an internal compliance foundation, not a legally complete external EDO platform.

Internal foundation includes:

- transport documents
- status history
- retry metadata
- exchange attempts
- receipts
- provider callback-style state
- ETRN XML/export foundation

External legal completion still requires:

- accredited operator integration
- KEP/UKEP and MChD
- GIS EPD exchange
- XSD validation gate
- provider UAT receipts
- audit and security model for signing

