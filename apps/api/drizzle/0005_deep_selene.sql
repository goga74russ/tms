ALTER TABLE "trips" ADD COLUMN "trailer_id" uuid;
ALTER TABLE "waybills" ADD COLUMN "trailer_id" uuid;
ALTER TABLE "trips" ADD CONSTRAINT "trips_trailer_id_trailers_id_fk" FOREIGN KEY ("trailer_id") REFERENCES "public"."trailers"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "waybills" ADD CONSTRAINT "waybills_trailer_id_trailers_id_fk" FOREIGN KEY ("trailer_id") REFERENCES "public"."trailers"("id") ON DELETE no action ON UPDATE no action;
CREATE INDEX "idx_trips_trailer" ON "trips" USING btree ("trailer_id");
CREATE INDEX "idx_waybills_trailer" ON "waybills" USING btree ("trailer_id");
UPDATE "waybills" AS wb
SET "trailer_id" = tr."trailer_id"
FROM "trips" AS tr
WHERE wb."trip_id" = tr."id" AND wb."trailer_id" IS NULL;
