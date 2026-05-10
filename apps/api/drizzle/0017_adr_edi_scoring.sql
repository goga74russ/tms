-- Wave 5: ADR/hazmat support, EDI (Diadoc/SBIS) mock, driver scoring v0.
-- 1) ADR (опасные грузы): класс/UN на заявке, ADR-сертификат водителя,
--    оборудование ADR на ТС.
-- 2) EDI: статусы провайдера (Diadoc/SBIS/Kontur) и журнал событий
--    на transport_documents.
-- 3) Driver scoring v0 — данные считаются on-demand из существующих
--    таблиц, новых таблиц для скоринга нет.

-- ===== ADR / hazmat =====
ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS adr_class text,
    ADD COLUMN IF NOT EXISTS adr_un_number text;

ALTER TABLE drivers
    ADD COLUMN IF NOT EXISTS adr_certificate_expiry timestamptz;

ALTER TABLE vehicles
    ADD COLUMN IF NOT EXISTS adr_equipped boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_orders_adr_class
    ON orders (adr_class)
    WHERE adr_class IS NOT NULL;

-- ===== EDI / Diadoc / SBIS / Kontur =====
ALTER TABLE transport_documents
    ADD COLUMN IF NOT EXISTS edi_status text,
    ADD COLUMN IF NOT EXISTS edi_provider text,
    ADD COLUMN IF NOT EXISTS edi_external_id text,
    ADD COLUMN IF NOT EXISTS edi_sent_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_transport_documents_edi_status
    ON transport_documents (edi_status)
    WHERE edi_status IS NOT NULL;

CREATE TABLE IF NOT EXISTS edi_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id uuid NOT NULL REFERENCES transport_documents(id) ON DELETE CASCADE,
    provider text NOT NULL,
    event_type text NOT NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_edi_events_document
    ON edi_events (document_id);
CREATE INDEX IF NOT EXISTS idx_edi_events_created
    ON edi_events (created_at DESC);
