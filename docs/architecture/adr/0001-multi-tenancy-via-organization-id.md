# ADR-0001: Multi-tenancy via `organization_id` column on every domain table

- **Status:** Accepted
- **Date:** 2026-02-14 (locked in at migration 0000; backfilled across schema by 0027)
- **Deciders:** TMS core team

## Context

TMS is a multi-tenant SaaS — a single deployment serves many transport companies ("organizations"). We needed a tenancy model that:

1. lets a dispatcher only see their own company's trips, drivers, vehicles, events;
2. doesn't require per-tenant infra to provision (we want to onboard a customer in seconds, not minutes);
3. keeps a single Postgres connection pool, single migration history, single backup;
4. is easy to enforce in code review.

Alternatives considered:

- **Schema-per-tenant** — every CREATE/ALTER must run N times; cross-tenant aggregations are hard; tooling (Drizzle, pg_dump) gets awkward.
- **Database-per-tenant** — strongest isolation, but ops overhead is prohibitive at our scale (pilot, ~10s of orgs). Reserving for the day a single customer demands their own DB for regulatory reasons.

## Decision

Every domain table carries a non-nullable `organization_id uuid` column referencing `organizations.id`. All queries are scoped by `organization_id` at the application layer (typically via `requireAuth` injecting `actor.organizationId` and ORM helpers building the WHERE clause).

Cross-tenant tables — `users` (a user belongs to exactly one org), `events` (audit journal), and shared catalogs — likewise carry `organization_id`. The only exception is the `organizations` table itself.

## Consequences

**Positive**
- Single migration history; trivially zero-downtime to add a customer.
- Easy cross-tenant aggregations for admin/billing dashboards (single WHERE removal).
- Backups, replication, and Drizzle tooling work out of the box.

**Negative**
- Isolation is enforced in code, not at the DB. A missing WHERE clause leaks data — mitigated by code review, `org-middleware.ts`, tests in `audit/audit-scope.test.ts`, and the `0027_multitenancy_backfill` migration that retrofitted `organization_id` on the few tables that originally shipped without it.
- Noisy-neighbour risk: one tenant's heavy query affects all others. Acceptable at pilot scale; we'll revisit with connection pools per tier when load demands.

**Neutral**
- Future move to row-level security (RLS) is straightforward — the column is already there; we'd just add policies.

## References

- Migrations: `apps/api/drizzle/0000_full_schema.sql` through `apps/api/drizzle/0027_multitenancy_backfill.sql`
- Code: `apps/api/src/auth/org-middleware.ts`, `apps/api/src/db/schema.ts`
- Tests: `apps/api/src/modules/audit/audit-scope.test.ts`
- Related: ADR-0003 (events table also carries `organization_id`)
