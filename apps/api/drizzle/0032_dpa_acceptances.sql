-- ============================================================
-- 0032 — dpa_acceptances (Data Processing Acceptances, 152-ФЗ ст. 9)
-- ============================================================
-- При подключении организацией каждой интеграции (Контур.Диадок, Wialon,
-- Госключ, и т.д.) администратор клиента видит DPA-текст с описанием
-- передаваемых данных и принимает согласие явным нажатием. Запись об
-- акцепте — proof-в-суде что пользователь видел именно эту версию текста.
--
-- Структура согласована с Jurist в docs/legal/dpa/README.md:
--   • provider_id    — совпадает с ProviderName enum
--   • version        — semver из frontmatter принятого файла
--   • content_hash   — SHA-256 от полного содержимого markdown на момент accept
--   • accepted_at    — server-generated UTC
--
-- Unique (user_id, organization_id, provider_id, version) — один user не
-- подписывает одну и ту же версию дважды. Но может подписать v1.0, потом
-- v2.0 (при major-обновлении текста — Jurist бампит version).
-- ============================================================

CREATE TABLE IF NOT EXISTS dpa_acceptances (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    -- ProviderName из @tms/shared (e.g. 'diadoc', 'wialon', 'gosklyuch')
    provider_id varchar(50) NOT NULL,
    -- Semver принятой версии текста ('1.0', '1.1', '2.0', ...)
    version varchar(20) NOT NULL,
    -- SHA-256 от полного содержимого markdown-файла на момент accept.
    -- 64 hex chars. Используется для proof: пользователь видел именно
    -- этот текст (если Jurist потом меняет минорно — старые acceptances
    -- остаются валидными, но hash будет другой).
    content_hash varchar(64) NOT NULL,
    accepted_at timestamp with time zone NOT NULL DEFAULT now(),
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Один user — одна версия — один provider в одной org. Подписание
-- идемпотентно: повторный accept той же версии возвращает существующую
-- запись (через ON CONFLICT DO NOTHING на стороне API).
CREATE UNIQUE INDEX IF NOT EXISTS uq_dpa_acceptances_user_org_provider_version
    ON dpa_acceptances (user_id, organization_id, provider_id, version);

-- Главный read-path: «нужно ли показывать DPA-step этому user для этого
-- provider в этой org?» → check существует ли запись с актуальной version.
CREATE INDEX IF NOT EXISTS idx_dpa_acceptances_user_org_provider
    ON dpa_acceptances (user_id, organization_id, provider_id);

-- Для admin-аудита: «кто за последний месяц подписал какие интеграции».
CREATE INDEX IF NOT EXISTS idx_dpa_acceptances_org_accepted_at
    ON dpa_acceptances (organization_id, accepted_at DESC);
