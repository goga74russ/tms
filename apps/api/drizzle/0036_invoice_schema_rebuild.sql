-- ============================================================
-- 0036 — Invoice schema rebuild (Этап 3 по invoice-spec.md).
--
-- Реализует:
--   §1 enum invoice_type (7 значений)
--   §2 FSM invoice_status (новый enum)
--   §3 обязательные поля + correction_kind + related_invoice_id + basis_text
--   §5 КСФ vs ИСФ (correction_kind: adjustment / replacement)
--   §8 invoice_history + DB-trigger на immutability + invoice_orders junction
--
-- Backfill:
--   - Существующие invoices.status (draft/sent/paid/overdue/cancelled) →
--     новый enum (draft/issued/paid_full/issued/cancelled).
--   - Существующие invoices.type ('invoice'/'sf'/'upd'/'act') → новый
--     ENUM ('payment'/'sf'/'upd'/'act').
--   - Существующие invoices.contractor_id → payer_id (предполагаем
--     исходящие).
--   - Создаём invoice_orders из invoice_trips через JOIN orders.trip_id
--     с пропорциональным allocated_amount.
-- ============================================================

-- ---------- 1. NEW ENUMS ----------

CREATE TYPE invoice_type AS ENUM (
    'payment',          -- Счёт на оплату (не СФ)
    'advance',          -- Счёт на аванс
    'sf',               -- Счёт-фактура (ст. 169 НК)
    'upd',              -- УПД
    'corrective_sf',    -- Корректировочный СФ (ст. 169 ч. 5.2)
    'corrective_upd',   -- Корректировочный УПД
    'act'               -- Акт оказанных услуг (УСН без НДС)
);

CREATE TYPE invoice_status_v2 AS ENUM (
    'draft',
    'issued',
    'paid_partial',
    'paid_full',
    'cancelled',
    'corrected'
);

CREATE TYPE invoice_correction_kind AS ENUM (
    'adjustment',       -- КСФ — изменение цены/объёма
    'replacement'       -- ИСФ — исправление реквизитов
);

-- ---------- 2. MIGRATE invoices.status ENUM ----------

-- Drop default чтобы можно было сменить тип.
ALTER TABLE invoices ALTER COLUMN status DROP DEFAULT;

ALTER TABLE invoices ALTER COLUMN status TYPE invoice_status_v2 USING (
    CASE status::text
        WHEN 'draft' THEN 'draft'::invoice_status_v2
        WHEN 'sent' THEN 'issued'::invoice_status_v2
        WHEN 'paid' THEN 'paid_full'::invoice_status_v2
        WHEN 'overdue' THEN 'issued'::invoice_status_v2  -- overdue не статус, а computed
        WHEN 'cancelled' THEN 'cancelled'::invoice_status_v2
        ELSE 'draft'::invoice_status_v2
    END
);

ALTER TABLE invoices ALTER COLUMN status SET DEFAULT 'draft';

DROP TYPE invoice_status;
ALTER TYPE invoice_status_v2 RENAME TO invoice_status;

-- ---------- 3. MIGRATE invoices.type VARCHAR → ENUM ----------

ALTER TABLE invoices ALTER COLUMN type TYPE invoice_type USING (
    CASE type
        WHEN 'invoice' THEN 'payment'::invoice_type
        WHEN 'sf' THEN 'sf'::invoice_type
        WHEN 'upd' THEN 'upd'::invoice_type
        WHEN 'act' THEN 'act'::invoice_type
        WHEN 'advance' THEN 'advance'::invoice_type
        ELSE 'payment'::invoice_type
    END
);

-- ---------- 4. NEW FIELDS per spec §3 ----------

ALTER TABLE invoices ADD COLUMN payer_id UUID REFERENCES contractors(id);
ALTER TABLE invoices ADD COLUMN payee_id UUID REFERENCES contractors(id);
ALTER TABLE invoices ADD COLUMN payee_organization_id UUID REFERENCES organizations(id);
ALTER TABLE invoices ADD COLUMN basis_text TEXT;
ALTER TABLE invoices ADD COLUMN vat_rate NUMERIC(4, 2);
ALTER TABLE invoices ADD COLUMN includes_vat BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE invoices ADD COLUMN currency VARCHAR(3) NOT NULL DEFAULT 'RUB';
ALTER TABLE invoices ADD COLUMN issued_at TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0);
ALTER TABLE invoices ADD COLUMN correction_kind invoice_correction_kind;
ALTER TABLE invoices ADD COLUMN related_invoice_id UUID REFERENCES invoices(id);
ALTER TABLE invoices ADD COLUMN correction_reason TEXT;
ALTER TABLE invoices ADD COLUMN correction_basis_artifact_id UUID;
ALTER TABLE invoices ADD COLUMN has_corrections BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE invoices ADD COLUMN cancellation_reason TEXT;

-- Backfill payer_id из contractor_id (все existing предполагаем исходящие).
UPDATE invoices SET payer_id = contractor_id WHERE payer_id IS NULL;

