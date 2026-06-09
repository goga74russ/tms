-- ============================================================
-- 0044 — tachograph_records: UNIQUE (driver_id, date, source).
--
-- Аудит C9 (api-edi): повторная загрузка того же .DDD дублировала
-- tachograph_records (нет уникального ключа). Код-уровень идемпотентности
-- (existence-check в ingestDddBuffer по driver/date/source) добавлен в волне 2;
-- этот индекс — БД-гарантия от дублей.
--
-- dedup-first: сначала удаляем существующие дубли (оставляем одну строку на
-- группу — с max id), затем создаём unique. Дубли .DDD-загрузок идентичны по
-- содержимому, потеря одной копии не теряет данные.
--
-- ВАЛИДАЦИЯ: dry-run против реального прода (BEGIN/ROLLBACK) — tachograph_records=0
-- строк, 0 дубль-групп → DELETE 0, индекс создаётся чисто. Нулевой риск данных.
--
-- BEGIN/COMMIT — атомарность (ON_ERROR_STOP откатит).
-- ============================================================
BEGIN;

-- dedup: оставляем одну строку на (driver_id, date, source) — с наибольшим id.
DELETE FROM tachograph_records a
       USING tachograph_records b
 WHERE a.id < b.id
   AND a.driver_id = b.driver_id
   AND a.date = b.date
   AND a.source = b.source;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tachograph_driver_date_source
    ON tachograph_records (driver_id, date, source);

COMMIT;
