import { and, eq } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import { events, orders, routePoints, tripOrders, trips } from '../../db/schema.js';
import { recordEvent } from '../../events/journal.js';

export const EXECUTION_EVENT_TYPES = [
    'correction',
    'disruption',
    'delay',
    'downtime',
    'photo-placeholder',
] as const;

export type ExecutionEventType = typeof EXECUTION_EVENT_TYPES[number];

type Actor = { userId: string; role: string; organizationId?: string | null };

export type ExecutionGps = {
    lat: number;
    lon: number;
    accuracyM?: number | null;
    capturedAt?: string | null;
};

export type ExecutionAttachment = string | Record<string, unknown>;

export type RecordExecutionEventInput = {
    tripId: string;
    routePointId?: string | null;
    orderId?: string | null;
    type: ExecutionEventType;
    reason?: string | null;
    notes?: string | null;
    gps?: ExecutionGps | null;
    attachments?: ExecutionAttachment[];
    occurredAt?: string | null;
    offlineCreatedAt?: string | null;
    externalId?: string | null;
    clientEventId?: string | null;
    source?: string | null;
    metadata?: Record<string, unknown>;
};

function assertOrg(entityOrgId: string | null | undefined, actor: Actor, name: string) {
    if (actor.organizationId && entityOrgId && actor.organizationId !== entityOrgId) {
        throw new Error(`${name} is outside current organization`);
    }
}

async function resolveOrderForTrip(tx: any, tripId: string, orderId: string, actor: Actor) {
    const [order] = await tx
        .select({ id: orders.id, tripId: orders.tripId, organizationId: orders.organizationId })
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);
    if (!order) throw new Error('Order not found');
    assertOrg(order.organizationId, actor, 'Order');

    const [link] = await tx
        .select({ id: tripOrders.id })
        .from(tripOrders)
        .where(and(eq(tripOrders.tripId, tripId), eq(tripOrders.orderId, orderId)))
        .limit(1);
    if (order.tripId !== tripId && !link) {
        throw new Error('Order is not linked to trip');
    }

    return order;
}

export async function recordExecutionEvent(input: RecordExecutionEventInput, actor: Actor) {
    return db.transaction(async (tx) => {
        const [trip] = await tx
            .select({ id: trips.id, organizationId: trips.organizationId })
            .from(trips)
            .where(eq(trips.id, input.tripId))
            .limit(1);
        if (!trip) throw new Error('Trip not found');
        assertOrg(trip.organizationId, actor, 'Trip');

        let resolvedOrderId = input.orderId ?? null;
        let routePoint: { id: string; tripId: string; orderId: string | null; lat: number | null; lon: number | null } | null = null;

        if (input.routePointId) {
            const [point] = await tx
                .select({
                    id: routePoints.id,
                    tripId: routePoints.tripId,
                    orderId: routePoints.orderId,
                    lat: routePoints.lat,
                    lon: routePoints.lon,
                })
                .from(routePoints)
                .where(eq(routePoints.id, input.routePointId))
                .limit(1);
            if (!point) throw new Error('Route point not found');
            if (point.tripId !== input.tripId) throw new Error('Route point is not linked to trip');
            if (resolvedOrderId && point.orderId && point.orderId !== resolvedOrderId) {
                throw new Error('Route point belongs to another order');
            }
            routePoint = point;
            resolvedOrderId = resolvedOrderId ?? point.orderId;
        }

        if (resolvedOrderId) {
            await resolveOrderForTrip(tx, input.tripId, resolvedOrderId, actor);
        }

        const externalId = input.externalId ?? input.clientEventId ?? undefined;
        const occurredAt = input.occurredAt ?? input.offlineCreatedAt ?? null;
        const eventTypeSuffix = input.type.replace(/-/g, '_');
        const data = {
            kind: 'execution_event',
            type: input.type,
            tripId: input.tripId,
            routePointId: input.routePointId ?? null,
            orderId: resolvedOrderId,
            reason: input.reason ?? null,
            notes: input.notes ?? null,
            gps: input.gps ?? null,
            plannedPointGps: routePoint ? { lat: routePoint.lat, lon: routePoint.lon } : null,
            attachments: input.attachments ?? [],
            source: input.source ?? 'mobile',
            occurredAt,
            receivedAt: new Date().toISOString(),
            sync: {
                clientEventId: input.clientEventId ?? null,
                offlineCreatedAt: input.offlineCreatedAt ?? null,
            },
            metadata: input.metadata ?? {},
        };

        const created = await recordEvent({
            authorId: actor.userId,
            authorRole: actor.role,
            eventType: `trip.execution.${eventTypeSuffix}`,
            entityType: 'trip',
            entityId: input.tripId,
            data,
            offlineCreatedAt: input.offlineCreatedAt ?? undefined,
            externalId,
        }, tx);

        if (created) return { event: created, duplicate: false };

        if (externalId) {
            const [existing] = await tx
                .select()
                .from(events)
                .where(eq(events.externalId, externalId))
                .limit(1);
            if (existing) return { event: existing, duplicate: true };
        }

        throw new Error('Execution event was not recorded');
    });
}
