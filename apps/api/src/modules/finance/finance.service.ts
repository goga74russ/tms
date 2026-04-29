import { db } from '../../db/connection.js';
import { trips, invoices, invoiceTrips, invoiceAdjustments, vehicles, fines, repairRequests, tachographRecords, orders, users, drivers, tripOrders, contractors, events } from '../../db/schema.js';
import { eq, and, gt, gte, lte, inArray, sql, desc } from 'drizzle-orm';
import { tarificationService } from './tarification.service.js';
import { InvoiceCreate } from './schemas.js';
import { recordEvent } from '../../events/journal.js';
import { buildCommerceMLXml, type InvoiceExportRow } from './xml-export.service.js';
import { toFiniteNumber } from '../../utils/number.js';

type FleetVehicleSnapshot = {
    status: string;
    currentOdometerKm: number | null;
    maintenanceNextKm: number | null;
    techInspectionExpiry: Date | string | null;
    osagoExpiry: Date | string | null;
    maintenanceNextDate: Date | string | null;
    tachographCalibrationExpiry: Date | string | null;
};

type FleetKtgMetrics = {
    fleetActive: number;
    fleetReady: number;
    fleetUnavailable: number;
    ktgPercent: number;
    ktgLight: 'green' | 'yellow' | 'red';
};

// ================================================================
// Fuel correction coefficients
// ================================================================
const FUEL_COEFFICIENTS = {
    winter: 1.10,   // +10% зимой
    city: 1.15,     // +15% город
    load: 1.05,     // +5% с грузом
} as const;

function num(value: unknown): number {
    return toFiniteNumber(value);
}

function getCurrentSeason(): 'winter' | 'summer' {
    const month = new Date().getMonth(); // 0-11
    return (month >= 10 || month <= 2) ? 'winter' : 'summer';
}

function getDeadlineState(value: Date | string | null | undefined, now: Date) {
    if (!value) return 'green' as const;
    const expiry = new Date(value);
    if (Number.isNaN(expiry.getTime())) return 'green' as const;
    if (expiry.getTime() < now.getTime()) return 'red' as const;
    const daysLeft = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    if (daysLeft <= 30) return 'yellow' as const;
    return 'green' as const;
}

export function calculateFleetKtgMetrics(fleet: FleetVehicleSnapshot[]): FleetKtgMetrics {
    const now = new Date();
    const activeFleet = fleet;
    const readyFleet = activeFleet.filter((vehicle) => {
        if (vehicle.status === 'blocked' || vehicle.status === 'broken' || vehicle.status === 'maintenance') {
            return false;
        }

        const maintenanceDueByDate = getDeadlineState(vehicle.maintenanceNextDate, now) === 'red';
        const documentsBlocked = [
            getDeadlineState(vehicle.techInspectionExpiry, now),
            getDeadlineState(vehicle.osagoExpiry, now),
            getDeadlineState(vehicle.tachographCalibrationExpiry, now),
        ].some((state) => state === 'red');

        const maintenanceDueByKm = typeof vehicle.maintenanceNextKm === 'number'
            && typeof vehicle.currentOdometerKm === 'number'
            && vehicle.maintenanceNextKm <= vehicle.currentOdometerKm;

        return !documentsBlocked && !maintenanceDueByDate && !maintenanceDueByKm;
    });

    const fleetActive = activeFleet.length;
    const fleetReady = readyFleet.length;
    const ktgPercent = fleetActive > 0 ? (fleetReady / fleetActive) * 100 : 0;

    return {
        fleetActive,
        fleetReady,
        fleetUnavailable: Math.max(0, fleetActive - fleetReady),
        ktgPercent: Math.round(ktgPercent * 10) / 10,
        ktgLight: ktgPercent >= 90 ? 'green' : ktgPercent >= 75 ? 'yellow' : 'red',
    };
}

// ================================================================
// Service
// ================================================================

export class FinanceService {

