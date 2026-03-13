CREATE TYPE "public"."inspection_type" AS ENUM('pre_trip', 'periodic');--> statement-breakpoint
CREATE TABLE "trip_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waybill_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"waybill_id" uuid NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"original_name" varchar(255) NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"file_size" integer NOT NULL,
	"storage_path" text NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "med_inspections" ADD COLUMN "inspection_type" "inspection_type" DEFAULT 'pre_trip' NOT NULL;--> statement-breakpoint
ALTER TABLE "tech_inspections" ADD COLUMN "inspection_type" "inspection_type" DEFAULT 'pre_trip' NOT NULL;--> statement-breakpoint
ALTER TABLE "trip_orders" ADD CONSTRAINT "trip_orders_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_orders" ADD CONSTRAINT "trip_orders_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waybill_attachments" ADD CONSTRAINT "waybill_attachments_waybill_id_waybills_id_fk" FOREIGN KEY ("waybill_id") REFERENCES "public"."waybills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waybill_attachments" ADD CONSTRAINT "waybill_attachments_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_trip_orders_unique" ON "trip_orders" USING btree ("trip_id","order_id");--> statement-breakpoint
CREATE INDEX "idx_trip_orders_trip" ON "trip_orders" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "idx_trip_orders_order" ON "trip_orders" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_waybill_attachments_waybill" ON "waybill_attachments" USING btree ("waybill_id");--> statement-breakpoint
CREATE INDEX "idx_med_inspections_type" ON "med_inspections" USING btree ("inspection_type");--> statement-breakpoint
CREATE INDEX "idx_tech_inspections_type" ON "tech_inspections" USING btree ("inspection_type");