-- ============================================================
-- 0039 — per-org уникальность номеров счетов и idempotency-ключей событий.
--
-- P2/P1-C #17: invoices.number был ГЛОБАЛЬНО уникален → у каждой орг не своя
-- серия (п.5.1 ст.169 НК требует независимую нумерацию у каждого
-- налогоплательщика). Меняем на composite unique (payee_organization_id, number).
--
-- events.external_id был глобально уникален → теоретическая cross-tenant
-- idempotency-коллизия (одинаковый external_id у разных орг конфликтовал).
-- Меняем на (organization_id, external_id).
--
-- Прод на момент миграции — демо-данные одного тенанта, конфликтов нет.
-- BEGIN/COMMIT — атомарность (docs/architecture/migrations.md §2).
-- ============================================================
BEGIN;

-- ---------- invoices: глобальный unique(number) → per-org ----------
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_number_unique;
DROP INDEX IF EXISTS idx_invoices_number;
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_org_number
    ON invoices (payee_organization_id, number);
-- неуникальный индекс на number оставляем для LIKE-поиска при генерации номера
CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices (number);

-- ---------- events: глобальный unique(external_id) → per-org ----------
DROP INDEX IF EXISTS idx_events_external_id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_org_external_id
    ON events (organization_id, external_id);

COMMIT;
