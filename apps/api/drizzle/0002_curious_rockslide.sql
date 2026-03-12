CREATE TYPE "public"."expense_category" AS ENUM('fuel', 'platon', 'parking', 'fine', 'repair', 'toll', 'other');--> statement-breakpoint
CREATE TYPE "public"."incident_severity" AS ENUM('low', 'medium', 'critical');--> statement-breakpoint
CREATE TYPE "public"."incident_status" AS ENUM('open', 'investigating', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."incident_type" AS ENUM('med_inspection', 'tech_inspection', 'road', 'cargo', 'other');--> statement-breakpoint
CREATE TYPE "public"."trailer_type" AS ENUM('tent', 'board', 'refrigerator', 'cistern', 'flatbed', 'container', 'other');--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "incident_type" NOT NULL,
	"severity" "incident_severity" DEFAULT 'low' NOT NULL,
	"status" "incident_status" DEFAULT 'open' NOT NULL,
	"description" text NOT NULL,
	"vehicle_id" uuid,
	"driver_id" uuid,
	"trip_id" uuid,
	"tech_inspection_id" uuid,
	"med_inspection_id" uuid,
	"resolution" text,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid,
	"blocks_release" boolean DEFAULT false NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trailers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plate_number" varchar(20) NOT NULL,
	"vin" varchar(17),
	"type" "trailer_type" NOT NULL,
	"make" varchar(100),
	"model" varchar(100),
	"year" integer,
	"payload_capacity_kg" double precision,
	"payload_volume_m3" double precision,
	"tech_inspection_expiry" timestamp with time zone,
	"osago_expiry" timestamp with time zone,
	"tachograph_calibration_expiry" timestamp with time zone,
	"current_vehicle_id" uuid,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trailers_plate_number_unique" UNIQUE("plate_number")
);
--> statement-breakpoint
CREATE TABLE "waybill_drivers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"waybill_id" uuid NOT NULL,
	"driver_id" uuid NOT NULL,
	"shift_start" timestamp with time zone,
	"shift_end" timestamp with time zone,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waybill_expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"waybill_id" uuid NOT NULL,
	"category" "expense_category" NOT NULL,
	"description" varchar(255),
	"planned_amount" numeric(12, 2),
	"actual_amount" numeric(12, 2),
	"receipt_url" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_tech_inspection_id_tech_inspections_id_fk" FOREIGN KEY ("tech_inspection_id") REFERENCES "public"."tech_inspections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_med_inspection_id_med_inspections_id_fk" FOREIGN KEY ("med_inspection_id") REFERENCES "public"."med_inspections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trailers" ADD CONSTRAINT "trailers_current_vehicle_id_vehicles_id_fk" FOREIGN KEY ("current_vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waybill_drivers" ADD CONSTRAINT "waybill_drivers_waybill_id_waybills_id_fk" FOREIGN KEY ("waybill_id") REFERENCES "public"."waybills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waybill_drivers" ADD CONSTRAINT "waybill_drivers_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waybill_expenses" ADD CONSTRAINT "waybill_expenses_waybill_id_waybills_id_fk" FOREIGN KEY ("waybill_id") REFERENCES "public"."waybills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waybill_expenses" ADD CONSTRAINT "waybill_expenses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_incidents_status" ON "incidents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_incidents_vehicle" ON "incidents" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "idx_incidents_driver" ON "incidents" USING btree ("driver_id");--> statement-breakpoint
CREATE INDEX "idx_incidents_trip" ON "incidents" USING btree ("trip_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_trailers_plate" ON "trailers" USING btree ("plate_number");--> statement-breakpoint
CREATE INDEX "idx_trailers_vehicle" ON "trailers" USING btree ("current_vehicle_id");--> statement-breakpoint
CREATE INDEX "idx_waybill_drivers_waybill" ON "waybill_drivers" USING btree ("waybill_id");--> statement-breakpoint
CREATE INDEX "idx_waybill_drivers_driver" ON "waybill_drivers" USING btree ("driver_id");--> statement-breakpoint
CREATE INDEX "idx_waybill_expenses_waybill" ON "waybill_expenses" USING btree ("waybill_id");--> statement-breakpoint
CREATE INDEX "idx_waybill_expenses_category" ON "waybill_expenses" USING btree ("category");