import { and, eq, ne, sql } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import { claims, orders, routePoints, shipmentFacts, shipmentLots, tripLotAssignments, tripOrders, trips, vehicles } from '../../db/schema.js';
import { recordEvent } from '../../events/journal.js';
import { OrderStatus } from '@tms/shared';

type Actor = { userId: string; role: string; organizationId?: string | null };

function n(value: unknown): number | null {
    if (value === undefined || value === null || value === '') return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) throw new Error('Quantity must be a non-negative number');
    return parsed;
}

function assertOrg(entityOrgId: string | null | undefined, actor: Actor, name: string) {
    if (actor.organizationId && entityOrgId && actor.organizationId !== entityOrgId) {
        throw new Error(`${name} is outside current organization`);
    }
}

async function nextRoutePointSeq(tx: any, tripId: string) {
    const [row] = await tx.select({ value: sql<number>`coalesce(max(${routePoints.sequenceNumber}), 0)::int` }).from(routePoints).where(eq(routePoints.tripId, tripId));
    return (row?.value ?? 0) + 1;
}

export async function splitOrderIntoLots(orderId: string, input: { maxWeightKg?: number; lotCount?: number }, actor: Actor) {
    return db.transaction(async (tx) => {
        const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
        if (!order) throw new Error('Order not found');
        assertOrg(order.organizationId, actor, 'Order');

        const assigned = await tx.select({ id: tripLotAssignments.id }).from(tripLotAssignments)
            .innerJoin(shipmentLots, eq(shipmentLots.id, tripLotAssignments.shipmentLotId))
            .where(eq(shipmentLots.orderId, orderId)).limit(1);
        if (assigned.length) throw new Error('Order already has trip assignments; cannot replace lots');

        const maxWeightKg = input.maxWeightKg ? n(input.maxWeightKg) : null;
        const lotCount = input.lotCount ? Math.floor(Number(input.lotCount)) : null;
        if (!maxWeightKg && !lotCount) throw new Error('Either maxWeightKg or lotCount is required');

        await tx.delete(shipmentLots).where(eq(shipmentLots.orderId, orderId));

        const totalWeight = Number(order.cargoWeightKg ?? 0);
        const totalVolume = Number(order.cargoVolumeM3 ?? 0);
        const totalPlaces = Number(order.cargoPlaces ?? 0);
        const count = lotCount ?? Math.ceil(totalWeight / Number(maxWeightKg));
        if (!Number.isFinite(count) || count < 1) throw new Error('Cannot calculate lot count');

        const basePlaces = count > 0 ? Math.floor(totalPlaces / count) : 0;
        const baseVolume = count > 0 ? totalVolume / count : 0;
        const lots = Array.from({ length: count }, (_, index) => {
            const last = index === count - 1;
            const weight = maxWeightKg ? (last ? Math.max(totalWeight - Number(maxWeightKg) * index, 0) : Number(maxWeightKg)) : totalWeight / count;
            const volume = totalVolume > 0 ? (last ? Math.max(totalVolume - baseVolume * index, 0) : baseVolume) : null;
            const places = totalPlaces > 0 ? (last ? Math.max(totalPlaces - basePlaces * index, 0) : basePlaces) : null;
            return {
                organizationId: order.organizationId ?? actor.organizationId ?? null,
                orderId,
                sequence: index + 1,
                status: 'planned' as const,
                plannedWeightKg: weight,
                plannedVolumeM3: volume,
                plannedPlaces: places,
                remainingWeightKg: weight,
                remainingVolumeM3: volume,
                remainingPlaces: places,
                cargoDescription: order.cargoDescription,
                cargoType: order.cargoType,
                loadingAddress: order.loadingAddress,
                loadingDate: order.loadingDate,
                loadingWindowStart: order.loadingWindowStart,
                loadingWindowEnd: order.loadingWindowEnd,
                unloadingAddress: order.unloadingAddress,
                unloadingDate: order.unloadingDate,
                unloadingWindowStart: order.unloadingWindowStart,
                unloadingWindowEnd: order.unloadingWindowEnd,
                requirementsSnapshot: {
                    multiTierAllowed: order.multiTierAllowed,
                    maxTiers: order.maxTiers,
                    temperatureMin: order.temperatureMin,
                    temperatureMax: order.temperatureMax,
                    loadingType: order.loadingType,
                    hydraulicLiftRequired: order.hydraulicLiftRequired,
                    vehicleRequirements: order.vehicleRequirements,
                },
                createdBy: actor.userId,
            };
        }).filter((lot) => Number(lot.plannedWeightKg ?? 0) > 0 || Number(lot.plannedVolumeM3 ?? 0) > 0 || Number(lot.plannedPlaces ?? 0) > 0);

        const created = await tx.insert(shipmentLots).values(lots).returning();
        await recordEvent({ authorId: actor.userId, authorRole: actor.role, eventType: 'order.split_lots', entityType: 'order', entityId: orderId, data: { lotCount: created.length, maxWeightKg } }, tx);
        return created;
    });
}
export async function assignLotToTrip(tripId: string, input: { shipmentLotId: string; assignedWeightKg?: number; assignedVolumeM3?: number; assignedPlaces?: number; allowOverCapacity?: boolean }, actor: Actor) {
    return db.transaction(async (tx) => {
        const [trip] = await tx.select().from(trips).where(eq(trips.id, tripId)).limit(1);
        if (!trip) throw new Error('Trip not found');
        assertOrg(trip.organizationId, actor, 'Trip');

        const [lot] = await tx.select().from(shipmentLots).where(eq(shipmentLots.id, input.shipmentLotId)).limit(1);
        if (!lot) throw new Error('Shipment lot not found');
        assertOrg(lot.organizationId, actor, 'Shipment lot');

        const [order] = await tx.select().from(orders).where(eq(orders.id, lot.orderId)).limit(1);
        if (!order) throw new Error('Order not found');
        assertOrg(order.organizationId, actor, 'Order');

        const assignedWeightKg = n(input.assignedWeightKg) ?? lot.remainingWeightKg ?? lot.plannedWeightKg ?? null;
        const assignedVolumeM3 = n(input.assignedVolumeM3) ?? lot.remainingVolumeM3 ?? lot.plannedVolumeM3 ?? null;
        const assignedPlaces = n(input.assignedPlaces) ?? lot.remainingPlaces ?? lot.plannedPlaces ?? null;

        const [lotTotals] = await tx.select({ weight: sql<number>`coalesce(sum(${tripLotAssignments.assignedWeightKg}), 0)::float8` }).from(tripLotAssignments)
            .where(and(eq(tripLotAssignments.shipmentLotId, lot.id), ne(tripLotAssignments.status, 'cancelled')));
        if (Number(lotTotals?.weight ?? 0) + Number(assignedWeightKg ?? 0) > Number(lot.plannedWeightKg ?? 0)) {
            throw new Error('Assigned weight exceeds shipment lot planned weight');
        }

        const [vehicle] = trip.vehicleId ? await tx.select().from(vehicles).where(eq(vehicles.id, trip.vehicleId)).limit(1) : [null];
        const [tripTotals] = await tx.select({ weight: sql<number>`coalesce(sum(${tripLotAssignments.assignedWeightKg}), 0)::float8` }).from(tripLotAssignments)
            .where(and(eq(tripLotAssignments.tripId, tripId), ne(tripLotAssignments.status, 'cancelled')));
        const projectedWeight = Number(tripTotals?.weight ?? 0) + Number(assignedWeightKg ?? 0);
        if (!input.allowOverCapacity && vehicle?.payloadCapacityKg && projectedWeight > Number(vehicle.payloadCapacityKg)) {
            throw new Error(`Assigned weight exceeds vehicle capacity: ${projectedWeight} > ${vehicle.payloadCapacityKg}`);
        }

        const seq = await nextRoutePointSeq(tx, tripId);
        const [loadingPoint] = await tx.insert(routePoints).values({
            tripId,
            orderId: order.id,
            type: 'loading',
            status: 'pending',
            sequenceNumber: seq,
            address: lot.loadingAddress ?? order.loadingAddress,
            windowStart: lot.loadingWindowStart ?? order.loadingWindowStart,
            windowEnd: lot.loadingWindowEnd ?? order.loadingWindowEnd,
        }).returning();
        const [unloadingPoint] = await tx.insert(routePoints).values({
            tripId,
            orderId: order.id,
            type: 'unloading',
            status: 'pending',
            sequenceNumber: seq + 1,
            address: lot.unloadingAddress ?? order.unloadingAddress,
            windowStart: lot.unloadingWindowStart ?? order.unloadingWindowStart,
            windowEnd: lot.unloadingWindowEnd ?? order.unloadingWindowEnd,
        }).returning();

        const [assignment] = await tx.insert(tripLotAssignments).values({
            organizationId: trip.organizationId ?? lot.organizationId ?? order.organizationId ?? actor.organizationId ?? null,
            tripId,
            orderId: order.id,
            shipmentLotId: lot.id,
            assignedWeightKg,
            assignedVolumeM3,
            assignedPlaces,
            status: 'planned',
            loadingRoutePointId: loadingPoint.id,
            unloadingRoutePointId: unloadingPoint.id,
            createdBy: actor.userId,
        }).onConflictDoUpdate({
            target: [tripLotAssignments.tripId, tripLotAssignments.shipmentLotId],
            set: { assignedWeightKg, assignedVolumeM3, assignedPlaces, updatedAt: new Date() },
        }).returning();

        await tx.insert(tripOrders).values({ tripId, orderId: order.id }).onConflictDoNothing();
        await tx.update(shipmentLots).set({ status: 'assigned', updatedAt: new Date() }).where(eq(shipmentLots.id, lot.id));
        if (!order.tripId) {
            await tx.update(orders).set({ tripId, status: OrderStatus.ASSIGNED, updatedAt: new Date() }).where(eq(orders.id, order.id));
        } else if (order.status === OrderStatus.CONFIRMED) {
            await tx.update(orders).set({ status: OrderStatus.ASSIGNED, updatedAt: new Date() }).where(eq(orders.id, order.id));
        }

        await recordEvent({ authorId: actor.userId, authorRole: actor.role, eventType: 'shipment_lot.assigned_to_trip', entityType: 'shipment_lot', entityId: lot.id, data: { tripId, assignmentId: assignment.id, assignedWeightKg } }, tx);
        return { assignment, routePoints: [loadingPoint, unloadingPoint] };
    });
}

