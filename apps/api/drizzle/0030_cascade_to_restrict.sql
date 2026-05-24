-- ============================================================
-- 0030 — CASCADE → RESTRICT для регуляторных таблиц
-- ============================================================
-- Multitenancy audit (2026-05-23) обнаружил: при `DELETE FROM organizations`
-- следующие FK имели ON DELETE CASCADE, что СТИРАЕТ регуляторные данные:
--   • mchd                 — Машиночитаемые Доверенности (юр-сила подписей)
--   • events               — audit trail (152-ФЗ retention)
--   • osago_checks         — проверки ОСАГО
--   • tachograph_uploads   — выгрузки тахографа (.DDD)
--   • marking_verifications — проверки маркировки ЦРПТ
--   • temperature_readings  — холодильная цепь
--   • subscriptions        — биллинг (нужно для финансовых актов)
--
-- API удаления org нет, но руками `DELETE FROM organizations` (или
-- bug в админ-роуте в будущем) → каскадный wipe. По законодательству
-- большинство этих данных подлежит хранению ≥5 лет. RESTRICT заставит
-- явно решать что делать с зависимостями (или мигрировать на soft-delete).
--
-- Имена constraint-ов в БД (Postgres-default `<table>_<column>_fkey`,
-- а не Drizzle-format `<table>_<column>_organizations_id_fk` — Drizzle
-- использует разные форматы в зависимости от того, был ли constraint
-- именован явно). Используем реальные имена из pg_constraint.
-- ============================================================

-- mchd → RESTRICT (юр-сила подписей)
ALTER TABLE mchd
    DROP CONSTRAINT IF EXISTS mchd_organization_id_fkey;
ALTER TABLE mchd
    ADD CONSTRAINT mchd_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;

-- events → RESTRICT (152-ФЗ audit retention)
ALTER TABLE events
    DROP CONSTRAINT IF EXISTS events_organization_id_fkey;
ALTER TABLE events
    ADD CONSTRAINT events_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;

-- osago_checks → RESTRICT (страховая история)
ALTER TABLE osago_checks
    DROP CONSTRAINT IF EXISTS osago_checks_organization_id_fkey;
ALTER TABLE osago_checks
    ADD CONSTRAINT osago_checks_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;

-- tachograph_uploads → RESTRICT (Минтранс хранение)
ALTER TABLE tachograph_uploads
    DROP CONSTRAINT IF EXISTS tachograph_uploads_organization_id_fkey;
ALTER TABLE tachograph_uploads
    ADD CONSTRAINT tachograph_uploads_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;

-- marking_verifications → RESTRICT
ALTER TABLE marking_verifications
    DROP CONSTRAINT IF EXISTS marking_verifications_organization_id_fkey;
ALTER TABLE marking_verifications
    ADD CONSTRAINT marking_verifications_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;

-- temperature_readings → RESTRICT (cold-chain compliance)
ALTER TABLE temperature_readings
    DROP CONSTRAINT IF EXISTS temperature_readings_organization_id_fkey;
ALTER TABLE temperature_readings
    ADD CONSTRAINT temperature_readings_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;

-- subscriptions → RESTRICT (биллинг history)
ALTER TABLE subscriptions
    DROP CONSTRAINT IF EXISTS subscriptions_organization_id_fkey;
ALTER TABLE subscriptions
    ADD CONSTRAINT subscriptions_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;
