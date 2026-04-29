import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import {
    orders,
    routePoints,
    shipmentFacts,
    shipmentLots,
    tripLotAssignments,
    trips,
    vehicles,
} from '../../db/schema.js';

function sumNumber<T>(items: T[], selector: (item: T) => unknown): number {
    return items.reduce((sum, item) => {
        const value = selector(item);
        return sum + (typeof value === 'number' ? value : Number(value ?? 0));
    }, 0);
}

function maybeOrgCondition<T extends { organizationId: any }>(table: T, organizationId?: string | null) {
    return organizationId ? eq(table.organizationId, organizationId) : undefined;
}

export async function getOrderFulfillment(orderId: string, organizationId?: string | null) {
    const conditions = [eq(orders.id, orderId)];
    if (organizationId) conditions.push(eq(orders.organizationId, organizationId));

    const [order] = await db.select().from(orders).where(and(...conditions)).limit(1);
    if (!order) return null;

    const lots = await db
        .select()
        .from(shipmentLots)
        .where(and(eq(shipmentLots.orderId, orderId), maybeOrgCondition(shipmentLots, organizationId)))
        .orderBy(shipmentLots.sequence, shipmentLots.createdAt);

    const assignments = await db
        .select({
            id: tripLotAssignments.id,
            organizationId: tripLotAssignments.organizationId,
            tripId: tripLotAssignments.tripId,
            tripNumber: trips.number,
            shipmentLotId: tripLotAssignments.shipmentLotId,
            orderId: tripLotAssignments.orderId,
            assignedWeightKg: tripLotAssignments.assignedWeightKg,
            assignedVolumeM3: tripLotAssignments.assignedVolumeM3,
            assignedPlaces: tripLotAssignments.assignedPlaces,
            status: tripLotAssignments.status,
            loadingRoutePointId: tripLotAssignments.loadingRoutePointId,
            unloadingRoutePointId: tripLotAssignments.unloadingRoutePointId,
            createdAt: tripLotAssignments.createdAt,
            updatedAt: tripLotAssignments.updatedAt,
        })
        .from(tripLotAssignments)
        .leftJoin(trips, eq(trips.id, tripLotAssignments.tripId))
        .where(and(eq(tripLotAssignments.orderId, orderId), maybeOrgCondition(tripLotAssignments, organizationId)))
        .orderBy(tripLotAssignments.createdAt);

    const facts = await db
        .select()
        .from(shipmentFacts)
        .where(and(eq(shipmentFacts.orderId, orderId), maybeOrgCondition(shipmentFacts, organizationId)))
        .orderBy(shipmentFacts.capturedAt);

    const assignmentsByLot = new Map<string, typeof assignments>();
    for (const assignment of assignments) {
        const current = assignmentsByLot.get(assignment.shipmentLotId) ?? [];
        current.push(assignment);
        assignmentsByLot.set(assignment.shipmentLotId, current);
    }

    const factsByLot = new Map<string, typeof facts>();
    for (const fact of facts) {
        const current = factsByLot.get(fact.shipmentLotId) ?? [];
        current.push(fact);
        factsByLot.set(fact.shipmentLotId, current);
    }

    return {
        order: {
            id: order.id,
            number: order.number,
            status: order.status,
            cargoWeightKg: order.cargoWeightKg,
            cargoVolumeM3: order.cargoVolumeM3,
            cargoPlaces: order.cargoPlaces,
        },
        totals: {
            plannedWeightKg: sumNumber(lots, lot => lot.plannedWeightKg),
            assignedWeightKg: sumNumber(assignments, assignment => assignment.assignedWeightKg),
            loadedWeightKg: sumNumber(lots, lot => lot.loadedWeightKg),
            deliveredWeightKg: sumNumber(lots, lot => lot.deliveredWeightKg),
            remainingWeightKg: sumNumber(lots, lot => lot.remainingWeightKg),
            plannedPlaces: sumNumber(lots, lot => lot.plannedPlaces),
            assignedPlaces: sumNumber(assignments, assignment => assignment.assignedPlaces),
            deliveredPlaces: sumNumber(lots, lot => lot.deliveredPlaces),
            remainingPlaces: sumNumber(lots, lot => lot.remainingPlaces),
        },
        lots: lots.map(lot => ({
            ...lot,
            assignments: assignmentsByLot.get(lot.id) ?? [],
            facts: factsByLot.get(lot.id) ?? [],
        })),
    };
}

