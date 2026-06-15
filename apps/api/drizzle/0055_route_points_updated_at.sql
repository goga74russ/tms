-- ============================================================
-- 0055 — P2 (код-аудит 2026-06-14): route_points без updated_at → sync pull делал
-- полную переотдачу всех точек изменённых рейсов (нет дельты по точке). Добавляем
-- колонку updated_at + триггер автообновления, чтобы sync фильтровал по ней.
-- BEGIN/COMMIT — атомарность.
-- ============================================================
BEGIN;

ALTER TABLE route_points ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE OR REPLACE FUNCTION set_route_points_updated_at() RETURNS trigger AS $func$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$func$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_route_points_updated_at ON route_points;
CREATE TRIGGER trg_route_points_updated_at
    BEFORE UPDATE ON route_points
    FOR EACH ROW EXECUTE FUNCTION set_route_points_updated_at();

COMMIT;
