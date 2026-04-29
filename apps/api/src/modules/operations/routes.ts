import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAbility } from '../../auth/rbac.js';
import { assertDriverAccess, assertOrderAccess, assertTrailerAccess, assertTripAccess, assertVehicleAccess } from '../../auth/guards.js';
import { listOperationExceptions } from './exceptions-service.js';
import {
    cancelTripAfterArrival,
    readdressTrip,
    recordRoutePointDowntime,
    recordTripBreakdown,
    replaceTripResources,
} from './trip-change-service.js';

const ExceptionsQuerySchema = z.object({
    tripId: z.string().uuid().optional(),
    severity: z.enum(['blocking', 'warning', 'info']).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    includeInfo: z.coerce.boolean().optional(),
});

const ReaddressTripSchema = z.object({
    routePointId: z.string().uuid().nullable().optional(),
    orderId: z.string().uuid().nullable().optional(),
    type: z.enum(['loading', 'unloading']).optional(),
    address: z.string().min(3).max(1000),
    lat: z.number().min(-90).max(90).nullable().optional(),
    lon: z.number().min(-180).max(180).nullable().optional(),
    windowStart: z.string().datetime().nullable().optional(),
    windowEnd: z.string().datetime().nullable().optional(),
    reason: z.string().min(3).max(500),
    notes: z.string().max(2000).nullable().optional(),
});

const ReplaceTripResourcesSchema = z.object({
    vehicleId: z.string().uuid().nullable().optional(),
    driverId: z.string().uuid().nullable().optional(),
    trailerId: z.string().uuid().nullable().optional(),
    reason: z.string().min(3).max(500),
    notes: z.string().max(2000).nullable().optional(),
}).refine((value) => value.vehicleId || value.driverId || value.trailerId !== undefined, {
    message: 'At least one of vehicleId, driverId or trailerId must be provided',
});

const DowntimeSchema = z.object({
    routePointId: z.string().uuid(),
    vehicleArrivedAt: z.string().datetime().nullable().optional(),
    waitingStartedAt: z.string().datetime().nullable().optional(),
    waitingEndedAt: z.string().datetime().nullable().optional(),
    reason: z.string().min(3).max(500),
    notes: z.string().max(2000).nullable().optional(),
    freeMinutes: z.number().int().nonnegative().nullable().optional(),
    reserveAmount: z.number().nonnegative().nullable().optional(),
});

const CancelAfterArrivalSchema = z.object({
    routePointId: z.string().uuid().nullable().optional(),
    vehicleArrivedAt: z.string().datetime().nullable().optional(),
    reason: z.string().min(3).max(500),
    notes: z.string().max(2000).nullable().optional(),
    reserveAmount: z.number().nonnegative().nullable().optional(),
    cancelTrip: z.boolean().optional(),
});

const BreakdownSchema = z.object({
    routePointId: z.string().uuid().nullable().optional(),
    reason: z.string().min(3).max(500),
    notes: z.string().max(2000).nullable().optional(),
    lat: z.number().min(-90).max(90).nullable().optional(),
    lon: z.number().min(-180).max(180).nullable().optional(),
    requiresReplacement: z.boolean().optional(),
    repairRequestId: z.string().uuid().nullable().optional(),
});

