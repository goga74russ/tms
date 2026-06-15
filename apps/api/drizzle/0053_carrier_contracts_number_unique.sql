-- ============================================================
-- 0053 — P2 (код-аудит 2026-06-14): carrier_contracts.number без уникальности →
-- дубли номеров договоров с перевозчиками. Per-org composite (organization_id,
-- number) + частичный unique для org-less строк (как orders 0051).
--
-- Данные: при существующих дублях номеров создание индекса упадёт — на демо/пилоте
-- дублей нет; при необходимости предварить дедупом.
-- BEGIN/COMMIT — атомарность (docs/architecture/migrations.md §2).
-- ============================================================
BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS idx_carrier_contracts_org_number
    ON carrier_contracts (organization_id, number);

CREATE UNIQUE INDEX IF NOT EXISTS idx_carrier_contracts_nullorg_number
    ON carrier_contracts (number)
    WHERE organization_id IS NULL;

COMMIT;
