-- Deep Fleet Operations Migration
-- Sprint: Deep Fleet

-- 1. Enums
DO $$ BEGIN
    CREATE TYPE fuel_type AS ENUM ('diesel', 'petrol', 'gas', 'adblue');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE odometer_source AS ENUM ('manual', 'gps', 'waybill', 'inspection');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE downtime_reason AS ENUM ('repair', 'waiting_load', 'waiting_docs', 'driver_absence', 'weather', 'other');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE maintenance_type AS ENUM ('to1', 'to2', 'to3', 'seasonal', 'other');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE maintenance_status AS ENUM ('planned', 'overdue', 'done', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 2. New columns in vehicles
ALTER TABLE vehicles
    ADD COLUMN IF NOT EXISTS total_fuel_consumed_l DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_odometer_km DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS last_odometer_updated_at TIMESTAMPTZ;

-- 3. fuel_records
CREATE TABLE IF NOT EXISTS fuel_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    recorded_at TIMESTAMPTZ NOT NULL,
    liters NUMERIC(10,2) NOT NULL,
    cost_per_liter NUMERIC(10,2) NOT NULL,
    total_cost NUMERIC(12,2) NOT NULL,
    fuel_type fuel_type NOT NULL,
    station VARCHAR(255),
    odometer_at_fill DOUBLE PRECISION,
    trip_id UUID REFERENCES trips(id) ON DELETE SET NULL,
    driver_id UUID REFERENCES drivers(id),
    organization_id UUID REFERENCES organizations(id),
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. odometer_readings
CREATE TABLE IF NOT EXISTS odometer_readings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    recorded_at TIMESTAMPTZ NOT NULL,
    value_km DOUBLE PRECISION NOT NULL,
    source odometer_source NOT NULL DEFAULT 'manual',
    trip_id UUID REFERENCES trips(id) ON DELETE SET NULL,
    driver_id UUID REFERENCES drivers(id),
    organization_id UUID REFERENCES organizations(id),
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. downtime_records
CREATE TABLE IF NOT EXISTS downtime_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    start_at TIMESTAMPTZ NOT NULL,
    end_at TIMESTAMPTZ,
    reason_code downtime_reason NOT NULL,
    description TEXT,
    trip_id UUID REFERENCES trips(id) ON DELETE SET NULL,
    organization_id UUID REFERENCES organizations(id),
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. maintenance_schedule
CREATE TABLE IF NOT EXISTS maintenance_schedule (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    maintenance_type maintenance_type NOT NULL,
    planned_date TIMESTAMPTZ,
    planned_odometer_km DOUBLE PRECISION,
    actual_date TIMESTAMPTZ,
    actual_odometer_km DOUBLE PRECISION,
    status maintenance_status NOT NULL DEFAULT 'planned',
    cost NUMERIC(12,2),
    contractor VARCHAR(255),
    notes TEXT,
    repair_request_id UUID REFERENCES repair_requests(id) ON DELETE SET NULL,
    organization_id UUID REFERENCES organizations(id),
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Indexes
CREATE INDEX IF NOT EXISTS idx_fuel_records_vehicle ON fuel_records(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_fuel_records_driver ON fuel_records(driver_id);
CREATE INDEX IF NOT EXISTS idx_fuel_records_recorded_at ON fuel_records(recorded_at);
CREATE INDEX IF NOT EXISTS idx_fuel_records_trip ON fuel_records(trip_id);
CREATE INDEX IF NOT EXISTS idx_fuel_records_org ON fuel_records(organization_id);

CREATE INDEX IF NOT EXISTS idx_odometer_vehicle ON odometer_readings(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_odometer_recorded_at ON odometer_readings(recorded_at);
CREATE INDEX IF NOT EXISTS idx_odometer_vehicle_recorded ON odometer_readings(vehicle_id, recorded_at);

CREATE INDEX IF NOT EXISTS idx_downtime_vehicle ON downtime_records(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_downtime_start_at ON downtime_records(start_at);
CREATE INDEX IF NOT EXISTS idx_downtime_vehicle_period ON downtime_records(vehicle_id, start_at, end_at);

CREATE INDEX IF NOT EXISTS idx_maintenance_vehicle ON maintenance_schedule(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_status ON maintenance_schedule(status);
CREATE INDEX IF NOT EXISTS idx_maintenance_planned_date ON maintenance_schedule(planned_date);
CREATE INDEX IF NOT EXISTS idx_maintenance_vehicle_status ON maintenance_schedule(vehicle_id, status);
