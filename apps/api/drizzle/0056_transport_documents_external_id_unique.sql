-- ============================================================
-- 0056 — P3 #685 (код-аудит 2026-06-14): UNIQUE(external_id) на transport_documents.
--
-- Публичный callback Госключа (POST /signatures/gosklyuch/callback) ищет
-- документ по external_id БЕЗ org-контекста (у callback нет аутентифицированного
-- пользователя). Без уникальности external_id коллизия между тенантами могла бы
-- привести к применению подписи не к тому документу. Уникальный индекс делает
-- lookup однозначным и фиксирует external_id как настоящий idempotency-key.
--
-- external_id — NOT NULL varchar(255). Значения генерируются как случайные
-- идентификаторы (gk-... от адаптера Госключа либо локальный buildExternalId),
-- поэтому коллизий быть не должно. Если CREATE UNIQUE INDEX упадёт —
-- значит в данных есть дубли external_id (последствие старого бага #686, когда
-- сохранялся локальный externalId вместо adapter-externalId) — их нужно
-- реконсилировать перед повторным прогоном миграции.
-- BEGIN/COMMIT — атомарность (docs/architecture/migrations.md §2).
-- ============================================================
BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS idx_transport_documents_external_id
    ON transport_documents (external_id);

COMMIT;
