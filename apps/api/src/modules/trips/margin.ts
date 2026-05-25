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
}

export async function computeTripMargin(tripId: string): Promise<TripMargin> {
    const [trip] = await db.select({
        carrierCost: trips.carrierCost,
        carrierCostCurrency: trips.carrierCostCurrency,
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

    const cost = trip.carrierCost ?? null;
    const finalRevenue = hasAnyPrice ? round2(revenue) : null;
    const margin = (finalRevenue != null && cost != null) ? round2(finalRevenue - cost) : null;

    return {
        revenue: finalRevenue,
        cost,
        margin,
        revenueCurrency: revenueCurrency ?? 'RUB',
        costCurrency: trip.carrierCostCurrency ?? 'RUB',
        ordersWithoutPrice,
        ordersChecked: orderRows.length - ordersWithoutPrice,
    };
}

function round2(v: number): number {
    return Math.round(v * 100) / 100;
}
