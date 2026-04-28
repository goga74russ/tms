-- Trailer tenant scope
-- Adds organization ownership to trailers and backfills from the coupled vehicle when possible.

ALTER TABLE trailers
    ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

UPDATE trailers AS t
SET organization_id = v.organization_id
FROM vehicles AS v
WHERE t.current_vehicle_id = v.id
  AND t.organization_id IS NULL
  AND v.organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_trailers_org ON trailers(organization_id);
