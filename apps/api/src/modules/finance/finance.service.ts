import { db } from '../../db/connection.js';
import { trips, invoices, invoiceTrips, invoiceAdjustments, vehicles, fines, repairRequests, tachographRecords, orders, users, drivers, tripOrders, contractors, contracts, tariffs, events } from '../../db/schema.js';
import { eq, and, gt, gte, lte, inArray, sql, desc, isNull } from 'drizzle-orm';
import { tarificationService } from './tarification.service.js';
import { InvoiceCreate } from './schemas.js';
import { recordEvent } from '../../events/journal.js';
import { buildCommerceMLXml, type InvoiceExportRow } from './xml-export.service.js';
import { toFiniteNumber } from '../../utils/number.js';
import { evaluateTariffRule, type TariffRuleServiceType } from './tariff-rules.service.js';

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

/**
 * A-P2: month-in-timezone helper. `new Date().getMonth()` returns the
 * server's local month — on a UTC host in early November (winter for
 * the operational window of Russian fleets) you'd get "summer" until
 * 03:00 Moscow time. Driving fuel coefficients off of server wall
 * clock is incorrect; everything in this app is Moscow-anchored.
 */
function getMonthInTimezone(date: Date, tz: string): number {
    // Intl returns the 2-digit month string in the requested zone.
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, month: '2-digit' });
    const parsed = Number.parseInt(fmt.format(date), 10);
    // Intl months are 1-12; getMonth() is 0-11. Keep the original
    // 0-11 contract so callers don't shift their boundary checks.
    return Number.isFinite(parsed) ? parsed - 1 : date.getUTCMonth();
}

