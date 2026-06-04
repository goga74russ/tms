import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireAbility } from '../../auth/rbac.js';
import { assertOrderAccess, assertTripAccess } from '../../auth/guards.js';
import { EXECUTION_EVENT_TYPES, recordExecutionEvent } from './execution-service.js';
import { safeClientError } from '../../utils/safe-error.js';

const attachmentSchema = z.union([z.string().min(1), z.record(z.string(), z.unknown())]);

const executionEventBodySchema = z.object({
    tripId: z.string().uuid().optional(),
    routePointId: z.string().uuid().nullable().optional(),
    orderId: z.string().uuid().nullable().optional(),
    type: z.enum(EXECUTION_EVENT_TYPES),
    reason: z.string().max(200).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
    gps: z.object({
        lat: z.number().min(-90).max(90),
        lon: z.number().min(-180).max(180),
        accuracyM: z.number().nonnegative().nullable().optional(),
        capturedAt: z.string().datetime().nullable().optional(),
    }).nullable().optional(),
    attachments: z.array(attachmentSchema).max(20).optional(),
    occurredAt: z.string().datetime().nullable().optional(),
    offlineCreatedAt: z.string().datetime().nullable().optional(),
    externalId: z.string().max(255).nullable().optional(),
    clientEventId: z.string().max(255).nullable().optional(),
    source: z.string().max(50).nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
});

type ExecutionEventBody = z.infer<typeof executionEventBodySchema>;

function canRecordExecutionEvent(user: { roles: string[] }) {
    return user.roles.some((role) => ['driver', 'dispatcher', 'admin'].includes(role));
}

async function handleCreateExecutionEvent(
    request: FastifyRequest,
    reply: FastifyReply,
    pathTripId?: string,
) {
    const parsed = executionEventBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
        return reply.status(400).send({ success: false, error: 'Ошибка валидации данных', details: parsed.error.flatten() });
    }

    const body = parsed.data as ExecutionEventBody;
    const tripId = pathTripId ?? body.tripId;
    if (!tripId) {
        return reply.status(400).send({ success: false, error: 'tripId is required' });
    }
    if (body.tripId && pathTripId && body.tripId !== pathTripId) {
        return reply.status(400).send({ success: false, error: 'body.tripId does not match route trip id' });
    }

    const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
    if (!canRecordExecutionEvent(user)) {
        return reply.status(403).send({ success: false, error: 'Only driver, dispatcher or admin can record execution events' });
    }
    await assertTripAccess(tripId, user);
    if (body.orderId) await assertOrderAccess(body.orderId, user);

    try {
        const result = await recordExecutionEvent(
            { ...body, tripId },
            { userId: user.userId, role: user.roles[0], organizationId: user.organizationId },
        );
        return reply.status(result.duplicate ? 200 : 201).send({ success: true, data: result });
    } catch (err: any) {
        return reply.status(400).send({ success: false, error: safeClientError(err, 'Внутренняя ошибка сервера') });
    }
}

export function registerExecutionRoutes(app: FastifyInstance) {
    app.post('/trips/execution-events', {
        schema: { tags: ['Trips'], summary: 'Record trip execution event' },
        preHandler: [app.authenticate, requireAbility('read', 'Trip')],
    }, async (request, reply) => handleCreateExecutionEvent(request, reply));

    app.post('/trips/:id/execution-events', {
        schema: { tags: ['Trips'], summary: 'Record trip execution event' },
        preHandler: [app.authenticate, requireAbility('read', 'Trip')],
    }, async (request, reply) => {
        const { id } = request.params as { id: string };
        return handleCreateExecutionEvent(request, reply, id);
    });
}