export default async function operationsRoutes(app: FastifyInstance) {
    app.post('/trips/:id/route-points/:pointId/downtime', {
        schema: {
            tags: ['Operations'],
            summary: 'Record route point downtime',
            description: 'Records vehicle arrival/waiting timestamps and an append-only downtime event for loading/unloading points.',
        },
        preHandler: [app.authenticate, requireAbility('update', 'Trip')],
    }, async (request, reply) => {
        const { id, pointId } = request.params as { id: string; pointId: string };
        const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
        await assertTripAccess(id, user);
        const parsed = DowntimeSchema.safeParse({ ...(request.body as object ?? {}), routePointId: pointId });
        if (!parsed.success) {
            return reply.status(400).send({ success: false, error: 'Validation failed', details: parsed.error.flatten() });
        }
        try {
            const data = await recordRoutePointDowntime(id, parsed.data, {
                userId: user.userId,
                role: user.roles[0] ?? 'unknown',
                organizationId: user.organizationId,
            });
            return reply.status(201).send({ success: true, data });
        } catch (err: any) {
            return reply.status(400).send({ success: false, error: err.message });
        }
    });

    app.post('/trips/:id/cancel-after-arrival', {
        schema: {
            tags: ['Operations'],
            summary: 'Cancel trip after vehicle arrival',
            description: 'Records cancellation after vehicle arrival, optional route-point arrival evidence, financial reserve, and trip cancellation.',
        },
        preHandler: [app.authenticate, requireAbility('update', 'Trip')],
    }, async (request, reply) => {
        const { id } = request.params as { id: string };
        const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
        await assertTripAccess(id, user);
        const parsed = CancelAfterArrivalSchema.safeParse(request.body ?? {});
        if (!parsed.success) {
            return reply.status(400).send({ success: false, error: 'Validation failed', details: parsed.error.flatten() });
        }
        try {
            const data = await cancelTripAfterArrival(id, parsed.data, {
                userId: user.userId,
                role: user.roles[0] ?? 'unknown',
                organizationId: user.organizationId,
            });
            return reply.status(201).send({ success: true, data });
        } catch (err: any) {
            return reply.status(400).send({ success: false, error: err.message });
        }
    });

    app.post('/trips/:id/breakdowns', {
        schema: {
            tags: ['Operations'],
            summary: 'Record trip breakdown',
            description: 'Records a blocking in-trip breakdown event and next actions for repair/replacement.',
        },
        preHandler: [app.authenticate, requireAbility('update', 'Trip')],
    }, async (request, reply) => {
        const { id } = request.params as { id: string };
        const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
        await assertTripAccess(id, user);
        const parsed = BreakdownSchema.safeParse(request.body ?? {});
        if (!parsed.success) {
            return reply.status(400).send({ success: false, error: 'Validation failed', details: parsed.error.flatten() });
        }
        try {
            const data = await recordTripBreakdown(id, parsed.data, {
                userId: user.userId,
                role: user.roles[0] ?? 'unknown',
                organizationId: user.organizationId,
            });
            return reply.status(201).send({ success: true, data });
        } catch (err: any) {
            return reply.status(400).send({ success: false, error: err.message });
        }
    });

    app.post('/trips/:id/route-changes/readdress', {
        schema: {
            tags: ['Operations'],
            summary: 'Record trip readdressing',
            description: 'Updates or adds a route point and records an append-only event mapped to ETRN Title 03.',
        },
        preHandler: [app.authenticate, requireAbility('update', 'Trip')],
    }, async (request, reply) => {
        const { id } = request.params as { id: string };
        const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
        await assertTripAccess(id, user);

        const parsed = ReaddressTripSchema.safeParse(request.body ?? {});
        if (!parsed.success) {
            return reply.status(400).send({ success: false, error: 'Validation failed', details: parsed.error.flatten() });
        }
        if (parsed.data.orderId) await assertOrderAccess(parsed.data.orderId, user);

        try {
            const data = await readdressTrip(id, parsed.data, {
                userId: user.userId,
                role: user.roles[0] ?? 'unknown',
                organizationId: user.organizationId,
            });
            return reply.status(201).send({ success: true, data });
        } catch (err: any) {
            return reply.status(400).send({ success: false, error: err.message });
        }
    });

    app.post('/trips/:id/resource-replacements', {
        schema: {
            tags: ['Operations'],
            summary: 'Replace trip vehicle, driver, or trailer',
            description: 'Updates assigned trip resources, recalculates compatibility, and records an append-only event mapped to ETRN Title 04.',
        },
        preHandler: [app.authenticate, requireAbility('update', 'Trip')],
    }, async (request, reply) => {
        const { id } = request.params as { id: string };
        const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
        await assertTripAccess(id, user);

        const parsed = ReplaceTripResourcesSchema.safeParse(request.body ?? {});
        if (!parsed.success) {
            return reply.status(400).send({ success: false, error: 'Validation failed', details: parsed.error.flatten() });
        }
        if (parsed.data.vehicleId) await assertVehicleAccess(parsed.data.vehicleId, user);
        if (parsed.data.driverId) await assertDriverAccess(parsed.data.driverId, user);
        if (parsed.data.trailerId) await assertTrailerAccess(parsed.data.trailerId, user);

        try {
            const data = await replaceTripResources(id, parsed.data, {
                userId: user.userId,
                role: user.roles[0] ?? 'unknown',
                organizationId: user.organizationId,
            });
            return reply.status(201).send({ success: true, data });
        } catch (err: any) {
            return reply.status(400).send({ success: false, error: err.message });
        }
    });

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
