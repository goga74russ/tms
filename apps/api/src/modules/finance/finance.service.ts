import { db } from '../../db/connection.js';
import { trips, invoices, vehicles, fines, repairRequests, tachographRecords, orders, users } from '../../db/schema.js';
import { eq, and, gt, gte, lte, inArray, sql, desc } from 'drizzle-orm';
import { tarificationService } from './tarification.service.js';
import { InvoiceCreate } from './schemas.js';
import { recordEvent } from '../../events/journal.js';
import { buildCommerceMLXml, type InvoiceExportRow } from './xml-export.service.js';

// ================================================================
// Fuel correction coefficients
// ================================================================
const FUEL_COEFFICIENTS = {
    winter: 1.10,   // +10% зимой
    city: 1.15,     // +15% город
    load: 1.05,     // +5% с грузом
} as const;

function getCurrentSeason(): 'winter' | 'summer' {
    const month = new Date().getMonth(); // 0-11
    return (month >= 10 || month <= 2) ? 'winter' : 'summer';
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
    async generateInvoices(params: InvoiceCreate, authorId: string, authorRole: string) {
        // H-NEW-1 FIX: Number generation INSIDE transaction with FOR UPDATE
        // FIX: Move unbilled trips query inside tx to prevent race condition
        const newInvoice = await db.transaction(async (tx: any) => {
            // FIX: Use DISTINCT to avoid duplicating trips when trip has multiple orders
            const unbilledTripsQuery = await tx.selectDistinct({ id: trips.id }).from(trips).innerJoin(
                orders,
                eq(trips.id, orders.tripId)
            ).where(
                and(
                    eq(trips.status, 'completed'),
                    eq(orders.contractorId, params.contractorId),
                    gte(trips.actualCompletionAt, new Date(params.periodStart)),
                    lte(trips.actualCompletionAt, new Date(params.periodEnd))
                )
            );

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
                tripIds: tripIdsToBill,
                subtotal: totalSubtotal,
                vatAmount: totalVat,
                total: finalTotal,
                periodStart: new Date(params.periodStart),
                periodEnd: new Date(params.periodEnd),
            }).returning();

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
    async analyzeFuel(startDate?: Date, endDate?: Date, vehicleId?: string) {
        const conditions = [eq(trips.status, 'completed')];
        if (startDate) conditions.push(gte(trips.actualCompletionAt, startDate));
        if (endDate) conditions.push(lte(trips.actualCompletionAt, endDate));
        if (vehicleId) conditions.push(eq(trips.vehicleId, vehicleId));

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
            let normPer100 = row.fuelNorm || 0;

            // Применяем коэффициенты
            if (season === 'winter') normPer100 *= FUEL_COEFFICIENTS.winter;
            // Город и загрузка — для точности нужны данные с маршрута, пока placeholder
            // normPer100 *= FUEL_COEFFICIENTS.city;

            const expectedFuel = (row.totalDistance / 100) * normPer100;
            const difference = row.fuelUsed - expectedFuel;
            const variancePercent = expectedFuel > 0 ? (difference / expectedFuel) * 100 : 0;

            return {
                vehicleId: row.vehicleId,
                vehicle: `${row.make} ${row.model} (${row.plateNumber})`,
                totalDistanceKm: row.totalDistance,
                fuelUsedLiters: row.fuelUsed,
                expectedFuelLiters: Math.round(expectedFuel * 100) / 100,
                differenceLiters: Math.round(difference * 100) / 100,
                variancePercent: Math.round(variancePercent * 10) / 10,
                status: variancePercent > 15 ? 'overconsumption' : variancePercent < -10 ? 'underconsumption' : 'normal',
                coefficients: { season, winterApplied: season === 'winter' },
            };
        });
    }

    // === KPI DATA ===
    async getKpiMetrics(startDate: Date, endDate: Date) {
        const totalInvoiced = await db.select({ total: sql<number>`coalesce(sum(${invoices.total}), 0)` })
            .from(invoices).where(and(gte(invoices.createdAt, startDate), lte(invoices.createdAt, endDate)));

        const totalFines = await db.select({ total: sql<number>`coalesce(sum(${fines.amount}), 0)` })
            .from(fines).where(and(gte(fines.createdAt, startDate), lte(fines.createdAt, endDate)));

        const totalRepairs = await db.select({ total: sql<number>`coalesce(sum(${repairRequests.totalCost}), 0)` })
            .from(repairRequests).where(and(gte(repairRequests.completedAt, startDate), lte(repairRequests.completedAt, endDate)));

        const tripCount = await db.select({ count: sql<number>`count(*)` })
            .from(trips).where(and(
                eq(trips.status, 'completed'),
                gte(trips.actualCompletionAt, startDate),
                lte(trips.actualCompletionAt, endDate)
            ));

        const overdueInvoices = await db.select({ total: sql<number>`coalesce(sum(${invoices.total}), 0)` })
            .from(invoices).where(and(eq(invoices.status, 'overdue')));

        const revenue = totalInvoiced[0]?.total || 0;
        const repairsAmount = totalRepairs[0]?.total || 0;
        const finesAmount = totalFines[0]?.total || 0;
        // H-NEW-2 FIX: Base operational cost from env (was hardcoded 100000)
        const baseOperationalCost = Number(process.env.BASE_OPERATIONAL_COST) || 100000;
        const cost = repairsAmount + finesAmount + baseOperationalCost;

        // H-13 FIX: Top drivers ranking
        const driverStats = await db.select({
            id: users.id,
            name: users.fullName,
            trips: sql<number>`count(${trips.id})`,
        })
            .from(trips)
            .innerJoin(users, eq(trips.driverId, users.id))
            .where(and(
                eq(trips.status, 'completed'),
                gte(trips.actualCompletionAt, startDate),
                lte(trips.actualCompletionAt, endDate)
            ))
            .groupBy(users.id, users.fullName)
            .orderBy(desc(sql`count(${trips.id})`))
            .limit(5);

        const topDrivers = driverStats.map((ds: any) => ({
            name: ds.name,
            trips: ds.trips,
            eco: '95%', // Placeholder for now, could be calculated from telemetry if available
            score: (4.5 + (ds.trips % 5) * 0.1).toFixed(1) // Stable placeholder rating based on trips count
        }));

        return {
            revenue,
            cost,
            margin: revenue - cost,
            marginPercent: revenue > 0 ? ((revenue - cost) / revenue) * 100 : 0,
            finesAmount,
            repairsAmount,
            tripsCompleted: tripCount[0]?.count || 0,
            overdueDebt: overdueInvoices[0]?.total || 0,
            topDrivers,
            // Traffic lights
            debtorLight: (overdueInvoices[0]?.total || 0) > 500000 ? 'red' : ((overdueInvoices[0]?.total || 0) > 100000 ? 'yellow' : 'green'),
            finesLight: finesAmount > 50000 ? 'red' : (finesAmount > 10000 ? 'yellow' : 'green'),
        };
    }

    // === 1C EXPORT (JSON — legacy) ===
    async get1CExportData(startDate: Date, endDate: Date) {
        const recentInvoices = await db.query.invoices.findMany({
            where: and(gte(invoices.createdAt, startDate), lte(invoices.createdAt, endDate)),
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
            Total: inv.total,
            VAT: inv.vatAmount,
            Subtotal: inv.subtotal,
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

    // === 1C EXPORT (XML — CommerceML 2.x) ===
    async export1CXml(startDate: Date, endDate: Date): Promise<string> {
        const recentInvoices = await db.query.invoices.findMany({
            where: and(gte(invoices.createdAt, startDate), lte(invoices.createdAt, endDate)),
            with: {
                contractor: true
            }
        });

        const rows: InvoiceExportRow[] = recentInvoices.map((inv: any) => ({
            id: inv.id,
            number: inv.number,
            type: inv.type,
            status: inv.status,
            subtotal: inv.subtotal,
            vatAmount: inv.vatAmount,
            total: inv.total,
            periodStart: inv.periodStart,
            periodEnd: inv.periodEnd,
            createdAt: inv.createdAt,
            contractor: inv.contractor ? {
                name: inv.contractor.name,
                inn: inv.contractor.inn,
                kpp: inv.contractor.kpp ?? null,
                legalAddress: inv.contractor.legalAddress ?? '',
            } : null,
            tripIds: inv.tripIds ?? [],
        }));

        return buildCommerceMLXml(rows);
    }
}

export const financeService = new FinanceService();
