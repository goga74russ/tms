import type { FastifyInstance } from 'fastify';
import { db } from '../../db/connection.js';
import { vehicles, repairRequests, trips } from '../../db/schema.js';
import { eq, desc, and, gte, sql } from 'drizzle-orm';

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
    }, async (request) => {
        const user = (request as any).user;
        const allowedRoles = ['admin', 'manager', 'mechanic', 'dispatcher'];
        if (!user.roles.some((r: string) => allowedRoles.includes(r))) {
            return { success: false, error: 'Доступ запрещён' };
        }

        // All non-archived vehicles
        const allVehicles = await db.select().from(vehicles)
            .where(eq(vehicles.isArchived, false));

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
            if (v.maintenanceNextKm && v.currentOdometerKm) {
                const kmLeft = v.maintenanceNextKm - v.currentOdometerKm;
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
    // ⚠️ MOK: базовая версия — нужны реальные данные себестоимости
    // ================================================================
    app.get('/analytics/profitability', {
        schema: { tags: ['Аналитика'], summary: 'Маржинальность рейсов', description: 'Анализ выручки vs себестоимости по завершённым рейсам. % маржи, суммарные показатели.' },
        preHandler: [app.authenticate],
    }, async (request) => {
        const user = (request as any).user;
        const allowedRoles = ['admin', 'manager', 'accountant'];
        if (!user.roles.some((r: string) => allowedRoles.includes(r))) {
            return { success: false, error: 'Доступ запрещён' };
        }

        // Get completed trips with cost data
        const completedTrips = await db.query.trips.findMany({
            where: eq(trips.status, 'completed'),
            with: { order: true },
            orderBy: [desc(trips.updatedAt)],
            limit: 100,
        });

        const profitability = completedTrips.map((trip: any) => {
            const revenue = trip.totalCost || 0;
            const distance = trip.actualDistanceKm || trip.plannedDistanceKm || 0;
            // ⚠️ Упрощённая себестоимость — в реальности из tarification.service
            const fuelCost = (distance / 100) * 30 * 60; // fuelNorm * fuelPrice
            const driverCost = ((trip.actualDurationHours || 8) * 350);
            const amortization = distance * 3;
            const cost = fuelCost + driverCost + amortization;
            const margin = revenue - cost;
            const marginPercent = revenue > 0 ? (margin / revenue) * 100 : 0;

            return {
                tripId: trip.id,
                tripNumber: trip.number,
                contractor: trip.order?.contractorId || null,
                revenue,
                cost: Math.round(cost),
                margin: Math.round(margin),
                marginPercent: Math.round(marginPercent * 10) / 10,
                distance,
                isProfitable: margin > 0,
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
}
