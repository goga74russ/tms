-- ============================================================
-- 0031 — perf-indexes follow-up (audit 2026-05-23, B7.2)
-- ============================================================
-- Perf audit обнаружил deathzones:
--   1. ilike-поиск по адресам/плате/VIN делает seq-scan — на 5K+ заявок
--      это 200-400ms per query.
--   2. getAvailableDrivers использует NOT IN (uuid, ...) — план деградирует
--      на 100+ занятых водителях.
--   3. notification.worker фетчит `WHERE is_active = true` без partial
--      index — на 10 events/sec = 600 запросов/мин в БД.
--
-- Все CREATE INDEX используют IF NOT EXISTS — идемпотентно.
-- pg_trgm — extension, должен быть включён один раз per-database.
-- ============================================================

-- Pre-req: pg_trgm extension.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 1) ilike-search по адресам заявок (loading/unloading_address).
CREATE INDEX IF NOT EXISTS idx_orders_loading_addr_trgm
    ON orders USING gin (loading_address gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_orders_unloading_addr_trgm
    ON orders USING gin (unloading_address gin_trgm_ops);

-- 2) ilike-search по plate_number в /fleet/vehicles.
CREATE INDEX IF NOT EXISTS idx_vehicles_plate_trgm
    ON vehicles USING gin (plate_number gin_trgm_ops);

-- 3) Client-RLS hot path: orders по (contractor, status, createdAt).
-- Существующий idx_orders_contractor покрывает только contractor_id;
-- запросы getOrders фильтруют (contractor + status) + ORDER BY createdAt.
CREATE INDEX IF NOT EXISTS idx_orders_contractor_status_created
    ON orders (contractor_id, status, created_at DESC);

-- 4) Partial: «активные водители без свободных рейсов» — для подбора.
-- getAvailableDrivers сейчас делает antijoin через NOT IN; partial-index
-- по trips.driver_id WHERE status IN ('assigned','in_transit') даёт
-- субсекундный план.
CREATE INDEX IF NOT EXISTS idx_trips_active_driver
    ON trips (driver_id)
    WHERE status IN ('assigned', 'in_transit');

-- 5) Partial: «активные подписки на уведомления» — главный фильтр
-- notification.worker. is_active=true — обычно 70-90% строк, но
-- partial-index экономит I/O и работает с index-only-scan.
CREATE INDEX IF NOT EXISTS idx_notification_subs_active
    ON notification_subscriptions (is_active)
    WHERE is_active = true;
