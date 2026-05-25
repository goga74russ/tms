-- ============================================================
-- 0034 — Order/Trip pricing (Этап 2).
--
-- orders.customer_price — стоимость от заказчика (вводит logist
-- при ручной заявке без контрактного тарифа). Видна manager+ /
-- accountant / admin. Logist может вводить, но НЕ видит после
-- сохранения (защита от data-leak коммерческой инфы).
--
-- trips.carrier_cost — стоимость перевозчика (вводит dispatcher
-- при назначении ТС). Видна manager+ / accountant / admin.
-- Dispatcher вводит, но НЕ видит. Маржа = Σ(customer_price) −
-- carrier_cost — считается на лету в /trips endpoints.
--
-- Все поля nullable: для существующих записей цена остаётся NULL,
-- интерпретируется как «не задана». Воспринимается accountant'ом
-- как «требует ввода вручную».
--
-- includes_vat: дефолт зависит от tax_regime организации (см.
-- invoice-spec.md). osno/usn_with_vat → true; usn_income, ausn,
-- patent, npd → false. Дефолт в БД false; реальный default
-- проставляется на UI на основе user.organization.taxRegime.
-- ============================================================

-- --- orders.customer_price ---
ALTER TABLE orders ADD COLUMN customer_price NUMERIC(12, 2);
ALTER TABLE orders ADD COLUMN customer_price_currency VARCHAR(3) NOT NULL DEFAULT 'RUB';
ALTER TABLE orders ADD COLUMN customer_price_includes_vat BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN orders.customer_price IS 'Стоимость от заказчика (для ручной заявки без тарифа). NULL = не задана. Видна manager+/accountant/admin. Logist может вводить через UI.';
COMMENT ON COLUMN orders.customer_price_includes_vat IS 'true = цена с НДС, false = без НДС. Default UI зависит от org.tax_regime: osno/usn_with_vat→true, прочее→false.';

CREATE INDEX idx_orders_customer_price_not_null ON orders((customer_price IS NOT NULL))
    WHERE customer_price IS NOT NULL;

-- --- trips.carrier_cost ---
ALTER TABLE trips ADD COLUMN carrier_cost NUMERIC(12, 2);
ALTER TABLE trips ADD COLUMN carrier_cost_currency VARCHAR(3) NOT NULL DEFAULT 'RUB';
ALTER TABLE trips ADD COLUMN carrier_cost_includes_vat BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN trips.carrier_cost IS 'Себестоимость рейса. Для наёмного — оплата субподрядчику. Для своего парка — внутренняя стоимость. Видна manager+/accountant/admin. Dispatcher может вводить.';
COMMENT ON COLUMN trips.carrier_cost_includes_vat IS 'true = с НДС (если перевозчик на ОСНО), false = без НДС (если УСН/АУСН/Патент/НПД).';

CREATE INDEX idx_trips_carrier_cost_not_null ON trips((carrier_cost IS NOT NULL))
    WHERE carrier_cost IS NOT NULL;
