// ============================================================
// Waybills Service — Путевые листы (§3.5)
// ============================================================
import { db } from '../../db/connection.js';
import { waybills, trips, vehicles, drivers, techInspections, medInspections, incidents } from '../../db/schema.js';
import { recordEvent } from '../../events/journal.js';
import { eq, and, gte, lte, desc, count, sql, inArray } from 'drizzle-orm';
import {
    hasValidTechInspectionToday,
    hasValidMedInspectionToday,
    getTodayTechInspectionId,
    getTodayMedInspectionId,
} from '../inspections/service.js';

// ================================================================
// Waybill number generation: WB-YYYY-NNNNN
// ================================================================
async function generateWaybillNumber(tx: any): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `WB-${year}-`;

    // Get the last waybill number for this year (lock for update to prevent duplicates)
    const [lastWaybill] = await tx
        .select({ number: waybills.number })
        .from(waybills)
        .where(sql`${waybills.number} LIKE ${prefix + '%'}`)
        .orderBy(desc(waybills.number))
        .limit(1)
        .for('update');

    let nextNum = 1;
    if (lastWaybill) {
        const lastNum = parseInt(lastWaybill.number.replace(prefix, ''), 10);
        nextNum = lastNum + 1;
    }

    return `${prefix}${String(nextNum).padStart(5, '0')}`;
}

// ================================================================
// Generate waybill for a trip
// ================================================================
/**
 * Generate waybill. Requires BOTH tech and med approvals for today.
 * Returns the created waybill or throws if conditions not met.
 */
async function getBlockingIncidentsForWaybill(params: {
    tripId: string;
    vehicleId: string;
    driverId: string;
}) {
    return db.select({
        id: incidents.id,
        type: incidents.type,
        description: incidents.description,
        status: incidents.status,
    }).from(incidents).where(and(
        eq(incidents.blocksRelease, true),
        inArray(incidents.status, ['open', 'investigating']),
        sql`(
            ${incidents.tripId} = ${params.tripId}
            OR ${incidents.vehicleId} = ${params.vehicleId}
            OR ${incidents.driverId} = ${params.driverId}
        )`,
    ));
}

export async function generateWaybill(
    tripId: string,
    authorId: string,
    authorRole: string,
) {
    // Get trip
    const [trip] = await db
        .select()
        .from(trips)
        .where(eq(trips.id, tripId))
        .limit(1);

    if (!trip) {
        throw new Error('Рейс не найден');
    }

    // FIX: Idempotency — prevent duplicate waybills for the same trip
    const [existingWaybill] = await db
        .select({ id: waybills.id, number: waybills.number })
        .from(waybills)
        .where(eq(waybills.tripId, tripId))
        .limit(1);

    if (existingWaybill) {
        throw Object.assign(
            new Error(`Путевой лист для этого рейса уже существует: ${existingWaybill.number}`),
            { statusCode: 409 }
        );
    }

    if (!trip.vehicleId || !trip.driverId) {
        throw new Error('Trip has no assigned vehicle or driver');
    }

    const blockingIncidents = await getBlockingIncidentsForWaybill({
        tripId,
        vehicleId: trip.vehicleId,
        driverId: trip.driverId,
    });
    if (blockingIncidents.length > 0) {
        const summary = blockingIncidents
            .map((incident) => `${incident.type}/${incident.status}: ${incident.description}`)
            .join('; ');
        throw Object.assign(new Error(`Blocking incidents prevent waybill issuance: ${summary}`), {
            statusCode: 409,
        });
    }

    // Check tech inspection for vehicle today
    const hasTechApproval = await hasValidTechInspectionToday(trip.vehicleId);
    if (!hasTechApproval) {
        throw new Error('Нет допуска механика. Путевой лист не может быть сформирован.');
    }

    // Check med inspection for driver today
    const hasMedApproval = await hasValidMedInspectionToday(trip.driverId);
    if (!hasMedApproval) {
        throw new Error('Нет допуска медика. Путевой лист не может быть сформирован.');
    }

    // Get inspection IDs and signatures
    const techInspectionId = await getTodayTechInspectionId(trip.vehicleId);
    const medInspectionId = await getTodayMedInspectionId(trip.driverId);

    if (!techInspectionId || !medInspectionId) {
        throw new Error('Ошибка получения данных осмотров');
    }

    // Get signatures from inspections
    const [techInsp] = await db
        .select({ signature: techInspections.signature })
        .from(techInspections)
        .where(eq(techInspections.id, techInspectionId))
        .limit(1);

    const [medInsp] = await db
        .select({ signature: medInspections.signature })
        .from(medInspections)
        .where(eq(medInspections.id, medInspectionId))
        .limit(1);

    // Get vehicle current odometer
    const [vehicle] = await db
        .select({ currentOdometerKm: vehicles.currentOdometerKm })
        .from(vehicles)
        .where(eq(vehicles.id, trip.vehicleId))
        .limit(1);

    // H-10: Wrap all mutations in a single transaction
    const waybill = await db.transaction(async (tx) => {
        // Generate unique number inside transaction with FOR UPDATE
        const number = await generateWaybillNumber(tx);

        // Create waybill
        const [wb] = await tx.insert(waybills).values({
            number,
            tripId,
            vehicleId: trip.vehicleId,
            driverId: trip.driverId,
            techInspectionId,
            medInspectionId,
            mechanicSignature: techInsp?.signature,
            medicSignature: medInsp?.signature,
            odometerOut: vehicle?.currentOdometerKm || 0,
            departureAt: new Date(),
        } as any).returning();

        // Update trip with waybill reference and status
        await tx.update(trips)
            .set({
                waybillId: wb.id,
                status: 'waybill_issued',
                odometerStart: vehicle?.currentOdometerKm || 0,
                updatedAt: new Date(),
            })
            .where(eq(trips.id, tripId));

        // Record events inside transaction
        await recordEvent({
            authorId,
            authorRole,
            eventType: 'document.created',
            entityType: 'waybill',
            entityId: wb.id,
            data: {
                number: wb.number,
                tripId: wb.tripId
            }
        }, tx);

        return wb;
    });

    await recordEvent({
        authorId,
        authorRole,
        eventType: 'trip.waybill_issued',
        entityType: 'trip',
        entityId: tripId,
        data: { waybillId: waybill.id, number: waybill.number },
    });

    return waybill;
}

