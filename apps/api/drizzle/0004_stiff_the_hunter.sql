ALTER TABLE "waybills" ALTER COLUMN "status" SET DEFAULT 'draft';--> statement-breakpoint
ALTER TABLE "waybills" ALTER COLUMN "tech_inspection_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "waybills" ALTER COLUMN "med_inspection_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "waybills" ALTER COLUMN "departure_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "public"."waybills" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
UPDATE "public"."waybills" SET "status" = CASE
	WHEN "status" = 'formed' THEN 'draft'
	WHEN "status" = 'open' THEN 'issued'
	ELSE "status"
END;--> statement-breakpoint
DROP TYPE "public"."waybill_status";--> statement-breakpoint
CREATE TYPE "public"."waybill_status" AS ENUM('draft', 'medical_check', 'technical_check', 'issued', 'closed');--> statement-breakpoint
ALTER TABLE "public"."waybills" ALTER COLUMN "status" SET DATA TYPE "public"."waybill_status" USING "status"::"public"."waybill_status";