import { and, eq } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import { drivers, routePoints, trailers, trips, vehicles } from '../../db/schema.js';
import { recordEvent } from '../../events/journal.js';
import { getTripCompatibility } from '../operational-core/compatibility-service.js';
import { syncTransportDocumentsForTrip } from '../trips/transport-documents-store.js';

type Actor = {
    userId: string;
    role: string;
    organizationId?: string | null;
};

export type ReaddressTripInput = {
    routePointId?: string | null;
    orderId?: string | null;
    type?: 'loading' | 'unloading';
    address: string;
    lat?: number | null;
    lon?: number | null;
    windowStart?: string | null;
    windowEnd?: string | null;
    reason: string;
    notes?: string | null;
};

export type ReplaceTripResourcesInput = {
    vehicleId?: string | null;
    driverId?: string | null;
    trailerId?: string | null;
    reason: string;
    notes?: string | null;
};

export type RecordDowntimeInput = {
    routePointId: string;
    vehicleArrivedAt?: string | null;
    waitingStartedAt?: string | null;
    waitingEndedAt?: string | null;
    reason: string;
    notes?: string | null;
    freeMinutes?: number | null;
    reserveAmount?: number | null;
};

export type CancelAfterArrivalInput = {
    routePointId?: string | null;
    vehicleArrivedAt?: string | null;
    reason: string;
    notes?: string | null;
    reserveAmount?: number | null;
    cancelTrip?: boolean;
};

export type RecordBreakdownInput = {
    routePointId?: string | null;
    reason: string;
    notes?: string | null;
    lat?: number | null;
    lon?: number | null;
    requiresReplacement?: boolean;
    repairRequestId?: string | null;
};

function maybeOrgCondition<T extends { organizationId: any }>(table: T, organizationId?: string | null) {
    return organizationId ? eq(table.organizationId, organizationId) : undefined;
}

function toDate(value?: string | null) {
    return value ? new Date(value) : null;
}

function serializePoint(point: typeof routePoints.$inferSelect | null | undefined) {
    if (!point) return null;
    return {
        id: point.id,
        orderId: point.orderId,
        type: point.type,
        status: point.status,
        sequenceNumber: point.sequenceNumber,
        address: point.address,
        lat: point.lat,
        lon: point.lon,
        windowStart: point.windowStart,
        windowEnd: point.windowEnd,
        notes: point.notes,
        vehicleArrivedAt: point.vehicleArrivedAt,
        waitingStartedAt: point.waitingStartedAt,
        waitingEndedAt: point.waitingEndedAt,
    };
}

function diffMinutes(start?: Date | null, end?: Date | null) {
    if (!start || !end) return null;
    const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
    return Number.isFinite(minutes) ? Math.max(minutes, 0) : null;
}

export async function readdressTrip(tripId: string, input: ReaddressTripInput, actor: Actor) {
    const result = await db.transaction(async (tx) => {
        const [trip] = await tx.select().from(trips).where(and(
            eq(trips.id, tripId),
            maybeOrgCondition(trips, actor.organizationId),
        )).limit(1);
        if (!trip) throw new Error('Trip not found');

        let before: typeof routePoints.$inferSelect | null = null;
        let point: typeof routePoints.$inferSelect;

        if (input.routePointId) {
            [before] = await tx.select().from(routePoints).where(and(
                eq(routePoints.id, input.routePointId),
                eq(routePoints.tripId, tripId),
            )).limit(1);
            if (!before) throw new Error('Route point not found');
            if (before.status === 'completed') {
                throw new Error('Completed route point cannot be readdressed; create a new route change point instead');
            }

            [point] = await tx.update(routePoints).set({
                address: input.address,
                lat: input.lat ?? null,
                lon: input.lon ?? null,
                windowStart: toDate(input.windowStart),
                windowEnd: toDate(input.windowEnd),
                notes: input.notes ?? before.notes,
            }).where(eq(routePoints.id, before.id)).returning();
        } else {
            const existing = await tx.select({ sequenceNumber: routePoints.sequenceNumber })
                .from(routePoints)
                .where(eq(routePoints.tripId, tripId));
            const maxSeq = existing.length > 0 ? Math.max(...existing.map((row) => row.sequenceNumber)) : 0;
            [point] = await tx.insert(routePoints).values({
                tripId,
                orderId: input.orderId ?? null,
                type: input.type ?? 'unloading',
                status: 'pending',
                sequenceNumber: maxSeq + 1,
                address: input.address,
                lat: input.lat ?? null,
                lon: input.lon ?? null,
                windowStart: toDate(input.windowStart),
                windowEnd: toDate(input.windowEnd),
                notes: input.notes ?? `Readdressed: ${input.reason}`,
            }).returning();
        }

        const event = await recordEvent({
            authorId: actor.userId,
            authorRole: actor.role,
            eventType: 'trip.route.readdressed',
            entityType: 'trip',
            entityId: tripId,
            data: {
                kind: 'route_change',
                changeType: input.routePointId ? 'update_point' : 'add_point',
                routePointId: point.id,
                orderId: point.orderId,
                reason: input.reason,
                notes: input.notes ?? null,
                before: serializePoint(before),
                after: serializePoint(point),
                etrn: {
                    titleType: '03',
                    titleName: 'readdressing',
                    requiresTitleRefresh: true,
                },
            },
        }, tx);

        await tx.update(trips).set({ updatedAt: new Date() }).where(eq(trips.id, tripId));

        return { routePoint: point, event };
    });
    await syncTransportDocumentsForTrip(tripId, actor.userId);
    return result;
}