// ================================================================
// Close waybill
// ================================================================
/**
 * Close waybill with return data.
 */
export async function closeWaybill(
    waybillId: string,
    data: {
        odometerIn: number;
        fuelIn?: number;
        returnAt?: string;
    },
    authorId: string,
    authorRole: string,
) {
    const [waybill] = await db
        .select()
        .from(waybills)
        .where(eq(waybills.id, waybillId))
        .limit(1);

    if (!waybill) {
        throw new Error('Путевой лист не найден');
    }

    if (waybill.status === 'closed') {
        throw new Error('Путевой лист уже закрыт');
    }

    const returnTime = data.returnAt ? new Date(data.returnAt) : new Date();

    // H-10: Wrap all mutations in a single transaction
    const updated = await db.transaction(async (tx) => {
        // Update waybill
        const [result] = await tx.update(waybills)
            .set({
                status: 'closed',
                odometerIn: data.odometerIn,
                fuelIn: data.fuelIn,
                returnAt: returnTime,
                closedAt: new Date(),
            })
            .where(eq(waybills.id, waybillId))
            .returning();

        // Update vehicle odometer
        await tx.update(vehicles)
            .set({
                currentOdometerKm: data.odometerIn,
                updatedAt: new Date(),
            })
            .where(eq(vehicles.id, waybill.vehicleId));

        // Update trip
        await tx.update(trips)
            .set({
                odometerEnd: data.odometerIn,
                fuelEnd: data.fuelIn,
                actualCompletionAt: returnTime,
                updatedAt: new Date(),
            })
            .where(eq(trips.id, waybill.tripId));

        // Record event inside transaction
        await recordEvent({
            authorId,
            authorRole,
            eventType: 'document.signed',
            entityType: 'waybill',
            entityId: waybillId,
            data: {
                action: 'closed',
                odometerIn: data.odometerIn,
                fuelIn: data.fuelIn,
                returnAt: returnTime.toISOString(),
            },
        }, tx);

        return result;
    });

    return updated;
}

// ================================================================
// List & Get
// ================================================================

/**
 * List waybills with pagination.
 * H-3: Optional driverId filter for RLS (drivers see only their own).
 */
export async function listWaybills(page = 1, limit = 20, driverId?: string) {
    const offset = (page - 1) * limit;
    const conditions = driverId ? eq(waybills.driverId, driverId) : undefined;

    const [totalResult] = await db
        .select({ count: count() })
        .from(waybills)
        .where(conditions);

    const items = await db
        .select({
            id: waybills.id,
            number: waybills.number,
            tripId: waybills.tripId,
            vehicleId: waybills.vehicleId,
            driverId: waybills.driverId,
            techInspectionId: waybills.techInspectionId,
            medInspectionId: waybills.medInspectionId,
            status: waybills.status,
            odometerOut: waybills.odometerOut,
            odometerIn: waybills.odometerIn,
            fuelIn: waybills.fuelIn,
            departureAt: waybills.departureAt,
            returnAt: waybills.returnAt,
            issuedAt: waybills.issuedAt,
            closedAt: waybills.closedAt,
            mechanicSignature: waybills.mechanicSignature,
            medicSignature: waybills.medicSignature,
            vehiclePlate: vehicles.plateNumber,
            driverName: drivers.fullName,
        })
        .from(waybills)
        .leftJoin(vehicles, eq(waybills.vehicleId, vehicles.id))
        .leftJoin(drivers, eq(waybills.driverId, drivers.id))
        .where(conditions)
        .orderBy(desc(waybills.issuedAt))
        .limit(limit)
        .offset(offset);

    return {
        data: items,
        total: totalResult.count,
        page,
        limit,
    };
}

/**
 * Get single waybill with related data.
 */
export async function getWaybillById(id: string) {
    const [waybill] = await db
        .select()
        .from(waybills)
        .where(eq(waybills.id, id))
        .limit(1);

    if (!waybill) return null;

    // Get related vehicle info
    const [vehicle] = await db
        .select({
            plateNumber: vehicles.plateNumber,
            make: vehicles.make,
            model: vehicles.model,
        })
        .from(vehicles)
        .where(eq(vehicles.id, waybill.vehicleId))
        .limit(1);

    // Get related driver info
    const [driver] = await db
        .select({
            fullName: drivers.fullName,
            licenseNumber: drivers.licenseNumber,
        })
        .from(drivers)
        .where(eq(drivers.id, waybill.driverId))
        .limit(1);

    // Get related trip info
    const [trip] = await db
        .select({
            number: trips.number,
            status: trips.status,
        })
        .from(trips)
        .where(eq(trips.id, waybill.tripId))
        .limit(1);

    return {
        ...waybill,
        vehicle,
        driver,
        trip,
    };
}

