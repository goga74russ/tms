CREATE TABLE "notification_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"telegram_chat_id" varchar(50) NOT NULL,
	"telegram_username" varchar(100),
	"event_types" jsonb DEFAULT '["*"]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "addresses" ALTER COLUMN "lat" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "addresses" ALTER COLUMN "lon" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "fines" ALTER COLUMN "amount" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "subtotal" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "vat_amount" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "total" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "med_inspections" ALTER COLUMN "temperature" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "cargo_weight_kg" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "cargo_volume_m3" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "loading_lat" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "loading_lon" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "unloading_lat" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "unloading_lon" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "repair_requests" ALTER COLUMN "total_cost" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "repair_requests" ALTER COLUMN "odometer_at_repair" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "route_points" ALTER COLUMN "lat" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "route_points" ALTER COLUMN "lon" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "tariffs" ALTER COLUMN "rate_per_km" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "tariffs" ALTER COLUMN "rate_per_ton" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "tariffs" ALTER COLUMN "rate_per_hour" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "tariffs" ALTER COLUMN "fixed_rate" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "tariffs" ALTER COLUMN "combined_fixed_rate" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "tariffs" ALTER COLUMN "combined_km_threshold" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "tariffs" ALTER COLUMN "combined_rate_per_km" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "tariffs" ALTER COLUMN "idle_rate_per_hour" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "tariffs" ALTER COLUMN "extra_point_rate" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "tariffs" ALTER COLUMN "night_coefficient" SET DATA TYPE numeric(5, 2);--> statement-breakpoint
ALTER TABLE "tariffs" ALTER COLUMN "urgent_coefficient" SET DATA TYPE numeric(5, 2);--> statement-breakpoint
ALTER TABLE "tariffs" ALTER COLUMN "return_percentage" SET DATA TYPE numeric(5, 2);--> statement-breakpoint
ALTER TABLE "tariffs" ALTER COLUMN "cancellation_fee" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "tariffs" ALTER COLUMN "weekend_coefficient" SET DATA TYPE numeric(5, 2);--> statement-breakpoint
ALTER TABLE "tariffs" ALTER COLUMN "vat_rate" SET DATA TYPE numeric(5, 2);--> statement-breakpoint
ALTER TABLE "tariffs" ALTER COLUMN "min_trip_cost" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "trips" ALTER COLUMN "planned_distance_km" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "trips" ALTER COLUMN "actual_distance_km" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "trips" ALTER COLUMN "odometer_start" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "trips" ALTER COLUMN "odometer_end" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "trips" ALTER COLUMN "fuel_start" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "trips" ALTER COLUMN "fuel_end" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "vehicles" ALTER COLUMN "payload_capacity_kg" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "vehicles" ALTER COLUMN "payload_volume_m3" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "vehicles" ALTER COLUMN "current_odometer_km" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "vehicles" ALTER COLUMN "fuel_tank_liters" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "vehicles" ALTER COLUMN "fuel_norm_per_100km" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "vehicles" ALTER COLUMN "maintenance_next_km" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "waybills" ALTER COLUMN "odometer_out" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "waybills" ALTER COLUMN "odometer_in" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "waybills" ALTER COLUMN "fuel_out" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "waybills" ALTER COLUMN "fuel_in" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "drivers" ADD COLUMN "power_of_attorney_number" varchar(50);--> statement-breakpoint
ALTER TABLE "drivers" ADD COLUMN "power_of_attorney_expiry" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "drivers" ADD COLUMN "fuel_card_number" varchar(50);--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "external_id" varchar(255);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "multi_tier_allowed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "max_tiers" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "temperature_min" double precision;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "temperature_max" double precision;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "loading_type" varchar(20);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "hydraulic_lift_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "loading_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "unloading_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "contractor_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "fuel_card_number" varchar(50);--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "transponder_number" varchar(50);--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "has_hydraulic_lift" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_subscriptions" ADD CONSTRAINT "notification_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_subs_chat_id_idx" ON "notification_subscriptions" USING btree ("telegram_chat_id");--> statement-breakpoint
CREATE INDEX "notification_subs_user_id_idx" ON "notification_subscriptions" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_contractor_id_contractors_id_fk" FOREIGN KEY ("contractor_id") REFERENCES "public"."contractors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_events_external_id" ON "events" USING btree ("external_id");--> statement-breakpoint
CREATE INDEX "idx_med_access_log_user" ON "med_access_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_med_access_log_driver" ON "med_access_log" USING btree ("target_driver_id");--> statement-breakpoint
CREATE INDEX "idx_med_access_log_accessed_at" ON "med_access_log" USING btree ("accessed_at");--> statement-breakpoint
CREATE INDEX "idx_users_contractor" ON "users" USING btree ("contractor_id");