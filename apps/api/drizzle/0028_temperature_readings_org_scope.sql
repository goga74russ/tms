-- ============================================================
-- 0028 — temperature_readings organization_id (audit A-P2)
-- ============================================================
-- temperature_readings predates explicit per-row tenancy. Today
-- tenant isolation relies entirely on the trip → org join in
-- every consumer query. Any query that forgets the join (or any
-- future raw SQL ad-hoc) leaks cold-chain readings across
-- tenants.
--
-- This migration adds the column, backfills it from the trip's
-- org_id, and indexes the column for tenant-scoped queries.
-- Column stays NULLABLE for now — a follow-up migration can
-- tighten to NOT NULL after one cycle of operational verification.
-- ============================================================

ALTER TABLE temperature_readings
ADD COLUMN IF NOT EXISTS organization_id uuid
REFERENCES organizations(id) ON DELETE CASCADE;

-- Backfill from the trip's organization at insert time.
UPDATE temperature_readings tr
SET organization_id = t.organization_id
FROM trips t
WHERE tr.organization_id IS NULL
  AND tr.trip_id = t.id;

CREATE INDEX IF NOT EXISTS idx_temperature_readings_org
ON temperature_readings (organization_id);
