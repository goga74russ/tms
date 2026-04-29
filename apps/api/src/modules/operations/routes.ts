import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAbility } from '../../auth/rbac.js';
import { assertTripAccess } from '../../auth/guards.js';
import { listOperationExceptions } from './exceptions-service.js';

const ExceptionsQuerySchema = z.object({
    tripId: z.string().uuid().optional(),
    severity: z.enum(['blocking', 'warning', 'info']).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    includeInfo: z.coerce.boolean().optional(),
});

export default async function operationsRoutes(app: FastifyInstance) {
    app.get('/operations/exceptions', {
        schema: {
            tags: ['Operations'],
            summary: 'Dispatcher exception cockpit',
            description: 'Aggregates operational blockers and warnings from compatibility checks, document close gate, claims, shipment discrepancies, and execution events.',
        },
        preHandler: [app.authenticate, requireAbility('read', 'Trip')],
    }, async (request, reply) => {
        const parsed = ExceptionsQuerySchema.safeParse(request.query);
        if (!parsed.success) {
            return reply.status(400).send({ success: false, error: 'Validation failed', details: parsed.error.flatten() });
        }

        const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
        if (parsed.data.tripId) {
            await assertTripAccess(parsed.data.tripId, user);
        }

        const data = await listOperationExceptions({
            ...parsed.data,
            organizationId: user.organizationId,
            actorId: user.userId,
        });

        return { success: true, data };
    });
}
