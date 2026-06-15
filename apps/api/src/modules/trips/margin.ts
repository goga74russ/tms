// ============================================================
// K4 — Margin computation (Этап 2).
//
// Маржа = Σ(orders.customerPrice для всех заявок trip'а) − trip.carrierCost.
//
// Возвращает null для revenue/cost/margin если данных не хватает:
//   • revenue=null если у ВСЕХ заявок trip'а customerPrice не задан
//   • cost=null если trip.carrierCost не задан
//   • margin=null если revenue или cost null
//
// Это RBAC-чувствительные данные. Caller должен сам проверить роль
// перед вызовом (manager+/accountant/admin).
// ============================================================
import { eq } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import { trips, tripOrders, orders } from '../../db/schema.js';
import { toOptionalFiniteNumber } from '../../utils/number.js';

export interface TripMargin {
    revenue: number | null;
    cost: number | null;
    margin: number | null;
    revenueCurrency: string;
    costCurrency: string;
    ordersWithoutPrice: number;
    ordersChecked: number;
    /** L1 — указывает откуда взяли cost: 'own' | 'subcontract' | 'legacy_carrier_cost'. */
    costSource?: 'own' | 'subcontract' | 'legacy_carrier_cost' | null;
    executionMode?: 'own' | 'subcontract' | null;
    /** P2 — true, если валюты revenue и cost различаются: margin=null (вычитание
     * разных валют бессмысленно), потребитель должен показать предупреждение. */
    currencyMismatch?: boolean;
}

/** Сырьё из БД (numeric-поля приходят строками либо number). */
export interface MarginTripRow {
    carrierCost: unknown;
    carrierCostCurrency: string | null;
    ownCostEstimate: unknown;
    subcontractorCost: unknown;
    executionMode: 'own' | 'subcontract' | null;
}
export interface MarginOrderRow {
    customerPrice: unknown;
    customerPriceCurrency: string | null;
}

/**
 * Чистый редьюсер маржи — без БД, тестируется напрямую.
 * Вынесен из computeTripMargin ради anchor-теста на string-numeric (C9 NaN-баг).
 */
export function reduceTripMargin(trip: MarginTripRow, orderRows: MarginOrderRow[]): TripMargin {
    let revenue = 0;
    let hasAnyPrice = false;
    let ordersWithoutPrice = 0;
    let revenueCurrency: string | null = null;
    for (const row of orderRows) {
        // C9: numeric-колонки PG приходят из драйвера СТРОКАМИ (несмотря на .$type<number>()).
        // Без явной коэрции `revenue += "1500.00"` конкатенировал строки → round2 → NaN.
        const price = toOptionalFiniteNumber(row.customerPrice);
        if (price != null) {
            revenue += price;
            hasAnyPrice = true;
            // Берём валюту первой заявки с ценой (валидация смешанных валют — TODO Этап 3).
            if (!revenueCurrency) revenueCurrency = row.customerPriceCurrency;
        } else {
            ordersWithoutPrice++;
        }
    }

    // L1 (Carriers-0) — fallback chain: новые поля приоритетнее legacy carrier_cost.
    // execution_mode='own' → own_cost_estimate; ='subcontract' → subcontractor_cost.
    // carrier_cost остаётся только для legacy trips (миграция 0035 backfill'ила
    // existing carrier_cost → own_cost_estimate, поэтому fallback редко срабатывает).
    const cost = toOptionalFiniteNumber(trip.subcontractorCost)
        ?? toOptionalFiniteNumber(trip.ownCostEstimate)
        ?? toOptionalFiniteNumber(trip.carrierCost);
    const finalRevenue = hasAnyPrice ? round2(revenue) : null;
    // P2 (код-аудит 2026-06-14): не вычитаем cost из revenue, если валюты различаются —
    // это финансово некорректно. margin=null + флаг currencyMismatch для UI.
    const revCurrency = revenueCurrency ?? 'RUB';
    const costCurrency = trip.carrierCostCurrency ?? 'RUB';
    const currencyMismatch = finalRevenue != null && cost != null && revCurrency !== costCurrency;
    const margin = (finalRevenue != null && cost != null && !currencyMismatch) ? round2(finalRevenue - cost) : null;

    const costSource = trip.subcontractorCost != null
        ? 'subcontract' as const
        : trip.ownCostEstimate != null
            ? 'own' as const
            : trip.carrierCost != null
                ? 'legacy_carrier_cost' as const
                : null;

    return {
        revenue: finalRevenue,
        cost,
        margin,
        revenueCurrency: revCurrency,
        costCurrency,
        ordersWithoutPrice,
        ordersChecked: orderRows.length - ordersWithoutPrice,
        costSource,
        executionMode: trip.executionMode ?? null,
        currencyMismatch,
    };
}

export async function computeTripMargin(tripId: string): Promise<TripMargin> {
    const [trip] = await db.select({
        carrierCost: trips.carrierCost,
        carrierCostCurrency: trips.carrierCostCurrency,
        // L1 — новые dual-cost поля. cost = subcontractor_cost ?? own_cost_estimate ?? carrier_cost (legacy).
        ownCostEstimate: trips.ownCostEstimate,
        subcontractorCost: trips.subcontractorCost,
        executionMode: trips.executionMode,
    })
        .from(trips)
        .where(eq(trips.id, tripId))
        .limit(1);

    if (!trip) {
        return {
            revenue: null, cost: null, margin: null,
            revenueCurrency: 'RUB', costCurrency: 'RUB',
            ordersWithoutPrice: 0, ordersChecked: 0,
        };
    }

    const orderRows = await db.select({
        customerPrice: orders.customerPrice,
        customerPriceCurrency: orders.customerPriceCurrency,
    })
        .from(tripOrders)
        .innerJoin(orders, eq(tripOrders.orderId, orders.id))
        .where(eq(tripOrders.tripId, tripId));

    return reduceTripMargin(trip as MarginTripRow, orderRows as MarginOrderRow[]);
}

function round2(v: number): number {
    return Math.round(v * 100) / 100;
}
