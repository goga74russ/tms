ALTER TABLE trips
    ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

UPDATE trips t
SET organization_id = COALESCE(
    (
        SELECT o.organization_id
        FROM trip_orders tor
        JOIN orders o ON o.id = tor.order_id
        WHERE tor.trip_id = t.id
          AND o.organization_id IS NOT NULL
        ORDER BY tor.linked_at
        LIMIT 1
    ),
    (
        SELECT o.organization_id
        FROM orders o
        WHERE o.trip_id = t.id
          AND o.organization_id IS NOT NULL
        ORDER BY o.created_at
        LIMIT 1
    ),
    (
        SELECT v.organization_id
        FROM vehicles v
        WHERE v.id = t.vehicle_id
    ),
    (
        SELECT d.organization_id
        FROM drivers d
        WHERE d.id = t.driver_id
    ),
    (
        SELECT u.organization_id
        FROM users u
        WHERE u.id = t.created_by
    )
)
WHERE t.organization_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_trips_org ON trips(organization_id);