async function createClaimForDiscrepancy(tx: any, params: {
    tripId: string;
    orderId: string;
    factId: string;
    shipmentLotId: string;
    tripLotAssignmentId: string;
    discrepancyCode?: string | null;
    cargoCondition?: string | null;
    notes?: string | null;
    reserveAmount?: number | null;
    estimatedAmount?: number | null;
    evidence?: Record<string, unknown>;
    actor: Actor;
}) {
    if (!params.discrepancyCode && params.cargoCondition !== 'damaged') return null;

    const [order] = await tx.select({ contractorId: orders.contractorId, number: orders.number }).from(orders).where(eq(orders.id, params.orderId)).limit(1);
    if (!order?.contractorId) return null;

    const claimType = params.cargoCondition === 'damaged' || params.discrepancyCode === 'damage'
        ? 'damage'
        : ['shortage', 'refusal'].includes(params.discrepancyCode ?? '')
            ? 'loss'
            : 'other';

    const [existing] = await tx.select({ id: claims.id }).from(claims)
        .where(and(eq(claims.tripId, params.tripId), eq(claims.orderId, params.orderId), eq(claims.status, 'open')))
        .limit(1);
    if (existing) return existing;

    const [claim] = await tx.insert(claims).values({
        tripId: params.tripId,
        orderId: params.orderId,
        contractorId: order.contractorId,
        type: claimType,
        status: 'open',
        amount: params.estimatedAmount != null ? String(params.estimatedAmount) : null,
        description: params.notes || `Auto-created from shipment discrepancy. shipmentFactId=${params.factId}; shipmentLotId=${params.shipmentLotId}; assignmentId=${params.tripLotAssignmentId}; discrepancyCode=${params.discrepancyCode ?? ''}; cargoCondition=${params.cargoCondition ?? ''}; order=${order.number}`,
        attachments: [
            { kind: 'shipment_fact', id: params.factId },
            { kind: 'shipment_lot', id: params.shipmentLotId },
            { kind: 'trip_lot_assignment', id: params.tripLotAssignmentId },
            {
                kind: 'claim_evidence',
                reserveAmount: params.reserveAmount ?? null,
                estimatedAmount: params.estimatedAmount ?? null,
                ...(params.evidence ?? {}),
            },
        ],
        createdBy: params.actor.userId,
    }).returning();

    await recordEvent({
        authorId: params.actor.userId,
        authorRole: params.actor.role,
        eventType: 'claim_created',
        entityType: 'claim',
        entityId: claim.id,
        data: {
            source: 'shipment_fact',
            factId: params.factId,
            discrepancyCode: params.discrepancyCode,
            cargoCondition: params.cargoCondition,
            reserveAmount: params.reserveAmount ?? null,
            estimatedAmount: params.estimatedAmount ?? null,
        },
    }, tx);

    return claim;
}

