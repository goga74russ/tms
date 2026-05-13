-- ============================================================
-- Round 2A — Compliance breadth
--   • drivers.tachograph_card_number — link DDD upload to driver
--   • organizations.adr_strict_mode   — block trip assignment when ADR fails
--   • osago_checks                     — РСА-АИС status snapshots
--   • marking_verifications            — Честный знак / ЦРПТ codes
-- All tables stay org-scoped so other tenants never see another's data.
-- ============================================================

ALTER TABLE "drivers"
    ADD COLUMN IF NOT EXISTS "tachograph_card_number" varchar(32);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_drivers_tachograph_card"
    ON "drivers" ("tachograph_card_number");
--> statement-breakpoint

ALTER TABLE "organizations"
    ADD COLUMN IF NOT EXISTS "adr_strict_mode" boolean NOT NULL DEFAULT false;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "osago_checks" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "organization_id" uuid REFERENCES "organizations"("id") ON DELETE CASCADE,
    "vehicle_id" uuid NOT NULL REFERENCES "vehicles"("id") ON DELETE CASCADE,
    "checked_at" timestamptz NOT NULL DEFAULT now(),
    "valid" boolean NOT NULL,
    "expires_at" timestamptz,
    "insurer" text,
    "policy_number" text,
    "raw_response" jsonb,
    "provider_name" text NOT NULL DEFAULT 'mock'
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_osago_checks_vehicle"
    ON "osago_checks" ("vehicle_id", "checked_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_osago_checks_org"
    ON "osago_checks" ("organization_id", "checked_at" DESC);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "marking_verifications" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "organization_id" uuid REFERENCES "organizations"("id") ON DELETE CASCADE,
    "lot_id" uuid REFERENCES "shipment_lots"("id") ON DELETE SET NULL,
    "code" text NOT NULL,
    "verified_at" timestamptz NOT NULL DEFAULT now(),
    "valid" boolean NOT NULL,
    "category" text,
    "product_name" text,
    "gtin" text,
    "serial" text,
    "raw_response" jsonb,
    "provider_name" text NOT NULL DEFAULT 'mock'
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_marking_verifications_org_code"
    ON "marking_verifications" ("organization_id", "code");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_marking_verifications_lot"
    ON "marking_verifications" ("lot_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "tachograph_uploads" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "organization_id" uuid REFERENCES "organizations"("id") ON DELETE CASCADE,
    "driver_id" uuid REFERENCES "drivers"("id") ON DELETE SET NULL,
    "driver_card_number" varchar(32),
    "vehicle_vin" varchar(17),
    "period_from" timestamptz,
    "period_to" timestamptz,
    "file_name" text,
    "file_size_bytes" integer,
    "records_inserted" integer NOT NULL DEFAULT 0,
    "total_driving_minutes" integer NOT NULL DEFAULT 0,
    "uploaded_by" uuid REFERENCES "users"("id"),
    "uploaded_at" timestamptz NOT NULL DEFAULT now(),
    "parse_warnings" jsonb
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tachograph_uploads_org"
    ON "tachograph_uploads" ("organization_id", "uploaded_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tachograph_uploads_driver"
    ON "tachograph_uploads" ("driver_id", "uploaded_at" DESC);
