import { describe, it, expect, vi } from 'vitest';

// margin.ts импортит db/connection (throw без DATABASE_URL). Тест трогает только
// чистый reduceTripMargin — глушим connection, чтобы импорт не падал в CI.
vi.mock('../../db/connection.js', () => ({ db: {} }));

import { reduceTripMargin, type MarginTripRow, type MarginOrderRow } from './margin.js';

// C9 anchor: PG numeric-колонки приходят из драйвера СТРОКАМИ ("1500.00"),
// несмотря на .$type<number>(). Раньше `revenue += "1500.00"` конкатенировал
// строки → round2 → NaN. Редьюсер обязан коэрсить и считать корректно.
const trip = (over: Partial<MarginTripRow> = {}): MarginTripRow => ({
    carrierCost: null,
    carrierCostCurrency: 'RUB',
    ownCostEstimate: null,
    subcontractorCost: null,
    executionMode: null,
    ...over,
});

describe('reduceTripMargin (string-numeric coercion)', () => {
    it('суммирует customerPrice-строки числом, не конкатенацией', () => {
        const orders: MarginOrderRow[] = [
            { customerPrice: '1500.00', customerPriceCurrency: 'RUB' },
            { customerPrice: '2000.50', customerPriceCurrency: 'RUB' },
        ];
        const r = reduceTripMargin(trip({ ownCostEstimate: '1000.00' }), orders);
        expect(r.revenue).toBe(3500.5);
        expect(r.cost).toBe(1000);
        expect(r.margin).toBe(2500.5);
        expect(Number.isNaN(r.margin as number)).toBe(false);
    });

    it('margin не становится NaN ни при каких string-входах', () => {
        const orders: MarginOrderRow[] = [{ customerPrice: '999.99', customerPriceCurrency: 'RUB' }];
        const r = reduceTripMargin(trip({ subcontractorCost: '500.00' }), orders);
        expect(r.margin).toBe(499.99);
    });

    it('cost берёт subcontractor > own > legacy carrier (приоритет)', () => {
        const orders: MarginOrderRow[] = [{ customerPrice: '100', customerPriceCurrency: 'RUB' }];
        expect(reduceTripMargin(trip({ subcontractorCost: '10', ownCostEstimate: '20', carrierCost: '30' }), orders).cost).toBe(10);
        expect(reduceTripMargin(trip({ ownCostEstimate: '20', carrierCost: '30' }), orders).cost).toBe(20);
        expect(reduceTripMargin(trip({ carrierCost: '30' }), orders).cost).toBe(30);
    });

    it('revenue=null если ни у одной заявки нет цены; margin=null', () => {
        const orders: MarginOrderRow[] = [
            { customerPrice: null, customerPriceCurrency: 'RUB' },
            { customerPrice: null, customerPriceCurrency: 'RUB' },
        ];
        const r = reduceTripMargin(trip({ ownCostEstimate: '1000' }), orders);
        expect(r.revenue).toBeNull();
        expect(r.margin).toBeNull();
        expect(r.ordersWithoutPrice).toBe(2);
        expect(r.ordersChecked).toBe(0);
    });

    it('cost=0 (строка "0.00") трактуется как присутствующий нулевой cost', () => {
        const orders: MarginOrderRow[] = [{ customerPrice: '100', customerPriceCurrency: 'RUB' }];
        const r = reduceTripMargin(trip({ subcontractorCost: '0.00' }), orders);
        expect(r.cost).toBe(0);
        expect(r.margin).toBe(100);
        expect(r.costSource).toBe('subcontract');
    });

    it('частичные цены: считает заданные, считает пропуски', () => {
        const orders: MarginOrderRow[] = [
            { customerPrice: '1000', customerPriceCurrency: 'RUB' },
            { customerPrice: null, customerPriceCurrency: 'RUB' },
            { customerPrice: '500', customerPriceCurrency: 'RUB' },
        ];
        const r = reduceTripMargin(trip({ ownCostEstimate: '300' }), orders);
        expect(r.revenue).toBe(1500);
        expect(r.ordersWithoutPrice).toBe(1);
        expect(r.ordersChecked).toBe(2);
        expect(r.margin).toBe(1200);
    });
});
