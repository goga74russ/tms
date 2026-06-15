import { db } from '../../db/connection.js';
import { trips, routePoints, vehicles, tariffs, contracts, invoices, tripOrders, orders, waybillExpenses, waybills } from '../../db/schema.js';
import { eq, and, gt, desc, inArray, sql } from 'drizzle-orm';
import { TariffType, RoutePointType } from '@tms/shared';
import { getCostModelSettings } from '../settings/service.js';

// ================================================================
// Types
// ================================================================

export interface TripCostBreakdown {
    baseCost: number;
    baseExplanation: string;
    modifiers: {
        idleCost: number;
        extraPointsCost: number;
        nightCost: number;
        urgentCost: number;
        weekendCost: number;
        returnCost: number;
        cancellationCost: number;
    };
    costComponents: {
        fuelCost: number;
        driverSalary: number;
        amortization: number;
        tollsCost: number;
    };
    subtotal: number;
    vatAmount: number;
    total: number;
    margin: number;
    marginPercent: number;
}

type RoundingPrecision = 1 | 10 | 100;

// ================================================================
// Helpers
// ================================================================

/** Смещение МСК относительно UTC в миллисекундах (РФ без перехода на летнее время → фикс. UTC+3) */
const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Час по МСК (UTC+3) для UTC-момента */
function getMskHour(date: Date): number {
    return new Date(date.getTime() + MSK_OFFSET_MS).getUTCHours();
}

/** День недели по МСК (UTC+3): воскресенье=0 … суббота=6 */
function getMskDay(date: Date): number {
    return new Date(date.getTime() + MSK_OFFSET_MS).getUTCDay();
}

/** Проверяет, попадает ли час в ночной диапазон 22:00–06:00 */
function isNightHour(hour: number): boolean {
    return hour >= 22 || hour < 6;
}

/** Проверяет, выходной ли день (суббота=6, воскресенье=0) по МСК */
function isWeekend(date: Date): boolean {
    const day = getMskDay(date);
    return day === 0 || day === 6;
}

/** Считает долю ночных часов в рейсе */
function calculateNightFraction(departureAt: Date, completionAt: Date): number {
    if (!departureAt || !completionAt) return 0;

    const totalMs = completionAt.getTime() - departureAt.getTime();
    if (totalMs <= 0) return 0;

    let nightMs = 0;
    const cursor = new Date(departureAt);
    const step = 15 * 60 * 1000; // шаг 15 мин

    while (cursor.getTime() < completionAt.getTime()) {
        if (isNightHour(getMskHour(cursor))) {
            nightMs += Math.min(step, completionAt.getTime() - cursor.getTime());
        }
        cursor.setTime(cursor.getTime() + step);
    }

    return nightMs / totalMs;
}

/** Округление суммы с заданной точностью */
function roundAmount(amount: number, precision: RoundingPrecision = 1): number {
    return Math.round(amount / precision) * precision;
}

