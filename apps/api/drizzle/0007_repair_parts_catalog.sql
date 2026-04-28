-- Persisted repair parts catalog

CREATE TABLE IF NOT EXISTS repair_part_catalog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(120) NOT NULL,
    unit VARCHAR(30) NOT NULL,
    suggested_unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
    aliases JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    organization_id UUID REFERENCES organizations(id),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_repair_part_catalog_code
    ON repair_part_catalog(code);

CREATE INDEX IF NOT EXISTS idx_repair_part_catalog_category
    ON repair_part_catalog(category);

CREATE INDEX IF NOT EXISTS idx_repair_part_catalog_archived
    ON repair_part_catalog(is_archived);