    // === SEQUENTIAL NUMBER GENERATION (must be called inside tx) ===
    private async getNextInvoiceNumber(type: string, tx?: any): Promise<string> {
        const queryDb = tx || db;
        const prefix = type === 'act' ? 'ACT' : type === 'upd' ? 'UPD' : 'INV';
        const year = new Date().getFullYear();
        const pattern = `${prefix}-${year}-%`;

        // H-NEW-1 FIX: FOR UPDATE prevents race condition on concurrent invoice creation
        const lastInvoice = await queryDb.select({ number: invoices.number })
            .from(invoices)
            .where(sql`${invoices.number} LIKE ${pattern}`)
            .orderBy(desc(invoices.number))
            .limit(1)
            .for('update');

        let seq = 1;
        if (lastInvoice.length > 0) {
            const parts = lastInvoice[0].number.split('-');
            seq = parseInt(parts[2], 10) + 1;
        }
        return `${prefix}-${year}-${String(seq).padStart(5, '0')}`;
    }

    // === INVOICES ===
    async generateInvoices(params: InvoiceCreate, authorId: string, authorRole: string, organizationId?: string | null) {
        // H-NEW-1 FIX: Number generation INSIDE transaction with FOR UPDATE
        // FIX: Move unbilled trips query inside tx to prevent race condition
        const newInvoice = await db.transaction(async (tx: any) => {
            // FIX: Use DISTINCT to avoid duplicating trips when trip has multiple orders
            // H-1 FIX: Add organizationId filter to prevent cross-org invoice generation
            const unbilledConditions = [
                eq(trips.status, 'completed'),
                eq(trips.originalDocumentsReceived, true),
                eq(orders.contractorId, params.contractorId),
                gte(trips.actualCompletionAt, new Date(params.periodStart)),
                lte(trips.actualCompletionAt, new Date(params.periodEnd)),
            ];
            if (organizationId) {
                unbilledConditions.push(
                    inArray(trips.vehicleId, db.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.organizationId, organizationId)))
                );
            }

            const unbilledTripsQuery = await tx.selectDistinct({ id: trips.id }).from(trips)
                .innerJoin(tripOrders, eq(trips.id, tripOrders.tripId))
                .innerJoin(orders, eq(tripOrders.orderId, orders.id))
            .where(and(...unbilledConditions));

            const unbilledTripIds = unbilledTripsQuery.map((t: any) => t.id);

            if (unbilledTripIds.length === 0) {
                return { message: 'No unbilled completed trips found for this period and contractor.' };
            }

            // C-3: Batch calculate all trip costs (eliminates N+1)
            const costMap = await tarificationService.calculateBatchTripCosts(unbilledTripIds);

            let totalSubtotal = 0;
            let totalVat = 0;
            let finalTotal = 0;
            const tripIdsToBill: string[] = [];

            for (const tripId of unbilledTripIds) {
                const cost = costMap.get(tripId);
                if (!cost) continue;
                totalSubtotal += cost.subtotal;
                totalVat += cost.vatAmount;
                finalTotal += cost.total;
                tripIdsToBill.push(tripId);
            }

            const invoiceNumber = await this.getNextInvoiceNumber(params.type, tx);

            const [invoice] = await tx.insert(invoices).values({
                number: invoiceNumber,
                contractorId: params.contractorId,
                type: params.type,
                status: 'draft',
                subtotal: totalSubtotal,
                vatAmount: totalVat,
                total: finalTotal,
                periodStart: new Date(params.periodStart),
                periodEnd: new Date(params.periodEnd),
            }).returning();

            // Sprint 11: dual-write junction table inside same TX
            if (tripIdsToBill.length > 0) {
                await tx.insert(invoiceTrips).values(
                    tripIdsToBill.map((tid: string) => ({ invoiceId: invoice.id, tripId: tid }))
                );
            }

            // Update trips to billed
            await tx.update(trips)
                .set({ status: 'billed' })
                .where(inArray(trips.id, tripIdsToBill));

            await recordEvent({
                authorId,
                authorRole,
                eventType: 'invoice.created',
                entityType: 'invoice',
                entityId: invoice.id,
                data: { number: invoice.number, total: invoice.total }
            }, tx);

            return invoice;
        });

        return newInvoice;
    }

    // === INVOICE STATUS ===
    async updateInvoiceStatus(invoiceId: string, newStatus: string, authorId: string, authorRole: string) {
        const [updated] = await db.update(invoices)
            .set({ status: newStatus as any })
            .where(eq(invoices.id, invoiceId))
            .returning();

        if (!updated) throw new Error('Invoice not found');

        const eventType = newStatus === 'paid' ? 'invoice.paid' : 'invoice.updated';
        await recordEvent({
            authorId,
            authorRole,
            eventType,
            entityType: 'invoice',
            entityId: updated.id,
            data: { status: newStatus }
        });

        return updated;
    }

    // === FUEL ANALYSIS (with coefficients) ===
    async analyzeFuel(startDate?: Date, endDate?: Date, vehicleId?: string, organizationId?: string | null) {
        const conditions = [eq(trips.status, 'completed')];
        if (startDate) conditions.push(gte(trips.actualCompletionAt, startDate));
        if (endDate) conditions.push(lte(trips.actualCompletionAt, endDate));
        if (vehicleId) conditions.push(eq(trips.vehicleId, vehicleId));
        if (organizationId) {
            conditions.push(eq(vehicles.organizationId, organizationId));
        }

        const query = db.select({
            vehicleId: trips.vehicleId,
            make: vehicles.make,
            model: vehicles.model,
            plateNumber: vehicles.plateNumber,
            totalDistance: sql<number>`sum(${trips.actualDistanceKm})`,
            fuelUsed: sql<number>`sum(${trips.fuelStart} - ${trips.fuelEnd})`,
            fuelNorm: vehicles.fuelNormPer100Km,
        })
            .from(trips)
            .innerJoin(vehicles, eq(trips.vehicleId, vehicles.id))
            .where(and(...conditions))
            .groupBy(trips.vehicleId, vehicles.make, vehicles.model, vehicles.plateNumber, vehicles.fuelNormPer100Km);

        const results = await query;
        const season = getCurrentSeason();

        return results.map((row: any) => {
            const totalDistance = num(row.totalDistance);
            const fuelUsed = num(row.fuelUsed);
            let normPer100 = num(row.fuelNorm);

            // Применяем коэффициенты
            if (season === 'winter') normPer100 *= FUEL_COEFFICIENTS.winter;
            // Город и загрузка — для точности нужны данные с маршрута, пока placeholder
            // normPer100 *= FUEL_COEFFICIENTS.city;

            const expectedFuel = (totalDistance / 100) * normPer100;
            const difference = fuelUsed - expectedFuel;
            const variancePercent = expectedFuel > 0 ? (difference / expectedFuel) * 100 : 0;

            return {
                vehicleId: row.vehicleId,
                vehicle: `${row.make} ${row.model} (${row.plateNumber})`,
                totalDistanceKm: totalDistance,
                fuelUsedLiters: fuelUsed,
                expectedFuelLiters: Math.round(expectedFuel * 100) / 100,
                differenceLiters: Math.round(difference * 100) / 100,
                variancePercent: Math.round(variancePercent * 10) / 10,
                status: variancePercent > 15 ? 'overconsumption' : variancePercent < -10 ? 'underconsumption' : 'normal',
                coefficients: { season, winterApplied: season === 'winter' },
            };
        });
    }

    // === KPI DATA ===
    async getKpiMetrics(startDate: Date, endDate: Date, organizationId?: string | null) {
        const fleetVehicles = await db.select({
            status: vehicles.status,
            currentOdometerKm: vehicles.currentOdometerKm,
            maintenanceNextKm: vehicles.maintenanceNextKm,
            techInspectionExpiry: vehicles.techInspectionExpiry,
            osagoExpiry: vehicles.osagoExpiry,
            maintenanceNextDate: vehicles.maintenanceNextDate,
            tachographCalibrationExpiry: vehicles.tachographCalibrationExpiry,
        })
            .from(vehicles)
            .where(and(
                eq(vehicles.isArchived, false),
                organizationId ? eq(vehicles.organizationId, organizationId) : undefined,
            ));

        const ktg = calculateFleetKtgMetrics(fleetVehicles);

        const totalInvoiced = await db.select({ total: sql<number>`coalesce(sum(${invoices.total}), 0)` })
            .from(invoices)
            .innerJoin(contractors, eq(invoices.contractorId, contractors.id))
            .where(and(
                gte(invoices.createdAt, startDate),
                lte(invoices.createdAt, endDate),
                organizationId ? eq(contractors.organizationId, organizationId) : undefined,
            ));

        const totalFines = await db.select({ total: sql<number>`coalesce(sum(${fines.amount}), 0)` })
            .from(fines)
            .innerJoin(vehicles, eq(fines.vehicleId, vehicles.id))
            .where(and(
                gte(fines.createdAt, startDate),
                lte(fines.createdAt, endDate),
                organizationId ? eq(vehicles.organizationId, organizationId) : undefined,
            ));

        const totalRepairs = await db.select({ total: sql<number>`coalesce(sum(${repairRequests.totalCost}), 0)` })
            .from(repairRequests)
            .innerJoin(vehicles, eq(repairRequests.vehicleId, vehicles.id))
            .where(and(
                gte(repairRequests.completedAt, startDate),
                lte(repairRequests.completedAt, endDate),
                organizationId ? eq(vehicles.organizationId, organizationId) : undefined,
            ));

        const tripCount = await db.select({ count: sql<number>`count(*)` })
            .from(trips).where(and(
                eq(trips.status, 'completed'),
                gte(trips.actualCompletionAt, startDate),
                lte(trips.actualCompletionAt, endDate),
                organizationId
                    ? inArray(trips.vehicleId, db.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.organizationId, organizationId)))
                    : undefined,
            ));

        const overdueInvoices = await db.select({ total: sql<number>`coalesce(sum(${invoices.total}), 0)` })
            .from(invoices)
            .innerJoin(contractors, eq(invoices.contractorId, contractors.id))
            .where(and(
                eq(invoices.status, 'overdue'),
                organizationId ? eq(contractors.organizationId, organizationId) : undefined,
            ));

        const revenue = Number(totalInvoiced[0]?.total ?? 0);
        const repairsAmount = Number(totalRepairs[0]?.total ?? 0);
        const finesAmount = Number(totalFines[0]?.total ?? 0);
        const tripsCompleted = Number(tripCount[0]?.count ?? 0);
        const overdueDebt = Number(overdueInvoices[0]?.total ?? 0);
        // H-NEW-2 FIX: Base operational cost from env (was hardcoded 100000)
        const baseOperationalCost = Number(process.env.BASE_OPERATIONAL_COST) || 100000;
        const cost = repairsAmount + finesAmount + baseOperationalCost;

        // H-13 FIX: Top drivers ranking
        const driverStats = await db.select({
            id: drivers.id,
            name: users.fullName,
            trips: sql<number>`count(${trips.id})`,
        })
            .from(trips)
            .innerJoin(drivers, eq(trips.driverId, drivers.id))
            .innerJoin(users, eq(drivers.userId, users.id))
            .where(and(
                eq(trips.status, 'completed'),
                gte(trips.actualCompletionAt, startDate),
                lte(trips.actualCompletionAt, endDate)
            ))
            .groupBy(drivers.id, users.fullName)
            .orderBy(desc(sql`count(${trips.id})`))
            .limit(5);

        const topDrivers = driverStats.map((ds: any) => ({
            name: ds.name,
            trips: Number(ds.trips ?? 0),
            eco: '95%', // Placeholder for now, could be calculated from telemetry if available
            score: (4.5 + (Number(ds.trips ?? 0) % 5) * 0.1).toFixed(1) // Stable placeholder rating based on trips count
        }));

        return {
            revenue,
            cost,
            margin: revenue - cost,
            marginPercent: revenue > 0 ? ((revenue - cost) / revenue) * 100 : 0,
            finesAmount,
            repairsAmount,
            tripsCompleted,
            overdueDebt,
            topDrivers,
            ktgPercent: ktg.ktgPercent,
            fleetActive: ktg.fleetActive,
            fleetReady: ktg.fleetReady,
            fleetUnavailable: ktg.fleetUnavailable,
            ktgLight: ktg.ktgLight,
            // Traffic lights
            debtorLight: overdueDebt > 500000 ? 'red' : (overdueDebt > 100000 ? 'yellow' : 'green'),
            finesLight: finesAmount > 50000 ? 'red' : (finesAmount > 10000 ? 'yellow' : 'green'),
        };
    }

    // === 1C EXPORT (JSON — legacy) ===
    async get1CExportData(startDate: Date, endDate: Date, organizationId?: string | null) {
        const recentInvoices = await db.query.invoices.findMany({
            where: and(
                gte(invoices.createdAt, startDate),
                lte(invoices.createdAt, endDate),
                organizationId
                    ? inArray(invoices.contractorId, db.select({ id: contractors.id }).from(contractors).where(eq(contractors.organizationId, organizationId)))
                    : undefined,
            ),
            with: {
                contractor: true
            }
        });

        const documents = recentInvoices.map((inv: any) => ({
            Type: 'РеализацияУслуг',
            Number: inv.number,
            Date: inv.createdAt.toISOString(),
            ContractorINN: inv.contractor?.inn,
            ContractorName: inv.contractor?.name,
            Total: num(inv.total),
            VAT: num(inv.vatAmount),
            Subtotal: num(inv.subtotal),
        }));

        return {
            format: 'EnterpriseData',
            version: '2.0',
            company: process.env.COMPANY_NAME || 'ООО «ТМС Логистик»',
            period: { start: startDate.toISOString(), end: endDate.toISOString() },
            documentCount: documents.length,
            documents,
        };
    }

    // === INVOICE ADJUSTMENTS ===

    async createAdjustment(
        invoiceId: string,
        reason: string,
        description: string,
        amount: number,
        createdBy: string,
    ) {
        return await db.transaction(async (tx: any) => {
            // Insert adjustment
            const [adjustment] = await tx.insert(invoiceAdjustments).values({
                invoiceId,
                reason: reason as any,
                description,
                amount,
                createdBy,
            }).returning();

            // Recalculate invoice total
            const [invoice] = await tx.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
            if (!invoice) throw new Error('Invoice not found');

            const allAdjustments = await tx.select({ amount: invoiceAdjustments.amount })
                .from(invoiceAdjustments)
                .where(eq(invoiceAdjustments.invoiceId, invoiceId));

            const adjustmentsSum = allAdjustments.reduce((sum: number, a: any) => sum + num(a.amount), 0);
            const newTotal = num(invoice.subtotal) + num(invoice.vatAmount) + adjustmentsSum;

            await tx.update(invoices)
                .set({ total: newTotal })
                .where(eq(invoices.id, invoiceId));

            return { ...adjustment, amount: num(adjustment.amount) };
        });
    }

    async listAdjustments(invoiceId: string) {
        const rows = await db.select().from(invoiceAdjustments)
            .where(eq(invoiceAdjustments.invoiceId, invoiceId))
            .orderBy(desc(invoiceAdjustments.createdAt));
        return rows.map((r: any) => ({ ...r, amount: num(r.amount) }));
    }

    async deleteAdjustment(adjustmentId: string, userId: string) {
        return await db.transaction(async (tx: any) => {
            const [adjustment] = await tx.select().from(invoiceAdjustments)
                .where(eq(invoiceAdjustments.id, adjustmentId)).limit(1);
            if (!adjustment) throw new Error('Adjustment not found');

            const invoiceId = adjustment.invoiceId;

            await tx.delete(invoiceAdjustments).where(eq(invoiceAdjustments.id, adjustmentId));

            // Recalculate invoice total without the deleted adjustment
            const [invoice] = await tx.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
            if (!invoice) throw new Error('Invoice not found');

            const remaining = await tx.select({ amount: invoiceAdjustments.amount })
                .from(invoiceAdjustments)
                .where(eq(invoiceAdjustments.invoiceId, invoiceId));

            const adjustmentsSum = remaining.reduce((sum: number, a: any) => sum + num(a.amount), 0);
            const newTotal = num(invoice.subtotal) + num(invoice.vatAmount) + adjustmentsSum;

            await tx.update(invoices)
                .set({ total: newTotal })
                .where(eq(invoices.id, invoiceId));

            return { deleted: true, adjustmentId, invoiceId, newTotal };
        });
    }

    // === 1C EXPORT (XML — CommerceML 2.x) ===
    async recordPartialPayment(
        invoiceId: string,
        params: {
            amount: number;
            paidAt?: string | null;
            paymentRef?: string | null;
            payerName?: string | null;
            notes?: string | null;
        },
        authorId: string,
        authorRole: string,
    ) {
        const [invoice] = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
        if (!invoice) throw new Error('Invoice not found');
        if (params.amount <= 0) throw new Error('Payment amount must be positive');

        await recordEvent({
            authorId,
            authorRole,
            eventType: 'invoice.partial_payment.recorded',
            entityType: 'invoice',
            entityId: invoiceId,
            data: {
                amount: params.amount,
                paidAt: params.paidAt ?? new Date().toISOString(),
                paymentRef: params.paymentRef ?? null,
                payerName: params.payerName ?? null,
                notes: params.notes ?? null,
            },
        });

        const paymentRows = await db.select({ data: events.data })
            .from(events)
            .where(and(
                eq(events.entityType, 'invoice'),
                eq(events.entityId, invoiceId),
                eq(events.eventType, 'invoice.partial_payment.recorded'),
            ));
        const paidAmount = paymentRows.reduce((sum, row) => sum + num((row.data as Record<string, unknown>)?.amount), 0);
        const remainingAmount = Math.max(num(invoice.total) - paidAmount, 0);

        if (remainingAmount === 0 && invoice.status !== 'paid') {
            await db.update(invoices).set({ status: 'paid' }).where(eq(invoices.id, invoiceId));
        }

        return {
            invoiceId,
            invoiceNumber: invoice.number,
            invoiceTotal: num(invoice.total),
            paidAmount,
            remainingAmount,
            status: remainingAmount === 0 ? 'paid' : invoice.status,
        };
    }

    async addAdditionalService(
        invoiceId: string,
        params: {
            serviceType: string;
            description: string;
            amount: number;
            tripId?: string | null;
            vatRate?: number | null;
            notes?: string | null;
        },
        authorId: string,
        authorRole: string,
    ) {
        const adjustment = await this.createAdjustment(
            invoiceId,
            'other',
            `${params.serviceType}: ${params.description}`,
            params.amount,
            authorId,
        );
        await recordEvent({
            authorId,
            authorRole,
            eventType: 'invoice.additional_service.added',
            entityType: 'invoice',
            entityId: invoiceId,
            data: {
                adjustmentId: adjustment.id,
                serviceType: params.serviceType,
                description: params.description,
                amount: params.amount,
                tripId: params.tripId ?? null,
                vatRate: params.vatRate ?? null,
                notes: params.notes ?? null,
            },
        });
        const [invoice] = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
        return {
            adjustment,
            invoice: invoice ? { ...invoice, subtotal: num(invoice.subtotal), vatAmount: num(invoice.vatAmount), total: num(invoice.total) } : null,
        };
    }

    async reconcileWith1C(
        invoiceId: string,
        params: {
            externalDocumentId: string;
            externalStatus?: string | null;
            externalTotal?: number | null;
            externalVatAmount?: number | null;
            exportedAt?: string | null;
            notes?: string | null;
        },
        authorId: string,
        authorRole: string,
    ) {
        const [invoice] = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
        if (!invoice) throw new Error('Invoice not found');

        const discrepancies = [];
        if (params.externalTotal !== undefined && params.externalTotal !== null && Math.abs(params.externalTotal - num(invoice.total)) > 0.01) {
            discrepancies.push({ code: 'total_mismatch', local: num(invoice.total), external: params.externalTotal });
        }
        if (params.externalVatAmount !== undefined && params.externalVatAmount !== null && Math.abs(params.externalVatAmount - num(invoice.vatAmount)) > 0.01) {
            discrepancies.push({ code: 'vat_mismatch', local: num(invoice.vatAmount), external: params.externalVatAmount });
        }

        const reconciliationStatus = discrepancies.length > 0 ? 'mismatch' : 'matched';
        await recordEvent({
            authorId,
            authorRole,
            eventType: 'invoice.1c.reconciled',
            entityType: 'invoice',
            entityId: invoiceId,
            data: {
                externalDocumentId: params.externalDocumentId,
                externalStatus: params.externalStatus ?? null,
                externalTotal: params.externalTotal ?? null,
                externalVatAmount: params.externalVatAmount ?? null,
                exportedAt: params.exportedAt ?? new Date().toISOString(),
                reconciliationStatus,
                discrepancies,
                notes: params.notes ?? null,
            },
        });

        return {
            invoiceId,
            invoiceNumber: invoice.number,
            reconciliationStatus,
            discrepancies,
        };
    }

    async export1CXml(startDate: Date, endDate: Date, organizationId?: string | null): Promise<string> {
        const recentInvoices = await db.query.invoices.findMany({
            where: and(
                gte(invoices.createdAt, startDate),
                lte(invoices.createdAt, endDate),
                organizationId
                    ? inArray(invoices.contractorId, db.select({ id: contractors.id }).from(contractors).where(eq(contractors.organizationId, organizationId)))
                    : undefined,
            ),
            with: {
                contractor: true
            }
        });

        // C-2 FIX: Batch query all invoice-trip links instead of N+1 loop
        const invoiceIds = (recentInvoices as any[]).map((inv: any) => inv.id);
        const allLinkedTrips = invoiceIds.length > 0
            ? await db.select({ invoiceId: invoiceTrips.invoiceId, tripId: invoiceTrips.tripId })
                .from(invoiceTrips)
                .where(inArray(invoiceTrips.invoiceId, invoiceIds))
            : [];

        const tripsByInvoice = new Map<string, string[]>();
        for (const link of allLinkedTrips) {
            if (!tripsByInvoice.has(link.invoiceId)) tripsByInvoice.set(link.invoiceId, []);
            tripsByInvoice.get(link.invoiceId)!.push(link.tripId);
        }

        const rows: InvoiceExportRow[] = [];
        for (const inv of recentInvoices as any[]) {
            rows.push({
                id: inv.id,
                number: inv.number,
                type: inv.type,
                status: inv.status,
                subtotal: num(inv.subtotal),
                vatAmount: num(inv.vatAmount),
                total: num(inv.total),
                periodStart: inv.periodStart,
                periodEnd: inv.periodEnd,
                createdAt: inv.createdAt,
                contractor: inv.contractor ? {
                    name: inv.contractor.name,
                    inn: inv.contractor.inn,
                    kpp: inv.contractor.kpp ?? null,
                    legalAddress: inv.contractor.legalAddress ?? '',
                } : null,
                tripIds: tripsByInvoice.get(inv.id) ?? [],
            });
        }

        return buildCommerceMLXml(rows);
    }
}

export const financeService = new FinanceService();
