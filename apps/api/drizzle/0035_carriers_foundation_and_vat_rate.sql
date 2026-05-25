-- ============================================================
-- 0035 — Этап 1.1 fix + Carriers-0 foundation (объединённая миграция).
--
-- 1. organizations.usn_vat_rate — обязательное расширение Этапа 1
--    для tax_regime='usn_with_vat' (244-ФЗ от 12.07.2024). Спецификация:
--    invoice-spec.md §4 «Особая логика для usn_with_vat».
--
-- 2. trips.execution_mode (enum own/subcontract) + dual cost
--    (own_cost_estimate XOR subcontractor_cost) — устранение долговой
--    бомбы единого carrier_cost. PM-флаг 1 из 2026-05-25 разбора.
--
-- 3. vehicles.owner_contractor_id + drivers.employer_contractor_id —
--    foundation для Phase 1 carriers (наёмный транспорт). Объединены
--    в эту миграцию по принципу «одна транзакция = меньше шансов
--    сломаться» (PM-флаг 3).
--
-- Backfill:
--   - existing trips.carrier_cost → own_cost_estimate (assume own)
--   - trips.execution_mode default = 'own' для всех existing
--   - carrier_cost помечается DEPRECATED (удаление в 004x)
-- ============================================================

-- === Этап 1.1 — USN VAT rate ===
ALTER TABLE organizations ADD COLUMN usn_vat_rate NUMERIC(4, 2);
ALTER TABLE organizations ADD CONSTRAINT organizations_usn_vat_rate_valid
    CHECK (usn_vat_rate IS NULL OR usn_vat_rate IN (5.00, 7.00, 20.00));
COMMENT ON COLUMN organizations.usn_vat_rate IS 'Ставка НДС для usn_with_vat (244-ФЗ). Допустимые значения: 5, 7, 20. NULL для прочих режимов. Изменение — с нового налогового периода.';

-- === Carriers-0 — execution_mode ===
CREATE TYPE trip_execution_mode AS ENUM ('own', 'subcontract');

ALTER TABLE trips ADD COLUMN execution_mode trip_execution_mode NOT NULL DEFAULT 'own';
COMMENT ON COLUMN trips.execution_mode IS 'own = свой парк, subcontractor_cost=NULL; subcontract = наёмный, own_cost_estimate=NULL.';

-- === Carriers-0 — dual cost ===
ALTER TABLE trips ADD COLUMN own_cost_estimate NUMERIC(12, 2);
ALTER TABLE trips ADD COLUMN subcontractor_cost NUMERIC(12, 2);

COMMENT ON COLUMN trips.own_cost_estimate IS 'Внутренняя себестоимость рейса (топливо + з/п + амортизация). Заполняется только при execution_mode=own.';
COMMENT ON COLUMN trips.subcontractor_cost IS 'Сумма оплаты субподрядчику по его счёту. Заполняется только при execution_mode=subcontract.';

-- XOR constraint: только одно из двух заполнено (или оба null).
ALTER TABLE trips ADD CONSTRAINT trips_cost_mode_xor CHECK (
    NOT (own_cost_estimate IS NOT NULL AND subcontractor_cost IS NOT NULL)
);

-- Логическая консистентность: own → нет subcontractor_cost; subcontract → нет own_cost_estimate.
ALTER TABLE trips ADD CONSTRAINT trips_cost_matches_mode CHECK (
    (execution_mode = 'own' AND subcontractor_cost IS NULL)
    OR (execution_mode = 'subcontract' AND own_cost_estimate IS NULL)
);

-- Backfill: existing carrier_cost интерпретируем как own (legacy behaviour).
UPDATE trips
SET own_cost_estimate = carrier_cost
WHERE carrier_cost IS NOT NULL AND own_cost_estimate IS NULL;

-- carrier_cost помечаем deprecated. Удаление — отдельной миграцией после
-- полной миграции UI/API на новые поля (004x).
COMMENT ON COLUMN trips.carrier_cost IS 'DEPRECATED — использовать own_cost_estimate или subcontractor_cost в зависимости от execution_mode. Удаление запланировано в 004x после стабилизации carriers-UI.';

-- === Carriers-0 — owner_contractor_id / employer_contractor_id ===
ALTER TABLE vehicles ADD COLUMN owner_contractor_id UUID REFERENCES contractors(id);
ALTER TABLE drivers ADD COLUMN employer_contractor_id UUID REFERENCES contractors(id);

COMMENT ON COLUMN vehicles.owner_contractor_id IS 'Если ТС принадлежит сторонней организации (наёмная). NULL = свой парк.';
COMMENT ON COLUMN drivers.employer_contractor_id IS 'Если водитель — сотрудник сторонней организации (подрядчик). NULL = наш сотрудник.';

CREATE INDEX idx_vehicles_owner_contractor ON vehicles(owner_contractor_id) WHERE owner_contractor_id IS NOT NULL;
CREATE INDEX idx_drivers_employer_contractor ON drivers(employer_contractor_id) WHERE employer_contractor_id IS NOT NULL;
CREATE INDEX idx_trips_execution_mode ON trips(execution_mode);
