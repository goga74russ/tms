-- ============================================================
-- 0046 — закрыть NULL-distinct щель миграции 0041 (C4, регресс-хвост).
--
-- 0041 заменил глобальную уникальность plate/vin/inn на composite
-- (organization_id, <ключ>). Но organization_id nullable, а в Postgres NULL
-- в unique-индексе DISTINCT → две строки с organization_id=NULL и одинаковым
-- госномером/VIN/ИНН проходят обе. org-less super-admin мог так создать
-- дубликаты (TOCTOU: app проверяет наличие, но БД-ограничение NULL-org не
-- ловит). Добавляем ЧАСТИЧНЫЕ unique-индексы для строк без организации —
-- теперь и они уникальны по ключу.
--
-- Безопасность данных: на демо/пилоте все строки имеют organization_id
-- (org-less строки не создаются — см. C3 org-less guard'ы), поэтому частичные
-- индексы строятся на пустом подмножестве, конфликтов нет. Если в будущем
-- появятся NULL-org дубликаты — миграцию предварить дедупом (как в 0044).
-- BEGIN/COMMIT — атомарность (docs/architecture/migrations.md §2).
-- ============================================================
BEGIN;

-- ---------- vehicles.plate_number: уникальность среди org-less строк ----------
CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_nullorg_plate
    ON vehicles (plate_number)
    WHERE organization_id IS NULL;

-- ---------- vehicles.vin: среди org-less строк (только непустой VIN) ----------
CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_nullorg_vin
    ON vehicles (vin)
    WHERE organization_id IS NULL AND vin IS NOT NULL;

-- ---------- contractors.inn: среди org-less строк ----------
CREATE UNIQUE INDEX IF NOT EXISTS idx_contractors_nullorg_inn
    ON contractors (inn)
    WHERE organization_id IS NULL;

COMMIT;
