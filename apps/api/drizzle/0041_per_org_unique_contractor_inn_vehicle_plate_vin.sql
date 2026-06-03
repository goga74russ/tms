-- ============================================================
-- 0041 — per-org уникальность ИНН контрагента и госномера/VIN ТС (C4).
--
-- Аудит C4 (multitenancy сломан): contractors.inn и vehicles.plate_number/vin
-- были ГЛОБАЛЬНО уникальны → тенант B не мог завести контрагента/ТС с ИНН/
-- госномером тенанта A (cross-org DoS + раскрытие существования через 409).
-- Меняем на composite unique (organization_id, <ключ>).
--
-- vehicles имеет ДВА механизма глобальной уникальности на каждый ключ:
-- inline CONSTRAINT (vehicles_plate_number_unique / vehicles_vin_unique) И
-- UNIQUE INDEX (idx_vehicles_plate / idx_vehicles_vin) — дропаем оба.
--
-- ⚠️ organization_id у vehicles/contractors nullable → строки с NULL-org НЕ
-- ограничиваются composite unique (Postgres: NULL distinct). На демо (один
-- тенант, у всех строк org заполнен) конфликтов нет; для мульти-тенанта строки
-- без org не должны создаваться (см. C3 org-less guard'ы).
--
-- Прод на момент миграции — демо-данные одного тенанта, конфликтов нет.
-- BEGIN/COMMIT — атомарность (docs/architecture/migrations.md §2).
-- ============================================================
BEGIN;

-- ---------- contractors.inn: глобальный unique → per-org ----------
DROP INDEX IF EXISTS idx_contractors_inn;
CREATE UNIQUE INDEX IF NOT EXISTS idx_contractors_org_inn
    ON contractors (organization_id, inn);

-- ---------- vehicles.plate_number: constraint + index → per-org ----------
ALTER TABLE vehicles DROP CONSTRAINT IF EXISTS vehicles_plate_number_unique;
DROP INDEX IF EXISTS idx_vehicles_plate;
CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_org_plate
    ON vehicles (organization_id, plate_number);

-- ---------- vehicles.vin: constraint + index → per-org ----------
ALTER TABLE vehicles DROP CONSTRAINT IF EXISTS vehicles_vin_unique;
DROP INDEX IF EXISTS idx_vehicles_vin;
CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_org_vin
    ON vehicles (organization_id, vin);

COMMIT;