async function recalcLot(tx: any, lotId: string) {
    const [lot] = await tx.select().from(shipmentLots).where(eq(shipmentLots.id, lotId)).limit(1);
    if (!lot) throw new Error('Shipment lot not found');

    const [totals] = await tx.select({
        loadedWeightKg: sql<number>`coalesce(sum(${shipmentFacts.weightKg}) filter (where ${shipmentFacts.factType} = 'loading'), 0)::float8`,
        loadedVolumeM3: sql<number>`coalesce(sum(${shipmentFacts.volumeM3}) filter (where ${shipmentFacts.factType} = 'loading'), 0)::float8`,
        loadedPlaces: sql<number>`coalesce(sum(${shipmentFacts.places}) filter (where ${shipmentFacts.factType} = 'loading'), 0)::int`,
        deliveredWeightKg: sql<number>`coalesce(sum(${shipmentFacts.weightKg}) filter (where ${shipmentFacts.factType} = 'unloading'), 0)::float8`,
        deliveredVolumeM3: sql<number>`coalesce(sum(${shipmentFacts.volumeM3}) filter (where ${shipmentFacts.factType} = 'unloading'), 0)::float8`,
        deliveredPlaces: sql<number>`coalesce(sum(${shipmentFacts.places}) filter (where ${shipmentFacts.factType} = 'unloading'), 0)::int`,
    }).from(shipmentFacts).where(eq(shipmentFacts.shipmentLotId, lotId));

    const plannedWeight = Number(lot.plannedWeightKg ?? 0);
    const plannedVolume = Number(lot.plannedVolumeM3 ?? 0);
    const plannedPlaces = Number(lot.plannedPlaces ?? 0);
    const deliveredWeight = Number(totals?.deliveredWeightKg ?? 0);
    const deliveredVolume = Number(totals?.deliveredVolumeM3 ?? 0);
    const deliveredPlaces = Number(totals?.deliveredPlaces ?? 0);
    const loadedWeight = Number(totals?.loadedWeightKg ?? 0);

    let status = lot.status;
    if (deliveredWeight > 0 || deliveredPlaces > 0) {
        status = (plannedWeight > 0 && deliveredWeight >= plannedWeight) || (plannedPlaces > 0 && deliveredPlaces >= plannedPlaces) ? 'delivered' : 'partially_delivered';
    } else if (loadedWeight > 0) {
        status = 'loading';
    }

    const [updated] = await tx.update(shipmentLots).set({
        status,
        loadedWeightKg: loadedWeight || null,
        loadedVolumeM3: Number(totals?.loadedVolumeM3 ?? 0) || null,
        loadedPlaces: Number(totals?.loadedPlaces ?? 0) || null,
        deliveredWeightKg: deliveredWeight || null,
        deliveredVolumeM3: deliveredVolume || null,
        deliveredPlaces: deliveredPlaces || null,
        remainingWeightKg: plannedWeight > 0 ? Math.max(plannedWeight - deliveredWeight, 0) : lot.remainingWeightKg,
        remainingVolumeM3: plannedVolume > 0 ? Math.max(plannedVolume - deliveredVolume, 0) : lot.remainingVolumeM3,
        remainingPlaces: plannedPlaces > 0 ? Math.max(plannedPlaces - deliveredPlaces, 0) : lot.remainingPlaces,
        updatedAt: new Date(),
    }).where(eq(shipmentLots.id, lotId)).returning();
    return updated;
}

