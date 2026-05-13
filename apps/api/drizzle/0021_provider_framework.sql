-- ============================================================
-- Round 1C — Provider adapter framework
-- Stores encrypted credentials for pluggable third-party providers
-- (signature, EDI, telematics, fuel cards, fines, marking, payment, email).
-- Encryption uses AES-256-GCM with CREDENTIALS_KEY env var.
-- ============================================================

CREATE TABLE IF NOT EXISTS "provider_credentials" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
    "provider_type" text NOT NULL,
    "provider_name" text NOT NULL,
    "status" text NOT NULL DEFAULT 'mock',
    "encrypted_credentials" text,
    "last_health_check_at" timestamptz,
    "last_error" text,
    "created_at" timestamptz NOT NULL DEFAULT now(),
    "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_provider_credentials_org_type_name"
    ON "provider_credentials" ("organization_id", "provider_type", "provider_name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_provider_credentials_org_type"
    ON "provider_credentials" ("organization_id", "provider_type");
