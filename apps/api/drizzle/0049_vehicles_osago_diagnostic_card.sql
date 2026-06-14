-- ⑥ Приказ Минтранса №390 — реквизиты ОСАГО (номер) и диагностической карты
-- (номер + срок) для путевого листа. osago_expiry уже существует (миг. ранее).
-- Идемпотентно (IF NOT EXISTS) — runner может применить повторно без падения.
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS osago_number varchar(50);
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS diagnostic_card_number varchar(50);
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS diagnostic_card_expiry timestamptz;
