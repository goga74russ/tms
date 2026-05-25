-- ============================================================
-- 0033 — Tax regime per organization (Jurist Этап 1).
--
-- Юр-обоснование: tax_regime фундаментален для логики НДС и
-- выпуска счетов. Без явного выбора режима — функционал
-- выставления СФ должен быть заблокирован (см. invoice-spec.md).
--
-- 8 значений включая 'unspecified' (default до явного выбора).
-- 'usn_with_vat' — новая категория с 244-ФЗ от 12.07.2024 для
-- УСН-плательщиков с доходом >60M ₽.
--
-- BACKFILL: все existing organizations получают 'unspecified'
-- через default. Admin'у выводится banner с требованием явного
-- выбора. До явного выбора /finance/invoices/issue заблокирован.
-- ============================================================

CREATE TYPE tax_regime AS ENUM (
    'osno',                   -- ОСНО (общая, НДС 20%/10%/0%)
    'usn_income',             -- УСН доходы 6%, без НДС
    'usn_income_expense',     -- УСН доходы−расходы 15%, без НДС
    'usn_with_vat',           -- 244-ФЗ от 2024: УСН с НДС (>60M ₽)
    'ausn',                   -- Автоматизированная УСН
    'patent',                 -- Патент (только ИП)
    'npd',                    -- НПД (самозанятые)
    'unspecified'             -- временное состояние до явного выбора
);

ALTER TABLE organizations
    ADD COLUMN tax_regime tax_regime NOT NULL DEFAULT 'unspecified';

COMMENT ON COLUMN organizations.tax_regime IS 'Налоговый режим организации. От него зависит логика НДС и выпуска СФ. unspecified блокирует /finance/invoices/issue до явного выбора. Изменения логируются в events с severity=warning (критическое событие).';

-- Индекс для быстрого поиска organizations с unspecified (для banner-warning).
CREATE INDEX idx_organizations_tax_regime_unspecified
    ON organizations(id) WHERE tax_regime = 'unspecified';
