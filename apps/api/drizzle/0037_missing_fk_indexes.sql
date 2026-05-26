-- ============================================================
-- Migration 0037: Missing FK indexes (Sprint W1, audit findings)
-- Date: 2026-05-26
--
-- Tech audit (docs/product/code-audit-tech-2026-05-25.md §⚡ DB) выявил
-- foreign-key колонки без покрытия индексами. Без них org-scope filter
-- и JOIN'ы по новым FK (M-batch invoice rebuild, L-batch carriers-0)
-- идут full table scan.
--
-- Все индексы IF NOT EXISTS — миграция идемпотентна.
--
-- Reference queries (документация, не для запуска):
--
--   1) Contractors per organization (org-scope filter — почти на каждом
--      endpoint'е /contractors, /carriers, /admin/contractors).
--      EXPLAIN ANALYZE
--        SELECT * FROM contractors WHERE organization_id = $1;
--
--   2) Invoice payee/payer lookup (поиск по контрагенту-получателю и
--      контрагенту-плательщику в /finance/invoices).
--      EXPLAIN ANALYZE
--        SELECT * FROM invoices WHERE payer_id = $1 ORDER BY issued_at DESC;
--
--   3) Invoice payee_organization (мой собственный счёт как продавец —
--      приходит из organizations.id, не contractors).
--      EXPLAIN ANALYZE
--        SELECT * FROM invoices WHERE payee_organization_id = $1;
--
--   4) КСФ/ИСФ chain — поиск всех корректировок к исходному СФ.
--      EXPLAIN ANALYZE
--        SELECT * FROM invoices WHERE related_invoice_id = $1;
-- ============================================================

-- 1) contractors.organization_id — multitenancy filter, hot path.
--    PARTIAL: NULL = legacy / global contractor (shared across orgs),
--    исключаем чтобы индекс был меньше и точечнее.
CREATE INDEX IF NOT EXISTS idx_contractors_organization_id
    ON contractors (organization_id)
    WHERE organization_id IS NOT NULL;

-- 2) invoices.payer_id — new M-batch FK (contractors.id, плательщик).
--    Hot path в /finance/invoices?payerId=… и в reconciliation.
CREATE INDEX IF NOT EXISTS idx_invoices_payer_id
    ON invoices (payer_id)
    WHERE payer_id IS NOT NULL;

-- 3) invoices.payee_id — new M-batch FK (contractors.id, получатель,
--    когда мы платим другому перевозчику).
CREATE INDEX IF NOT EXISTS idx_invoices_payee_id
    ON invoices (payee_id)
    WHERE payee_id IS NOT NULL;

-- 4) invoices.payee_organization_id — new M-batch FK (organizations.id,
--    «мы как продавец»). Org-scope filter в /finance/invoices.
CREATE INDEX IF NOT EXISTS idx_invoices_payee_organization_id
    ON invoices (payee_organization_id)
    WHERE payee_organization_id IS NOT NULL;

-- 5) invoices.related_invoice_id — chain lookup для КСФ/ИСФ (M-batch §5.2).
--    Хитрый паттерн: каждый раз когда показываем исходный СФ — ищем
--    все corrections где related_invoice_id = $1 + correction_kind.
CREATE INDEX IF NOT EXISTS idx_invoices_related_invoice_id
    ON invoices (related_invoice_id)
    WHERE related_invoice_id IS NOT NULL;
