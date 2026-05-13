-- Wave 4: Carrier subcontracting v0.
-- 1) contractors.is_carrier — флаг "может выполнять наши перевозки".
-- 2) carrier_contracts — договоры с перевозчиками с дефолтными ставками.
-- 3) trips.carrier_contractor_id — рейс выполняется субподрядчиком.

ALTER TABLE contractors
    ADD COLUMN IF NOT EXISTS is_carrier boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_contractors_is_carrier
    ON contractors (is_carrier)
    WHERE is_carrier = true;

CREATE TABLE IF NOT EXISTS carrier_contracts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    contractor_id uuid NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
    number varchar(100) NOT NULL,
    start_date timestamptz NOT NULL,
    end_date timestamptz,
    default_rate_per_km numeric(12, 2),
    default_rate_per_ton numeric(12, 2),
    status varchar(20) NOT NULL DEFAULT 'draft',
    organization_id uuid REFERENCES organizations(id),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_carrier_contracts_contractor
    ON carrier_contracts (contractor_id);
CREATE INDEX IF NOT EXISTS idx_carrier_contracts_status
    ON carrier_contracts (status);
CREATE INDEX IF NOT EXISTS idx_carrier_contracts_org
    ON carrier_contracts (organization_id);

ALTER TABLE trips
    ADD COLUMN IF NOT EXISTS carrier_contractor_id uuid REFERENCES contractors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_trips_carrier_contractor
    ON trips (carrier_contractor_id)
    WHERE carrier_contractor_id IS NOT NULL;
