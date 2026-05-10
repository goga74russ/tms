-- Wave 3: РТО, окна доставки, история позиций ТС.
-- 1) Дополнительные окна доставки на route_points (windowFrom/windowTo).
-- 2) Новая таблица vehicle_positions для истории GPS-точек (ETA, треки).
--    WS-broadcast и mock-генератор треков пишут сюда, существующий
--    in-memory путь сохраняется как fallback.

ALTER TABLE route_points
    ADD COLUMN IF NOT EXISTS window_from timestamptz;
ALTER TABLE route_points
    ADD COLUMN IF NOT EXISTS window_to timestamptz;

CREATE TABLE IF NOT EXISTS vehicle_positions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    recorded_at timestamptz NOT NULL DEFAULT now(),
    latitude double precision NOT NULL,
    longitude double precision NOT NULL,
    speed_kmh double precision,
    heading_deg double precision,
    source text NOT NULL DEFAULT 'mock',
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_positions_vehicle_recorded
    ON vehicle_positions (vehicle_id, recorded_at DESC);
