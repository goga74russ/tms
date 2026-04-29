\set ON_ERROR_STOP on

CREATE TEMP TABLE integrity_violations (
    check_name text PRIMARY KEY,
    violation_count bigint NOT NULL
);

INSERT INTO integrity_violations
SELECT 'trips_missing_org_scope', count(*)
FROM trips t
WHERE t.organization_id IS NULL
  AND EXISTS (
      SELECT 1
      FROM users u
      WHERE u.id = t.created_by
        AND u.organization_id IS NOT NULL
  );

INSERT INTO integrity_violations
SELECT 'trip_orders_cross_org', count(*)
FROM trip_orders tor
JOIN trips t ON t.id = tor.trip_id
JOIN orders o ON o.id = tor.order_id
WHERE t.organization_id IS NOT NULL
  AND o.organization_id IS NOT NULL
  AND t.organization_id <> o.organization_id;

INSERT INTO integrity_violations
SELECT 'orders_trip_id_missing_trip_orders_link', count(*)
FROM orders o
WHERE o.trip_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM trip_orders tor
      WHERE tor.trip_id = o.trip_id
        AND tor.order_id = o.id
  );

INSERT INTO integrity_violations
SELECT 'route_points_order_not_linked_to_trip', count(*)
FROM route_points rp
WHERE rp.order_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM trip_orders tor
      WHERE tor.trip_id = rp.trip_id
        AND tor.order_id = rp.order_id
  );

INSERT INTO integrity_violations
SELECT 'drivers_user_org_mismatch', count(*)
FROM drivers d
JOIN users u ON u.id = d.user_id
WHERE d.organization_id IS NOT NULL
  AND u.organization_id IS NOT NULL
  AND d.organization_id <> u.organization_id;

INSERT INTO integrity_violations
SELECT 'users_contractor_org_mismatch', count(*)
FROM users u
JOIN contractors c ON c.id = u.contractor_id
WHERE u.organization_id IS NOT NULL
  AND c.organization_id IS NOT NULL
  AND u.organization_id <> c.organization_id;

INSERT INTO integrity_violations
SELECT 'trips_vehicle_org_mismatch', count(*)
FROM trips t
JOIN vehicles v ON v.id = t.vehicle_id
WHERE t.organization_id IS NOT NULL
  AND v.organization_id IS NOT NULL
  AND t.organization_id <> v.organization_id;

INSERT INTO integrity_violations
SELECT 'trips_driver_org_mismatch', count(*)
FROM trips t
JOIN drivers d ON d.id = t.driver_id
WHERE t.organization_id IS NOT NULL
  AND d.organization_id IS NOT NULL
  AND t.organization_id <> d.organization_id;

INSERT INTO integrity_violations
SELECT 'trips_trailer_org_mismatch', count(*)
FROM trips t
JOIN trailers tr ON tr.id = t.trailer_id
WHERE t.organization_id IS NOT NULL
  AND tr.organization_id IS NOT NULL
  AND t.organization_id <> tr.organization_id;


INSERT INTO integrity_violations
SELECT 'orders_missing_default_shipment_lot', count(*)
FROM orders o
WHERE NOT EXISTS (
    SELECT 1
    FROM shipment_lots sl
    WHERE sl.order_id = o.id
      AND sl.sequence = 1
);

INSERT INTO integrity_violations
SELECT 'trip_orders_missing_lot_assignment', count(*)
FROM trip_orders tor
WHERE NOT EXISTS (
    SELECT 1
    FROM shipment_lots sl
    JOIN trip_lot_assignments tla ON tla.shipment_lot_id = sl.id
    WHERE sl.order_id = tor.order_id
      AND tla.trip_id = tor.trip_id
);

INSERT INTO integrity_violations
SELECT 'shipment_lots_cross_org', count(*)
FROM shipment_lots sl
JOIN orders o ON o.id = sl.order_id
WHERE sl.organization_id IS NOT NULL
  AND o.organization_id IS NOT NULL
  AND sl.organization_id <> o.organization_id;

INSERT INTO integrity_violations
SELECT 'trip_lot_assignments_cross_org', count(*)
FROM trip_lot_assignments tla
JOIN trips t ON t.id = tla.trip_id
JOIN orders o ON o.id = tla.order_id
JOIN shipment_lots sl ON sl.id = tla.shipment_lot_id
WHERE (tla.organization_id IS NOT NULL AND t.organization_id IS NOT NULL AND tla.organization_id <> t.organization_id)
   OR (tla.organization_id IS NOT NULL AND o.organization_id IS NOT NULL AND tla.organization_id <> o.organization_id)
   OR (tla.organization_id IS NOT NULL AND sl.organization_id IS NOT NULL AND tla.organization_id <> sl.organization_id);

INSERT INTO integrity_violations
SELECT 'shipment_facts_cross_org', count(*)
FROM shipment_facts sf
JOIN trips t ON t.id = sf.trip_id
JOIN orders o ON o.id = sf.order_id
JOIN shipment_lots sl ON sl.id = sf.shipment_lot_id
WHERE (sf.organization_id IS NOT NULL AND t.organization_id IS NOT NULL AND sf.organization_id <> t.organization_id)
   OR (sf.organization_id IS NOT NULL AND o.organization_id IS NOT NULL AND sf.organization_id <> o.organization_id)
   OR (sf.organization_id IS NOT NULL AND sl.organization_id IS NOT NULL AND sf.organization_id <> sl.organization_id);
INSERT INTO integrity_violations
SELECT 'invoices_contract_contractor_mismatch', count(*)
FROM invoices i
JOIN contracts c ON c.id = i.contract_id
WHERE i.contractor_id <> c.contractor_id;

TABLE integrity_violations
ORDER BY check_name;

DO $$
DECLARE
    failing_checks bigint;
BEGIN
    SELECT count(*) INTO failing_checks
    FROM integrity_violations
    WHERE violation_count > 0;

    IF failing_checks > 0 THEN
        RAISE EXCEPTION 'DB integrity check failed: % failing checks', failing_checks;
    END IF;
END $$;