export async function captureShipmentFact(tripId: string, input: {
    tripLotAssignmentId: string;
    routePointId?: string | null;
    factType: 'loading' | 'unloading' | 'return' | 'correction' | 'discrepancy';
    weightKg?: number | null;
    volumeM3?: number | null;
    places?: number | null;
    cargoCondition?: 'intact' | 'damaged' | 'partial' | null;
    discrepancyCode?: 'shortage' | 'overage' | 'damage' | 'refusal' | 'wrong_docs' | 'other' | null;
    notes?: string | null;
    attachments?: string[];
    photoUrls?: string[];
    signatureUrl?: string | null;
    actUrl?: string | null;
    palletCount?: number | null;
    reserveAmount?: number | null;
    estimatedAmount?: number | null;
    gpsLat?: number | null;
    gpsLon?: number | null;
    source?: string;
}, actor: Actor) {
    return db.transaction(async (tx) => {
        const [assignment] = await tx.select().from(tripLotAssignments)
            .where(and(eq(tripLotAssignments.id, input.tripLotAssignmentId), eq(tripLotAssignments.tripId, tripId))).limit(1);
        if (!assignment) throw new Error('Trip lot assignment not found');
        assertOrg(assignment.organizationId, actor, 'Trip lot assignment');

        const evidenceAttachments = [
            ...(input.attachments ?? []),
            ...(input.photoUrls ?? []).map((url) => `photo:${url}`),
            ...(input.signatureUrl ? [`signature:${input.signatureUrl}`] : []),
            ...(input.actUrl ? [`act:${input.actUrl}`] : []),
        ];

        const [fact] = await tx.insert(shipmentFacts).values({
            organizationId: assignment.organizationId ?? actor.organizationId ?? null,
            tripId,
            orderId: assignment.orderId,
            shipmentLotId: assignment.shipmentLotId,
            tripLotAssignmentId: assignment.id,
            routePointId: input.routePointId ?? null,
            factType: input.factType,
            weightKg: n(input.weightKg),
            volumeM3: n(input.volumeM3),
            places: n(input.places),
            cargoCondition: input.cargoCondition ?? null,
            discrepancyCode: input.discrepancyCode ?? null,
            notes: input.notes ?? null,
            attachments: evidenceAttachments,
            gpsLat: input.gpsLat ?? null,
            gpsLon: input.gpsLon ?? null,
            capturedBy: actor.userId,
            source: input.source ?? 'web',
        }).returning();

        let status = assignment.status;
        if (input.factType === 'loading') status = 'loaded';
        if (input.factType === 'unloading') status = input.discrepancyCode || input.cargoCondition === 'damaged' ? (input.cargoCondition === 'damaged' ? 'damaged' : 'short') : 'delivered';
        if (input.factType === 'return') status = 'returned';
        if (input.factType === 'discrepancy') status = input.cargoCondition === 'damaged' ? 'damaged' : 'short';

        await tx.update(tripLotAssignments).set({ status, updatedAt: new Date() }).where(eq(tripLotAssignments.id, assignment.id));
        const lot = await recalcLot(tx, assignment.shipmentLotId);
        const evidence = {
            attachmentCount: evidenceAttachments.length,
            photoUrls: input.photoUrls ?? [],
            signatureUrl: input.signatureUrl ?? null,
            actUrl: input.actUrl ?? null,
            palletCount: input.palletCount ?? null,
            gps: input.gpsLat != null && input.gpsLon != null ? { lat: input.gpsLat, lon: input.gpsLon } : null,
        };
        const claim = await createClaimForDiscrepancy(tx, {
            tripId,
            orderId: assignment.orderId,
            factId: fact.id,
            shipmentLotId: assignment.shipmentLotId,
            tripLotAssignmentId: assignment.id,
            discrepancyCode: input.discrepancyCode,
            cargoCondition: input.cargoCondition,
            notes: input.notes,
            reserveAmount: n(input.reserveAmount),
            estimatedAmount: n(input.estimatedAmount),
            evidence,
            actor,
        });
        await recordEvent({
            authorId: actor.userId,
            authorRole: actor.role,
            eventType: `shipment_fact.${input.factType}`,
            entityType: 'shipment_fact',
            entityId: fact.id,
            data: {
                tripId,
                orderId: assignment.orderId,
                shipmentLotId: assignment.shipmentLotId,
                assignmentId: assignment.id,
                evidence,
                reserveAmount: input.reserveAmount ?? null,
                estimatedAmount: input.estimatedAmount ?? null,
            },
        }, tx);
        return { fact, assignment: { ...assignment, status }, lot, claim };
    });
}
