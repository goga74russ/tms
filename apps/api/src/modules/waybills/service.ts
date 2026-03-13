// ============================================================
// Waybills Service - lifecycle before inspections (Sprint 9)
// ============================================================
import { db } from '../../db/connection.js';
import { waybills, trips, vehicles, drivers, techInspections, medInspections, incidents, routePoints } from '../../db/schema.js';
import { recordEvent } from '../../events/journal.js';
import { eq, and, gte, lte, desc, count, sql, inArray } from 'drizzle-orm';
import { getBusinessDayBounds } from '../../utils/timezone.js';

async function generateWaybillNumber(tx: any): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `WB-${year}-`;

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

async function getTodayApprovedTechInspection(vehicleId: string) {
    const { todayStart, todayEnd } = getBusinessDayBounds();
    const [inspection] = await db
        .select({ id: techInspections.id, signature: techInspections.signature })
        .from(techInspections)
        .where(and(
            eq(techInspections.vehicleId, vehicleId),
            eq(techInspections.decision, 'approved'),
            eq(techInspections.inspectionType, 'pre_trip'),
            gte(techInspections.createdAt, todayStart),
            lte(techInspections.createdAt, todayEnd),
        ))
        .orderBy(desc(techInspections.createdAt))
        .limit(1);

    return inspection ?? null;
}

async function getTodayApprovedMedInspection(driverId: string) {
    const { todayStart, todayEnd } = getBusinessDayBounds();
    const [inspection] = await db
        .select({ id: medInspections.id, signature: medInspections.signature })
        .from(medInspections)
        .where(and(
            eq(medInspections.driverId, driverId),
            eq(medInspections.decision, 'approved'),
            eq(medInspections.inspectionType, 'pre_trip'),
            gte(medInspections.createdAt, todayStart),
            lte(medInspections.createdAt, todayEnd),
        ))
        .orderBy(desc(medInspections.createdAt))
        .limit(1);

    return inspection ?? null;
}

async function getIncompleteRoutePointsForTrip(tripId: string) {
    return db
        .select({
            id: routePoints.id,
            type: routePoints.type,
            status: routePoints.status,
            sequenceNumber: routePoints.sequenceNumber,
        })
        .from(routePoints)
        .where(and(
            eq(routePoints.tripId, tripId),
            sql`${routePoints.status} <> 'completed'`,
        ))
        .limit(1000);
}

async function getTripPreTripState(tripId: string) {
    const [trip] = await db
        .select()
        .from(trips)
        .where(eq(trips.id, tripId))
        .limit(1);

    if (!trip) {
        throw new Error('Trip not found');
    }

    if (!trip.vehicleId || !trip.driverId) {
        throw new Error('Trip has no assigned vehicle or driver');
    }

    const [vehicle] = await db
        .select({ currentOdometerKm: vehicles.currentOdometerKm })
        .from(vehicles)
        .where(eq(vehicles.id, trip.vehicleId))
        .limit(1);

    const [techInspection, medInspection, blockingIncidents] = await Promise.all([
        getTodayApprovedTechInspection(trip.vehicleId),
        getTodayApprovedMedInspection(trip.driverId),
        getBlockingIncidentsForWaybill({ tripId, vehicleId: trip.vehicleId, driverId: trip.driverId }),
    ]);

    const hasTechApproval = !!techInspection;
    const hasMedApproval = !!medInspection;
    const hasBlockingIncidents = blockingIncidents.length > 0;

    let status: 'draft' | 'medical_check' | 'technical_check' | 'issued';
    if (hasTechApproval && hasMedApproval && !hasBlockingIncidents) {
        status = 'issued';
    } else if (hasTechApproval) {
        status = 'medical_check';
    } else if (hasMedApproval) {
        status = 'technical_check';
    } else {
        status = 'draft';
    }

    return {
        trip,
        vehicle,
        techInspection,
        medInspection,
        blockingIncidents,
        status,
    };
}

export async function syncWaybillStateForTrip(
    tripId: string,
    authorId?: string,
    authorRole?: string,
) {
    const state = await getTripPreTripState(tripId);

    const [existingWaybill] = await db
        .select()
        .from(waybills)
        .where(eq(waybills.tripId, tripId))
        .limit(1);

    if (!existingWaybill) {
        return null;
    }

    const wasIssued = existingWaybill.status === 'issued';
    const issueNow = state.status === 'issued';
    const departureAt = issueNow ? (existingWaybill.departureAt ?? new Date()) : null;

    const [updatedWaybill] = await db.update(waybills)
        .set({
            status: state.status,
            techInspectionId: state.techInspection?.id ?? null,
            medInspectionId: state.medInspection?.id ?? null,
            mechanicSignature: state.techInspection?.signature ?? null,
            medicSignature: state.medInspection?.signature ?? null,
            departureAt,
            odometerOut: existingWaybill.odometerOut ?? state.vehicle?.currentOdometerKm ?? 0,
        })
        .where(eq(waybills.id, existingWaybill.id))
        .returning();

    if (issueNow && !wasIssued) {
        await db.update(trips)
            .set({
                waybillId: updatedWaybill.id,
                status: 'waybill_issued',
                odometerStart: state.vehicle?.currentOdometerKm ?? 0,
                updatedAt: new Date(),
            })
            .where(eq(trips.id, tripId));

        if (authorId && authorRole) {
            await recordEvent({
                authorId,
                authorRole,
                eventType: 'trip.waybill_issued',
                entityType: 'trip',
                entityId: tripId,
                data: { waybillId: updatedWaybill.id, number: updatedWaybill.number },
            });
        }
    }

    return updatedWaybill;
}

