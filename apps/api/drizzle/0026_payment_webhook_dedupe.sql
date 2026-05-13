-- ============================================================
-- 0026 — Payment webhook replay dedupe (audit A-P0-1)
-- ============================================================
-- Adds a JSONB `provider_metadata` column to `payments` so the
-- YooKassa (and Tinkoff / CloudPayments) webhook handler can persist
-- the last-processed event_id and refuse to re-apply the same event
-- on retry. Without this, ЮKassa's "deliver up to 6 retries until 200"
-- behaviour would roll the subscription period N times for a single
-- succeeded payment.
-- ============================================================

ALTER TABLE payments
ADD COLUMN IF NOT EXISTS provider_metadata jsonb;

-- For lookups by `lastWebhookEventId` (used during dedupe check).
-- Partial index keeps the index tiny for the common path where the
-- column is null.
CREATE INDEX IF NOT EXISTS idx_payments_webhook_event_id
ON payments ((provider_metadata->>'lastWebhookEventId'))
WHERE provider_metadata IS NOT NULL;
