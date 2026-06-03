-- ============================================================
-- 0042 — organization_id в incidents и fines (C3 механизм «в»).
--
-- Аудит C3: incidents/fines НЕ имели organization_id — скоуп шёл через FK
-- (vehicle_id). Строки с vehicle_id=null (incidents) выпадали из inArray-скоупа
-- и были видны ВСЕМ тенантам (cross-tenant leak). fines скоупились только через
-- join fines→vehicles на каждом чтении (хрупко).
--
-- Добавляем прямой organization_id + backfill из vehicle. Строки без vehicle_id
-- (orphan incidents) остаются с org=null — на демо их нет; в коде такие при
-- чтении не отдаются (org-scoped запрос по organization_id).
--
-- Прод — демо-данные одного тенанта. BEGIN/COMMIT — атомарность.
-- ============================================================
BEGIN;

-- ---------- incidents.organization_id ----------
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
UPDATE incidents
    SET organization_id = v.organization_id
    FROM vehicles v
    WHERE incidents.vehicle_id = v.id
      AND incidents.organization_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_incidents_org ON incidents (organization_id);

-- ---------- fines.organization_id ----------
ALTER TABLE fines ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);
UPDATE fines
    SET organization_id = v.organization_id
    FROM vehicles v
    WHERE fines.vehicle_id = v.id
      AND fines.organization_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_fines_org ON fines (organization_id);

COMMIT;