export async function generateWaybill(
    tripId: string,
    authorId: string,
    authorRole: string,
) {
    const state = await getTripPreTripState(tripId);

    const [existingWaybill] = await db
        .select()
        .from(waybills)
        .where(eq(waybills.tripId, tripId))
        .limit(1);

    if (existingWaybill) {
        if (existingWaybill.status === 'closed') {
            throw Object.assign(new Error(`Waybill already closed: ${existingWaybill.number}`), { statusCode: 409 });
        }

        const synced = await syncWaybillStateForTrip(tripId, authorId, authorRole);
        if (!synced) {
            throw new Error('Failed to sync existing waybill');
        }
        return synced;
    }

    const created = await db.transaction(async (tx) => {
        const number = await generateWaybillNumber(tx);
        const issueNow = state.status === 'issued';
        const [waybill] = await tx.insert(waybills).values({
            number,
            tripId,
            vehicleId: state.trip.vehicleId!,
            driverId: state.trip.driverId!,
            status: state.status,
            techInspectionId: state.techInspection?.id ?? null,
            medInspectionId: state.medInspection?.id ?? null,
            mechanicSignature: state.techInspection?.signature ?? null,
            medicSignature: state.medInspection?.signature ?? null,
            odometerOut: state.vehicle?.currentOdometerKm ?? 0,
            departureAt: issueNow ? new Date() : null,
        } as any).returning();

        await tx.update(trips)
            .set({
                waybillId: waybill.id,
                status: issueNow ? 'waybill_issued' : state.trip.status,
                odometerStart: issueNow ? (state.vehicle?.currentOdometerKm ?? 0) : state.trip.odometerStart,
                updatedAt: new Date(),
            })
            .where(eq(trips.id, tripId));

        await recordEvent({
            authorId,
            authorRole,
            eventType: 'document.created',
            entityType: 'waybill',
            entityId: waybill.id,
            data: {
                number: waybill.number,
                tripId: waybill.tripId,
                status: waybill.status,
            },
        }, tx);

        return waybill;
    });

    if (created.status === 'issued') {
        await recordEvent({
            authorId,
            authorRole,
            eventType: 'trip.waybill_issued',
            entityType: 'trip',
            entityId: tripId,
            data: { waybillId: created.id, number: created.number },
        });
    }

    return created;
}

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
        throw new Error('Waybill not found');
    }

    if (waybill.status !== 'issued') {
        throw new Error('Only issued waybills can be closed');
    }

    if (data.odometerIn < (waybill.odometerOut ?? 0)) {
        throw new Error('Odometer in cannot be less than odometer out');
    }

    const incompleteRoutePoints = await getIncompleteRoutePointsForTrip(waybill.tripId);
    if (incompleteRoutePoints.length > 0) {
        throw new Error('Cannot close waybill until all route points are completed');
    }

    const returnTime = data.returnAt ? new Date(data.returnAt) : new Date();

    const updated = await db.transaction(async (tx) => {
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

        await tx.update(vehicles)
            .set({
                currentOdometerKm: data.odometerIn,
                updatedAt: new Date(),
            })
            .where(eq(vehicles.id, waybill.vehicleId));

        await tx.update(trips)
            .set({
                odometerEnd: data.odometerIn,
                fuelEnd: data.fuelIn,
                actualCompletionAt: returnTime,
                updatedAt: new Date(),
            })
            .where(eq(trips.id, waybill.tripId));

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

export async function getWaybillById(id: string) {
    const [waybill] = await db
        .select()
        .from(waybills)
        .where(eq(waybills.id, id))
        .limit(1);

    if (!waybill) return null;

    const [vehicle] = await db
        .select({
            plateNumber: vehicles.plateNumber,
            make: vehicles.make,
            model: vehicles.model,
        })
        .from(vehicles)
        .where(eq(vehicles.id, waybill.vehicleId))
        .limit(1);

    const [driver] = await db
        .select({
            fullName: drivers.fullName,
            licenseNumber: drivers.licenseNumber,
        })
        .from(drivers)
        .where(eq(drivers.id, waybill.driverId))
        .limit(1);

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
