import { db } from '../../db/connection.js';
import { trips, routePoints, vehicles, tariffs, contracts, invoices } from '../../db/schema.js';
import { eq, and, gt, desc, inArray } from 'drizzle-orm';
import { TariffType, RoutePointType } from '@tms/shared';

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

/** Проверяет, попадает ли час в ночной диапазон 22:00–06:00 */
function isNightHour(hour: number): boolean {
    return hour >= 22 || hour < 6;
}

/** Проверяет, выходной ли день (суббота=6, воскресенье=0) */
function isWeekend(date: Date): boolean {
    const day = date.getDay();
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
        if (isNightHour(cursor.getHours())) {
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

// ================================================================
// Service
// ================================================================

export class TarificationService {
    /**
     * Расчёт стоимости рейса для клиента согласно тарифу из договора.
     * Включает все 7 модификаторов, НДС и расчёт себестоимости.
     */
    async calculateTripCost(tripId: string): Promise<TripCostBreakdown> {
        // 1. Получаем рейс с вложениями
        const tripRecord = await db.query.trips.findFirst({
            where: eq(trips.id, tripId),
            with: {
                order: {
                    with: {
                        contractor: true,
                        contract: {
                            with: { tariffs: true }
                        }
                    }
                }
            }
        }) as any;

        if (!tripRecord) throw new Error('Trip not found');
        if (!tripRecord.order) throw new Error('Trip has no associated order');
        if (!tripRecord.order.contract) throw new Error('No active contract for this order');

        const tariff = tripRecord.order.contract.tariffs[0];
        if (!tariff) throw new Error('No tariff found for this contract');

        const points = await db.query.routePoints.findMany({
            where: eq(routePoints.tripId, tripId),
            orderBy: routePoints.sequenceNumber
        });

        // ——— 2. Базовый расчёт по типу тарифа ———
        let baseCost = 0;
        let baseExplanation = '';

        const distance = tripRecord.actualDistanceKm || tripRecord.plannedDistanceKm || 0;
        const weight = tripRecord.order.cargoWeightKg || 0;
        const weightTon = weight / 1000;

        let totalHours = 0;
        if (tripRecord.actualDepartureAt && tripRecord.actualCompletionAt) {
            totalHours = (tripRecord.actualCompletionAt.getTime() - tripRecord.actualDepartureAt.getTime()) / (1000 * 60 * 60);
        }

        switch (tariff.type as TariffType) {
            case 'per_km':
                baseCost = distance * (tariff.ratePerKm || 0);
                baseExplanation = `${distance} км × ${tariff.ratePerKm} ₽`;
                break;
            case 'per_ton':
                baseCost = weightTon * (tariff.ratePerTon || 0);
                baseExplanation = `${weightTon} т × ${tariff.ratePerTon} ₽`;
                break;
            case 'per_hour':
                baseCost = totalHours * (tariff.ratePerHour || 0);
                baseExplanation = `${totalHours.toFixed(1)} ч × ${tariff.ratePerHour} ₽`;
                break;
            case 'fixed_route':
                baseCost = tariff.fixedRate || 0;
                baseExplanation = `Фикс ставка: ${tariff.fixedRate} ₽`;
                break;
            case 'combined': {
                const kmThresh = tariff.combinedKmThreshold || 0;
                const fixed = tariff.combinedFixedRate || 0;
                const rateKm = tariff.combinedRatePerKm || 0;
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

        // ——— 3. Модификаторы (7 штук) ———

        // 3.1 Простой
        let idleCost = 0;
        let totalIdleMinutes = 0;
        for (const pt of points) {
            if (pt.arrivedAt && pt.completedAt) {
                const stayMins = (pt.completedAt.getTime() - pt.arrivedAt.getTime()) / (1000 * 60);
                if (stayMins > (tariff.idleFreeLimitMinutes ?? 60)) {
                    totalIdleMinutes += stayMins - (tariff.idleFreeLimitMinutes ?? 60);
                }
            }
        }
        idleCost = (totalIdleMinutes / 60) * (tariff.idleRatePerHour || 0);

        // 3.2 Доп. точки (> 2 точек)
        let extraPointsCost = 0;
        if (points.length > 2) {
            extraPointsCost = (points.length - 2) * (tariff.extraPointRate || 0);
        }

        // 3.3 Ночная доставка (×1.5 за часы 22:00–06:00)
        let nightCost = 0;
        if (tripRecord.actualDepartureAt && tripRecord.actualCompletionAt) {
            const nightFraction = calculateNightFraction(
                tripRecord.actualDepartureAt,
                tripRecord.actualCompletionAt
            );
            if (nightFraction > 0) {
                const nightSurchargeRate = tariff.nightMultiplier ?? 1.5;
                nightCost = baseCost * nightFraction * (nightSurchargeRate - 1);
            }
        }

        // 3.4 Срочная доставка (<4 часа от создания заявки до плановой доставки)
        let urgentCost = 0;
        const orderCreatedAt = tripRecord.order?.createdAt;
        const plannedDelivery = tripRecord.plannedCompletionAt;
        if (orderCreatedAt && plannedDelivery) {
            const leadTimeHours = (plannedDelivery.getTime() - orderCreatedAt.getTime()) / (1000 * 60 * 60);
            if (leadTimeHours < 4) {
                const urgentRate = tariff.urgentMultiplier ?? 1.3;
                urgentCost = baseCost * (urgentRate - 1);
            }
        }

        // 3.5 Выходные
        let weekendCost = 0;
        if (tripRecord.actualDepartureAt && isWeekend(tripRecord.actualDepartureAt)) {
            const weekendRate = tariff.weekendMultiplier ?? 1.2;
            weekendCost = baseCost * (weekendRate - 1);
        }

        // 3.6 Возврат (placeholder — зависит от флага в заявке)
        let returnCost = 0;
        if (tripRecord.order?.returnRequired) {
            returnCost = baseCost * 0.5; // 50% от базовой стоимости
        }

        // 3.7 Отмена (если рейс отменён после назначения ТС)
        let cancellationCost = 0;
        if (tripRecord.status === 'cancelled' && tripRecord.vehicleId) {
            cancellationCost = (tariff.cancellationFee ?? 0) || baseCost * 0.3;
        }

        // Fetch vehicle fuel norm for cost calculation
        const [vehicleForFuel] = await db.select({ fuelNormPer100Km: vehicles.fuelNormPer100Km })
            .from(vehicles).where(eq(vehicles.id, tripRecord.vehicleId!)).limit(1);

        // ——— 4. Себестоимость ———
        const fuelPriceLiter = Number(process.env.FUEL_PRICE_PER_LITER) || 60;
        const fuelNormPer100 = vehicleForFuel?.fuelNormPer100Km || Number(process.env.FUEL_NORM_PER_100KM) || 30;
        const fuelCost = (distance / 100) * fuelNormPer100 * fuelPriceLiter;
        const driverSalaryRate = Number(process.env.DRIVER_SALARY_PER_HOUR) || 350;
        const driverSalary = totalHours * driverSalaryRate;
        const amortizationRate = Number(process.env.AMORTIZATION_PER_KM) || 3;
        const amortization = distance * amortizationRate;
        const tollsCost = 0; // placeholder — Платон

        // ——— 5. Итог + Округление + НДС ———
        let subtotal = baseCost + idleCost + extraPointsCost + nightCost + urgentCost + weekendCost + returnCost;

        // Если рейс отменён — считаем ТОЛЬКО cancellationCost
        if (tripRecord.status === 'cancelled') {
            subtotal = cancellationCost;
        }

        // Минимальная стоимость рейса
        if (subtotal < (tariff.minTripCost ?? 0)) {
            subtotal = tariff.minTripCost;
        }

        // Округление (настраиваемое)
        const roundingPrecision: RoundingPrecision = (tariff.roundingPrecision as RoundingPrecision) || 1;
        subtotal = roundAmount(subtotal, roundingPrecision);

        // НДС
        let vatAmount = 0;
        let total = subtotal;

        if (tariff.vatIncluded) {
            vatAmount = subtotal * (tariff.vatRate / (100 + tariff.vatRate));
            total = subtotal;
            subtotal = total - vatAmount;
        } else {
            vatAmount = subtotal * (tariff.vatRate / 100);
            total = subtotal + vatAmount;
        }

        // Маржа
        const totalCost = fuelCost + driverSalary + amortization + tollsCost;
        const margin = total - totalCost;
        const marginPercent = total > 0 ? (margin / total) * 100 : 0;

        return {
            baseCost,
            baseExplanation,
            modifiers: {
                idleCost,
                extraPointsCost,
                nightCost,
                urgentCost,
                weekendCost,
                returnCost,
                cancellationCost,
            },
            costComponents: {
                fuelCost,
                driverSalary,
                amortization,
                tollsCost,
            },
            subtotal,
            vatAmount,
            total,
            margin,
            marginPercent,
        };
    }
    /**
     * C-3: Batch calculation — eliminates N+1 by loading all data upfront.
     * Returns a map of tripId → TripCostBreakdown.
     */
    async calculateBatchTripCosts(tripIds: string[]): Promise<Map<string, TripCostBreakdown>> {
        if (tripIds.length === 0) return new Map();

        // Bulk load all trips with nested relations
        const allTrips = await db.query.trips.findMany({
            where: inArray(trips.id, tripIds),
            with: {
                order: {
                    with: {
                        contractor: true,
                        contract: {
                            with: { tariffs: true }
                        }
                    }
                }
            }
        }) as any[];

        // Bulk load all route points for all trips
        const allPoints = await db.query.routePoints.findMany({
            where: inArray(routePoints.tripId, tripIds),
            orderBy: routePoints.sequenceNumber,
        });

        // Group points by tripId
        const pointsByTrip = new Map<string, typeof allPoints>();
        for (const pt of allPoints) {
            const list = pointsByTrip.get(pt.tripId) || [];
            list.push(pt);
            pointsByTrip.set(pt.tripId, list);
        }

        // Calculate costs in-memory for each trip
        const results = new Map<string, TripCostBreakdown>();

        for (const tripRecord of allTrips) {
            try {
                if (!tripRecord.order?.contract?.tariffs?.[0]) {
                    // Skip trips without tariff — avoid error
                    continue;
                }

                const tariff = tripRecord.order.contract.tariffs[0];
                const points = pointsByTrip.get(tripRecord.id) || [];

                // Reuse in-memory calculation logic (same as calculateTripCost)
                const cost = await this.computeTripCost(tripRecord, tariff, points);
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
    private async computeTripCost(tripRecord: any, tariff: any, points: any[]): Promise<TripCostBreakdown> {
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
                baseCost = distance * (tariff.ratePerKm || 0);
                baseExplanation = `${distance} км × ${tariff.ratePerKm} ₽`;
                break;
            case 'per_ton':
                baseCost = weightTon * (tariff.ratePerTon || 0);
                baseExplanation = `${weightTon} т × ${tariff.ratePerTon} ₽`;
                break;
            case 'per_hour':
                baseCost = totalHours * (tariff.ratePerHour || 0);
                baseExplanation = `${totalHours.toFixed(1)} ч × ${tariff.ratePerHour} ₽`;
                break;
            case 'fixed_route':
                baseCost = tariff.fixedRate || 0;
                baseExplanation = `Фикс ставка: ${tariff.fixedRate} ₽`;
                break;
            case 'combined': {
                const kmThresh = tariff.combinedKmThreshold || 0;
                const fixed = tariff.combinedFixedRate || 0;
                const rateKm = tariff.combinedRatePerKm || 0;
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
        const idleCost = (totalIdleMinutes / 60) * (tariff.idleRatePerHour || 0);
        const extraPointsCost = points.length > 2 ? (points.length - 2) * (tariff.extraPointRate || 0) : 0;

        let nightCost = 0;
        if (tripRecord.actualDepartureAt && tripRecord.actualCompletionAt) {
            const nightFraction = calculateNightFraction(tripRecord.actualDepartureAt, tripRecord.actualCompletionAt);
            if (nightFraction > 0) {
                nightCost = baseCost * nightFraction * ((tariff.nightMultiplier ?? 1.5) - 1);
            }
        }

        let urgentCost = 0;
        const orderCreatedAt = tripRecord.order?.createdAt;
        const plannedDelivery = tripRecord.plannedCompletionAt;
        if (orderCreatedAt && plannedDelivery) {
            const leadTimeHours = (plannedDelivery.getTime() - orderCreatedAt.getTime()) / (1000 * 60 * 60);
            if (leadTimeHours < 4) {
                urgentCost = baseCost * ((tariff.urgentMultiplier ?? 1.3) - 1);
            }
        }

        let weekendCost = 0;
        if (tripRecord.actualDepartureAt && isWeekend(tripRecord.actualDepartureAt)) {
            weekendCost = baseCost * ((tariff.weekendMultiplier ?? 1.2) - 1);
        }

        const returnCost = tripRecord.order?.returnRequired ? baseCost * 0.5 : 0;
        const cancellationCost = (tripRecord.status === 'cancelled' && tripRecord.vehicleId)
            ? ((tariff.cancellationFee ?? 0) || baseCost * 0.3) : 0;

        // Cost components — fetch vehicle fuelNorm from DB
        const fuelPriceLiter = Number(process.env.FUEL_PRICE_PER_LITER) || 60;
        let vehicleFuelNorm = Number(process.env.FUEL_NORM_PER_100KM) || 30;
        if (tripRecord.vehicleId) {
            const [veh] = await db.select({ fuelNormPer100Km: vehicles.fuelNormPer100Km })
                .from(vehicles).where(eq(vehicles.id, tripRecord.vehicleId)).limit(1);
            if (veh?.fuelNormPer100Km) vehicleFuelNorm = veh.fuelNormPer100Km;
        }
        const fuelCost = (distance / 100) * vehicleFuelNorm * fuelPriceLiter;
        const driverSalaryRate = Number(process.env.DRIVER_SALARY_PER_HOUR) || 350;
        const driverSalary = totalHours * driverSalaryRate;
        const amortizationRate = Number(process.env.AMORTIZATION_PER_KM) || 3;
        const amortization = distance * amortizationRate;
        const tollsCost = 0;

        // Subtotal
        let subtotal = baseCost + idleCost + extraPointsCost + nightCost + urgentCost + weekendCost + returnCost;
        if (tripRecord.status === 'cancelled') subtotal = cancellationCost;
        if (subtotal < (tariff.minTripCost ?? 0)) subtotal = tariff.minTripCost;

        const roundingPrecision: RoundingPrecision = (tariff.roundingPrecision as RoundingPrecision) || 1;
        subtotal = roundAmount(subtotal, roundingPrecision);

        let vatAmount = 0;
        let total = subtotal;
        if (tariff.vatIncluded) {
            vatAmount = subtotal * (tariff.vatRate / (100 + tariff.vatRate));
            total = subtotal;
            subtotal = total - vatAmount;
        } else {
            vatAmount = subtotal * (tariff.vatRate / 100);
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
