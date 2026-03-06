import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as syncService from './service.js';
import { db } from '../../db/connection.js';
import { trips, vehicles, drivers, orders } from '../../db/schema.js';
import { eq, gt, and } from 'drizzle-orm';

const SyncEventInputSchema = z.object({
    id: z.string().uuid(),
    type: z.enum([
        'trip_status_changed',
        'route_point_arrived',
        'route_point_completed',
    ]),
    timestamp: z.string().datetime(),
    payload: z.record(z.any()),
});

const SyncBodySchema = z.object({
    events: z.array(SyncEventInputSchema).max(100),
});

export default async function syncRoutes(app: FastifyInstance) {

    /**
     * GET /sync/pull — WatermelonDB pull protocol
     * Returns rows changed since lastSyncAt.
     * Driver RLS: drivers only see their own trips.
     */
    app.get('/sync/pull', {
        schema: { tags: ['Синхронизация'], summary: 'Pull обновлений', description: 'Получить изменения с сервера для офлайн-синхронизации мобильного приложения (WatermelonDB). Фильтр по lastSyncAt.' },
        preHandler: [app.authenticate],
    }, async (request, reply) => {
        const user = request.user as { userId: string; roles: string[] };
        const { lastSyncAt = '1970-01-01T00:00:00Z' } = request.query as Record<string, string>;
        const since = new Date(lastSyncAt);
        const now = new Date();
        const isDriver = user.roles.includes('driver');

        try {
            let driverId: string | undefined;
            if (isDriver) {
                const [driver] = await db
                    .select({ id: drivers.id })
                    .from(drivers)
                    .where(eq(drivers.userId, user.userId))
                    .limit(1);
                driverId = driver?.id;
                if (!driverId) {
                    return reply.status(403).send({ success: false, error: 'Профиль водителя не привязан' });
                }
            }

            // Trips: driver sees only own, others see all updated
            const tripConditions = isDriver
                ? and(gt(trips.updatedAt, since), eq(trips.driverId, driverId!))
                : gt(trips.updatedAt, since);

            const updatedTrips = await db.select().from(trips)
                .where(tripConditions).limit(500);

            // Vehicles: all updated
            const updatedVehicles = await db
                .select({
                    id: vehicles.id,
                    plateNumber: vehicles.plateNumber,
                    make: vehicles.make,
                    model: vehicles.model,
                    status: vehicles.status,
                    currentOdometerKm: vehicles.currentOdometerKm,
                    updatedAt: vehicles.updatedAt,
                })
                .from(vehicles)
                .where(gt(vehicles.updatedAt, since))
                .limit(500);

            return {
                success: true,
                changes: {
                    trips: { created: updatedTrips, updated: [], deleted: [] },
                    vehicles: { created: updatedVehicles, updated: [], deleted: [] },
                },
                timestamp: now.toISOString(),
            };
        } catch (error: any) {
            request.log.error(error);
            return reply.status(500).send({ success: false, error: error.message || 'Sync pull failed' });
        }
    });

    app.post('/sync/events', {
        schema: { tags: ['Синхронизация'], summary: 'Push событий', description: 'Отправка офлайн-событий с мобильного устройства. Разрешение конфликтов по timestamp.' },
        preHandler: [app.authenticate] // Driver authentication
    }, async (request, reply) => {
        try {
            const user = request.user as { userId: string; roles: string[] };

            // Zod validation for incoming body
            const parseResult = SyncBodySchema.safeParse(request.body);
            if (!parseResult.success) {
                return reply.code(400).send({
                    success: false,
                    error: 'Invalid events payload',
                    details: parseResult.error.format()
                });
            }

            const { events } = parseResult.data;

            // Simple deduplication strategy within the batch
            const uniqueEventsMap = new Map<string, syncService.SyncEvent>();
            for (const ev of events) {
                // Keep the latest if ID is repeated in the same batch (unlikely but safe)
                uniqueEventsMap.set(ev.id, ev as syncService.SyncEvent);
            }
            const uniqueEvents = Array.from(uniqueEventsMap.values());

            const results = await syncService.processSyncEvents(uniqueEvents, user);
            return { success: true, data: results };
        } catch (error: any) {
            app.log.error(error);
            return reply.status(500).send({ success: false, error: error.message });
        }
    });
}
