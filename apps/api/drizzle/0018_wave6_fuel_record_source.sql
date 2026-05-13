-- Wave 6: provenance column on fuel_records so we can distinguish
-- manually-entered records from synthesised ones (mock fuel-card sync)
-- and, eventually, real provider feeds.

ALTER TABLE fuel_records
    ADD COLUMN IF NOT EXISTS source VARCHAR(50) NOT NULL DEFAULT 'manual';

CREATE INDEX IF NOT EXISTS idx_fuel_records_source ON fuel_records (source);
