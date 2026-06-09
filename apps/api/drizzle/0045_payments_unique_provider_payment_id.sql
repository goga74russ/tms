-- ============================================================
-- 0045 — payments: partial UNIQUE на provider_payment_id (где NOT NULL).
--
-- Аудит C9 (api-billing): вебхук ищет платёж по provider_payment_id с limit(1)
-- при НЕуникальном idx_payments_provider_id → при дублях недетерминированный
-- выбор строки. Код-уровень (детерминированный orderBy) добавлен в волне 3;
-- этот partial-unique — БД-гарантия.
--
-- Partial WHERE provider_payment_id IS NOT NULL: pending-платежи (ещё без
-- provider id, NULL) не конфликтуют; уникальность только для присвоенных id.
--
-- ВАЛИДАЦИЯ: dry-run против реального прода (BEGIN/ROLLBACK) — payments=0 строк,
-- 0 дубль-групп → индекс создаётся чисто. Нулевой риск данных.
--
-- BEGIN/COMMIT — атомарность (ON_ERROR_STOP откатит).
-- ============================================================
BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_provider_payment_id
    ON payments (provider_payment_id)
    WHERE provider_payment_id IS NOT NULL;

COMMIT;
