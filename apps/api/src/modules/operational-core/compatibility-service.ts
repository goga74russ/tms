import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import { orders, shipmentLots, tripLotAssignments, trips, vehicles } from '../../db/schema.js';

export type CompatibilityStatus = 'ok' | 'warning' | 'blocking';

export interface CompatibilityCheck {
    code: string;
    status: CompatibilityStatus;
    message: string;
    details?: Record<string, unknown>;
}

function maybeOrgCondition<T extends { organizationId: any }>(table: T, organizationId?: string | null) {
    return organizationId ? eq(table.organizationId, organizationId) : undefined;
}

function toNumber(value: unknown): number | null {
    if (value === undefined || value === null || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function sumNumber<T>(items: T[], selector: (item: T) => unknown): number {
    return items.reduce((sum, item) => sum + (toNumber(selector(item)) ?? 0), 0);
}

function worstStatus(statuses: CompatibilityStatus[]): CompatibilityStatus {
    if (statuses.includes('blocking')) return 'blocking';
    if (statuses.includes('warning')) return 'warning';
    return 'ok';
}

function compactText(value?: string | null) {
    const text = String(value ?? '').trim();
    return text.length > 0 ? text : null;
}

function normalizeText(value?: string | null) {
    return compactText(value)?.toLowerCase().replace(/\s+/g, ' ') ?? '';
}

function hasMeaningfulRequirementSnapshot(snapshot: Record<string, unknown> | null | undefined) {
    if (!snapshot) return false;
    return Object.values(snapshot).some((value) => {
        if (value === undefined || value === null || value === false) return false;
        if (typeof value === 'string') return value.trim().length > 0;
        if (typeof value === 'number') return Number.isFinite(value) && value !== 0;
        return true;
    });
}

function snapshotNumber(snapshot: Record<string, unknown> | null | undefined, key: string) {
    return toNumber(snapshot?.[key]);
}

function requiresRefrigeration(temperatureMin: number | null, temperatureMax: number | null, cargoType?: string | null, requirements?: string | null) {
    const cargo = normalizeText(cargoType);
    const req = normalizeText(requirements);
    return temperatureMin !== null
        || temperatureMax !== null
        || ['refriger', 'reefer', 'cool', 'cold', 'frozen', 'chilled', 'ref', 'реф', 'холод', 'мороз', 'температур'].some(token => cargo.includes(token) || req.includes(token));
}

function vehicleLooksRefrigerated(bodyType?: string | null) {
    const body = normalizeText(bodyType);
    return ['refriger', 'reefer', 'ref', 'реф', 'холод'].some(token => body.includes(token));
}

function bodyTypeMatchesRequirement(bodyType?: string | null, requirement?: string | null) {
    const body = normalizeText(bodyType);
    const req = normalizeText(requirement);
    if (!req) return true;
    if (!body) return false;

    const bodyAliases: string[][] = [
        ['tent', 'тент'],
        ['van', 'box', 'фургон'],
        ['flatbed', 'борт', 'platform', 'платформ'],
        ['refriger', 'reefer', 'ref', 'реф', 'холод'],
    ];

    for (const aliases of bodyAliases) {
        const requested = aliases.some(alias => req.includes(alias));
        const actual = aliases.some(alias => body.includes(alias));
        if (requested && !actual) return false;
    }

    return true;
}

export async function getTripCompatibility(tripId: string, organizationId?: string | null) {
    const tripConditions = [eq(trips.id, tripId)];
    if (organizationId) tripConditions.push(eq(trips.organizationId, organizationId));

    const [trip] = await db
        .select({
            id: trips.id,
            number: trips.number,
            status: trips.status,
            vehicleId: trips.vehicleId,
            vehiclePlateNumber: vehicles.plateNumber,
            vehicleBodyType: vehicles.bodyType,
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
            assignmentId: tripLotAssignments.id,
            assignmentStatus: tripLotAssignments.status,
            assignedWeightKg: tripLotAssignments.assignedWeightKg,
            assignedVolumeM3: tripLotAssignments.assignedVolumeM3,
            assignedPlaces: tripLotAssignments.assignedPlaces,
            orderId: tripLotAssignments.orderId,
            orderNumber: orders.number,
            shipmentLotId: tripLotAssignments.shipmentLotId,
            lotSequence: shipmentLots.sequence,
            cargoDescription: sql<string>`coalesce(${shipmentLots.cargoDescription}, ${orders.cargoDescription})`,
            cargoType: sql<string | null>`coalesce(${shipmentLots.cargoType}, ${orders.cargoType})`,
            plannedWeightKg: shipmentLots.plannedWeightKg,
            plannedVolumeM3: shipmentLots.plannedVolumeM3,
            plannedPlaces: shipmentLots.plannedPlaces,
            orderVehicleRequirements: orders.vehicleRequirements,
            orderTemperatureMin: orders.temperatureMin,
            orderTemperatureMax: orders.temperatureMax,
            requirementsSnapshot: shipmentLots.requirementsSnapshot,
        })
        .from(tripLotAssignments)
        .innerJoin(shipmentLots, eq(shipmentLots.id, tripLotAssignments.shipmentLotId))
        .innerJoin(orders, eq(orders.id, tripLotAssignments.orderId))
        .where(and(eq(tripLotAssignments.tripId, tripId), maybeOrgCondition(tripLotAssignments, organizationId)))
        .orderBy(orders.number, shipmentLots.sequence);

    const totalAssignedWeightKg = sumNumber(assignments, assignment => assignment.assignedWeightKg);
    const totalAssignedVolumeM3 = sumNumber(assignments, assignment => assignment.assignedVolumeM3);
    const totalAssignedPlaces = sumNumber(assignments, assignment => assignment.assignedPlaces);
    const payloadCapacityKg = toNumber(trip.vehiclePayloadCapacityKg);
    const payloadVolumeM3 = toNumber(trip.vehiclePayloadVolumeM3);
    const hasAssignedVolume = assignments.some(assignment => toNumber(assignment.assignedVolumeM3) !== null);
    const checks: CompatibilityCheck[] = [];

    checks.push(trip.vehicleId ? {
        code: 'vehicle_assignment',
        status: 'ok',
        message: 'Vehicle is assigned to the trip.',
        details: {
            vehicleId: trip.vehicleId,
            plateNumber: trip.vehiclePlateNumber,
            bodyType: trip.vehicleBodyType,
        },
    } : {
        code: 'vehicle_assignment',
        status: 'warning',
        message: 'No vehicle assigned to the trip; compatibility is limited to cargo snapshots.',
    });

    checks.push({
        code: 'payload',
        status: payloadCapacityKg !== null && totalAssignedWeightKg > payloadCapacityKg ? 'blocking' : payloadCapacityKg === null ? 'warning' : 'ok',
        message: payloadCapacityKg === null
            ? 'Vehicle payload capacity is not available.'
            : totalAssignedWeightKg > payloadCapacityKg
                ? `Assigned weight ${totalAssignedWeightKg} kg exceeds payload capacity ${payloadCapacityKg} kg.`
                : `Assigned weight ${totalAssignedWeightKg} kg is within payload capacity ${payloadCapacityKg} kg.`,
        details: { totalAssignedWeightKg, payloadCapacityKg },
    });

    checks.push({
        code: 'volume',
        status: !hasAssignedVolume
            ? 'ok'
            : payloadVolumeM3 === null
                ? 'warning'
                : totalAssignedVolumeM3 > payloadVolumeM3 ? 'blocking' : 'ok',
        message: !hasAssignedVolume
            ? 'Assigned volume is not available; volume check was skipped.'
            : payloadVolumeM3 === null
                ? 'Vehicle payload volume is not available.'
                : totalAssignedVolumeM3 > payloadVolumeM3
                    ? `Assigned volume ${totalAssignedVolumeM3} m3 exceeds payload volume ${payloadVolumeM3} m3.`
                    : `Assigned volume ${totalAssignedVolumeM3} m3 is within payload volume ${payloadVolumeM3} m3.`,
        details: { totalAssignedVolumeM3, payloadVolumeM3, available: hasAssignedVolume && payloadVolumeM3 !== null },
    });

    const assignmentResults = assignments.map((assignment) => {
        const snapshot = assignment.requirementsSnapshot ?? {};
        const requirementText = compactText(String(snapshot.vehicleRequirements ?? assignment.orderVehicleRequirements ?? ''));
        const temperatureMin = snapshotNumber(snapshot, 'temperatureMin') ?? toNumber(assignment.orderTemperatureMin);
        const temperatureMax = snapshotNumber(snapshot, 'temperatureMax') ?? toNumber(assignment.orderTemperatureMax);
        const assignmentChecks: CompatibilityCheck[] = [];

        assignmentChecks.push({
            code: 'cargo_requirements_snapshot',
            status: 'ok',
            message: hasMeaningfulRequirementSnapshot(snapshot) || requirementText
                ? 'Cargo requirements snapshot is available for dispatcher review.'
                : 'No cargo-specific vehicle requirements were captured.',
            details: {
                requirementsSnapshot: snapshot,
                vehicleRequirements: requirementText,
            },
        });

        const bodyCompatible = bodyTypeMatchesRequirement(trip.vehicleBodyType, requirementText);
        assignmentChecks.push({
            code: 'body_type',
            status: !trip.vehicleId || !requirementText ? 'ok' : bodyCompatible ? 'ok' : 'warning',
            message: !requirementText
                ? 'No explicit body type requirement was captured.'
                : !trip.vehicleId
                    ? 'No vehicle assigned; body type requirement cannot be checked.'
                    : bodyCompatible
                        ? 'Vehicle body type matches the captured requirement markers.'
                        : 'Vehicle body type may not match captured cargo requirements.',
            details: {
                vehicleBodyType: trip.vehicleBodyType,
                vehicleRequirements: requirementText,
            },
        });

        const refrigeratedNeeded = requiresRefrigeration(temperatureMin, temperatureMax, assignment.cargoType, requirementText);
        const refrigeratedVehicle = vehicleLooksRefrigerated(trip.vehicleBodyType);
        assignmentChecks.push({
            code: 'temperature',
            status: !refrigeratedNeeded || refrigeratedVehicle ? 'ok' : 'warning',
            message: !refrigeratedNeeded
                ? 'No temperature control requirement was detected.'
                : refrigeratedVehicle
                    ? 'Temperature-sensitive cargo has a refrigerated body marker.'
                    : 'Temperature-sensitive cargo is assigned to a vehicle without a refrigerated body marker.',
            details: {
                temperatureMin,
                temperatureMax,
                cargoType: assignment.cargoType,
                vehicleBodyType: trip.vehicleBodyType,
            },
        });

        return {
            assignmentId: assignment.assignmentId,
            shipmentLotId: assignment.shipmentLotId,
            orderId: assignment.orderId,
            orderNumber: assignment.orderNumber,
            lotSequence: assignment.lotSequence,
            cargoDescription: assignment.cargoDescription,
            cargoType: assignment.cargoType,
            assignedWeightKg: assignment.assignedWeightKg,
            assignedVolumeM3: assignment.assignedVolumeM3,
            assignedPlaces: assignment.assignedPlaces,
            plannedWeightKg: assignment.plannedWeightKg,
            plannedVolumeM3: assignment.plannedVolumeM3,
            plannedPlaces: assignment.plannedPlaces,
            requirementsSnapshot: snapshot,
            checks: assignmentChecks,
            status: worstStatus(assignmentChecks.map(check => check.status)),
        };
    });

    const requirementStatuses = assignmentResults.flatMap(assignment => assignment.checks.map(check => check.status));
    checks.push({
        code: 'cargo_requirements',
        status: worstStatus(requirementStatuses),
        message: assignmentResults.length > 0
            ? 'Cargo requirement checks were calculated for assigned lots.'
            : 'No assigned lots are present on the trip.',
        details: { assignmentCount: assignmentResults.length },
    });

    return {
        trip: {
            id: trip.id,
            number: trip.number,
            status: trip.status,
            vehicleId: trip.vehicleId,
            vehicle: trip.vehicleId ? {
                id: trip.vehicleId,
                plateNumber: trip.vehiclePlateNumber,
                bodyType: trip.vehicleBodyType,
                payloadCapacityKg,
                payloadVolumeM3,
            } : null,
        },
        status: worstStatus(checks.map(check => check.status)),
        summary: {
            assignmentCount: assignmentResults.length,
            totalAssignedWeightKg,
            totalAssignedVolumeM3,
            totalAssignedPlaces,
            payloadCapacityKg,
            payloadVolumeM3,
        },
        checks,
        assignments: assignmentResults,
    };
}