export async function replaceTripResources(tripId: string, input: ReplaceTripResourcesInput, actor: Actor) {
    const result = await db.transaction(async (tx) => {
        const [trip] = await tx.select({
            id: trips.id,
            vehicleId: trips.vehicleId,
            driverId: trips.driverId,
            trailerId: trips.trailerId,
            organizationId: trips.organizationId,
        }).from(trips).where(and(
            eq(trips.id, tripId),
            maybeOrgCondition(trips, actor.organizationId),
        )).limit(1);
        if (!trip) throw new Error('Trip not found');
        if (!input.vehicleId && !input.driverId && input.trailerId === undefined) {
            throw new Error('At least one of vehicleId, driverId or trailerId must be provided');
        }

        const patch: Partial<typeof trips.$inferInsert> = { updatedAt: new Date() };
        if (input.vehicleId) {
            const [vehicle] = await tx.select({ id: vehicles.id }).from(vehicles).where(and(
                eq(vehicles.id, input.vehicleId),
                maybeOrgCondition(vehicles, actor.organizationId),
            )).limit(1);
            if (!vehicle) throw new Error('Vehicle not found');
            patch.vehicleId = input.vehicleId;
        }
        if (input.driverId) {
            const [driver] = await tx.select({ id: drivers.id }).from(drivers).where(and(
                eq(drivers.id, input.driverId),
                maybeOrgCondition(drivers, actor.organizationId),
            )).limit(1);
            if (!driver) throw new Error('Driver not found');
            patch.driverId = input.driverId;
        }
        if (input.trailerId !== undefined) {
            if (input.trailerId) {
                const [trailer] = await tx.select({ id: trailers.id }).from(trailers).where(and(
                    eq(trailers.id, input.trailerId),
                    maybeOrgCondition(trailers, actor.organizationId),
                )).limit(1);
                if (!trailer) throw new Error('Trailer not found');
            }
            patch.trailerId = input.trailerId;
        }

        const [updated] = await tx.update(trips).set(patch).where(eq(trips.id, tripId)).returning();

        const event = await recordEvent({
            authorId: actor.userId,
            authorRole: actor.role,
            eventType: 'trip.resource.replaced',
            entityType: 'trip',
            entityId: tripId,
            data: {
                kind: 'resource_replacement',
                reason: input.reason,
                notes: input.notes ?? null,
                before: {
                    vehicleId: trip.vehicleId,
                    driverId: trip.driverId,
                    trailerId: trip.trailerId,
                },
                after: {
                    vehicleId: updated.vehicleId,
                    driverId: updated.driverId,
                    trailerId: updated.trailerId,
                },
                etrn: {
                    titleType: '04',
                    titleName: 'vehicle_or_driver_replacement',
                    requiresTitleRefresh: true,
                },
            },
        }, tx);

        return { trip: updated, event };
    });
    const compatibility = await getTripCompatibility(tripId, actor.organizationId);
    await syncTransportDocumentsForTrip(tripId, actor.userId);
    return { ...result, compatibility };
}

export async function recordRoutePointDowntime(tripId: string, input: RecordDowntimeInput, actor: Actor) {
    return db.transaction(async (tx) => {
        const [trip] = await tx.select({ id: trips.id }).from(trips).where(and(
            eq(trips.id, tripId),
            maybeOrgCondition(trips, actor.organizationId),
        )).limit(1);
        if (!trip) throw new Error('Trip not found');

        const [before] = await tx.select().from(routePoints).where(and(
            eq(routePoints.id, input.routePointId),
            eq(routePoints.tripId, tripId),
        )).limit(1);
        if (!before) throw new Error('Route point not found');

        const vehicleArrivedAt = input.vehicleArrivedAt ? new Date(input.vehicleArrivedAt) : before.vehicleArrivedAt ?? new Date();
        const waitingStartedAt = input.waitingStartedAt ? new Date(input.waitingStartedAt) : before.waitingStartedAt ?? vehicleArrivedAt;
        const waitingEndedAt = input.waitingEndedAt ? new Date(input.waitingEndedAt) : before.waitingEndedAt ?? null;
        const waitingMinutes = diffMinutes(waitingStartedAt, waitingEndedAt);
        const freeMinutes = input.freeMinutes ?? 120;
        const billableMinutes = waitingMinutes === null ? null : Math.max(waitingMinutes - freeMinutes, 0);

        const [point] = await tx.update(routePoints).set({
            vehicleArrivedAt,
            waitingStartedAt,
            waitingEndedAt,
            notes: input.notes ?? before.notes,
        }).where(eq(routePoints.id, before.id)).returning();

        const event = await recordEvent({
            authorId: actor.userId,
            authorRole: actor.role,
            eventType: 'trip.point.downtime_recorded',
            entityType: 'trip',
            entityId: tripId,
            data: {
                kind: 'downtime',
                routePointId: point.id,
                orderId: point.orderId,
                reason: input.reason,
                notes: input.notes ?? null,
                before: serializePoint(before),
                after: serializePoint(point),
                waitingMinutes,
                freeMinutes,
                billableMinutes,
                reserveAmount: input.reserveAmount ?? null,
                financialImpact: {
                    reserveAmount: input.reserveAmount ?? null,
                    basis: billableMinutes && billableMinutes > 0 ? 'billable_downtime' : 'tracked_downtime',
                },
            },
        }, tx);

        await tx.update(trips).set({ updatedAt: new Date() }).where(eq(trips.id, tripId));
        return { routePoint: point, waitingMinutes, billableMinutes, event };
    });
}