-- ---------- 5. CHECK constraints per spec ----------

ALTER TABLE invoices ADD CONSTRAINT invoices_correction_kind_consistency CHECK (
    (type IN ('corrective_sf', 'corrective_upd')
        AND correction_kind IS NOT NULL
        AND related_invoice_id IS NOT NULL
        AND correction_reason IS NOT NULL)
    OR (type NOT IN ('corrective_sf', 'corrective_upd') AND correction_kind IS NULL)
);

-- ---------- 6. JUNCTION invoice_orders ----------

CREATE TABLE invoice_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES orders(id),
    allocated_amount NUMERIC(12, 2) NOT NULL CHECK (allocated_amount >= 0),
    allocated_vat NUMERIC(12, 2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (invoice_id, order_id)
);
CREATE INDEX idx_invoice_orders_invoice ON invoice_orders(invoice_id);
CREATE INDEX idx_invoice_orders_order ON invoice_orders(order_id);

COMMENT ON COLUMN invoice_orders.allocated_amount IS 'Сумма этой заявки в счёте. Σ allocated_amount = invoice.total (CHECK через DEFERRED trigger).';

-- ---------- 7. invoice_history audit table ----------

CREATE TABLE invoice_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES invoices(id),
    operation VARCHAR(20) NOT NULL CHECK (operation IN ('create', 'update', 'status_change', 'cancel', 'correction')),
    field_name VARCHAR(64),
    previous_value JSONB,
    new_value JSONB,
    changed_by_user_id UUID REFERENCES users(id),
    change_reason TEXT,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_invoice_history_invoice ON invoice_history(invoice_id, changed_at DESC);
CREATE INDEX idx_invoice_history_operation ON invoice_history(operation);

-- ---------- 8. DB-TRIGGER: immutability after issued ----------
-- per spec §8 «Что не должно меняться»

CREATE OR REPLACE FUNCTION invoice_check_immutable_fields() RETURNS TRIGGER AS $$
BEGIN
    -- Allow всё в draft. После issued — только whitelist полей.
    IF OLD.status = 'draft' THEN
        RETURN NEW;
    END IF;

    -- Запрещённые изменения после issued (spec §8).
    IF NEW.number IS DISTINCT FROM OLD.number THEN
        RAISE EXCEPTION 'INVOICE_IMMUTABLE: cannot change number after issued';
    END IF;
    IF NEW.type IS DISTINCT FROM OLD.type THEN
        RAISE EXCEPTION 'INVOICE_IMMUTABLE: cannot change type after issued';
    END IF;
    IF NEW.issued_at IS DISTINCT FROM OLD.issued_at THEN
        RAISE EXCEPTION 'INVOICE_IMMUTABLE: cannot change issued_at after issued';
    END IF;
    IF NEW.total IS DISTINCT FROM OLD.total THEN
        RAISE EXCEPTION 'INVOICE_IMMUTABLE: cannot change total after issued (use corrective_sf)';
    END IF;
    IF NEW.subtotal IS DISTINCT FROM OLD.subtotal THEN
        RAISE EXCEPTION 'INVOICE_IMMUTABLE: cannot change subtotal after issued';
    END IF;
    IF NEW.vat_amount IS DISTINCT FROM OLD.vat_amount THEN
        RAISE EXCEPTION 'INVOICE_IMMUTABLE: cannot change vat_amount after issued';
    END IF;
    IF NEW.vat_rate IS DISTINCT FROM OLD.vat_rate THEN
        RAISE EXCEPTION 'INVOICE_IMMUTABLE: cannot change vat_rate after issued';
    END IF;
    IF NEW.payer_id IS DISTINCT FROM OLD.payer_id THEN
        RAISE EXCEPTION 'INVOICE_IMMUTABLE: cannot change payer_id after issued';
    END IF;
    IF NEW.payee_id IS DISTINCT FROM OLD.payee_id THEN
        RAISE EXCEPTION 'INVOICE_IMMUTABLE: cannot change payee_id after issued';
    END IF;
    IF NEW.payee_organization_id IS DISTINCT FROM OLD.payee_organization_id THEN
        RAISE EXCEPTION 'INVOICE_IMMUTABLE: cannot change payee_organization_id after issued';
    END IF;
    IF NEW.currency IS DISTINCT FROM OLD.currency THEN
        RAISE EXCEPTION 'INVOICE_IMMUTABLE: cannot change currency after issued';
    END IF;
    IF NEW.includes_vat IS DISTINCT FROM OLD.includes_vat THEN
        RAISE EXCEPTION 'INVOICE_IMMUTABLE: cannot change includes_vat after issued';
    END IF;
    IF NEW.basis_text IS DISTINCT FROM OLD.basis_text THEN
        RAISE EXCEPTION 'INVOICE_IMMUTABLE: cannot change basis_text after issued';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER invoices_immutable_check
BEFORE UPDATE ON invoices
FOR EACH ROW EXECUTE FUNCTION invoice_check_immutable_fields();

