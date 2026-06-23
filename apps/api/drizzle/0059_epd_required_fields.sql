-- ============================================================
-- 0059 — ЭПД: недостающие обязательные по XSD ФНС поля для ролей,
-- участвующих в документах (ЭТрН/ЭЗЗ/ЭПЛ). Аудит и маппинг —
-- apps/api/docs/etrn/CERTIFICATION-DELTA.md.
-- Все колонки additive (nullable) — безопасно для существующих данных.
-- Обязательность (валидация форм) и бэкфилл — отдельной фазой.
-- BEGIN/COMMIT + IF NOT EXISTS (docs/architecture/migrations.md §2,3).
-- ============================================================
BEGIN;

-- Организация-перевозчик: контактный телефон (ЭТрН СвПер/Контакт/Тлф).
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS phone varchar(20);

-- Водитель: реквизиты для ЭЗЗ/ЭПЛ (ВодитУд серия/дата ВУ, ИННФЛ, Тлф).
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS license_series     varchar(10);
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS license_issue_date timestamptz;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS inn                varchar(12);
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS phone              varchar(20);

-- Заказ: габариты грузового места (ЭЗЗ грузоотправителя РазмерГрМест), м.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cargo_height_m double precision;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cargo_length_m double precision;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cargo_width_m  double precision;

COMMIT;
