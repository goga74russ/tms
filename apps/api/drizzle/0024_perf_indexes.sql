-- ============================================================
-- Migration 0024: Round 3C performance indexes (D21).
-- Date: 2026-05-10
-- Targets hot lookup paths surfaced during Round 3 review.
-- All indexes use IF NOT EXISTS so re-running on a partially
-- populated DB is safe.
--
-- Reference query patterns (do not run — documentation only):
--
-- 1) Active trip listing filtered by org + status
--    EXPLAIN ANALYZE
--      SELECT id FROM trips
--      WHERE organization_id = $1 AND status = 'in_transit'
--      ORDER BY actual_completion_at DESC NULLS LAST;
--
-- 2) Order kanban filtered by org + status
--    EXPLAIN ANALYZE
--      SELECT id FROM orders
--      WHERE organization_id = $1 AND status = 'planned';
--
-- 3) Route point sequence load for a trip
--    EXPLAIN ANALYZE
--      SELECT * FROM route_points
--      WHERE trip_id = $1
--      ORDER BY sequence_number ASC;
--
-- 4) Audit log scan filtered by entity + time
--    EXPLAIN ANALYZE
--      SELECT * FROM events
--      WHERE entity_type = 'trip' AND entity_id = $1
--      ORDER BY timestamp DESC LIMIT 100;
--
-- 5) Invoice expansion (junction table)
--    EXPLAIN ANALYZE
--      SELECT trip_id FROM invoice_trips WHERE invoice_id = $1;
--
-- 6) RTO summary (tachograph for driver in window)
--    EXPLAIN ANALYZE
--      SELECT * FROM tachograph_records
--      WHERE driver_id = $1 AND date BETWEEN $2 AND $3
--      ORDER BY started_at DESC;
-- ============================================================

-- 1) trips: composite (organization_id, status) — kanban + active trip queries
CREATE INDEX IF NOT EXISTS idx_trips_org_status
    ON trips (organization_id, status);

-- 2) orders: composite (organization_id, status) — kanban filtering
CREATE INDEX IF NOT EXISTS idx_orders_org_status
    ON orders (organization_id, status);

-- 3) route_points: composite (trip_id, sequence_number) — ordered loads
CREATE INDEX IF NOT EXISTS idx_route_points_trip_sequence
    ON route_points (trip_id, sequence_number);

-- 4) events: composite (entity_type, entity_id, timestamp DESC) — audit lookups
CREATE INDEX IF NOT EXISTS idx_events_entity_timestamp
    ON events (entity_type, entity_id, timestamp DESC);

-- 5) invoice_trips: invoice_id alone for quick expansion
--    (the (invoice_id, trip_id) PK already covers this in btree leftmost,
--    but a dedicated single-column index keeps simple expansions cheap
--    on read-replicas where the PK might be partitioned differently).
CREATE INDEX IF NOT EXISTS idx_invoice_trips_invoice
    ON invoice_trips (invoice_id);

-- 6) tachograph_records: composite (driver_id, date DESC)
--    Drives RTO summary + scoring window queries.
--    Note: real column is `date` (not started_at) per schema 0004
CREATE INDEX IF NOT EXISTS idx_tachograph_driver_started
    ON tachograph_records (driver_id, date DESC);

-- 7) tachograph_records: composite (driver_id, date) — getDriverHoursSummary
CREATE INDEX IF NOT EXISTS idx_tachograph_driver_date
    ON tachograph_records (driver_id, date);

-- 8) temperature_readings: trip_id + recorded_at DESC.
--    Note: 0014_cold_chain_v0.sql may already provide this; the IF NOT
--    EXISTS guard keeps the migration idempotent either way.
CREATE INDEX IF NOT EXISTS idx_temp_readings_trip_recorded
    ON temperature_readings (trip_id, recorded_at DESC);

-- 9) vehicle_positions: vehicle_id + recorded_at DESC.
--    Same idempotency guard — earlier waves may have created this index.
CREATE INDEX IF NOT EXISTS idx_vehicle_positions_vehicle_recorded
    ON vehicle_positions (vehicle_id, recorded_at DESC);

-- 10) fines: composite (driver_id, violation_date) — scoring window
CREATE INDEX IF NOT EXISTS idx_fines_driver_violation_date
    ON fines (driver_id, violation_date DESC);

-- 11) trips: (driver_id, created_at) — driver scoring window
CREATE INDEX IF NOT EXISTS idx_trips_driver_created
    ON trips (driver_id, created_at DESC);

-- 12) invoice_adjustments: (invoice_id, created_at DESC) for listAdjustments
CREATE INDEX IF NOT EXISTS idx_invoice_adjustments_invoice_created
    ON invoice_adjustments (invoice_id, created_at DESC);