export async function cancelTripAfterArrival(tripId: string, input: CancelAfterArrivalInput, actor: Actor) {
    return db.transaction(async (tx) => {
        const [trip] = await tx.select({
            id: trips.id,
            status: trips.status,
        }).from(trips).where(and(
            eq(trips.id, tripId),
            maybeOrgCondition(trips, actor.organizationId),
        )).limit(1);
        if (!trip) throw new Error('Trip not found');

        let point: typeof routePoints.$inferSelect | null = null;
        if (input.routePointId) {
            const [before] = await tx.select().from(routePoints).where(and(
                eq(routePoints.id, input.routePointId),
                eq(routePoints.tripId, tripId),
            )).limit(1);
            if (!before) throw new Error('Route point not found');
            [point] = await tx.update(routePoints).set({
                vehicleArrivedAt: input.vehicleArrivedAt ? new Date(input.vehicleArrivedAt) : before.vehicleArrivedAt ?? new Date(),
                notes: input.notes ?? before.notes,
            }).where(eq(routePoints.id, before.id)).returning();
        }

        const [updatedTrip] = await tx.update(trips).set({
            status: input.cancelTrip === false ? trip.status : 'cancelled',
            updatedAt: new Date(),
        }).where(eq(trips.id, tripId)).returning();

        const event = await recordEvent({
            authorId: actor.userId,
            authorRole: actor.role,
            eventType: 'trip.cancellation.after_arrival',
            entityType: 'trip',
            entityId: tripId,
            data: {
                kind: 'cancellation_after_arrival',
                routePointId: point?.id ?? input.routePointId ?? null,
                orderId: point?.orderId ?? null,
                reason: input.reason,
                notes: input.notes ?? null,
                previousStatus: trip.status,
                nextStatus: updatedTrip.status,
                reserveAmount: input.reserveAmount ?? null,
                financialImpact: {
                    reserveAmount: input.reserveAmount ?? null,
                    basis: 'vehicle_arrived_cancellation',
                },
            },
        }, tx);

        return { trip: updatedTrip, routePoint: point, event };
    });
}

export async function recordTripBreakdown(tripId: string, input: RecordBreakdownInput, actor: Actor) {
    return db.transaction(async (tx) => {
        const [trip] = await tx.select({ id: trips.id, vehicleId: trips.vehicleId, driverId: trips.driverId })
            .from(trips)
            .where(and(eq(trips.id, tripId), maybeOrgCondition(trips, actor.organizationId)))
            .limit(1);
        if (!trip) throw new Error('Trip not found');

        if (input.routePointId) {
            const [point] = await tx.select({ id: routePoints.id }).from(routePoints).where(and(
                eq(routePoints.id, input.routePointId),
                eq(routePoints.tripId, tripId),
            )).limit(1);
            if (!point) throw new Error('Route point not found');
        }

        const event = await recordEvent({
            authorId: actor.userId,
            authorRole: actor.role,
            eventType: 'trip.disruption.breakdown',
            entityType: 'trip',
            entityId: tripId,
            data: {
                kind: 'breakdown',
                routePointId: input.routePointId ?? null,
                reason: input.reason,
                notes: input.notes ?? null,
                gps: input.lat !== undefined && input.lon !== undefined ? { lat: input.lat, lon: input.lon } : null,
                vehicleId: trip.vehicleId,
                driverId: trip.driverId,
                requiresReplacement: input.requiresReplacement ?? true,
                repairRequestId: input.repairRequestId ?? null,
                nextActions: {
                    createRepairRequest: !input.repairRequestId,
                    considerResourceReplacement: input.requiresReplacement ?? true,
                    notifyDispatcher: true,
                },
            },
        }, tx);

        await tx.update(trips).set({ updatedAt: new Date() }).where(eq(trips.id, tripId));
        return { event };
    });
}
