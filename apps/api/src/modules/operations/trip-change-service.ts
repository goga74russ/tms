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
    };
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
