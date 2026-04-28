DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_name = 'orders_trip_id_trips_id_fk'
          AND table_name = 'orders'
    ) THEN
        ALTER TABLE "orders"
        ADD CONSTRAINT "orders_trip_id_trips_id_fk"
        FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE SET NULL;
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "idx_waybills_trip_unique" ON "waybills" ("trip_id");
CREATE INDEX IF NOT EXISTS "idx_invoices_status" ON "invoices" ("status");
