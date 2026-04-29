DO $$ BEGIN
    CREATE TYPE shipment_lot_status AS ENUM ('planned', 'assigned', 'loading', 'in_transit', 'delivered', 'partially_delivered', 'returned', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE trip_lot_assignment_status AS ENUM ('planned', 'loaded', 'in_transit', 'delivered', 'short', 'damaged', 'returned', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE shipment_fact_type AS ENUM ('loading', 'unloading', 'return', 'correction', 'discrepancy');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE shipment_discrepancy_code AS ENUM ('shortage', 'overage', 'damage', 'refusal', 'wrong_docs', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE document_dossier_scope AS ENUM ('order', 'trip', 'shipment_lot', 'trip_lot_assignment');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE document_dossier_status AS ENUM ('missing', 'draft', 'sent', 'signed', 'received', 'accepted', 'rejected', 'exceptioned');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS shipment_lots (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid REFERENCES organizations(id),
    order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    sequence integer NOT NULL DEFAULT 1,
    status shipment_lot_status NOT NULL DEFAULT 'planned',
    planned_weight_kg double precision,
    planned_volume_m3 double precision,
    planned_places integer,
    loaded_weight_kg double precision,
    loaded_volume_m3 double precision,
    loaded_places integer,
    delivered_weight_kg double precision,
    delivered_volume_m3 double precision,
    delivered_places integer,
    remaining_weight_kg double precision,
    remaining_volume_m3 double precision,
    remaining_places integer,
    cargo_description text,
    cargo_type varchar(100),
    loading_address text,
    loading_date timestamptz,
    loading_window_start timestamptz,
    loading_window_end timestamptz,
    unloading_address text,
    unloading_date timestamptz,
    unloading_window_start timestamptz,
    unloading_window_end timestamptz,
    requirements_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by uuid REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shipment_lots_order ON shipment_lots(order_id);
CREATE INDEX IF NOT EXISTS idx_shipment_lots_org ON shipment_lots(organization_id);
CREATE INDEX IF NOT EXISTS idx_shipment_lots_status ON shipment_lots(status);

CREATE TABLE IF NOT EXISTS trip_lot_assignments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid REFERENCES organizations(id),
    trip_id uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    shipment_lot_id uuid NOT NULL REFERENCES shipment_lots(id) ON DELETE CASCADE,
    assigned_weight_kg double precision,
    assigned_volume_m3 double precision,
    assigned_places integer,
    status trip_lot_assignment_status NOT NULL DEFAULT 'planned',
    loading_route_point_id uuid REFERENCES route_points(id) ON DELETE SET NULL,
    unloading_route_point_id uuid REFERENCES route_points(id) ON DELETE SET NULL,
    document_group_id uuid,
    created_by uuid REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_trip_lot_assignments_unique ON trip_lot_assignments(trip_id, shipment_lot_id);
CREATE INDEX IF NOT EXISTS idx_trip_lot_assignments_trip ON trip_lot_assignments(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_lot_assignments_lot ON trip_lot_assignments(shipment_lot_id);
CREATE INDEX IF NOT EXISTS idx_trip_lot_assignments_order ON trip_lot_assignments(order_id);
CREATE INDEX IF NOT EXISTS idx_trip_lot_assignments_org ON trip_lot_assignments(organization_id);
CREATE INDEX IF NOT EXISTS idx_trip_lot_assignments_status ON trip_lot_assignments(status);

CREATE TABLE IF NOT EXISTS shipment_facts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid REFERENCES organizations(id),
    trip_id uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    shipment_lot_id uuid NOT NULL REFERENCES shipment_lots(id) ON DELETE CASCADE,
    trip_lot_assignment_id uuid REFERENCES trip_lot_assignments(id) ON DELETE SET NULL,
    route_point_id uuid REFERENCES route_points(id) ON DELETE SET NULL,
    fact_type shipment_fact_type NOT NULL,
    weight_kg double precision,
    volume_m3 double precision,
    places integer,
    cargo_condition cargo_condition,
    discrepancy_code shipment_discrepancy_code,
    notes text,
    attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
    gps_lat double precision,
    gps_lon double precision,
    captured_at timestamptz NOT NULL DEFAULT now(),
    captured_by uuid REFERENCES users(id),
    source varchar(50) NOT NULL DEFAULT 'web',
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shipment_facts_trip ON shipment_facts(trip_id);
CREATE INDEX IF NOT EXISTS idx_shipment_facts_order ON shipment_facts(order_id);
CREATE INDEX IF NOT EXISTS idx_shipment_facts_lot ON shipment_facts(shipment_lot_id);
CREATE INDEX IF NOT EXISTS idx_shipment_facts_assignment ON shipment_facts(trip_lot_assignment_id);
CREATE INDEX IF NOT EXISTS idx_shipment_facts_route_point ON shipment_facts(route_point_id);
CREATE INDEX IF NOT EXISTS idx_shipment_facts_org ON shipment_facts(organization_id);

CREATE TABLE IF NOT EXISTS document_dossier_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid REFERENCES organizations(id),
    scope_type document_dossier_scope NOT NULL,
    scope_id uuid NOT NULL,
    document_type varchar(50) NOT NULL,
    required boolean NOT NULL DEFAULT true,
    status document_dossier_status NOT NULL DEFAULT 'missing',
    source_document_id uuid,
    source_document_kind varchar(50),
    due_at timestamptz,
    completed_at timestamptz,
    blocked_reason text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_document_dossier_scope ON document_dossier_items(scope_type, scope_id);
CREATE INDEX IF NOT EXISTS idx_document_dossier_org ON document_dossier_items(organization_id);
CREATE INDEX IF NOT EXISTS idx_document_dossier_status ON document_dossier_items(status);

INSERT INTO shipment_lots (
    organization_id,
    order_id,
    sequence,
    status,
    planned_weight_kg,
    planned_volume_m3,
    planned_places,
    remaining_weight_kg,
    remaining_volume_m3,
    remaining_places,
    cargo_description,
    cargo_type,
    loading_address,
    loading_date,
    loading_window_start,
    loading_window_end,
    unloading_address,
    unloading_date,
    unloading_window_start,
    unloading_window_end,
    requirements_snapshot,
    created_by,
    created_at,
    updated_at
)
SELECT
    o.organization_id,
    o.id,
    1,
    CASE
        WHEN o.status = 'assigned' THEN 'assigned'::shipment_lot_status
        WHEN o.status = 'in_transit' THEN 'in_transit'::shipment_lot_status
        WHEN o.status = 'delivered' THEN 'delivered'::shipment_lot_status
        WHEN o.status = 'returned' THEN 'returned'::shipment_lot_status
        WHEN o.status = 'cancelled' THEN 'cancelled'::shipment_lot_status
        ELSE 'planned'::shipment_lot_status
    END,
    o.cargo_weight_kg,
    o.cargo_volume_m3,
    o.cargo_places,
    CASE WHEN o.status = 'delivered' THEN 0 ELSE o.cargo_weight_kg END,
    CASE WHEN o.status = 'delivered' THEN 0 ELSE o.cargo_volume_m3 END,
    CASE WHEN o.status = 'delivered' THEN 0 ELSE o.cargo_places END,
    o.cargo_description,
    o.cargo_type,
    o.loading_address,
    o.loading_date,
    o.loading_window_start,
    o.loading_window_end,
    o.unloading_address,
    o.unloading_date,
    o.unloading_window_start,
    o.unloading_window_end,
    jsonb_strip_nulls(jsonb_build_object(
        'multiTierAllowed', o.multi_tier_allowed,
        'maxTiers', o.max_tiers,
        'temperatureMin', o.temperature_min,
        'temperatureMax', o.temperature_max,
        'loadingType', o.loading_type,
        'hydraulicLiftRequired', o.hydraulic_lift_required,
        'vehicleRequirements', o.vehicle_requirements
    )),
    o.created_by,
    o.created_at,
    o.updated_at
FROM orders o
WHERE NOT EXISTS (
    SELECT 1 FROM shipment_lots sl WHERE sl.order_id = o.id
);

WITH legacy_links AS (
    SELECT tor.trip_id, tor.order_id, tor.linked_at
    FROM trip_orders tor
    UNION
    SELECT o.trip_id, o.id, o.updated_at
    FROM orders o
    WHERE o.trip_id IS NOT NULL
), route_pairs AS (
    SELECT
        ll.trip_id,
        ll.order_id,
        MIN(CASE WHEN rp.type = 'loading' THEN rp.id::text END)::uuid AS loading_route_point_id,
        MIN(CASE WHEN rp.type = 'unloading' THEN rp.id::text END)::uuid AS unloading_route_point_id
    FROM legacy_links ll
    LEFT JOIN route_points rp ON rp.trip_id = ll.trip_id AND rp.order_id = ll.order_id
    GROUP BY ll.trip_id, ll.order_id
)
INSERT INTO trip_lot_assignments (
    organization_id,
    trip_id,
    order_id,
    shipment_lot_id,
    assigned_weight_kg,
    assigned_volume_m3,
    assigned_places,
    status,
    loading_route_point_id,
    unloading_route_point_id,
    created_by,
    created_at,
    updated_at
)
SELECT
    COALESCE(t.organization_id, sl.organization_id, o.organization_id),
    ll.trip_id,
    ll.order_id,
    sl.id,
    sl.planned_weight_kg,
    sl.planned_volume_m3,
    sl.planned_places,
    CASE
        WHEN t.status = 'loading' THEN 'loaded'::trip_lot_assignment_status
        WHEN t.status = 'in_transit' THEN 'in_transit'::trip_lot_assignment_status
        WHEN t.status IN ('completed', 'billed') THEN 'delivered'::trip_lot_assignment_status
        WHEN t.status = 'cancelled' THEN 'cancelled'::trip_lot_assignment_status
        ELSE 'planned'::trip_lot_assignment_status
    END,
    rp.loading_route_point_id,
    rp.unloading_route_point_id,
    t.created_by,
    COALESCE(ll.linked_at, t.created_at, now()),
    now()
FROM legacy_links ll
JOIN shipment_lots sl ON sl.order_id = ll.order_id AND sl.sequence = 1
JOIN orders o ON o.id = ll.order_id
JOIN trips t ON t.id = ll.trip_id
LEFT JOIN route_pairs rp ON rp.trip_id = ll.trip_id AND rp.order_id = ll.order_id
ON CONFLICT (trip_id, shipment_lot_id) DO NOTHING;
