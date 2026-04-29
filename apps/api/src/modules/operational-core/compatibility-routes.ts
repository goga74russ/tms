import type { FastifyInstance } from 'fastify';
import { requireAbility } from '../../auth/rbac.js';
import { assertTripAccess } from '../../auth/guards.js';
import { getTripCompatibility } from './compatibility-service.js';

type AuthenticatedUser = {
    userId: string;
    roles: string[];
    organizationId?: string | null;
};

export function registerTripCompatibilityRoutes(app: FastifyInstance) {
    app.get('/trips/:id/compatibility', {
        schema: {
            tags: ['Trips'],
            summary: 'Trip cargo/vehicle compatibility',
            description: 'Read-only operational-core checks for assigned lots against trip vehicle capacity, volume, requirements, body type, and temperature markers.',
        },
        preHandler: [app.authenticate, requireAbility('read', 'Trip')],
    }, async (request, reply) => {
        const { id } = request.params as { id: string };
        const user = request.user as AuthenticatedUser;
        await assertTripAccess(id, user);

        const compatibility = await getTripCompatibility(id, user.organizationId);
        if (!compatibility) {
            return reply.status(404).send({ success: false, error: 'Trip not found' });
        }

        return { success: true, data: compatibility };
    });
}
