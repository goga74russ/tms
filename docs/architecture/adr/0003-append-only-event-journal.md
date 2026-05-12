# ADR-0003: Append-only event journal enforced by DB triggers

- **Status:** Accepted
- **Date:** 2026-03-08 (initial schema 0000; trigger hardening migration 0025)
- **Deciders:** TMS core team

## Context

Russian transport regulation (§А.2 ТЗ) requires an immutable audit trail for every state change: who did what to which entity, when. The TMS also needs replay-ability for debugging ("how did this trip end up cancelled?") and a basis for billing reconciliation.

The naive approach — a regular table the app writes to — fails the immutability requirement: any operator with `UPDATE`/`DELETE` privileges could rewrite history. We need defence at the DB level, not just trust in app code.

Alternatives considered:

- **Separate write-once storage (S3 with object lock, dedicated audit DB)** — adds a moving part and an eventual-consistency window. Defer to a later phase if regulators demand cross-system witness.
- **Trust the app layer only** — fails the audit requirement; one rogue migration could mutate history.
- **Postgres logical replication to an immutable sink** — useful for backup, but doesn't stop a sufficiently-privileged actor from rewriting the primary.

## Decision

`events` is a regular Postgres table with append-only semantics enforced by **DB triggers** (BEFORE UPDATE and BEFORE DELETE → RAISE EXCEPTION). The trigger SQL lives in `apps/api/src/db/triggers.ts` and is re-applied on every boot (CREATE OR REPLACE), so a stray manual migration cannot silently drop it.

All state-changing API handlers go through a `journal.ts` wrapper that:
1. opens a transaction,
2. performs the domain write,
3. inserts a corresponding `events` row in the same transaction,
4. commits (or rolls back both together).

The `events` row carries `organization_id`, `aggregate_type`, `aggregate_id`, `actor_id`, `payload jsonb`, `occurred_at`. Indexes support `(organization_id, occurred_at)` and `(aggregate_type, aggregate_id, occurred_at)`.

## Consequences

**Positive**
- Append-only is enforced at the layer that matters (DB), not the layer that's easiest to bypass (app).
- Replay-able: re-deriving an aggregate's state from its events is a single query.
- Audit endpoints (`/api/audit/*`) are trivial — read straight from one table.
- Aligns with §А.2 ТЗ requirements out of the box.

**Negative**
- Storage growth is linear in operations. At pilot scale (~10K events/day) this is negligible; at 10M events/day we'd partition by month and archive cold partitions.
- Every domain write becomes a 2-row insert. Negligible latency hit, but doubles WAL traffic.
- Schema migrations on `events` itself must be additive only — you can't rewrite history to fit a new column shape. ALTER ADD COLUMN with default is fine; DROP COLUMN is not.

**Neutral**
- The trigger raises a Postgres error on attempted UPDATE/DELETE. Operators expecting to "fix a typo" learn the hard way that they must instead insert a corrective event.

## References

- Code: `apps/api/src/db/triggers.ts` (`APPEND_ONLY_TRIGGER_SQL`), `apps/api/src/events/journal.ts`, `apps/api/src/server.ts` (boot-time `sql.unsafe(APPEND_ONLY_TRIGGER_SQL)`)
- Migrations: `apps/api/drizzle/0000_full_schema.sql` (initial events table), `apps/api/drizzle/0025_inspection_decision_trigger.sql` (extends to inspection-decision invariants)
- Spec: §А.2 ТЗ ("Журнал событий append-only")
- Related: ADR-0001 (events table is also tenant-scoped)
