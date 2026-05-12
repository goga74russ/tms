# Migration Drift Investigation — 2026-05-12

## Scope
H-5 + M-9. Audit `apps/api/drizzle/` for missing/duplicate migrations,
duplicate indexes flagged by 0008, and `_journal.json` drift vs. on-disk
SQL files and applied state in the running prod DB.

## Findings

### 1. Migration 0005 is intentionally absent — not deleted.
- `git log --all --diff-filter=D --summary -- 'apps/api/drizzle/*'`
  returns no deleted-file entries. The only commit that ever touched the
  drizzle dir for that range is `bb5868b Initial TMS v2 workspace`.
- `_journal.json` had no entry at idx for 0005 either.
- Conclusion: 0005 was reserved during development and the next migration
  was authored as 0006 (likely a rename after squash). No file ever lived
  on disk under tag `0005_*`. The numbering gap is harmless — Drizzle
  resolves applies by `tag`, not by ordinal index. Production
  `tms_schema_migrations` confirms: 0004 → 0006 with no row for 0005.

### 2. 0008 is a legit cleanup, not Drizzle generator drift.
- `apps/api/drizzle/0000_full_schema.sql:713` creates
  `CREATE INDEX idx_waybills_trip ON waybills (trip_id)` (non-unique).
- `apps/api/drizzle/0001_production_hardening.sql:15` creates
  `CREATE UNIQUE INDEX idx_waybills_trip_unique ON waybills (trip_id)`
  on the same column.
- Two indexes on the same column → the unique one is strictly stronger,
  so 0008 drops the duplicate non-unique index `idx_waybills_trip`.
- Not generator drift. Human cleanup, correctly migrated. No action.

### 3. `_journal.json` was missing the 0025 entry (the actual drift).
- On-disk: `0025_inspection_decision_trigger.sql` exists and is applied
  in prod (`tms_schema_migrations` shows `applied_at 2026-05-12
  10:23:23` for tag `0025_inspection_decision_trigger`).
- Journal: entries stopped at idx 23 / `0024_perf_indexes`.
- Effect: `drizzle-kit` would consider 0025 untracked for future ops
  (snapshot reconciliation, `generate`).
- Fix: appended idx 24 entry for `0025_inspection_decision_trigger`
  with `when: 1773640842000`. No new SQL migration written —
  schema/state are already in sync; only the metadata bookkeeping was
  stale.

### 4. `drizzle-kit check` result
After the journal append: `Everything's fine 🐶🔥`. Pre-fix it also
passed, because `check` only validates SQL files vs schema and ignores
journal gaps — the gap is silent drift that only surfaces during
`generate` / snapshot reconciliation, which is why it was flagged here.

## Why no 0026 migration was added
- `drizzle-kit check` passes both before and after the journal patch.
- The migration runner (`deploy.sh`, `scripts/apply-local-migrations.ps1`)
  is custom and tracks state via `tms_schema_migrations`, not the
  Drizzle journal. So the journal was decorative for the runner, but it
  matters for future `drizzle-kit generate`.
- There is no schema-level drift to reconcile — only metadata. A new
  no-op migration would dirty `tms_schema_migrations` for zero gain.

## Files changed
- `apps/api/drizzle/meta/_journal.json` — appended idx 24 entry for 0025.
- (No new SQL migration; no existing migrations touched.)
