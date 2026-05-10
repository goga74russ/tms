-- ============================================================
-- Round 2B — Monetization framework.
-- Plans, subscriptions, payments, usage counters.
-- Plan limits NOT yet enforced on existing routes — infra only.
-- ============================================================

CREATE TABLE IF NOT EXISTS "plans" (
    "id" text PRIMARY KEY NOT NULL,
    "name_ru" text NOT NULL,
    "price_monthly_kopecks" integer NOT NULL DEFAULT 0,
    "vehicle_limit" integer,
    "monthly_orders_limit" integer,
    "copilot_messages_daily" integer,
    "features" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "created_at" timestamptz NOT NULL DEFAULT now(),
    "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

-- Seed catalogue. Use INSERT ... ON CONFLICT to make migration re-runnable.
INSERT INTO "plans" ("id", "name_ru", "price_monthly_kopecks", "vehicle_limit", "monthly_orders_limit", "copilot_messages_daily", "features") VALUES
    ('free',       'Free',       0,       5,    50,   0,    '{"ai_copilot":false,"edi":false,"marking":false,"osago_monitoring":false,"tachograph":false,"adr":false,"multi_tenant":false,"sso":false,"api_export":false,"priority_support":false,"custom_integrations":false}'::jsonb),
    ('pro',        'Pro',        290000,  30,   NULL, 500,  '{"ai_copilot":true,"edi":true,"marking":true,"osago_monitoring":false,"tachograph":false,"adr":false,"multi_tenant":false,"sso":false,"api_export":true,"priority_support":false,"custom_integrations":false}'::jsonb),
    ('business',   'Business',   990000,  100,  NULL, 2000, '{"ai_copilot":true,"edi":true,"marking":true,"osago_monitoring":true,"tachograph":true,"adr":true,"multi_tenant":true,"sso":true,"api_export":true,"priority_support":true,"custom_integrations":false}'::jsonb),
    ('enterprise', 'Enterprise', 0,       NULL, NULL, NULL, '{"ai_copilot":true,"edi":true,"marking":true,"osago_monitoring":true,"tachograph":true,"adr":true,"multi_tenant":true,"sso":true,"api_export":true,"priority_support":true,"custom_integrations":true}'::jsonb)
ON CONFLICT ("id") DO UPDATE SET
    "name_ru" = EXCLUDED."name_ru",
    "price_monthly_kopecks" = EXCLUDED."price_monthly_kopecks",
    "vehicle_limit" = EXCLUDED."vehicle_limit",
    "monthly_orders_limit" = EXCLUDED."monthly_orders_limit",
    "copilot_messages_daily" = EXCLUDED."copilot_messages_daily",
    "features" = EXCLUDED."features",
    "updated_at" = now();
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "subscriptions" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
    "plan_id" text NOT NULL REFERENCES "plans"("id"),
    "status" text NOT NULL DEFAULT 'trial',
    "trial_ends_at" timestamptz,
    "current_period_start" timestamptz NOT NULL DEFAULT now(),
    "current_period_end" timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
    "cancel_at_period_end" boolean NOT NULL DEFAULT false,
    "payment_provider" text,
    "payment_external_id" text,
    "created_at" timestamptz NOT NULL DEFAULT now(),
    "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_subscriptions_org" ON "subscriptions"("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_subscriptions_status" ON "subscriptions"("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_subscriptions_period_end" ON "subscriptions"("current_period_end");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "payments" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "subscription_id" uuid NOT NULL REFERENCES "subscriptions"("id") ON DELETE CASCADE,
    "amount_kopecks" integer NOT NULL,
    "status" text NOT NULL DEFAULT 'pending',
    "provider_payment_id" text,
    "paid_at" timestamptz,
    "receipt_url" text,
    "failure_reason" text,
    "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_payments_subscription" ON "payments"("subscription_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payments_provider_id" ON "payments"("provider_payment_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "usage_counters" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
    "period_start" timestamptz NOT NULL,
    "vehicles_count" integer NOT NULL DEFAULT 0,
    "orders_count" integer NOT NULL DEFAULT 0,
    "copilot_messages_count" integer NOT NULL DEFAULT 0,
    "created_at" timestamptz NOT NULL DEFAULT now(),
    "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_usage_counters_org_period" ON "usage_counters"("organization_id", "period_start");
