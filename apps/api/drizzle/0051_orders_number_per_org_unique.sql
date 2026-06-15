-- ============================================================
-- 0051 — P1 (код-аудит 2026-06-14): orders.number → per-org уникальность.
--
-- orders.number была глобально уникальна сразу двумя механизмами:
--   • constraint orders_number_unique (inline .unique() в схеме)
--   • idx_orders_number (uniqueIndex)
-- Это давало cross-tenant коллизию номеров (импорт заявок тенанта B падал на
-- 23505, если тенант A уже занял номер) и existence-leak. vehicles/contractors
-- уже переведены на composite (organization_id, <ключ>) в 0041/0046 — orders
-- пропустили. Приводим к той же модели.
--
-- Частичный unique для org-less строк (idx_orders_nullorg_number) закрывает
-- NULL-distinct щель (как 0046): две org-less строки с одним номером иначе
-- прошли бы обе.
--
-- Данные: глобальный unique сейчас ЗАПРЕЩАЕТ кросс-тенантные дубликаты, поэтому
-- существующие строки заведомо удовлетворяют более слабому composite — дедуп не
-- нужен. На демо/пилоте org-less заявки не создаются (C3 guard'ы).
-- BEGIN/COMMIT — атомарность (docs/architecture/migrations.md §2).
-- ============================================================
BEGIN;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_number_unique;
DROP INDEX IF EXISTS idx_orders_number;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_org_number
    ON orders (organization_id, number);

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_nullorg_number
    ON orders (number)
    WHERE organization_id IS NULL;

COMMIT;
