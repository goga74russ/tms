-- ============================================================
-- 0047 — прямой organization_id у claims (multitenancy GAP, demo-readiness #10).
--
-- Раньше claims скоупились ТОЛЬКО через contractor-FK подзапросом
-- (inArray(claims.contractor_id, contractors этой орг)). Это тот же класс,
-- что NULL-FK баг incidents до 0042: claims с null-contractor или связанные
-- лишь с trip/order другой орг мис-скоупились (выпадали из списка / getById
-- без org-проверки). Добавляем прямую колонку + бэкфилл из contractor
-- (claims всегда создаётся с contractor — service.create требует), чтобы
-- скоуп был по claims.organization_id напрямую.
--
-- Безопасность: бэкфилл из contractor.organization_id, затем (страховка для
-- legacy без contractor) из order→contractor. Колонка nullable — org-less
-- claims не блокируются на уровне БД, но org-скоуп их корректно прячет.
-- BEGIN/COMMIT — атомарность.
-- ============================================================
BEGIN;

ALTER TABLE claims ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id);

-- Бэкфилл из контрагента (основной путь).
UPDATE claims c
SET organization_id = co.organization_id
FROM contractors co
WHERE c.contractor_id = co.id
  AND c.organization_id IS NULL;

-- Страховка: claims без contractor, но со связанным order → его контрагент.
UPDATE claims c
SET organization_id = co.organization_id
FROM orders o
JOIN contractors co ON co.id = o.contractor_id
WHERE c.order_id = o.id
  AND c.organization_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_claims_org ON claims (organization_id);

COMMIT;
