import type { FastifyInstance } from 'fastify';
import { db } from '../../db/connection.js';
import { vehicles, repairRequests, trips, maintenanceSchedule } from '../../db/schema.js';
import { eq, desc, and, gte, sql, inArray } from 'drizzle-orm';
import { calculateFleetKtgMetrics } from '../finance/finance.service.js';
import { getFuelConsumptionAnalytics, getFleetKtgAnalytics } from '../fleet/service.js';
import { buildFleetReadinessSnapshot } from './fleet-readiness.js';

/**
 * Analytics & Predictive Maintenance — Sprint 8
 * 
 * GET /api/analytics/maintenance-alerts  — предупреждения о предстоящем ТО
 * GET /api/analytics/profitability       — маржинальность по рейсам/клиентам
 */
export default async function analyticsRoutes(app: FastifyInstance) {

    // ================================================================
    // GET /analytics/maintenance-alerts — Предиктивное ТО
    // Логика: предупреждение если до ТО/ОСАГО/техосмотра < 30 дней 
    //         или пробег приближается к плановому км ТО
    // ================================================================
    app.get('/analytics/maintenance-alerts', {
        schema: { tags: ['Аналитика'], summary: 'ТО-алерты', description: 'Предиктивные алерты: ТО, ОСАГО, техосмотр, тахограф (<7д — critical, <30д — warning), пробег (<2000 км).' },
        preHandler: [app.authenticate],
    }, async (request, reply) => {
        const user = request.user as { userId: string; roles: string[]; organizationId?: string };
        const allowedRoles = ['admin', 'manager', 'mechanic', 'dispatcher'];
        if (!user.roles.some((r: string) => allowedRoles.includes(r))) {
            return reply.status(403).send({ success: false, error: 'Доступ запрещён' });
        }

        // All non-archived vehicles
        const vehicleConditions = [eq(vehicles.isArchived, false)];
        if (user.organizationId) {
            vehicleConditions.push(eq(vehicles.organizationId, user.organizationId));
        }
        const allVehicles = await db.select().from(vehicles)
            .where(and(...vehicleConditions));

        const maintenanceConditions = [eq(maintenanceSchedule.status, 'planned' as any)];
        if (user.organizationId) {
            maintenanceConditions.push(eq(maintenanceSchedule.organizationId, user.organizationId));
        }
        const plannedMaintenance = await db.select().from(maintenanceSchedule)
            .where(and(...maintenanceConditions))
            .orderBy(desc(maintenanceSchedule.createdAt));
        const maintenanceByVehicleId = new Map(plannedMaintenance.map((item) => [item.vehicleId, item]));

        const now = new Date();
        const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

        const alerts: Array<{
            vehicleId: string;
            plateNumber: string;
            make: string;
            model: string;
            type: 'maintenance' | 'osago' | 'tech_inspection' | 'tachograph' | 'odometer';
            severity: 'critical' | 'warning' | 'info';
            message: string;
            daysLeft?: number;
            kmLeft?: number;
        }> = [];

        for (const v of allVehicles) {
            // ---- Date-based alerts ----
            const dateChecks: { field: Date | null; type: any; label: string }[] = [
                { field: v.maintenanceNextDate, type: 'maintenance', label: 'ТО' },
                { field: v.osagoExpiry, type: 'osago', label: 'ОСАГО' },
                { field: v.techInspectionExpiry, type: 'tech_inspection', label: 'Техосмотр' },
                { field: v.tachographCalibrationExpiry, type: 'tachograph', label: 'Тахограф' },
            ];

            for (const check of dateChecks) {
                if (!check.field) continue;
                const expiry = new Date(check.field);
                const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

                if (daysLeft < 0) {
                    alerts.push({
                        vehicleId: v.id, plateNumber: v.plateNumber,
                        make: v.make, model: v.model,
                        type: check.type, severity: 'critical',
                        message: `${check.label} просрочен на ${Math.abs(daysLeft)} дн.`,
                        daysLeft,
                    });
                } else if (daysLeft <= 7) {
                    alerts.push({
                        vehicleId: v.id, plateNumber: v.plateNumber,
                        make: v.make, model: v.model,
                        type: check.type, severity: 'critical',
                        message: `${check.label} через ${daysLeft} дн.`,
                        daysLeft,
                    });
                } else if (daysLeft <= 30) {
                    alerts.push({
                        vehicleId: v.id, plateNumber: v.plateNumber,
                        make: v.make, model: v.model,
                        type: check.type, severity: 'warning',
                        message: `${check.label} через ${daysLeft} дн.`,
                        daysLeft,
                    });
                }
            }

            // ---- Odometer-based ТО prediction ----
            // If nextMaintenanceKm is set, check how close we are
            const nextMaintenancePlan = maintenanceByVehicleId.get(v.id);
            const currentOdometerKm = v.lastOdometerKm ?? v.currentOdometerKm;
            const plannedMaintenanceDate = nextMaintenancePlan?.plannedDate ?? v.maintenanceNextDate;
            const plannedMaintenanceKm = nextMaintenancePlan?.plannedOdometerKm ?? v.maintenanceNextKm;

            if (plannedMaintenanceDate) {
                const maintenanceDate = new Date(plannedMaintenanceDate);
                const daysLeft = Math.ceil((maintenanceDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                if (daysLeft <= 30) {
                    alerts.push({
                        vehicleId: v.id,
                        plateNumber: v.plateNumber,
                        make: v.make,
                        model: v.model,
                        type: 'maintenance',
                        severity: daysLeft <= 7 ? 'critical' : 'warning',
                        message: daysLeft < 0
                            ? `Плановое ТО просрочено на ${Math.abs(daysLeft)} дн.`
                            : `Плановое ТО через ${daysLeft} дн.`,
                        daysLeft,
                    });
                }
            }

            if (plannedMaintenanceKm && currentOdometerKm) {
                const kmLeft = plannedMaintenanceKm - currentOdometerKm;
                if (kmLeft <= 0) {
                    alerts.push({
                        vehicleId: v.id, plateNumber: v.plateNumber,
                        make: v.make, model: v.model,
                        type: 'odometer', severity: 'critical',
                        message: `Пробег ${v.currentOdometerKm.toLocaleString()} км — ТО превышен на ${Math.abs(kmLeft).toLocaleString()} км`,
                        kmLeft,
                    });
                } else if (kmLeft <= 2000) {
                    alerts.push({
                        vehicleId: v.id, plateNumber: v.plateNumber,
                        make: v.make, model: v.model,
                        type: 'odometer', severity: 'warning',
                        // @ts-ignore legacy fallback text still references nullable field
                        message: `До ТО ${kmLeft.toLocaleString()} км (${v.currentOdometerKm.toLocaleString()} / ${v.maintenanceNextKm.toLocaleString()})`,
                        kmLeft,
                    });
                }
            }
        }

        // Sort: critical first, then warning
        alerts.sort((a, b) => {
            const sev = { critical: 0, warning: 1, info: 2 };
            return sev[a.severity] - sev[b.severity];
        });

        return { success: true, data: alerts, total: alerts.length };
    });

    // ================================================================
    // GET /analytics/profitability — Маржинальность рейсов
    // Sprint 14: использует tarification.service для точной себестоимости
    // ================================================================
    app.get('/analytics/fleet-health', {
        schema: { tags: ['Аналитика'], summary: 'КТГ парка', description: 'Runtime-расчет коэффициента технической готовности: готовые к выпуску ТС / активный парк.' },
        preHandler: [app.authenticate],
    }, async (request, reply) => {
        const user = request.user as { userId: string; roles: string[]; organizationId?: string };
        const allowedRoles = ['admin', 'manager', 'dispatcher', 'mechanic', 'accountant'];
        if (!user.roles.some((r: string) => allowedRoles.includes(r))) {
            return reply.status(403).send({ success: false, error: 'Доступ запрещён' });
        }

        const vehicleConditions = [eq(vehicles.isArchived, false)];
        if (user.organizationId) {
            vehicleConditions.push(eq(vehicles.organizationId, user.organizationId));
        }

        const fleet = await db.select({
            id: vehicles.id,
            plateNumber: vehicles.plateNumber,
            status: vehicles.status,
            currentOdometerKm: vehicles.currentOdometerKm,
            lastOdometerKm: vehicles.lastOdometerKm,
            maintenanceNextKm: vehicles.maintenanceNextKm,
            techInspectionExpiry: vehicles.techInspectionExpiry,
            osagoExpiry: vehicles.osagoExpiry,
            maintenanceNextDate: vehicles.maintenanceNextDate,
            tachographCalibrationExpiry: vehicles.tachographCalibrationExpiry,
        })
            .from(vehicles)
            .where(and(...vehicleConditions));

        const ktg = calculateFleetKtgMetrics(fleet);
        const readiness = buildFleetReadinessSnapshot(fleet);
        const byStatus = fleet.reduce((acc, vehicle) => {
            acc[vehicle.status] = (acc[vehicle.status] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
        const q = request.query as { dateFrom?: string; dateTo?: string; vehicleId?: string };
        let historical: Awaited<ReturnType<typeof getFleetKtgAnalytics>> | undefined;
        let historicalSummary:
            | {
                avgKtg: number | null;
                avgKtgPercent: number | null;
                totalDowntimeHours: number;
                totalWorkingHours: number;
            }
            | undefined;

        if (q.dateFrom && q.dateTo) {
            historical = await getFleetKtgAnalytics({
                vehicleId: q.vehicleId,
                dateFrom: q.dateFrom,
                dateTo: q.dateTo,
                organizationId: user.organizationId,
            });
            const totalDowntimeHours = historical.reduce((sum, item) => sum + item.downtimeHours, 0);
            const totalWorkingHours = historical.reduce((sum, item) => sum + item.workingHours, 0);
            const avgKtg = historical.length
                ? historical.reduce((sum, item) => sum + (item.ktg ?? 0), 0) / historical.length
                : null;
            historicalSummary = {
                avgKtg,
                avgKtgPercent: avgKtg !== null ? Math.round(avgKtg * 1000) / 10 : null,
                totalDowntimeHours: Math.round(totalDowntimeHours * 10) / 10,
                totalWorkingHours: Math.round(totalWorkingHours * 10) / 10,
            };
        }

        return { success: true, data: { ...ktg, byStatus, readiness, historical, historicalSummary } };
    });

    app.get('/analytics/profitability', {
        schema: { tags: ['Аналитика'], summary: 'Маржинальность рейсов', description: 'Анализ выручки vs себестоимости по завершённым рейсам через TarificationService.' },
        preHandler: [app.authenticate],
    }, async (request, reply) => {
        const user = request.user as { userId: string; roles: string[]; organizationId?: string };
        const allowedRoles = ['admin', 'manager', 'accountant'];
        if (!user.roles.some((r: string) => allowedRoles.includes(r))) {
            return reply.status(403).send({ success: false, error: 'Доступ запрещён' });
        }

        // Get completed trips
        const tripConditions = [eq(trips.status, 'completed')];
        if (user.organizationId) {
            tripConditions.push(inArray(trips.vehicleId, db.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.organizationId, user.organizationId))));
        }
        const completedTrips = await db.select().from(trips)
            .where(and(...tripConditions))
            .orderBy(desc(trips.updatedAt))
            .limit(100);

        if (completedTrips.length === 0) {
            return {
                success: true,
                data: { trips: [], summary: { totalTrips: 0, totalRevenue: 0, totalCost: 0, totalMargin: 0, avgMarginPercent: 0, unprofitableCount: 0 } },
            };
        }

        // Use tarification service for accurate cost calculation
        const { tarificationService } = await import('../finance/tarification.service.js');
        const tripIds = completedTrips.map(t => t.id);
        let costMap: Map<string, any>;
        try {
            costMap = await tarificationService.calculateBatchTripCosts(tripIds);
        } catch {
            costMap = new Map();
        }

        const profitability = completedTrips.map((trip: any) => {
            const breakdown = costMap.get(trip.id);
            const distance = trip.actualDistanceKm || trip.plannedDistanceKm || 0;

            if (breakdown) {
                // Use real tarification data
                const revenue = breakdown.total;
                const cost = breakdown.costComponents.fuelCost
                    + breakdown.costComponents.driverSalary
                    + breakdown.costComponents.amortization
                    + breakdown.costComponents.tollsCost;
                const margin = revenue - cost;
                const marginPercent = revenue > 0 ? (margin / revenue) * 100 : 0;

                return {
                    tripId: trip.id,
                    tripNumber: trip.number,
                    contractor: null,
                    revenue: Math.round(revenue),
                    cost: Math.round(cost),
                    margin: Math.round(margin),
                    marginPercent: Math.round(marginPercent * 10) / 10,
                    distance,
                    isProfitable: margin > 0,
                    source: 'tarification' as const,
                };
            }

            // Fallback: simplified calculation for trips without contract/tariff
            const revenue = trip.totalCost || 0;
            const fuelPriceLiter = Number(process.env.FUEL_PRICE_PER_LITER) || 60;
            const fuelNorm = Number(process.env.FUEL_NORM_PER_100KM) || 30;
            const fuelCost = (distance / 100) * fuelNorm * fuelPriceLiter;
            const driverCost = ((trip.actualDurationHours || 8) * (Number(process.env.DRIVER_SALARY_PER_HOUR) || 350));
            const amortization = distance * (Number(process.env.AMORTIZATION_PER_KM) || 3);
            const cost = fuelCost + driverCost + amortization;
            const margin = revenue - cost;
            const marginPercent = revenue > 0 ? (margin / revenue) * 100 : 0;

            return {
                tripId: trip.id,
                tripNumber: trip.number,
                contractor: null,
                revenue,
                cost: Math.round(cost),
                margin: Math.round(margin),
                marginPercent: Math.round(marginPercent * 10) / 10,
                distance,
                isProfitable: margin > 0,
                source: 'simplified' as const,
            };
        });

        // Summary
        const totalRevenue = profitability.reduce((s, p) => s + p.revenue, 0);
        const totalCost = profitability.reduce((s, p) => s + p.cost, 0);
        const totalMargin = totalRevenue - totalCost;
        const avgMarginPercent = totalRevenue > 0 ? (totalMargin / totalRevenue) * 100 : 0;
        const unprofitableCount = profitability.filter(p => !p.isProfitable).length;

        return {
            success: true,
            data: {
                trips: profitability,
                summary: {
                    totalTrips: profitability.length,
                    totalRevenue: Math.round(totalRevenue),
                    totalCost: Math.round(totalCost),
                    totalMargin: Math.round(totalMargin),
                    avgMarginPercent: Math.round(avgMarginPercent * 10) / 10,
                    unprofitableCount,
                },
            },
        };
    });

    // ================================================================
    // GET /analytics/fuel-consumption — Расход топлива по ТС
    // ================================================================
    app.get('/analytics/fuel-consumption', {
        schema: { tags: ['Аналитика'], summary: 'Расход топлива', description: 'Анализ расхода топлива по ТС за период: литры, стоимость, норма vs факт.' },
        preHandler: [app.authenticate],
    }, async (request, reply) => {
        const user = request.user as { userId: string; roles: string[]; organizationId?: string };
        const allowedRoles = ['admin', 'manager', 'mechanic', 'dispatcher', 'accountant', 'logist'];
        if (!user.roles.some((r: string) => allowedRoles.includes(r))) {
            return reply.status(403).send({ success: false, error: 'Доступ запрещён' });
        }
        const q = request.query as any;
        if (!q.dateFrom || !q.dateTo) {
            return reply.status(400).send({ success: false, error: 'dateFrom и dateTo обязательны' });
        }
        const data = await getFuelConsumptionAnalytics({
            vehicleId: q.vehicleId,
            dateFrom: q.dateFrom,
            dateTo: q.dateTo,
            organizationId: user.organizationId,
        });
        return reply.send({ success: true, data });
    });

    // ================================================================
    // GET /analytics/fleet-ktg — КТГ парка (коэффициент технической готовности)
    // ================================================================
    app.get('/analytics/fleet-ktg', {
        schema: { tags: ['Аналитика'], summary: 'КТГ парка (детальный)', description: 'Коэффициент технической готовности по каждому ТС за период на основе записей простоев.' },
        preHandler: [app.authenticate],
    }, async (request, reply) => {
        const user = request.user as { userId: string; roles: string[]; organizationId?: string };
        const allowedRoles = ['admin', 'manager', 'mechanic', 'dispatcher', 'accountant'];
        if (!user.roles.some((r: string) => allowedRoles.includes(r))) {
            return reply.status(403).send({ success: false, error: 'Доступ запрещён' });
        }
        const q = request.query as any;
        if (!q.dateFrom || !q.dateTo) {
            return reply.status(400).send({ success: false, error: 'dateFrom и dateTo обязательны' });
        }
        const data = await getFleetKtgAnalytics({
            vehicleId: q.vehicleId,
            dateFrom: q.dateFrom,
            dateTo: q.dateTo,
            organizationId: user.organizationId,
        });
        return reply.send({ success: true, data });
    });
}


