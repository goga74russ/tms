-- ============================================================
-- Migration 0002: Performance indexes (M-3 fix)
-- Date: 2026-03-16
-- Adds missing createdAt indexes on invoices, fines, repairRequests
-- for production query performance on time-range filters.
-- ============================================================

-- repairRequests: sort/filter by date
CREATE INDEX IF NOT EXISTS idx_repairs_created_at
    ON repair_requests (created_at DESC);

-- fines: sort by date + filter by violation date
CREATE INDEX IF NOT EXISTS idx_fines_created_at
    ON fines (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fines_violation_date
    ON fines (violation_date DESC);

-- invoices: the most critical — finance reports filter by period
CREATE INDEX IF NOT EXISTS idx_invoices_created_at
    ON invoices (created_at DESC);

-- composite: status + date for paginated invoice lists
CREATE INDEX IF NOT EXISTS idx_invoices_status_created
    ON invoices (status, created_at DESC);

-- composite: contractor + period for billing reports
CREATE INDEX IF NOT EXISTS idx_invoices_contractor_period
    ON invoices (contractor_id, period_start, period_end);

-- trips: completion date for analytics (profitability, KPI)
CREATE INDEX IF NOT EXISTS idx_trips_completion_date
    ON trips (actual_completion_at DESC)
    WHERE actual_completion_at IS NOT NULL;

-- claims: sort/filter by creation date
CREATE INDEX IF NOT EXISTS idx_claims_created
    ON claims (created_at DESC);
