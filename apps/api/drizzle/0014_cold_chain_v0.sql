-- Wave 2: Cold chain v0 — temperature readings + order SLA columns.
-- Adds a dedicated readings table with breach tracking, plus optional
-- min/max bounds and a cold-chain flag on orders. Real sensors are
-- stubbed for now; the API/DB shape is production-ready.

DO $$
BEGIN
    CREATE TYPE temperature_reading_source AS ENUM ('sensor', 'manual', 'mock');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS cold_chain_required boolean NOT NULL DEFAULT false;
ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS temperature_min_c numeric(5, 2);
ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS temperature_max_c numeric(5, 2);

CREATE TABLE IF NOT EXISTS temperature_readings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
    recorded_at timestamptz NOT NULL DEFAULT now(),
    temp_c numeric(5, 2) NOT NULL,
    sensor_id text,
    latitude double precision,
    longitude double precision,
    source temperature_reading_source NOT NULL DEFAULT 'mock',
    breach boolean NOT NULL DEFAULT false,
    breach_min_c numeric(5, 2),
    breach_max_c numeric(5, 2),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_temp_readings_trip_recorded
    ON temperature_readings (trip_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_temp_readings_order_recorded
    ON temperature_readings (order_id, recorded_at DESC)
    WHERE order_id IS NOT NULL;
