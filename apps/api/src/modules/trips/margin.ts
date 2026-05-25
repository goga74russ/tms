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

    let revenue = 0;
    let hasAnyPrice = false;
    let ordersWithoutPrice = 0;
    let revenueCurrency: string | null = null;
    for (const row of orderRows) {
        if (row.customerPrice != null) {
            revenue += row.customerPrice;
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
    const cost = trip.subcontractorCost ?? trip.ownCostEstimate ?? trip.carrierCost ?? null;
    const finalRevenue = hasAnyPrice ? round2(revenue) : null;
    const margin = (finalRevenue != null && cost != null) ? round2(finalRevenue - cost) : null;

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
        revenueCurrency: revenueCurrency ?? 'RUB',
        costCurrency: trip.carrierCostCurrency ?? 'RUB',
        ordersWithoutPrice,
        ordersChecked: orderRows.length - ordersWithoutPrice,
        costSource,
        executionMode: trip.executionMode ?? null,
    };
}

function round2(v: number): number {
    return Math.round(v * 100) / 100;
}