export async function getTripLoadPlan(tripId: string, organizationId?: string | null) {
    const tripConditions = [eq(trips.id, tripId)];
    if (organizationId) tripConditions.push(eq(trips.organizationId, organizationId));

    const [trip] = await db
        .select({
            id: trips.id,
            number: trips.number,
            status: trips.status,
            vehicleId: trips.vehicleId,
            vehiclePlateNumber: vehicles.plateNumber,
            vehiclePayloadCapacityKg: vehicles.payloadCapacityKg,
            vehiclePayloadVolumeM3: vehicles.payloadVolumeM3,
        })
        .from(trips)
        .leftJoin(vehicles, eq(vehicles.id, trips.vehicleId))
        .where(and(...tripConditions))
        .limit(1);

    if (!trip) return null;

    const assignments = await db
        .select({
            id: tripLotAssignments.id,
            status: tripLotAssignments.status,
            assignedWeightKg: tripLotAssignments.assignedWeightKg,
            assignedVolumeM3: tripLotAssignments.assignedVolumeM3,
            assignedPlaces: tripLotAssignments.assignedPlaces,
            orderId: tripLotAssignments.orderId,
            orderNumber: orders.number,
            shipmentLotId: tripLotAssignments.shipmentLotId,
            lotSequence: shipmentLots.sequence,
            lotStatus: shipmentLots.status,
            cargoDescription: sql<string>`coalesce(${shipmentLots.cargoDescription}, ${orders.cargoDescription})`,
            cargoType: sql<string | null>`coalesce(${shipmentLots.cargoType}, ${orders.cargoType})`,
            plannedWeightKg: shipmentLots.plannedWeightKg,
            remainingWeightKg: shipmentLots.remainingWeightKg,
            loadingRoutePointId: tripLotAssignments.loadingRoutePointId,
            unloadingRoutePointId: tripLotAssignments.unloadingRoutePointId,
        })
        .from(tripLotAssignments)
        .innerJoin(shipmentLots, eq(shipmentLots.id, tripLotAssignments.shipmentLotId))
        .innerJoin(orders, eq(orders.id, tripLotAssignments.orderId))
        .where(and(eq(tripLotAssignments.tripId, tripId), maybeOrgCondition(tripLotAssignments, organizationId)))
        .orderBy(orders.number, shipmentLots.sequence);

    const points = await db
        .select()
        .from(routePoints)
        .where(eq(routePoints.tripId, tripId))
        .orderBy(routePoints.sequenceNumber);

    const totalAssignedWeightKg = sumNumber(assignments, assignment => assignment.assignedWeightKg);
    const totalAssignedVolumeM3 = sumNumber(assignments, assignment => assignment.assignedVolumeM3);
    const capacityKg = trip.vehiclePayloadCapacityKg ?? null;
    const capacityVolumeM3 = trip.vehiclePayloadVolumeM3 ?? null;

    return {
        trip,
        summary: {
            assignmentCount: assignments.length,
            totalAssignedWeightKg,
            totalAssignedVolumeM3,
            payloadCapacityKg: capacityKg,
            payloadVolumeM3: capacityVolumeM3,
            overweight: capacityKg !== null && totalAssignedWeightKg > capacityKg,
            overVolume: capacityVolumeM3 !== null && totalAssignedVolumeM3 > capacityVolumeM3,
        },
        assignments,
        routePoints: points,
    };
}