function num(value: unknown): number {
    if (value === null || value === undefined || value === '') return 0;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

// ================================================================
// Service
// ================================================================

export class TarificationService {
    /**
     * Расчёт стоимости рейса для клиента согласно тарифу из договора.
     * Включает все 7 модификаторов, НДС и расчёт себестоимости.
     */
    async calculateTripCost(tripId: string, organizationId: string | null = null): Promise<TripCostBreakdown> {
        // 1. Load trip. C3 (CBO): при передаче organizationId — row-level org-фильтр
        // (cross-tenant IDOR ставок/себестоимости/маржи). Untrusted-входы (роут) ОБЯЗАНЫ
        // передавать org; trusted-внутренние (auto-billing) уже отскоуплены → null.
        const conditions = [eq(trips.id, tripId)];
        if (organizationId) conditions.push(eq(trips.organizationId, organizationId));
        const [tripRecord] = await db.select().from(trips).where(and(...conditions)).limit(1) as any[];
        if (!tripRecord) throw new Error('Trip not found');

        // 2. Load linked orders
        const tripOrderRecords = await db.select({ order: orders })
            .from(tripOrders)
            .innerJoin(orders, eq(tripOrders.orderId, orders.id))
            .where(eq(tripOrders.tripId, tripId));

        if (tripOrderRecords.length === 0) throw new Error('Trip has no associated order');
        const linkedOrders = tripOrderRecords.map(r => r.order);

        const contractIds = [...new Set(linkedOrders.map((order) => order.contractId).filter(Boolean))];
        if (contractIds.length === 0) throw new Error('No active contract for this trip');
        if (contractIds.length > 1) throw new Error('Trip has orders from multiple contracts - split billing required');

        const firstOrder = linkedOrders[0];
        if (!firstOrder.contractId) throw new Error('No active contract for this order');

        // 3. Load tariff
        const [tariff] = await db.select()
            .from(tariffs)
            .where(eq(tariffs.contractId, firstOrder.contractId))
            .limit(1);
        if (!tariff) throw new Error('No tariff found for this contract');

        // 4. Prepare trip record with aggregated weight
        const totalWeight = linkedOrders.reduce((sum, o) => sum + (o.cargoWeightKg || 0), 0);
        tripRecord.order = { ...firstOrder, cargoWeightKg: totalWeight };

        // 5. Load route points, vehicle fuel norm, and toll costs in parallel
        const [points, vehicleForFuel, tollsCost] = await Promise.all([
            db.select().from(routePoints)
                .where(eq(routePoints.tripId, tripId))
                .orderBy(routePoints.sequenceNumber),
            tripRecord.vehicleId
                ? db.select({ fuelNormPer100Km: vehicles.fuelNormPer100Km })
                    .from(vehicles).where(eq(vehicles.id, tripRecord.vehicleId)).limit(1)
                    .then(rows => rows[0] ?? null)
                : Promise.resolve(null),
            tripRecord.waybillId
                ? db.select({
                    total: sql<number>`coalesce(sum(${waybillExpenses.actualAmount}), 0)`,
                })
                    .from(waybillExpenses)
                    .where(and(
                        eq(waybillExpenses.waybillId, tripRecord.waybillId),
                        sql`${waybillExpenses.category} IN ('platon', 'toll')`,
                    ))
                    .then(rows => Number(rows[0]?.total) || 0)
                : Promise.resolve(0),
        ]);

        // P1-D: cost-model — per-org (tripRecord несёт organizationId).
        const costSettings = await getCostModelSettings(tripRecord.organizationId);

        // 6. Delegate to pure computation
        return this.computeTripCost(tripRecord, tariff, points, vehicleForFuel, tollsCost, costSettings);
    }
    /**
     * C-3: Batch calculation — eliminates N+1 by loading all data upfront.
     * Returns a map of tripId → TripCostBreakdown.
     */
    async calculateBatchTripCosts(tripIds: string[]): Promise<Map<string, TripCostBreakdown>> {
        if (tripIds.length === 0) return new Map();

        // Bulk load all trips
        const allTrips = await db.select().from(trips).where(inArray(trips.id, tripIds)) as any[];

        // Bulk load all orders via tripOrders
        const allTripOrders = await db.select({ tripId: tripOrders.tripId, order: orders })
            .from(tripOrders)
            .innerJoin(orders, eq(tripOrders.orderId, orders.id))
            .where(inArray(tripOrders.tripId, tripIds));

        // Extract contract IDs to load tariffs
        const contractIds = [...new Set(allTripOrders.map(to => to.order.contractId).filter(id => id))] as string[];
        const allTariffs = contractIds.length > 0
            ? await db.select().from(tariffs).where(inArray(tariffs.contractId, contractIds))
            : [];

        const vehicleIds = [...new Set(allTrips.map((trip) => trip.vehicleId).filter(Boolean))] as string[];
        const allVehicles = vehicleIds.length > 0
            ? await db.select({ id: vehicles.id, fuelNormPer100Km: vehicles.fuelNormPer100Km })
                .from(vehicles)
                .where(inArray(vehicles.id, vehicleIds))
            : [];

        const waybillIds = [...new Set(allTrips.map((trip) => trip.waybillId).filter(Boolean))] as string[];
        const allTollRows = waybillIds.length > 0
            ? await db.select({
                waybillId: waybillExpenses.waybillId,
                total: sql<number>`coalesce(sum(${waybillExpenses.actualAmount}), 0)`,
            })
                .from(waybillExpenses)
                .where(and(
                    inArray(waybillExpenses.waybillId, waybillIds),
                    sql`${waybillExpenses.category} IN ('platon', 'toll')`,
                ))
                .groupBy(waybillExpenses.waybillId)
            : [];

        // Bulk load all route points
        const allPoints = await db.select().from(routePoints)
            .where(inArray(routePoints.tripId, tripIds))
            .orderBy(routePoints.sequenceNumber);

        // Group points by tripId
        const pointsByTrip = new Map<string, typeof allPoints>();
        for (const pt of allPoints) {
            const list = pointsByTrip.get(pt.tripId) || [];
            list.push(pt);
            pointsByTrip.set(pt.tripId, list);
        }

        const vehiclesById = new Map(allVehicles.map((vehicle) => [vehicle.id, vehicle]));
        const tollsByWaybillId = new Map(allTollRows.map((row) => [row.waybillId, Number(row.total) || 0]));
        // P1-D: batch обычно в пределах одной орг (вызывается из org-scoped
        // bulk-операции) — берём орг первого рейса для per-org cost-model.
        const costSettings = await getCostModelSettings(allTrips[0]?.organizationId);

        // Calculate costs in-memory for each trip
        const results = new Map<string, TripCostBreakdown>();

        for (const tripRecord of allTrips) {
            try {
                const linked = allTripOrders.filter(to => to.tripId === tripRecord.id).map(to => to.order);
                if (linked.length === 0 || !linked[0].contractId) continue;

                const totalWeight = linked.reduce((sum, o) => sum + (o.cargoWeightKg || 0), 0);
                const firstOrder = linked[0];
                const trf = allTariffs.find(t => t.contractId === firstOrder.contractId);
                
                if (!trf) continue;
                
                tripRecord.order = { 
                   ...firstOrder, 
                   cargoWeightKg: totalWeight
                };

                const points = pointsByTrip.get(tripRecord.id) || [];

                // Reuse in-memory calculation logic (same as calculateTripCost)
                const cost = this.computeTripCost(
                    tripRecord,
                    trf,
                    points,
                    vehiclesById.get(tripRecord.vehicleId ?? ''),
                    tripRecord.waybillId ? tollsByWaybillId.get(tripRecord.waybillId) ?? 0 : 0,
                    costSettings,
                );
                results.set(tripRecord.id, cost);
            } catch {
                // Skip trips that fail calculation
            }
        }

        return results;
    }

    /**
     * Pure in-memory computation — extracted from calculateTripCost for reuse.
     */
    private computeTripCost(
        tripRecord: any,
        tariff: any,
        points: any[],
        vehicleForFuel?: { fuelNormPer100Km: number | null } | null,
        tollsCostOverride?: number,
        costSettings?: Awaited<ReturnType<typeof getCostModelSettings>>,
    ): TripCostBreakdown {
        const distance = tripRecord.actualDistanceKm || tripRecord.plannedDistanceKm || 0;
        const weight = tripRecord.order?.cargoWeightKg || 0;
        const weightTon = weight / 1000;

        let totalHours = 0;
        if (tripRecord.actualDepartureAt && tripRecord.actualCompletionAt) {
            totalHours = (tripRecord.actualCompletionAt.getTime() - tripRecord.actualDepartureAt.getTime()) / (1000 * 60 * 60);
        }

        // Base cost
        let baseCost = 0;
        let baseExplanation = '';

        switch (tariff.type as TariffType) {
            case 'per_km':
                baseCost = distance * (num(tariff.ratePerKm));
                baseExplanation = `${distance} км × ${tariff.ratePerKm} ₽`;
                break;
            case 'per_ton':
                baseCost = weightTon * (num(tariff.ratePerTon));
                baseExplanation = `${weightTon} т × ${tariff.ratePerTon} ₽`;
                break;
            case 'per_hour':
                baseCost = totalHours * (num(tariff.ratePerHour));
                baseExplanation = `${totalHours.toFixed(1)} ч × ${tariff.ratePerHour} ₽`;
                break;
            case 'fixed_route':
                baseCost = num(tariff.fixedRate);
                baseExplanation = `Фикс ставка: ${tariff.fixedRate} ₽`;
                break;
            case 'combined': {
                const kmThresh = num(tariff.combinedKmThreshold);
                const fixed = num(tariff.combinedFixedRate);
                const rateKm = num(tariff.combinedRatePerKm);
                if (distance <= kmThresh) {
                    baseCost = fixed;
                    baseExplanation = `Фикс (до ${kmThresh} км): ${fixed} ₽`;
                } else {
                    const extra = distance - kmThresh;
                    baseCost = fixed + extra * rateKm;
                    baseExplanation = `Фикс ${fixed} ₽ + ${extra} км × ${rateKm} ₽`;
                }
                break;
            }
        }

        // Modifiers
        let totalIdleMinutes = 0;
        for (const pt of points) {
            if (pt.arrivedAt && pt.completedAt) {
                const stayMins = (pt.completedAt.getTime() - pt.arrivedAt.getTime()) / (1000 * 60);
                if (stayMins > (tariff.idleFreeLimitMinutes ?? 60)) {
                    totalIdleMinutes += stayMins - (tariff.idleFreeLimitMinutes ?? 60);
                }
            }
        }
        const idleCost = (totalIdleMinutes / 60) * (num(tariff.idleRatePerHour));
        const extraPointsCost = points.length > 2 ? (points.length - 2) * (num(tariff.extraPointRate)) : 0;

        let nightCost = 0;
        if (tripRecord.actualDepartureAt && tripRecord.actualCompletionAt) {
            const nightFraction = calculateNightFraction(tripRecord.actualDepartureAt, tripRecord.actualCompletionAt);
            if (nightFraction > 0) {
                nightCost = baseCost * nightFraction * ((tariff.nightCoefficient ?? 1.5) - 1);
            }
        }

        let urgentCost = 0;
        const orderCreatedAt = tripRecord.order?.createdAt;
        const plannedDelivery = points.find((p: any) => p.type === RoutePointType.UNLOADING || p.type === 'unloading')?.windowEnd ?? tripRecord.order?.unloadingWindowEnd;
        if (orderCreatedAt && plannedDelivery) {
            const leadTimeHours = (plannedDelivery.getTime() - orderCreatedAt.getTime()) / (1000 * 60 * 60);
            if (leadTimeHours < 4) {
                urgentCost = baseCost * ((tariff.urgentCoefficient ?? 1.3) - 1);
            }
        }

        let weekendCost = 0;
        if (tripRecord.actualDepartureAt && isWeekend(tripRecord.actualDepartureAt)) {
            weekendCost = baseCost * ((tariff.weekendCoefficient ?? 1.2) - 1);
        }


        // Return leg modifier stays disabled until the order model gets an explicit return flag.
        const returnCost = 0;
        const cancellationCost = (tripRecord.status === 'cancelled' && tripRecord.vehicleId)
            ? ((tariff.cancellationFee ?? 0) || baseCost * 0.3) : 0;

        // Cost components — fetch vehicle fuelNorm from DB
        const fuelPriceLiter = costSettings?.fuelPricePerLiter.value ?? (Number(process.env.FUEL_PRICE_PER_LITER) || 60);
        let vehicleFuelNorm = Number(process.env.FUEL_NORM_PER_100KM) || 30;
        if (vehicleForFuel?.fuelNormPer100Km) vehicleFuelNorm = vehicleForFuel.fuelNormPer100Km;
        const fuelCost = (distance / 100) * vehicleFuelNorm * fuelPriceLiter;
        const driverSalaryRate = costSettings?.driverSalaryPerHour.value ?? (Number(process.env.DRIVER_SALARY_PER_HOUR) || 350);
        const driverSalary = totalHours * driverSalaryRate;
        const amortizationRate = costSettings?.amortizationPerKm.value ?? (Number(process.env.AMORTIZATION_PER_KM) || 3);
        const amortization = distance * amortizationRate;

        // Sprint 12: Платон + toll — из waybill_expenses рейса
        const tollsCost = tollsCostOverride ?? 0;

        // Subtotal
        let subtotal = baseCost + idleCost + extraPointsCost + nightCost + urgentCost + weekendCost + returnCost;
        if (tripRecord.status === 'cancelled') subtotal = cancellationCost;
        // code-audit 2026-06-14 #9: drizzle numeric() возвращает СТРОКУ в рантайме —
        // tariff.minTripCost/vatRate без num() ломали арифметику (100 + "20.00" =
        // конкатенация "10020.00" → НДС занижался в ~83×). Коэрсим как остальные поля.
        const minTrip = num(tariff.minTripCost);
        if (subtotal < minTrip) subtotal = minTrip;

        const roundingPrecision: RoundingPrecision = (tariff.roundingPrecision as RoundingPrecision) || 1;
        subtotal = roundAmount(subtotal, roundingPrecision);

        const vr = num(tariff.vatRate);
        let vatAmount = 0;
        let total = subtotal;
        if (tariff.vatIncluded) {
            vatAmount = subtotal * (vr / (100 + vr));
            total = subtotal;
            subtotal = total - vatAmount;
        } else {
            vatAmount = subtotal * (vr / 100);
            total = subtotal + vatAmount;
        }

        const totalCost = fuelCost + driverSalary + amortization + tollsCost;
        const margin = total - totalCost;
        const marginPercent = total > 0 ? (margin / total) * 100 : 0;

        return {
            baseCost, baseExplanation,
            modifiers: { idleCost, extraPointsCost, nightCost, urgentCost, weekendCost, returnCost, cancellationCost },
            costComponents: { fuelCost, driverSalary, amortization, tollsCost },
            subtotal, vatAmount, total, margin, marginPercent,
        };
    }
}

export const tarificationService = new TarificationService();
