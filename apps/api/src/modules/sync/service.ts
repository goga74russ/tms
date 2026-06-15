// ============================================================
// Sync Service — Mobile event processing
// C-7/C-8: With driver ownership verification
// ============================================================
import { db } from '../../db/connection.js';
import { trips, routePoints, drivers, events } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { changeTripStatus, updateRoutePoint } from '../trips/service.js';
import { recordEvent } from '../../events/journal.js';
import { safeClientError } from '../../utils/safe-error.js';

export type SyncEvent = {
    id: string; // client-side event id
    type: 'trip_status_changed' | 'route_point_arrived' | 'route_point_completed';
    timestamp: string; // when it happened offline
    payload: any;
};

// C-8: Verify that the user is the driver assigned to this trip
async function verifyTripOwnership(tripId: string, userId: string): Promise<void> {
    const [trip] = await db.select({ driverId: trips.driverId }).from(trips).where(eq(trips.id, tripId)).limit(1);
    if (!trip) throw new Error('Trip not found');

    // Get driver record for the current user
    const [driver] = await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.userId, userId)).limit(1);
    if (!driver) throw new Error('Driver record not found for user');

    if (trip.driverId !== driver.id) {
        throw new Error('Forbidden: You are not the assigned driver for this trip');
    }
}

export async function processSyncEvents(events: SyncEvent[], user: { userId: string, roles: string[] }) {
    // C-7: Verify the user has driver role
    if (!user.roles.includes('driver')) {
        throw new Error('Forbidden: Only drivers can sync events');
    }

    const results = {
        processed: 0,
        failed: 0,
        errors: [] as any[]
    };

    // Process sequentially to maintain order
    for (const event of events) {
        try {
            await processSingleEvent(event, user);
            results.processed++;
        } catch (error: any) {
            results.failed++;
            results.errors.push({ eventId: event.id, error: safeClientError(error, 'Внутренняя ошибка сервера') });
        }
    }

    return results;
}

async function processSingleEvent(event: SyncEvent, user: { userId: string, roles: string[] }) {
    const offlineTimestamp = new Date(event.timestamp);

    const [existingEvent] = await db.select({ id: events.id })
        .from(events)
        .where(eq(events.externalId, event.id))
        .limit(1);

    if (existingEvent) {
        return;
    }

    if (event.type === 'trip_status_changed') {
        const { tripId, status, odometer, fuel } = event.payload;

        // C-8: Verify ownership before processing
        await verifyTripOwnership(tripId, user.userId);

        // Fetch current trip state
        const [trip] = await db.select().from(trips).where(eq(trips.id, tripId)).limit(1);
        if (!trip) throw new Error('Trip not found');

        // Conflict: if trip is cancelled on server, reject offline status change
        if (trip.status === 'cancelled') {
            await recordEvent({
                authorId: user.userId,
                authorRole: user.roles[0],
                eventType: 'sync.conflict',
                entityType: 'trip',
                entityId: tripId,
                data: { reason: 'trip_already_cancelled', event },
                offlineCreatedAt: offlineTimestamp.toISOString(),
                externalId: event.id,
            });
            throw new Error('Conflict: Trip is cancelled');
        }

        await changeTripStatus(tripId, status, { userId: user.userId, role: user.roles[0] }, {
            odometerEnd: odometer,
            fuelEnd: fuel
        });

        await recordEvent({
            authorId: user.userId,
            authorRole: user.roles[0],
            eventType: 'sync.event_processed',
            entityType: 'trip',
            entityId: tripId,
            data: { type: event.type, status },
            offlineCreatedAt: offlineTimestamp.toISOString(),
            externalId: event.id,
        });

    } else if (event.type === 'route_point_arrived') {
        const { pointId } = event.payload;

        const [point] = await db.select().from(routePoints).where(eq(routePoints.id, pointId)).limit(1);
        if (!point) throw new Error('Route point not found');

        // C-8: Verify ownership via trip
        await verifyTripOwnership(point.tripId, user.userId);

        const [trip] = await db.select().from(trips).where(eq(trips.id, point.tripId)).limit(1);
        // P3 (код-аудит 2026-06-14): null-guard — рейс мог быть удалён между SELECT'ами
        // (раньше trip.status без проверки → NPE).
        if (trip?.status === 'cancelled') {
            await recordEvent({
                authorId: user.userId,
                authorRole: user.roles[0],
                eventType: 'sync.conflict',
                entityType: 'route_point',
                entityId: pointId,
                data: { reason: 'trip_already_cancelled', tripId: point.tripId, event },
                offlineCreatedAt: offlineTimestamp.toISOString(),
                externalId: event.id,
            });
            throw new Error('Conflict: Trip is cancelled');
        }

        if (point.status === 'pending') {
            await updateRoutePoint(point.tripId, pointId, { status: 'arrived', arrivedAt: offlineTimestamp.toISOString() });
        }

        await recordEvent({
            authorId: user.userId,
            authorRole: user.roles[0],
            eventType: 'sync.event_processed',
            entityType: 'route_point',
            entityId: pointId,
            data: { type: event.type },
            offlineCreatedAt: offlineTimestamp.toISOString(),
            externalId: event.id,
        });

    } else if (event.type === 'route_point_completed') {
        const { pointId, photoUrls, signatureUrl } = event.payload;

        const [point] = await db.select().from(routePoints).where(eq(routePoints.id, pointId)).limit(1);
        if (!point) throw new Error('Route point not found');

        // C-8: Verify ownership via trip
        await verifyTripOwnership(point.tripId, user.userId);

        const [trip] = await db.select().from(trips).where(eq(trips.id, point.tripId)).limit(1);
        // P3 (код-аудит 2026-06-14): null-guard — рейс мог быть удалён между SELECT'ами
        // (раньше trip.status без проверки → NPE).
        if (trip?.status === 'cancelled') {
            await recordEvent({
                authorId: user.userId,
                authorRole: user.roles[0],
                eventType: 'sync.conflict',
                entityType: 'route_point',
                entityId: pointId,
                data: { reason: 'trip_already_cancelled', tripId: point.tripId, event },
                offlineCreatedAt: offlineTimestamp.toISOString(),
                externalId: event.id,
            });
            throw new Error('Conflict: Trip is cancelled');
        }

        if (point.status !== 'completed' && point.status !== 'skipped') {
            await updateRoutePoint(point.tripId, pointId, {
                status: 'completed',
                completedAt: offlineTimestamp.toISOString(),
                photoUrls,
                signatureUrl
            });
        }

        await recordEvent({
            authorId: user.userId,
            authorRole: user.roles[0],
            eventType: 'sync.event_processed',
            entityType: 'route_point',
            entityId: pointId,
            data: { type: event.type },
            offlineCreatedAt: offlineTimestamp.toISOString(),
            externalId: event.id,
        });
    } else {
        throw new Error('Unknown event type');
    }
}


