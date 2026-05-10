# Drizzle migration history

This document explains the migration ledger under `apps/api/drizzle/`.
Each entry corresponds to one entry in `meta/_journal.json` and one
`NNNN_*.sql` file. The `idx` in the journal is monotonically
increasing; the filename prefix (`NNNN_`) is a separate human-readable
sequence.

## Migrations

| File | Idx | Topic |
|------|-----|-------|
| `0000_full_schema.sql` | 0 | Initial Drizzle baseline — full schema dump. |
| `0001_production_hardening.sql` | 1 | NOT NULL/CHECK constraints, FK cascade rules, audit trigger fixtures. |
| `0002_performance_indexes.sql` | 2 | First wave of hot-path indexes (orders, trips, fines). |
| `0003_waybill_first.sql` | 3 | Waybill-first redesign — путевой лист as the operational anchor. |
| `0004_sprint19_compliance.sql` | 4 | Sprint 19 compliance fields (ОКВЭД, КПП, certificates). |
| `0006_deep_fleet_operations.sql` | 5 | Deep fleet (trailers, telematics state, fuel records). |
| `0007_repair_parts_catalog.sql` | 6 | Repair parts catalog + parts-on-repair junction. |
| `0008_drop_duplicate_waybill_trip_index.sql` | 7 | **Drift fix** — drops a duplicate index Drizzle re-emitted. |
| `0009_app_settings.sql` | 8 | Per-org app settings (cost model, defaults). |
| `0010_trailer_organization_scope.sql` | 9 | Multi-tenant scope for trailers. |
| `0011_trip_organization_scope.sql` | 10 | Multi-tenant scope for trips. |
| `0012_operational_core_v2.sql` | 11 | Operational core v2 — orders/trips/route_points refactor. |
| `0013_transport_documents_foundation.sql` | 12 | Transport documents (ТТН/ТрН/УПД) foundation. |
| `0014_cold_chain_v0.sql` | 13 | Cold-chain v0 — temperature_readings, breach incidents. |
| `0015_rto_windows_positions.sql` | 14 | РТО windows + vehicle_positions. |
| `0016_carrier_subcontracting.sql` | 15 | Subcontracting carriers. |
| `0017_adr_edi_scoring.sql` | 16 | ADR cargo, EDI events, driver scoring. |
| `0018_wave6_fuel_record_source.sql` | 17 | Fuel record source provenance. |
| `0019_copilot.sql` | 18 | Co-pilot tool registry tables. |
| `0020_signup_onboarding.sql` | 19 | Signup + onboarding flow tables. |
| `0021_provider_framework.sql` | 20 | Provider framework (OFD/Wialon/EDI providers). |
| `0022_compliance.sql` | 21 | Compliance evidence + certificate uploads. |
| `0023_monetization.sql` | 22 | Monetization — subscriptions, plans, billing periods. |
| `0024_perf_indexes.sql` | 23 | Round 3C — performance indexes for hot lookup paths. |

## Why is 0005 missing?

There is **no `0005_*.sql` file**, and the journal has no `idx`
pointing to a filename starting with `0005_`. This is a harmless gap
inherited from early development:

* During the initial `drizzle-kit generate` cycles a candidate
  migration was rejected before it landed in the journal. Its slot
  number (`0005`) was never reused, so the next accepted migration
  (`0006_deep_fleet_operations.sql`) kept its existing prefix.
* The journal `_journal.json` shows continuous `idx` values
  (0, 1, 2, 3, 4, 5, …) — `idx 5` maps to `0006_deep_fleet_operations`,
  not to a phantom `0005_*.sql`. **No migration was lost.**
* Drizzle's `migrate` command keys off `idx`, not the filename
  prefix, so the gap has zero runtime consequence. New migrations
  must continue to use the next available prefix
  (`0024`, `0025`, …) to keep human-readable ordering aligned with
  `idx` order.

## Drift signal — the 0008 duplicate-index drop

`0008_drop_duplicate_waybill_trip_index.sql` is intentionally a
**no-op-on-fresh-install** kind of migration: it drops an index that
Drizzle's diff tool re-emitted because the production DB carried a
manually created index with the same definition but a different name.
We caught the drift with a `drizzle-kit check` run during Sprint 18
and shipped 0008 to keep the journal clean.

If you ever see another migration whose entire body is a `DROP INDEX
IF EXISTS <auto_name>`, treat it as the same kind of drift signal and
investigate before applying — the ORM is telling you the live schema
disagrees with the schema files.

## Adding a new migration

1. `pnpm --filter @tms/api db:generate` — Drizzle compares
   `src/db/schema.ts` against the journal.
2. Verify the new file's `idx` continues the sequence in
   `meta/_journal.json`.
3. **Always update this document** with a one-line description of
   what the migration changes.
4. Apply via `pnpm --filter @tms/api db:migrate` in non-prod first.
5. Migrations are **append-only** — never edit a migration that has
   already been applied to a shared environment. Roll forward instead.
