# Architecture docs

The architectural surface of TMS, in roughly the order you'd read it if you joined the team today.

## Start here

- [`diagram.md`](./diagram.md) — **system at a glance.** Component diagram, core trip sequence, ER diagram. Read this first.
- [`operational-core-v2.md`](./operational-core-v2.md) — deep dive on the order → trip → waybill model.

## Decisions

Architectural Decision Records — immutable, numbered, append-only. New decisions get a new file; we don't edit accepted ADRs in place.

- [`adr/template.md`](./adr/template.md) — Michael Nygard template; copy this when adding ADR-NNNN.
- [`adr/0001-multi-tenancy-via-organization-id.md`](./adr/0001-multi-tenancy-via-organization-id.md) — every domain table carries `organization_id`.
- [`adr/0002-aes-256-gcm-provider-credentials.md`](./adr/0002-aes-256-gcm-provider-credentials.md) — credential encryption with fail-fast `CREDENTIALS_KEY`.
- [`adr/0003-append-only-event-journal.md`](./adr/0003-append-only-event-journal.md) — `events` table immutability enforced by DB triggers.
- [`adr/0004-jwt-24h-no-refresh.md`](./adr/0004-jwt-24h-no-refresh.md) — pilot-stage auth shape and its upgrade path.
- [`adr/0005-provider-registry-factory-map.md`](./adr/0005-provider-registry-factory-map.md) — `${type}:${name}` factory map + per-org instance cache.

## Reference

- [`overview.md`](./overview.md) — older system snapshot. Kept for context; superseded by `diagram.md` where the two disagree.
- [`etrn-source-map.md`](./etrn-source-map.md) — eТрН ↔ Russian Federation source-of-truth mapping.

## Related (outside this folder)

- [`../api/openapi.md`](../api/openapi.md) — full REST surface (auto-generated; regenerate with `pnpm --filter @tms/api openapi:export`).
- [`../operations/wave-summary.md`](../operations/wave-summary.md) — chronological build history.
- [`../operations/audit-2026-05-12-deep.md`](../operations/audit-2026-05-12-deep.md) — most recent security/quality audit.

## Adding a new ADR

1. Copy `adr/template.md` to `adr/NNNN-short-title.md` (next free number, kebab-case title).
2. Fill it out. Status starts as `Proposed`; flips to `Accepted` once merged.
3. Link it from this README under "Decisions".
4. Never edit an accepted ADR — supersede it with a new one (`Status: Superseded by ADR-XXXX`).