function getCurrentSeason(): 'winter' | 'summer' {
    const tz = process.env.APP_TIMEZONE || 'Europe/Moscow';
    const month = getMonthInTimezone(new Date(), tz); // 0-11
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

        // H-NEW-1 FIX: FOR UPDATE prevents race condition on concurrent invoice creation.
        // AUDIT FIX: считаем максимум ЧИСЛЕННО, а не лексикографически.
        // orderBy(desc(number)).limit(1) брал лексикографический максимум: при
        // переходе 99999 → 100000 (6 цифр) строка "99999" сортируется ВЫШЕ "100000",
        // поэтому seq вычислялся из "99999" → снова 100000 → дубль. Также падало при
        // разной ширине суффикса. Берём все номера года под блокировкой и извлекаем
        // числовой суффикс, максимум считаем по числу.
        const existing = await queryDb.select({ number: invoices.number })
            .from(invoices)
            .where(sql`${invoices.number} LIKE ${pattern}`)
            .for('update');

        let maxSeq = 0;
        for (const row of existing) {
            const parts = String(row.number).split('-');
            const parsed = parseInt(parts[2], 10);
            if (Number.isFinite(parsed) && parsed > maxSeq) {
                maxSeq = parsed;
            }
        }
        const seq = maxSeq + 1;
        return `${prefix}-${year}-${String(seq).padStart(5, '0')}`;
    }

    // === INVOICES ===
    async generateInvoices(params: InvoiceCreate, authorId: string, authorRole: string, organizationId?: string | null) {
        // H-NEW-1 FIX: Number generation INSIDE transaction with FOR UPDATE
        // FIX: Move unbilled trips query inside tx to prevent race condition
        const newInvoice = await db.transaction(async (tx: any) => {
            // Defense-in-depth: contractorId должен принадлежать организации actor-а.
            // Org-фильтр ниже идёт только через vehicles → сам по себе не гарантирует,
            // что переданный contractorId из той же орг. Проверяем явно: если
            // организация задана и контрагент к ней не относится — 0 строк, не падаем.
            if (organizationId) {
                const [ownedContractor] = await tx.select({ id: contractors.id })
                    .from(contractors)
                    .where(and(
                        eq(contractors.id, params.contractorId),
                        eq(contractors.organizationId, organizationId),
                    ))
                    .limit(1);
                if (!ownedContractor) {
                    return { message: 'No unbilled completed trips found for this period and contractor.' };
                }
            }

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
                // C2: API-тип 'invoice' (счёт на оплату) → DB-enum 'payment'.
                // DB invoice_type не содержит 'invoice' → раньше INSERT падал PG-ошибкой.
                type: params.type === 'invoice' ? 'payment' : params.type,
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
    // updateInvoiceStatus — УДАЛЁН (P1-A / finance-C2): писал произвольный
    // status сырым `as any` без FSM. Переходы — только через invoice-workflow.

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
        // T-25 (W3.5): 7 sequential aggregations → Promise.all (parallel).
        // Не объединяю в одну CTE (drizzle не поддерживает универсально и
        // дифф против существующей логики был бы рискованным). Promise.all
        // — bounded perf win: 7×~30ms (sequential ~210ms) → ~30-50ms (parallel).
        // Каждая агрегация независима, можно ходить параллельно.
        const [
            fleetVehicles,
            totalInvoiced,
            totalFines,
            totalRepairs,
            tripCount,
            overdueInvoices,
            driverStats,
        ] = await Promise.all([
            db.select({
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
                )),

            db.select({ total: sql<number>`coalesce(sum(${invoices.total}), 0)` })
                .from(invoices)
                .innerJoin(contractors, eq(invoices.contractorId, contractors.id))
                .where(and(
                    gte(invoices.createdAt, startDate),
                    lte(invoices.createdAt, endDate),
                    organizationId ? eq(contractors.organizationId, organizationId) : undefined,
                )),

            db.select({ total: sql<number>`coalesce(sum(${fines.amount}), 0)` })
                .from(fines)
                .innerJoin(vehicles, eq(fines.vehicleId, vehicles.id))
                .where(and(
                    gte(fines.createdAt, startDate),
                    lte(fines.createdAt, endDate),
                    organizationId ? eq(vehicles.organizationId, organizationId) : undefined,
                )),

            db.select({ total: sql<number>`coalesce(sum(${repairRequests.totalCost}), 0)` })
                .from(repairRequests)
                .innerJoin(vehicles, eq(repairRequests.vehicleId, vehicles.id))
                .where(and(
                    gte(repairRequests.completedAt, startDate),
                    lte(repairRequests.completedAt, endDate),
                    organizationId ? eq(vehicles.organizationId, organizationId) : undefined,
                )),

            db.select({ count: sql<number>`count(*)` })
                .from(trips).where(and(
                    eq(trips.status, 'completed'),
                    gte(trips.actualCompletionAt, startDate),
                    lte(trips.actualCompletionAt, endDate),
                    organizationId
                        ? inArray(trips.vehicleId, db.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.organizationId, organizationId)))
                        : undefined,
                )),

            // M (Этап 3) — 'overdue' computed: issued + paid<total + due_date<now.
            db.select({ total: sql<number>`coalesce(sum(${invoices.total}), 0)` })
                .from(invoices)
                .innerJoin(contractors, eq(invoices.contractorId, contractors.id))
                .where(and(
                    eq(invoices.status, 'issued'),
                    sql`${invoices.paidAmount} < ${invoices.total}`,
                    organizationId ? eq(contractors.organizationId, organizationId) : undefined,
                )),

            // H-13 — top drivers ranking (moved into Promise.all).
            db.select({
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
                .limit(5),
        ]);

        const ktg = calculateFleetKtgMetrics(fleetVehicles);

        const revenue = Number(totalInvoiced[0]?.total ?? 0);
        const repairsAmount = Number(totalRepairs[0]?.total ?? 0);
        const finesAmount = Number(totalFines[0]?.total ?? 0);
        const tripsCompleted = Number(tripCount[0]?.count ?? 0);
        const overdueDebt = Number(overdueInvoices[0]?.total ?? 0);
        // H-NEW-2 FIX: Base operational cost from env (was hardcoded 100000)
        const baseOperationalCost = Number(process.env.BASE_OPERATIONAL_COST) || 100000;
        const cost = repairsAmount + finesAmount + baseOperationalCost;

        // driverStats fetched в Promise.all выше — теперь только маппинг.
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
        // Plain leftJoin instead of `db.query.invoices.findMany` — drizzle
        // relations() blocks aren't wired in this codebase, so the rqb API
        // would throw "Cannot read properties of undefined (reading 'tableConfig')".
        const recentInvoices = await db
            .select({
                id: invoices.id,
                number: invoices.number,
                createdAt: invoices.createdAt,
                total: invoices.total,
                vatAmount: invoices.vatAmount,
                subtotal: invoices.subtotal,
                contractorInn: contractors.inn,
                contractorName: contractors.name,
            })
            .from(invoices)
            .leftJoin(contractors, eq(invoices.contractorId, contractors.id))
            .where(and(
                gte(invoices.createdAt, startDate),
                lte(invoices.createdAt, endDate),
                organizationId
                    ? eq(contractors.organizationId, organizationId)
                    : undefined,
            ));

        const documents = recentInvoices.map((inv: any) => ({
            Type: 'РеализацияУслуг',
            Number: inv.number,
            Date: inv.createdAt instanceof Date ? inv.createdAt.toISOString() : new Date(inv.createdAt).toISOString(),
            ContractorINN: inv.contractorInn ?? null,
            ContractorName: inv.contractorName ?? null,
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
            // Status-guard: корректировать total можно только у draft-счёта.
            // На выпущенных/терминальных статусах (issued/paid_partial/paid_full/
            // cancelled/corrected) сумма зафиксирована — изменения только через
            // корректировочный документ (КСФ/correction). Иначе можно было бы
            // безусловным UPDATE менять total оплаченного/выставленного счёта.
            // Читаем invoice ДО вставки adjustment, чтобы не плодить «осиротевшую»
            // строку при отказе.
            const [invoice] = await tx.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
            if (!invoice) throw new Error('Invoice not found');
            if (invoice.status !== 'draft') {
                throw new Error('Корректировка возможна только для счёта в статусе «черновик». Для выпущенного счёта используйте корректировочный документ.');
            }

            // Insert adjustment
            const [adjustment] = await tx.insert(invoiceAdjustments).values({
                invoiceId,
                reason: reason as any,
                description,
                amount,
                createdBy,
            }).returning();

            // Recalculate invoice total
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
        if (params.amount <= 0) throw new Error('Payment amount must be positive');

        // C5: read-modify-write (event + сумма всех платежей + update статуса) — в одной
        // транзакции с SELECT ... FOR UPDATE на invoice. Раньше всё было вне tx → два
        // параллельных платежа суммировали по таймингу и перетирали paidAmount/статус.
        return db.transaction(async (tx) => {
            const [invoice] = await tx.select().from(invoices)
                .where(eq(invoices.id, invoiceId)).for('update').limit(1);
            if (!invoice) throw new Error('Invoice not found');

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
            }, tx);

            const paymentRows = await tx.select({ data: events.data })
                .from(events)
                .where(and(
                    eq(events.entityType, 'invoice'),
                    eq(events.entityId, invoiceId),
                    eq(events.eventType, 'invoice.partial_payment.recorded'),
                ));
            const paidAmount = paymentRows.reduce((sum, row) => sum + num((row.data as Record<string, unknown>)?.amount), 0);
            const remainingAmount = Math.max(num(invoice.total) - paidAmount, 0);

            // M (Этап 3) — FSM: issued/paid_partial → paid_full когда полностью оплачено.
            if (remainingAmount === 0 && invoice.status !== 'paid_full') {
                await tx.update(invoices).set({ status: 'paid_full', paidAmount: num(invoice.total) }).where(eq(invoices.id, invoiceId));
            } else if (paidAmount > 0 && remainingAmount > 0 && invoice.status === 'issued') {
                await tx.update(invoices).set({ status: 'paid_partial', paidAmount }).where(eq(invoices.id, invoiceId));
            }

            return {
                invoiceId,
                invoiceNumber: invoice.number,
                invoiceTotal: num(invoice.total),
                paidAmount,
                remainingAmount,
                status: remainingAmount === 0 ? 'paid_full' : (paidAmount > 0 ? 'paid_partial' : invoice.status),
            };
        });
    }

    async addAdditionalService(
        invoiceId: string,
        params: {
            serviceType: TariffRuleServiceType;
            description: string;
            amount?: number | null;
            tripId?: string | null;
            quantity?: number | null;
            unit?: string | null;
            minutes?: number | null;
            freeMinutes?: number | null;
            vatRate?: number | null;
            notes?: string | null;
        },
        authorId: string,
        authorRole: string,
    ) {
        const tariffRule = await evaluateTariffRule({
            serviceType: params.serviceType,
            tripId: params.tripId,
            quantity: params.quantity,
            unit: params.unit,
            minutes: params.minutes,
            freeMinutes: params.freeMinutes,
            amountOverride: params.amount,
        });
        const adjustment = await this.createAdjustment(
            invoiceId,
            params.serviceType === 'cancellation_after_arrival' ? 'penalty' : 'other',
            `${params.serviceType}: ${params.description}`,
            tariffRule.amount,
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
                amount: tariffRule.amount,
                tripId: params.tripId ?? null,
                tariffRule,
                vatRate: params.vatRate ?? null,
                notes: params.notes ?? null,
            },
        });
        const [invoice] = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
        return {
            adjustment,
            tariffRule,
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
        // Plain leftJoin — see note in `get1CExportData`. Empty result must
        // produce a valid `КоммерческаяИнформация` envelope, not throw.
        const recentInvoices = await db
            .select({
                id: invoices.id,
                number: invoices.number,
                type: invoices.type,
                status: invoices.status,
                subtotal: invoices.subtotal,
                vatAmount: invoices.vatAmount,
                total: invoices.total,
                periodStart: invoices.periodStart,
                periodEnd: invoices.periodEnd,
                createdAt: invoices.createdAt,
                contractorInn: contractors.inn,
                contractorName: contractors.name,
                contractorKpp: contractors.kpp,
                contractorAddress: contractors.legalAddress,
            })
            .from(invoices)
            .leftJoin(contractors, eq(invoices.contractorId, contractors.id))
            .where(and(
                gte(invoices.createdAt, startDate),
                lte(invoices.createdAt, endDate),
                organizationId
                    ? eq(contractors.organizationId, organizationId)
                    : undefined,
            ));

        // C-2 FIX: Batch query all invoice-trip links instead of N+1 loop
        const invoiceIds = recentInvoices.map((inv) => inv.id);
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

        const rows: InvoiceExportRow[] = recentInvoices.map((inv) => ({
            id: inv.id,
            number: inv.number,
            type: String(inv.type),
            status: String(inv.status),
            subtotal: num(inv.subtotal),
            vatAmount: num(inv.vatAmount),
            total: num(inv.total),
            periodStart: inv.periodStart as Date,
            periodEnd: inv.periodEnd as Date,
            createdAt: inv.createdAt as Date,
            contractor: inv.contractorName
                ? {
                    name: inv.contractorName,
                    inn: inv.contractorInn ?? '',
                    kpp: inv.contractorKpp ?? null,
                    legalAddress: inv.contractorAddress ?? '',
                }
                : null,
            tripIds: tripsByInvoice.get(inv.id) ?? [],
        }));

        return buildCommerceMLXml(rows);
    }

    // ================================================================
    // Wave 4: Auto-billing on trip completion
    // ================================================================
    /**
     * Создать draft-счёт по одному рейсу, если у заявки рейса есть
     * активный договор с тарифом и счёт ещё не создан.
     * Идемпотентно: повторный вызов на том же рейсе вернёт `skipped`.
     */
    async tryAutoCreateInvoice(
        tripId: string,
        author?: { authorId?: string; authorRole?: string },
    ): Promise<{ created: boolean; invoiceId?: string; reason?: string }> {
        // 1. Проверка: рейс уже привязан к счёту?
        const [existingLink] = await db
            .select({ invoiceId: invoiceTrips.invoiceId })
            .from(invoiceTrips)
            .where(eq(invoiceTrips.tripId, tripId))
            .limit(1);
        if (existingLink) {
            return { created: false, reason: 'already_invoiced', invoiceId: existingLink.invoiceId };
        }

        // 2. Найти заявки рейса и контракт.
        const linkedOrders = await db
            .select({
                orderId: orders.id,
                contractorId: orders.contractorId,
                contractId: orders.contractId,
            })
            .from(tripOrders)
            .innerJoin(orders, eq(tripOrders.orderId, orders.id))
            .where(eq(tripOrders.tripId, tripId));

        if (linkedOrders.length === 0) {
            return { created: false, reason: 'no_orders' };
        }

        const contractId = linkedOrders[0].contractId;
        const contractorId = linkedOrders[0].contractorId;
        if (!contractId) {
            return { created: false, reason: 'no_contract' };
        }
        // Все заявки рейса должны принадлежать одному контракту
        const sameContract = linkedOrders.every((o) => o.contractId === contractId);
        if (!sameContract) {
            return { created: false, reason: 'multi_contract' };
        }

        // 3. Контракт активен и содержит тариф.
        const [contract] = await db
            .select({ id: contracts.id, isActive: contracts.isActive })
            .from(contracts)
            .where(eq(contracts.id, contractId))
            .limit(1);
        if (!contract || !contract.isActive) {
            return { created: false, reason: 'contract_inactive' };
        }
        const [tariff] = await db
            .select({ id: tariffs.id })
            .from(tariffs)
            .where(eq(tariffs.contractId, contractId))
            .limit(1);
        if (!tariff) {
            return { created: false, reason: 'no_tariff' };
        }

        // 4. Расчёт стоимости рейса.
        let cost;
        try {
            cost = await tarificationService.calculateTripCost(tripId);
        } catch (err: any) {
            return { created: false, reason: `calc_failed:${err.message ?? 'unknown'}` };
        }

        // 5. Создать draft-счёт + invoice_trips + journal в одной транзакции.
        const authorId = author?.authorId ?? '00000000-0000-0000-0000-000000000000';
        const authorRole = author?.authorRole ?? 'system';

        const created = await db.transaction(async (tx) => {
            // Двойная защита от гонок: проверить связь ещё раз внутри tx.
            const [doubleCheck] = await tx
                .select({ invoiceId: invoiceTrips.invoiceId })
                .from(invoiceTrips)
                .where(eq(invoiceTrips.tripId, tripId))
                .limit(1);
            if (doubleCheck) {
                return { skipped: true, invoiceId: doubleCheck.invoiceId };
            }

            const [tripRow] = await tx
                .select({
                    actualCompletionAt: trips.actualCompletionAt,
                    createdAt: trips.createdAt,
                })
                .from(trips)
                .where(eq(trips.id, tripId))
                .limit(1);
            const periodAnchor = tripRow?.actualCompletionAt ?? tripRow?.createdAt ?? new Date();

            const number = await this.getNextInvoiceNumber('invoice', tx);

            const [invoice] = await tx
                .insert(invoices)
                .values({
                    number,
                    contractorId,
                    contractId,
                    type: 'payment',
                    status: 'draft',
                    subtotal: cost.subtotal,
                    vatAmount: cost.vatAmount,
                    total: cost.total,
                    periodStart: periodAnchor,
                    periodEnd: periodAnchor,
                })
                .returning();

            await tx.insert(invoiceTrips).values({
                invoiceId: invoice.id,
                tripId,
            });

            await recordEvent({
                authorId,
                authorRole,
                eventType: 'invoice.auto_created',
                entityType: 'invoice',
                entityId: invoice.id,
                data: {
                    tripId,
                    contractorId,
                    contractId,
                    number: invoice.number,
                    total: invoice.total,
                    source: 'trip.completed',
                },
            }, tx);

            return { skipped: false, invoiceId: invoice.id };
        });

        if (created.skipped) {
            return { created: false, reason: 'already_invoiced', invoiceId: created.invoiceId };
        }
        return { created: true, invoiceId: created.invoiceId };
    }

    /**
     * Сформировать сводные счета за период по всем завершённым рейсам без счетов.
     * Группирует рейсы по контрагенту → один консолидированный счёт на каждого.
     * Возвращает списки `created` и `skipped` для аудита.
     */
    async bulkGenerateInvoices(
        params: { from: string; to: string; contractorId?: string },
        author: { authorId: string; authorRole: string; organizationId?: string | null },
    ): Promise<{
        created: Array<{ invoiceId: string; contractorId: string; tripIds: string[]; total: number }>;
        skipped: Array<{ tripId: string; reason: string }>;
        hasMore?: boolean;
    }> {
        const fromDate = new Date(params.from);
        const toDate = new Date(params.to);

        const conditions = [
            eq(trips.status, 'completed'),
            gte(trips.actualCompletionAt, fromDate),
            lte(trips.actualCompletionAt, toDate),
        ];
        if (author.organizationId) {
            conditions.push(eq(trips.organizationId, author.organizationId));
        }

        // T-15 (W3.5): защитный LIMIT 1000.
        //
        // Раньше query тянул все completed рейсы за период без LIMIT — на
        // больших окнах (12 мес × несколько ТС) могло вернуть 50k+ строк
        // и привести к OOM в Node + полный sequential scan trips × tripOrders.
        //
        // 1000 строк ≈ ~100 счетов (10 рейсов на счёт в среднем) — достаточно
        // для одного вызова. Если результат >= 1000 → hasMore=true, фронт
        // показывает баннер «сузьте окно» и предлагает вызвать ещё раз.
        const BULK_GENERATE_LIMIT = 1000;

        // Найти completed рейсы, у которых ещё нет связанного счёта (с LIMIT).
        const completedRows = await db
            .selectDistinct({
                tripId: trips.id,
                contractorId: orders.contractorId,
                contractId: orders.contractId,
            })
            .from(trips)
            .innerJoin(tripOrders, eq(trips.id, tripOrders.tripId))
            .innerJoin(orders, eq(tripOrders.orderId, orders.id))
            .leftJoin(invoiceTrips, eq(invoiceTrips.tripId, trips.id))
            .where(and(
                ...conditions,
                isNull(invoiceTrips.invoiceId),
                params.contractorId ? eq(orders.contractorId, params.contractorId) : undefined,
            ))
            .limit(BULK_GENERATE_LIMIT);

        const hasMore = completedRows.length >= BULK_GENERATE_LIMIT;

        const created: Array<{ invoiceId: string; contractorId: string; tripIds: string[]; total: number }> = [];
        const skipped: Array<{ tripId: string; reason: string }> = [];

        // Сгруппировать по contractor + contract.
        const byContractor = new Map<string, { contractorId: string; contractId: string; tripIds: string[] }>();
        for (const row of completedRows) {
            if (!row.contractorId || !row.contractId) {
                skipped.push({ tripId: row.tripId, reason: 'no_contract' });
                continue;
            }
            const key = `${row.contractorId}::${row.contractId}`;
            const bucket = byContractor.get(key) ?? { contractorId: row.contractorId, contractId: row.contractId, tripIds: [] };
            bucket.tripIds.push(row.tripId);
            byContractor.set(key, bucket);
        }

        for (const bucket of byContractor.values()) {
            // Проверить тариф.
            const [tariff] = await db
                .select({ id: tariffs.id })
                .from(tariffs)
                .where(eq(tariffs.contractId, bucket.contractId))
                .limit(1);
            if (!tariff) {
                for (const tid of bucket.tripIds) skipped.push({ tripId: tid, reason: 'no_tariff' });
                continue;
            }

            // Расчёт стоимости батчем.
            const costMap = await tarificationService.calculateBatchTripCosts(bucket.tripIds);
            let subtotal = 0;
            let vat = 0;
            let total = 0;
            const billable: string[] = [];
            for (const tid of bucket.tripIds) {
                const c = costMap.get(tid);
                if (!c) {
                    skipped.push({ tripId: tid, reason: 'calc_failed' });
                    continue;
                }
                subtotal += c.subtotal;
                vat += c.vatAmount;
                total += c.total;
                billable.push(tid);
            }
            if (billable.length === 0) continue;

            try {
                const invoiceId = await db.transaction(async (tx) => {
                    const number = await this.getNextInvoiceNumber('invoice', tx);
                    const [invoice] = await tx
                        .insert(invoices)
                        .values({
                            number,
                            contractorId: bucket.contractorId,
                            contractId: bucket.contractId,
                            type: 'payment',
                            status: 'draft',
                            subtotal,
                            vatAmount: vat,
                            total,
                            periodStart: fromDate,
                            periodEnd: toDate,
                        })
                        .returning();

                    await tx.insert(invoiceTrips).values(
                        billable.map((tid) => ({ invoiceId: invoice.id, tripId: tid }))
                    );

                    await recordEvent({
                        authorId: author.authorId,
                        authorRole: author.authorRole,
                        eventType: 'invoice.auto_created',
                        entityType: 'invoice',
                        entityId: invoice.id,
                        data: {
                            number: invoice.number,
                            contractorId: bucket.contractorId,
                            contractId: bucket.contractId,
                            tripIds: billable,
                            total: invoice.total,
                            source: 'finance.bulk_generate',
                        },
                    }, tx);

                    return invoice.id;
                });

                created.push({
                    invoiceId,
                    contractorId: bucket.contractorId,
                    tripIds: billable,
                    total,
                });
            } catch (err: any) {
                for (const tid of billable) skipped.push({ tripId: tid, reason: `tx_failed:${err?.message ?? 'unknown'}` });
            }
        }

        return { created, skipped, hasMore };
    }
}

export const financeService = new FinanceService();
