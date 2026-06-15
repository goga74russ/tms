-- ============================================================
-- 0050 — P1 (код-аудит 2026-06-14): различимые типы возвратов документов.
--
-- DocReturnTypeMap схлопывал waybill→'other', cmr→'other', other→'other'
-- (routes.ts:21-28), а documentReturns имеет unique(tripId, docType)
-- (idx_doc_returns_trip_type). Итог: на один рейс можно зарегистрировать
-- только ОДИН оригинал из группы {waybill, cmr, other} — второй ловил
-- unique-conflict (409) и терялся.
--
-- Добавляем отдельные значения enum, чтобы каждый тип хранился различимо и
-- unique(tripId, docType) их не путал. PG16 допускает ALTER TYPE ADD VALUE
-- внутри транзакции; новые значения не используются в этой же миграции.
-- ADD VALUE IF NOT EXISTS — идемпотентность при повторном прогоне.
-- BEGIN/COMMIT — атомарность (docs/architecture/migrations.md §2).
-- ============================================================
BEGIN;

ALTER TYPE document_return_type ADD VALUE IF NOT EXISTS 'waybill';
ALTER TYPE document_return_type ADD VALUE IF NOT EXISTS 'cmr';

COMMIT;
