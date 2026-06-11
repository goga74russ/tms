-- ③ legal-register §2.F1 — наименование банка + корр.счёт в профиле организации.
-- Нужны для банковского блока счёта на оплату (server invoice-PDF), чтобы
-- реквизиты шли из организации, а не из хардкода ИП Бардина (денежная мина).
-- Идемпотентно (IF NOT EXISTS) — runner может применить повторно без падения.
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS bank_name text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS corr_account text;
