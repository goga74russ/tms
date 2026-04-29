-- Transport documents persistence foundation.
-- This migration aligns the database with the Drizzle schema used by ETRN/dossier APIs.

DO $$
BEGIN
    CREATE TYPE transport_document_severity AS ENUM ('info', 'warning', 'critical');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE TYPE transport_document_exchange_direction AS ENUM ('outbound', 'inbound');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE TYPE transport_document_exchange_status AS ENUM ('queued', 'sent', 'acknowledged', 'delivered', 'accepted', 'rejected', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE TYPE transport_document_receipt_type AS ENUM ('ack', 'acceptance', 'rejection', 'correction_required', 'registration', 'delivery');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS transport_documents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    artifact_id varchar(255) NOT NULL,
    artifact_kind varchar(50) NOT NULL,
    trip_id uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    waybill_id uuid REFERENCES waybills(id) ON DELETE SET NULL,
    document_type varchar(50),
    title_type varchar(50),
    title_number varchar(8),
    source_key text NOT NULL,
    correlation_id text NOT NULL,
    snapshot_id varchar(64) NOT NULL,
    external_id varchar(255) NOT NULL,
    status varchar(50) NOT NULL,
    source_status varchar(50),
    provider_name varchar(100) NOT NULL DEFAULT 'internal',
    provider_document_id varchar(255),
    provider_message_id varchar(255),
    provider_status varchar(100),
    error text,
    version integer NOT NULL DEFAULT 1,
    order_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
    retry_count integer NOT NULL DEFAULT 0,
    last_attempt_at timestamptz,
    last_retry_at timestamptz,
    last_error_at timestamptz,
    next_retry_at timestamptz,
    issued_at timestamptz,
    sent_at timestamptz,
    accepted_at timestamptz,
    rejected_at timestamptz,
    completed_at timestamptz,
    last_synced_at timestamptz NOT NULL DEFAULT now(),
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    history jsonb NOT NULL DEFAULT '[]'::jsonb,
    timeline jsonb NOT NULL DEFAULT '[]'::jsonb,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_transport_documents_artifact ON transport_documents(artifact_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_transport_documents_source_key ON transport_documents(source_key);
CREATE INDEX IF NOT EXISTS idx_transport_documents_trip ON transport_documents(trip_id);
CREATE INDEX IF NOT EXISTS idx_transport_documents_waybill ON transport_documents(waybill_id);
CREATE INDEX IF NOT EXISTS idx_transport_documents_kind ON transport_documents(artifact_kind);
CREATE INDEX IF NOT EXISTS idx_transport_documents_status ON transport_documents(status);

CREATE TABLE IF NOT EXISTS transport_document_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id uuid NOT NULL REFERENCES transport_documents(id) ON DELETE CASCADE,
    event_type varchar(50) NOT NULL,
    title varchar(255) NOT NULL,
    from_status varchar(50),
    to_status varchar(50),
    severity transport_document_severity NOT NULL DEFAULT 'info',
    message text,
    error_code varchar(100),
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by uuid REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transport_document_events_document ON transport_document_events(document_id);
CREATE INDEX IF NOT EXISTS idx_transport_document_events_created ON transport_document_events(created_at);

CREATE TABLE IF NOT EXISTS transport_document_exchanges (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id uuid NOT NULL REFERENCES transport_documents(id) ON DELETE CASCADE,
    trip_id uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    provider_name varchar(100) NOT NULL DEFAULT 'sandbox_edo',
    direction transport_document_exchange_direction NOT NULL DEFAULT 'outbound',
    operation varchar(50) NOT NULL,
    status transport_document_exchange_status NOT NULL DEFAULT 'queued',
    request_id varchar(255),
    provider_document_id varchar(255),
    provider_message_id varchar(255),
    provider_event_id varchar(255),
    provider_status varchar(100),
    attempt_number integer NOT NULL DEFAULT 1,
    error_code varchar(100),
    error_message text,
    request_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    response_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    initiated_by uuid REFERENCES users(id),
    initiated_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    next_retry_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_transport_document_exchanges_document ON transport_document_exchanges(document_id);
CREATE INDEX IF NOT EXISTS idx_transport_document_exchanges_trip ON transport_document_exchanges(trip_id);
CREATE INDEX IF NOT EXISTS idx_transport_document_exchanges_status ON transport_document_exchanges(status);
CREATE INDEX IF NOT EXISTS idx_transport_document_exchanges_initiated ON transport_document_exchanges(initiated_at);

CREATE TABLE IF NOT EXISTS transport_document_receipts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id uuid NOT NULL REFERENCES transport_documents(id) ON DELETE CASCADE,
    trip_id uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    exchange_id uuid REFERENCES transport_document_exchanges(id) ON DELETE SET NULL,
    receipt_type transport_document_receipt_type NOT NULL,
    provider_receipt_id varchar(255),
    provider_event_id varchar(255),
    provider_status varchar(100),
    title varchar(255) NOT NULL,
    message text,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    received_at timestamptz NOT NULL DEFAULT now(),
    processed_at timestamptz,
    created_by uuid REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_transport_document_receipts_document ON transport_document_receipts(document_id);
CREATE INDEX IF NOT EXISTS idx_transport_document_receipts_trip ON transport_document_receipts(trip_id);
CREATE INDEX IF NOT EXISTS idx_transport_document_receipts_received ON transport_document_receipts(received_at);