-- ---------- 9. DB-TRIGGER: invoice_history auto-fill ----------
-- per spec §8

CREATE OR REPLACE FUNCTION invoice_history_capture() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO invoice_history (invoice_id, operation, new_value, changed_at)
        VALUES (NEW.id, 'create', to_jsonb(NEW), now());
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.status IS DISTINCT FROM OLD.status THEN
            INSERT INTO invoice_history (invoice_id, operation, field_name, previous_value, new_value, changed_at)
            VALUES (NEW.id, 'status_change', 'status',
                to_jsonb(OLD.status::text), to_jsonb(NEW.status::text), now());
        END IF;
        IF NEW.paid_amount IS DISTINCT FROM OLD.paid_amount THEN
            INSERT INTO invoice_history (invoice_id, operation, field_name, previous_value, new_value, changed_at)
            VALUES (NEW.id, 'update', 'paid_amount',
                to_jsonb(OLD.paid_amount), to_jsonb(NEW.paid_amount), now());
        END IF;
        IF NEW.has_corrections IS DISTINCT FROM OLD.has_corrections THEN
            INSERT INTO invoice_history (invoice_id, operation, field_name, previous_value, new_value, changed_at)
            VALUES (NEW.id, 'update', 'has_corrections',
                to_jsonb(OLD.has_corrections), to_jsonb(NEW.has_corrections), now());
        END IF;
        IF NEW.cancellation_reason IS DISTINCT FROM OLD.cancellation_reason
           AND NEW.cancellation_reason IS NOT NULL THEN
            INSERT INTO invoice_history (invoice_id, operation, field_name, previous_value, new_value, changed_at)
            VALUES (NEW.id, 'cancel', 'cancellation_reason',
                to_jsonb(OLD.cancellation_reason), to_jsonb(NEW.cancellation_reason), now());
        END IF;
        RETURN NEW;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER invoices_history_capture
AFTER INSERT OR UPDATE ON invoices
FOR EACH ROW EXECUTE FUNCTION invoice_history_capture();

-- ---------- 10. DEFERRED CHECK: Σ allocated_amount = total ----------
-- Проверка отключена для draft (накопительный режим заполнения).
-- DEFERRABLE INITIALLY DEFERRED — проверка в конце транзакции,
-- чтобы можно было одновременно update invoice + insert/delete invoice_orders.

CREATE OR REPLACE FUNCTION check_invoice_orders_sum() RETURNS TRIGGER AS $$
DECLARE
    inv_total NUMERIC(12, 2);
    sum_alloc NUMERIC(12, 2);
    inv_status invoice_status;
    inv_id UUID;
BEGIN
    inv_id := COALESCE(NEW.invoice_id, OLD.invoice_id);
    SELECT total, status INTO inv_total, inv_status FROM invoices WHERE id = inv_id;
    -- Invoice удалён каскадом — проверка не нужна.
    IF inv_total IS NULL THEN
        RETURN NEW;
    END IF;
    -- В draft проверка отключена (можно накапливать).
    IF inv_status = 'draft' THEN
        RETURN NEW;
    END IF;

    SELECT COALESCE(SUM(allocated_amount), 0) INTO sum_alloc
    FROM invoice_orders WHERE invoice_id = inv_id;

    IF abs(sum_alloc - inv_total) > 0.01 THEN
        RAISE EXCEPTION 'INVOICE_ORDERS_SUM_MISMATCH: sum(allocated_amount)=% != invoice.total=%', sum_alloc, inv_total;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER invoice_orders_sum_check
AFTER INSERT OR UPDATE OR DELETE ON invoice_orders
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION check_invoice_orders_sum();

-- ---------- 11. BACKFILL invoice_trips → invoice_orders ----------
-- Для existing invoices с invoice_trips связями — создаём invoice_orders
-- с пропорциональным allocated_amount (поровну между orders).
-- На prod: 0 invoices, на local: 6 seed-demo invoices.

-- Используем trip_orders junction-table (нормализованная связь),
-- так как orders.trip_id может быть NULL для split-order сценариев.
INSERT INTO invoice_orders (invoice_id, order_id, allocated_amount, allocated_vat)
SELECT
    it.invoice_id,
    tro.order_id,
    -- equal split: total / count(orders per invoice)
    (i.total / NULLIF(cnt.order_count, 0))::numeric(12, 2) AS allocated_amount,
    (i.vat_amount / NULLIF(cnt.order_count, 0))::numeric(12, 2) AS allocated_vat
FROM invoice_trips it
JOIN invoices i ON i.id = it.invoice_id
JOIN trip_orders tro ON tro.trip_id = it.trip_id
JOIN (
    SELECT it2.invoice_id, COUNT(*) AS order_count
    FROM invoice_trips it2
    JOIN trip_orders tro2 ON tro2.trip_id = it2.trip_id
    GROUP BY it2.invoice_id
) cnt ON cnt.invoice_id = it.invoice_id
ON CONFLICT (invoice_id, order_id) DO NOTHING;
