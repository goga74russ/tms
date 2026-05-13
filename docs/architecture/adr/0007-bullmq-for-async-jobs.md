# ADR-0007: BullMQ on Redis for scheduled and event-driven jobs

- **Status:** Accepted
- **Date:** 2026-03-15
- **Deciders:** TMS core team

## Context

The API needs both scheduled and event-driven background work:

- **Repeatable jobs** — Wialon telematics sync every 15 minutes, GIBDD fines pull daily at 03:00 МСК, billing run daily at 02:00 МСК.
- **Event-driven jobs** — outbound notifications (push, email, Telegram), EDI document polling on demand, post-trip auto-invoice.
- **Operational requirements** — retries with exponential backoff, dead-letter visibility, the ability to drain a queue during deploy, scale by adding worker processes.

Redis is already in the stack (rate limiting, sessions, websocket fan-out), so the marginal cost of a Redis-backed queue is small.

Alternatives considered:

- **pg-boss** — Queue state in Postgres. Tempting because backups and DR cover it for free (ADR-0001's multi-tenant DB also gets the queue). Loses on throughput, lacks BullMQ's first-class repeatable-job model, and we'd be putting hot-path job traffic on the same Postgres that already carries our OLTP load.
- **Temporal / restate** — Strong durability and workflow primitives, but operationally heavy for a single-DB single-Redis pilot. Defer until we have workflows that genuinely span hours and need replay.
- **Custom (setInterval + DB rows)** — Re-implementing retries, locks, and visibility timeouts is exactly the work BullMQ already did. Pass.

## Decision

Use **BullMQ** as the queue layer; one named queue per worker concern (`wialon`, `fines`, `billing`, `edi`, `notifications`). Workers run in the same Node process as the API today and can be split into separate containers later by setting an env flag — no code change required.

Mechanism:

- Queue/worker construction lives in `apps/api/src/integrations/queues.ts` and `apps/api/src/integrations/workers/`.
- Repeatable jobs are registered at API boot with deterministic IDs so restarts don't duplicate schedules.
- All workers share the Redis connection pool with the rate limiter and websocket layer.

## Consequences

**Positive**
- Zero new infrastructure — Redis was already a dependency.
- Web UI via BullBoard available for ops once we mount it behind admin auth.
- Retry/backoff/DLQ are configuration, not application code.
- Horizontal scale is "run more worker processes."

**Negative**
- Redis becomes a single point of failure for the queue. Production runs without Redis replication today — a Redis outage drops scheduled job execution until it recovers. Mitigation: Redis AOF (`--appendonly yes`) is enabled in `docker-compose.prod.yml`, but the AOF file is **not** part of the DR backup pipeline.
- Queue state isn't in Postgres, so a clean DB restore alone won't restore in-flight jobs. The DR drill must back up both PG dumps and the Redis AOF.

**Neutral**
- Repeatable jobs are deduplicated by job ID; renaming a repeatable means clearing the old key explicitly.
- Worker code is colocated with the API; splitting it into a `tms-worker` image is a deployment-topology change, not a refactor.

## Open question

Should we add the Redis AOF to the DR backup rotation? Today it's enabled on disk but not snapshotted off-host. Tracked separately from this ADR; impacts the answer to "what does a full restore look like?"

## References

- Code: `apps/api/src/integrations/queues.ts`
- Workers: `apps/api/src/integrations/workers/{wialon,fines,billing,edi,notification}.worker.ts`
- Compose: `docker-compose.prod.yml` (Redis `--appendonly yes`)
- Related ADRs: ADR-0005 (provider registry — workers consume provider adapters)
