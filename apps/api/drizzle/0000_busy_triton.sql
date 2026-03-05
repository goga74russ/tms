CREATE TYPE "public"."fine_status" AS ENUM('new', 'confirmed', 'paid', 'appealed');--> statement-breakpoint
CREATE TYPE "public"."inspection_decision" AS ENUM('approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'sent', 'paid', 'overdue', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('draft', 'confirmed', 'assigned', 'in_transit', 'delivered', 'returned', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."repair_priority" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."repair_source" AS ENUM('auto_inspection', 'driver', 'mechanic', 'scheduled');--> statement-breakpoint
CREATE TYPE "public"."repair_status" AS ENUM('created', 'waiting_parts', 'in_progress', 'done');--> statement-breakpoint
CREATE TYPE "public"."restriction_zone_type" AS ENUM('mkad', 'ttk', 'city');--> statement-breakpoint
CREATE TYPE "public"."route_point_status" AS ENUM('pending', 'arrived', 'completed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."route_point_type" AS ENUM('loading', 'unloading');--> statement-breakpoint
CREATE TYPE "public"."tariff_type" AS ENUM('per_km', 'per_ton', 'per_hour', 'fixed_route', 'combined');--> statement-breakpoint
CREATE TYPE "public"."trip_status" AS ENUM('planning', 'assigned', 'inspection', 'waybill_issued', 'loading', 'in_transit', 'completed', 'billed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('logist', 'dispatcher', 'manager', 'mechanic', 'medic', 'repair_service', 'driver', 'accountant', 'admin', 'client');--> statement-breakpoint
CREATE TYPE "public"."vehicle_status" AS ENUM('available', 'assigned', 'in_trip', 'maintenance', 'broken', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."waybill_status" AS ENUM('formed', 'open', 'closed');--> statement-breakpoint
CREATE TABLE "addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"address_string" text NOT NULL,
	"lat" real NOT NULL,
	"lon" real NOT NULL,
	"type" "route_point_type" NOT NULL,
	"contractor_id" uuid,
	"fias_id" varchar(50),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checklist_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" varchar(10) NOT NULL,
	"version" varchar(20) NOT NULL,
	"name" varchar(255) NOT NULL,
	"items" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contractors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(500) NOT NULL,
	"inn" varchar(12) NOT NULL,
	"kpp" varchar(9),
	"legal_address" text NOT NULL,
	"phone" varchar(20),
	"email" varchar(255),
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contractor_id" uuid NOT NULL,
	"number" varchar(100) NOT NULL,
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drivers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"full_name" varchar(255) NOT NULL,
	"birth_date" timestamp with time zone NOT NULL,
	"license_number" varchar(20) NOT NULL,
	"license_categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"license_expiry" timestamp with time zone NOT NULL,
	"med_certificate_expiry" timestamp with time zone,
	"personal_data_consent" boolean DEFAULT false NOT NULL,
	"personal_data_consent_date" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"author_id" uuid NOT NULL,
	"author_role" varchar(30) NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" uuid NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"conflict" boolean DEFAULT false NOT NULL,
	"offline_created_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "fines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"driver_id" uuid,
	"status" "fine_status" DEFAULT 'new' NOT NULL,
	"violation_date" timestamp with time zone NOT NULL,
	"violation_type" varchar(255) NOT NULL,
	"amount" real NOT NULL,
	"resolution_number" varchar(100),
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" varchar(50) NOT NULL,
	"contractor_id" uuid NOT NULL,
	"contract_id" uuid,
	"type" varchar(20) NOT NULL,
	"status" "invoice_status" DEFAULT 'draft' NOT NULL,
	"trip_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"subtotal" real NOT NULL,
	"vat_amount" real NOT NULL,
	"total" real NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "med_access_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"target_driver_id" uuid NOT NULL,
	"action" varchar(50) NOT NULL,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" varchar(45)
);
--> statement-breakpoint
CREATE TABLE "med_inspections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"driver_id" uuid NOT NULL,
	"medic_id" uuid NOT NULL,
	"trip_id" uuid,
	"checklist_version" varchar(20) NOT NULL,
	"systolic_bp" integer NOT NULL,
	"diastolic_bp" integer NOT NULL,
	"heart_rate" integer NOT NULL,
	"temperature" real NOT NULL,
	"condition" text NOT NULL,
	"alcohol_test" varchar(10) NOT NULL,
	"complaints" text,
	"decision" "inspection_decision" NOT NULL,
	"comment" text,
	"signature" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" varchar(50) NOT NULL,
	"contractor_id" uuid NOT NULL,
	"contract_id" uuid,
	"status" "order_status" DEFAULT 'draft' NOT NULL,
	"cargo_description" text NOT NULL,
	"cargo_weight_kg" real NOT NULL,
	"cargo_volume_m3" real,
	"cargo_places" integer,
	"cargo_type" varchar(100),
	"loading_address" text NOT NULL,
	"loading_lat" real,
	"loading_lon" real,
	"loading_window_start" timestamp with time zone,
	"loading_window_end" timestamp with time zone,
	"unloading_address" text NOT NULL,
	"unloading_lat" real,
	"unloading_lon" real,
	"unloading_window_start" timestamp with time zone,
	"unloading_window_end" timestamp with time zone,
	"vehicle_requirements" text,
	"notes" text,
	"trip_id" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "permits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"zone_type" "restriction_zone_type" NOT NULL,
	"zone_name" varchar(255) NOT NULL,
	"permit_number" varchar(100) NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_until" timestamp with time zone NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repair_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"status" "repair_status" DEFAULT 'created' NOT NULL,
	"description" text NOT NULL,
	"priority" "repair_priority" NOT NULL,
	"source" "repair_source" NOT NULL,
	"inspection_id" uuid,
	"assigned_to" varchar(255),
	"work_description" text,
	"parts_used" jsonb DEFAULT '[]'::jsonb,
	"total_cost" real DEFAULT 0 NOT NULL,
	"odometer_at_repair" real,
	"photo_urls" jsonb DEFAULT '[]'::jsonb,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "restriction_zones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" "restriction_zone_type" NOT NULL,
	"geo_json" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "route_points" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"order_id" uuid,
	"type" "route_point_type" NOT NULL,
	"status" "route_point_status" DEFAULT 'pending' NOT NULL,
	"sequence_number" integer NOT NULL,
	"address" text NOT NULL,
	"lat" real,
	"lon" real,
	"window_start" timestamp with time zone,
	"window_end" timestamp with time zone,
	"arrived_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"signature_url" text,
	"photo_urls" jsonb DEFAULT '[]'::jsonb,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tachograph_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"driver_id" uuid NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"driving_minutes" integer NOT NULL,
	"rest_minutes" integer NOT NULL,
	"continuous_driving_minutes" integer NOT NULL,
	"weekly_rest_minutes" integer,
	"source" varchar(50) DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tariffs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_id" uuid NOT NULL,
	"type" "tariff_type" NOT NULL,
	"rate_per_km" real,
	"rate_per_ton" real,
	"rate_per_hour" real,
	"fixed_rate" real,
	"combined_fixed_rate" real,
	"combined_km_threshold" real,
	"combined_rate_per_km" real,
	"idle_free_limit_minutes" integer DEFAULT 120 NOT NULL,
	"idle_rate_per_hour" real DEFAULT 0 NOT NULL,
	"extra_point_rate" real DEFAULT 0 NOT NULL,
	"night_coefficient" real DEFAULT 1 NOT NULL,
	"urgent_coefficient" real DEFAULT 1 NOT NULL,
	"return_percentage" real DEFAULT 100 NOT NULL,
	"cancellation_fee" real DEFAULT 0 NOT NULL,
	"weekend_coefficient" real DEFAULT 1 NOT NULL,
	"vat_included" boolean DEFAULT true NOT NULL,
	"vat_rate" real DEFAULT 20 NOT NULL,
	"min_trip_cost" real DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tech_inspections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"mechanic_id" uuid NOT NULL,
	"trip_id" uuid,
	"checklist_version" varchar(20) NOT NULL,
	"items" jsonb NOT NULL,
	"decision" "inspection_decision" NOT NULL,
	"comment" text,
	"signature" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" varchar(50) NOT NULL,
	"status" "trip_status" DEFAULT 'planning' NOT NULL,
	"vehicle_id" uuid,
	"driver_id" uuid,
	"waybill_id" uuid,
	"planned_distance_km" real,
	"actual_distance_km" real,
	"planned_departure_at" timestamp with time zone,
	"actual_departure_at" timestamp with time zone,
	"actual_completion_at" timestamp with time zone,
	"odometer_start" real,
	"odometer_end" real,
	"fuel_start" real,
	"fuel_end" real,
	"notes" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trips_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" text NOT NULL,
	"full_name" varchar(255) NOT NULL,
	"phone" varchar(20),
	"roles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plate_number" varchar(15) NOT NULL,
	"vin" varchar(17) NOT NULL,
	"make" varchar(100) NOT NULL,
	"model" varchar(100) NOT NULL,
	"year" integer NOT NULL,
	"body_type" varchar(100) NOT NULL,
	"payload_capacity_kg" real NOT NULL,
	"payload_volume_m3" real,
	"status" "vehicle_status" DEFAULT 'available' NOT NULL,
	"current_odometer_km" real DEFAULT 0 NOT NULL,
	"fuel_tank_liters" real,
	"fuel_norm_per_100km" real,
	"tech_inspection_expiry" timestamp with time zone,
	"osago_expiry" timestamp with time zone,
	"maintenance_next_date" timestamp with time zone,
	"maintenance_next_km" real,
	"tachograph_calibration_expiry" timestamp with time zone,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicles_plate_number_unique" UNIQUE("plate_number"),
	CONSTRAINT "vehicles_vin_unique" UNIQUE("vin")
);
--> statement-breakpoint
CREATE TABLE "waybills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" varchar(50) NOT NULL,
	"trip_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"driver_id" uuid NOT NULL,
	"status" "waybill_status" DEFAULT 'formed' NOT NULL,
	"tech_inspection_id" uuid NOT NULL,
	"med_inspection_id" uuid NOT NULL,
	"mechanic_signature" text,
	"medic_signature" text,
	"odometer_out" real NOT NULL,
	"odometer_in" real,
	"fuel_out" real,
	"fuel_in" real,
	"departure_at" timestamp with time zone NOT NULL,
	"return_at" timestamp with time zone,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "waybills_number_unique" UNIQUE("number")
);
--> statement-breakpoint
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_contractor_id_contractors_id_fk" FOREIGN KEY ("contractor_id") REFERENCES "public"."contractors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_contractor_id_contractors_id_fk" FOREIGN KEY ("contractor_id") REFERENCES "public"."contractors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fines" ADD CONSTRAINT "fines_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fines" ADD CONSTRAINT "fines_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_contractor_id_contractors_id_fk" FOREIGN KEY ("contractor_id") REFERENCES "public"."contractors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "med_access_log" ADD CONSTRAINT "med_access_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "med_access_log" ADD CONSTRAINT "med_access_log_target_driver_id_drivers_id_fk" FOREIGN KEY ("target_driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "med_inspections" ADD CONSTRAINT "med_inspections_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "med_inspections" ADD CONSTRAINT "med_inspections_medic_id_users_id_fk" FOREIGN KEY ("medic_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "med_inspections" ADD CONSTRAINT "med_inspections_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_contractor_id_contractors_id_fk" FOREIGN KEY ("contractor_id") REFERENCES "public"."contractors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permits" ADD CONSTRAINT "permits_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_requests" ADD CONSTRAINT "repair_requests_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_points" ADD CONSTRAINT "route_points_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_points" ADD CONSTRAINT "route_points_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tachograph_records" ADD CONSTRAINT "tachograph_records_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tariffs" ADD CONSTRAINT "tariffs_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tech_inspections" ADD CONSTRAINT "tech_inspections_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tech_inspections" ADD CONSTRAINT "tech_inspections_mechanic_id_users_id_fk" FOREIGN KEY ("mechanic_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tech_inspections" ADD CONSTRAINT "tech_inspections_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waybills" ADD CONSTRAINT "waybills_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waybills" ADD CONSTRAINT "waybills_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waybills" ADD CONSTRAINT "waybills_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waybills" ADD CONSTRAINT "waybills_tech_inspection_id_tech_inspections_id_fk" FOREIGN KEY ("tech_inspection_id") REFERENCES "public"."tech_inspections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waybills" ADD CONSTRAINT "waybills_med_inspection_id_med_inspections_id_fk" FOREIGN KEY ("med_inspection_id") REFERENCES "public"."med_inspections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_addresses_contractor" ON "addresses" USING btree ("contractor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_contractors_inn" ON "contractors" USING btree ("inn");--> statement-breakpoint
CREATE INDEX "idx_contracts_contractor" ON "contracts" USING btree ("contractor_id");--> statement-breakpoint
CREATE INDEX "idx_drivers_user" ON "drivers" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_events_entity" ON "events" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_events_type" ON "events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "idx_events_timestamp" ON "events" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "idx_events_author" ON "events" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "idx_fines_vehicle" ON "fines" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "idx_fines_driver" ON "fines" USING btree ("driver_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_invoices_number" ON "invoices" USING btree ("number");--> statement-breakpoint
CREATE INDEX "idx_invoices_contractor" ON "invoices" USING btree ("contractor_id");--> statement-breakpoint
CREATE INDEX "idx_med_inspections_driver" ON "med_inspections" USING btree ("driver_id");--> statement-breakpoint
CREATE INDEX "idx_med_inspections_trip" ON "med_inspections" USING btree ("trip_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_orders_number" ON "orders" USING btree ("number");--> statement-breakpoint
CREATE INDEX "idx_orders_status" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_orders_contractor" ON "orders" USING btree ("contractor_id");--> statement-breakpoint
CREATE INDEX "idx_orders_trip" ON "orders" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "idx_permits_vehicle" ON "permits" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "idx_repairs_vehicle" ON "repair_requests" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "idx_repairs_status" ON "repair_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_route_points_trip" ON "route_points" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "idx_tachograph_driver" ON "tachograph_records" USING btree ("driver_id");--> statement-breakpoint
CREATE INDEX "idx_tachograph_date" ON "tachograph_records" USING btree ("date");--> statement-breakpoint
CREATE INDEX "idx_tariffs_contract" ON "tariffs" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "idx_tech_inspections_vehicle" ON "tech_inspections" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "idx_tech_inspections_trip" ON "tech_inspections" USING btree ("trip_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_trips_number" ON "trips" USING btree ("number");--> statement-breakpoint
CREATE INDEX "idx_trips_status" ON "trips" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_trips_vehicle" ON "trips" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "idx_trips_driver" ON "trips" USING btree ("driver_id");--> statement-breakpoint
CREATE INDEX "idx_users_email" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_vehicles_plate" ON "vehicles" USING btree ("plate_number");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_vehicles_vin" ON "vehicles" USING btree ("vin");--> statement-breakpoint
CREATE INDEX "idx_vehicles_status" ON "vehicles" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_waybills_number" ON "waybills" USING btree ("number");--> statement-breakpoint
CREATE INDEX "idx_waybills_trip" ON "waybills" USING btree ("trip_id");