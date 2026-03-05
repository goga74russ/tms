import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as syncService from './service.js';

const SyncEventInputSchema = z.object({
    id: z.string().uuid(),
    type: z.enum([
        'trip_status_changed',
        'route_point_arrived',
        'route_point_completed',
    ]),
    timestamp: z.string().datetime(),
    payload: z.record(z.any()), // We allow dynamic payload but it's checked in service.ts further
});

const SyncBodySchema = z.object({
    events: z.array(SyncEventInputSchema).max(100), // Max 100 events per sync batch
});

export default async function syncRoutes(app: FastifyInstance) {
    app.post('/sync/events', {
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
