-- Sprint 19: Приказ Минтранса 390 + операционные улучшения
-- Phase 1: Нормативные поля, пломбы, простой, корректировки

-- 1. СНИЛС водителя (Минтранс 390)
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS snils VARCHAR(14);

-- 2. Тип осмотра post_trip
ALTER TYPE inspection_type ADD VALUE IF NOT EXISTS 'post_trip';

-- 3. Обязательные реквизиты путевого листа (Минтранс 390)
ALTER TABLE waybills ADD COLUMN IF NOT EXISTS issued_by_name VARCHAR(255);
ALTER TABLE waybills ADD COLUMN IF NOT EXISTS issued_by_position VARCHAR(255);
ALTER TABLE waybills ADD COLUMN IF NOT EXISTS valid_from TIMESTAMPTZ;
ALTER TABLE waybills ADD COLUMN IF NOT EXISTS valid_to TIMESTAMPTZ;
ALTER TABLE waybills ADD COLUMN IF NOT EXISTS transport_service_type VARCHAR(100);
ALTER TABLE waybills ADD COLUMN IF NOT EXISTS transport_mode VARCHAR(100);

-- 4. Пломбы и маркировка в route_points
ALTER TABLE route_points ADD COLUMN IF NOT EXISTS seal_numbers JSONB;
ALTER TABLE route_points ADD COLUMN IF NOT EXISTS packaging_condition TEXT;

-- 5. Простой и время прибытия ТС в route_points
ALTER TABLE route_points ADD COLUMN IF NOT EXISTS vehicle_arrived_at TIMESTAMPTZ;
ALTER TABLE route_points ADD COLUMN IF NOT EXISTS waiting_started_at TIMESTAMPTZ;
ALTER TABLE route_points ADD COLUMN IF NOT EXISTS waiting_ended_at TIMESTAMPTZ;

-- 6. Пломбы в delivery_confirmations
ALTER TABLE delivery_confirmations ADD COLUMN IF NOT EXISTS seal_numbers JSONB;
ALTER TABLE delivery_confirmations ADD COLUMN IF NOT EXISTS packaging_condition TEXT;

-- 7. Корректировочные счета
DO $$ BEGIN
    CREATE TYPE adjustment_reason AS ENUM (
        'rate_change', 'volume_change', 'penalty', 'discount', 'error_correction', 'other'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS invoice_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES invoices(id),
    reason adjustment_reason NOT NULL,
    description TEXT NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoice_adjustments_invoice ON invoice_adjustments(invoice_id);
