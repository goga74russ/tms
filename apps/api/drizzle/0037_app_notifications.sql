-- 0037: In-app уведомления (колокольчик в навигации).
-- Отдельный канал от Telegram. Строка = адресат: user_id + created_at + read_at
-- дают встроенный лог «кому / когда отправлено / когда прочитано» — доказуемость
-- своевременного уведомления подписанта ЭТрН (4-часовой срок Т2).
CREATE TABLE IF NOT EXISTS "app_notifications" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
    "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
    "type" varchar(64) NOT NULL,
    "title" varchar(255) NOT NULL,
    "message" text NOT NULL,
    "trip_id" uuid REFERENCES "trips"("id") ON DELETE set null,
    "meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "read_at" timestamptz,
    "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_app_notifications_user_unread" ON "app_notifications" ("user_id","read_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_app_notifications_org" ON "app_notifications" ("organization_id");
