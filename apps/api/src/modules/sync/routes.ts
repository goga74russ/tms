import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, eq, gt, inArray } from 'drizzle-orm';
import * as syncService from './service.js';
import { db } from '../../db/connection.js';
import { trips, routePoints, drivers } from '../../db/schema.js';
import { safeClientError } from '../../utils/safe-error.js';

const TripStatusPayloadSchema = z.object({
    tripId: z.string().uuid(),
    status: z.string().min(1),
    odometer: z.number().optional(),
    fuel: z.number().optional(),
});

const RoutePointPayloadSchema = z.object({
    pointId: z.string().uuid(),
    photoUrls: z.array(z.string()).optional(),
    signatureUrl: z.string().optional(),
});

const SyncEventInputSchema = z.discriminatedUnion('type', [
    z.object({
        id: z.string().uuid(),
        type: z.literal('trip_status_changed'),
        timestamp: z.string().datetime(),
        payload: TripStatusPayloadSchema,
    }),
    z.object({
        id: z.string().uuid(),
        type: z.literal('route_point_arrived'),
        timestamp: z.string().datetime(),
        payload: RoutePointPayloadSchema,
    }),
    z.object({
        id: z.string().uuid(),
        type: z.literal('route_point_completed'),
        timestamp: z.string().datetime(),
        payload: RoutePointPayloadSchema,
    }),
]);

const SyncBodySchema = z.object({
    events: z.array(SyncEventInputSchema).max(100),
});

function parseSyncCursor(rawCursor: string | undefined) {
    if (!rawCursor || rawCursor === '0') {
        return new Date(0);
    }

    const numericCursor = Number(rawCursor);
    if (!Number.isNaN(numericCursor) && Number.isFinite(numericCursor)) {
        return new Date(numericCursor);
    }

    return new Date(rawCursor);
}

function toTripSyncRow(
    trip: typeof trips.$inferSelect,
    tripRoutePoints: Array<typeof routePoints.$inferSelect>,
) {
    return {
        trip_id: trip.id,
        route: JSON.stringify(tripRoutePoints.map((point) => ({
            id: point.id,
            address: point.address,
            type: point.type,
            status: point.status,
            sequenceNumber: point.sequenceNumber,
        }))),
        status: trip.status,
        driver_id: trip.driverId ?? '',
        vehicle_id: trip.vehicleId ?? '',
        created_at: trip.createdAt.getTime(),
        updated_at: trip.updatedAt.getTime(),
    };
}

function toRoutePointSyncRow(point: typeof routePoints.$inferSelect) {
    return {
        route_point_id: point.id,
        trip_id: point.tripId,
        address: point.address,
        type: point.type,
        status: point.status,
        window_start: point.windowStart?.getTime() ?? null,
        window_end: point.windowEnd?.getTime() ?? null,
        created_at: point.createdAt.getTime(),
        updated_at: (point.completedAt ?? point.arrivedAt ?? point.createdAt).getTime(),
    };
}

export default async function syncRoutes(app: FastifyInstance) {
    app.get('/sync/pull', {
        schema: { tags: ['Синхронизация'], summary: 'Pull обновлений', description: 'Возвращает изменения для WatermelonDB-синхронизации.' },
        preHandler: [app.authenticate],
    }, async (request, reply) => {
        const user = request.user as { userId: string; roles: string[] };
        const q = request.query as Record<string, string>;
        const since = parseSyncCursor(q.lastSyncAt ?? q.lastPulledAt ?? '0');
        const now = new Date();
        const isDriver = user.roles.includes('driver');

        try {
            if (!isDriver) {
                return reply.status(403).send({ success: false, error: 'Sync pull доступен только водителям' });
            }

            const [driver] = await db
                .select({ id: drivers.id })
                .from(drivers)
                .where(eq(drivers.userId, user.userId))
                .limit(1);
            const driverId = driver?.id;
            if (!driverId) {
                return reply.status(403).send({ success: false, error: 'Профиль водителя не привязан' });
            }

            const tripConditions = and(gt(trips.updatedAt, since), eq(trips.driverId, driverId));

            const changedTrips = await db.select().from(trips).where(tripConditions).limit(500);
            const tripIds = changedTrips.map((trip) => trip.id);

            const changedRoutePoints = tripIds.length > 0
                ? await db.select().from(routePoints).where(inArray(routePoints.tripId, tripIds))
                : [];

            const routePointsByTrip = new Map<string, Array<typeof routePoints.$inferSelect>>();
            const tripById = new Map<string, typeof trips.$inferSelect>();
            for (const trip of changedTrips) {
                tripById.set(trip.id, trip);
            }

            for (const point of changedRoutePoints) {
                const existing = routePointsByTrip.get(point.tripId) ?? [];
                existing.push(point);
                routePointsByTrip.set(point.tripId, existing);
            }

            const tripCreated = [];
            const tripUpdated = [];
            for (const trip of changedTrips) {
                const syncRow = toTripSyncRow(trip, routePointsByTrip.get(trip.id) ?? []);
                if (trip.createdAt > since) {
                    tripCreated.push(syncRow);
                } else {
                    tripUpdated.push(syncRow);
                }
            }

            const routePointCreated = [];
            const routePointUpdated = [];
            for (const point of changedRoutePoints) {
                const parentTrip = tripById.get(point.tripId);
                if (!parentTrip) continue;

                const syncRow = toRoutePointSyncRow(point);
                // P2 (код-аудит 2026-06-14, #568): created/updated по createdAt САМОЙ
                // точки, а не родительского рейса (раньше все точки нового рейса шли
                // в created, а точки старого рейса — в updated, независимо от точки).
                // #569 (полная переотдача без updatedAt-фильтра) — требует миграцию:
                // route_points не имеет колонки updated_at, дельта по ней невозможна.
                if (point.createdAt > since) {
                    routePointCreated.push(syncRow);
                } else {
                    routePointUpdated.push(syncRow);
                }
            }

            return {
                success: true,
                changes: {
                    trips: { created: tripCreated, updated: tripUpdated, deleted: [] },
                    route_points: { created: routePointCreated, updated: routePointUpdated, deleted: [] },
                },
                timestamp: now.getTime(),
            };
        } catch (error: any) {
            request.log.error(error);
            return reply.status(500).send({ success: false, error: safeClientError(error, 'Sync pull failed') });
        }
    });

    app.post('/sync/events', {
        schema: { tags: ['Синхронизация'], summary: 'Push событий', description: 'Принимает офлайн-события mobile клиента.' },
        preHandler: [app.authenticate],
    }, async (request, reply) => {
        try {
            const user = request.user as { userId: string; roles: string[] };
            const parseResult = SyncBodySchema.safeParse(request.body);
            if (!parseResult.success) {
                return reply.code(400).send({
                    success: false,
                    error: 'Invalid events payload',
                    details: parseResult.error.format(),
                });
            }

            const uniqueEventsMap = new Map<string, syncService.SyncEvent>();
            for (const event of parseResult.data.events) {
                uniqueEventsMap.set(event.id, event as syncService.SyncEvent);
            }

            const results = await syncService.processSyncEvents(Array.from(uniqueEventsMap.values()), user);
            return { success: true, data: results };
        } catch (error: any) {
            app.log.error(error);
            return reply.status(500).send({ success: false, error: safeClientError(error, 'Внутренняя ошибка сервера') });
        }
    });
}


