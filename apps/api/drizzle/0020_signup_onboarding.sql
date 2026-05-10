-- ============================================================
-- Round 1B — Self-serve signup + onboarding wizard.
-- Adds email_verifications table for the 6-digit code flow,
-- plus extends users/organizations with verification + onboarding state.
-- ============================================================

CREATE TABLE IF NOT EXISTS "email_verifications" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "email" varchar(255) NOT NULL,
    "code" char(6) NOT NULL,
    "expires_at" timestamptz NOT NULL,
    "used_at" timestamptz,
    "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_email_verifications_email"
    ON "email_verifications" ("email");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_email_verifications_created"
    ON "email_verifications" ("created_at" DESC);
--> statement-breakpoint

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verified_at" timestamptz;
--> statement-breakpoint

ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "onboarding_step" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "onboarding_completed_at" timestamptz;
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "onboarding_scenario" text;
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "kpp" text;
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "ogrn" text;
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "legal_address" text;
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "bank_bik" text;
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "bank_account" text;
