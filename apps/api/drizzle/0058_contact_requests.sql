-- ============================================================
-- 0058 — contact_requests: заявки «Связаться» с публичного лендинга (лиды).
-- Публичная форма /contacts → POST /api/public/contact → эта таблица.
-- Без org-привязки (входящие до регистрации). Founder смотрит в /admin/contacts.
-- BEGIN/COMMIT — атомарность (docs/architecture/migrations.md §2).
-- ============================================================
BEGIN;

CREATE TABLE IF NOT EXISTS contact_requests (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        varchar(200) NOT NULL,
    phone       varchar(50)  NOT NULL,
    email       varchar(255),
    fleet_size  varchar(20),
    comment     text,
    source      varchar(50)  NOT NULL DEFAULT 'landing',
    status      varchar(20)  NOT NULL DEFAULT 'new',
    created_at  timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contact_requests_created ON contact_requests (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_requests_status  ON contact_requests (status);

COMMIT;
