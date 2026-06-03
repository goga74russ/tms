// ============================================================
// Entity Access Guards - centralized ownership and org checks
// Prevents IDOR and cross-org access on entity-level routes.
// ============================================================
import { and, eq } from 'drizzle-orm';
import { db } from '../db/connection.js';
import {
    drivers,
    incidents,
    orders,
    trailers,
    trips,
    tripOrders,
    users,
    vehicles,
    waybills,
} from '../db/schema.js';

type GuardUser = {
    userId: string;
    roles: string[];
    organizationId?: string | null;
};

const STAFF_ROLES = new Set([
    'admin',
    'logist',
    'dispatcher',
    'manager',
    'accountant',
    'repair_service',
    'medic',
    'mechanic',
]);

function hasStaffAccess(user: GuardUser) {
    return user.roles.some((role) => STAFF_ROLES.has(role));
}

function assertOrganizationScope(
    organizationIds: Array<string | null | undefined>,
    user: GuardUser,
) {
    // C3 (механизм «б», корень): org-less актор раньше ПРОХОДИЛ scope-проверку
    // (`return`) — а платформенного super-admin в системе НЕТ (APP_ROLES), значит
    // org-less = мисконфиг/недо-онбординг и НЕ должен видеть tenant-данные. DENY.
    if (!user.organizationId) {
        throw new AccessDeniedError('Учётная запись не привязана к организации');
    }

    const knownOrganizationIds = Array.from(
        new Set(
            organizationIds.filter(
                (organizationId): organizationId is string => Boolean(organizationId),
            ),
        ),
    );

    if (knownOrganizationIds.length === 0) return;

    const hasForeignOrganization = knownOrganizationIds.some(
        (organizationId) => organizationId !== user.organizationId,
    );

    if (hasForeignOrganization) {
        throw new AccessDeniedError('Доступ к данным другой организации запрещен');
    }
}

async function getTripAccessSnapshot(tripId: string) {
    const [trip] = await db
        .select({
            organizationId: trips.organizationId,
            driverId: trips.driverId,
            vehicleId: trips.vehicleId,
            trailerId: trips.trailerId,
        })
        .from(trips)
        .where(eq(trips.id, tripId))
        .limit(1);

    if (!trip) return null;

    const organizationIds: Array<string | null | undefined> = [trip.organizationId];

    if (trip.vehicleId) {
        const [vehicle] = await db
            .select({ organizationId: vehicles.organizationId })
            .from(vehicles)
            .where(eq(vehicles.id, trip.vehicleId))
            .limit(1);
        organizationIds.push(vehicle?.organizationId);
    }

    if (trip.driverId) {
        const [driver] = await db
            .select({ organizationId: drivers.organizationId })
            .from(drivers)
            .where(eq(drivers.id, trip.driverId))
            .limit(1);
        organizationIds.push(driver?.organizationId);
    }

    if (trip.trailerId) {
        const [trailer] = await db
            .select({ organizationId: trailers.organizationId })
            .from(trailers)
            .where(eq(trailers.id, trip.trailerId))
            .limit(1);
        organizationIds.push(trailer?.organizationId);
    }

    const normalizedOrders = await db
        .select({ organizationId: orders.organizationId, contractorId: orders.contractorId })
        .from(tripOrders)
        .innerJoin(orders, eq(tripOrders.orderId, orders.id))
        .where(eq(tripOrders.tripId, tripId));

    const legacyOrders = await db
        .select({ organizationId: orders.organizationId, contractorId: orders.contractorId })
        .from(orders)
        .where(eq(orders.tripId, tripId));

    for (const order of [...normalizedOrders, ...legacyOrders]) {
        organizationIds.push(order.organizationId);
    }

    return {
        driverId: trip.driverId,
        contractorIds: Array.from(
            new Set(
                [...normalizedOrders, ...legacyOrders]
                    .map((order) => order.contractorId)
                    .filter((contractorId): contractorId is string => Boolean(contractorId)),
            ),
        ),
        organizationIds,
    };
}

async function getWaybillAccessSnapshot(waybillId: string) {
    const [waybill] = await db
        .select({
            driverId: waybills.driverId,
            vehicleId: waybills.vehicleId,
            tripId: waybills.tripId,
        })
        .from(waybills)
        .where(eq(waybills.id, waybillId))
        .limit(1);

    if (!waybill) return null;

    const organizationIds: Array<string | null | undefined> = [];

    if (waybill.vehicleId) {
        const [vehicle] = await db
            .select({ organizationId: vehicles.organizationId })
            .from(vehicles)
            .where(eq(vehicles.id, waybill.vehicleId))
            .limit(1);
        organizationIds.push(vehicle?.organizationId);
    }

    if (waybill.tripId) {
        const tripSnapshot = await getTripAccessSnapshot(waybill.tripId);
        organizationIds.push(...(tripSnapshot?.organizationIds ?? []));
    }

    return {
        driverId: waybill.driverId,
        tripId: waybill.tripId,
        organizationIds,
    };
}

async function getIncidentAccessSnapshot(incidentId: string) {
    const [incident] = await db
        .select({
            driverId: incidents.driverId,
            vehicleId: incidents.vehicleId,
            tripId: incidents.tripId,
            organizationId: incidents.organizationId,
        })
        .from(incidents)
        .where(eq(incidents.id, incidentId))
        .limit(1);

    if (!incident) return null;

    // C3 «в» (миг.0042): прямой org инцидента — авторитетный скоуп. Раньше org
    // выводился ТОЛЬКО из FK (vehicle/driver/trip), и при всех null-FK снапшот
    // был пуст → assertOrganizationScope пропускал (NULL-FK leak).
    const organizationIds: Array<string | null | undefined> = [incident.organizationId];

    if (incident.vehicleId) {
        const [vehicle] = await db
            .select({ organizationId: vehicles.organizationId })
            .from(vehicles)
            .where(eq(vehicles.id, incident.vehicleId))
            .limit(1);
        organizationIds.push(vehicle?.organizationId);
    }

    if (incident.driverId) {
        const [driver] = await db
            .select({ organizationId: drivers.organizationId })
            .from(drivers)
            .where(eq(drivers.id, incident.driverId))
            .limit(1);
        organizationIds.push(driver?.organizationId);
    }

    if (incident.tripId) {
        const tripSnapshot = await getTripAccessSnapshot(incident.tripId);
        organizationIds.push(...(tripSnapshot?.organizationIds ?? []));
    }

    return {
        driverId: incident.driverId,
        organizationIds,
    };
}

/**
 * Resolves the contractorId for a user (for client role RLS).
 */
export async function resolveContractorId(userId: string): Promise<string | null> {
    const [user] = await db
        .select({ contractorId: users.contractorId })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
    return user?.contractorId ?? null;
}

/**
 * Resolves the driverId for a user (for driver role RLS).
 */
export async function resolveDriverId(userId: string): Promise<string | null> {
    const [driver] = await db
        .select({ id: drivers.id })
        .from(drivers)
        .where(eq(drivers.userId, userId))
        .limit(1);
    return driver?.id ?? null;
}

export async function assertVehicleAccess(vehicleId: string, user: GuardUser): Promise<void> {
    const [vehicle] = await db
        .select({ organizationId: vehicles.organizationId })
        .from(vehicles)
        .where(eq(vehicles.id, vehicleId))
        .limit(1);

    if (!vehicle) throw new EntityNotFoundError('Транспортное средство не найдено');

    assertOrganizationScope([vehicle.organizationId], user);

    if (hasStaffAccess(user)) return;

    throw new AccessDeniedError('Нет доступа');
}

export async function assertDriverAccess(driverId: string, user: GuardUser): Promise<void> {
    const [driver] = await db
        .select({ organizationId: drivers.organizationId, userId: drivers.userId })
        .from(drivers)
        .where(eq(drivers.id, driverId))
        .limit(1);

    if (!driver) throw new EntityNotFoundError('Водитель не найден');

    assertOrganizationScope([driver.organizationId], user);

    if (hasStaffAccess(user)) return;

    if (user.roles.includes('driver') && driver.userId === user.userId) return;

    throw new AccessDeniedError('Нет доступа');
}

export async function assertTrailerAccess(trailerId: string, user: GuardUser): Promise<void> {
    const [trailer] = await db
        .select({ organizationId: trailers.organizationId })
        .from(trailers)
        .where(eq(trailers.id, trailerId))
        .limit(1);

    if (!trailer) throw new EntityNotFoundError('Прицеп не найден');

    assertOrganizationScope([trailer.organizationId], user);

    if (hasStaffAccess(user)) return;

    throw new AccessDeniedError('Нет доступа');
}

/**
 * Checks if a user has access to a specific order.
 * - Staff roles: access limited by organization scope when present
 * - Client: only orders belonging to their contractor
 * - Driver: only orders linked to their assigned trips
 */
export async function assertOrderAccess(orderId: string, user: GuardUser): Promise<void> {
    const [order] = await db
        .select({
            contractorId: orders.contractorId,
            tripId: orders.tripId,
            organizationId: orders.organizationId,
        })
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);

    if (!order) throw new EntityNotFoundError('Заявка не найдена');

    assertOrganizationScope([order.organizationId], user);

    if (hasStaffAccess(user)) return;

    if (user.roles.includes('client')) {
        const myContractorId = await resolveContractorId(user.userId);
        if (!myContractorId || order.contractorId !== myContractorId) {
            throw new AccessDeniedError('Нет доступа к этой заявке');
        }
        return;
    }

    if (user.roles.includes('driver')) {
        const myDriverId = await resolveDriverId(user.userId);
        if (!myDriverId || !order.tripId) {
            throw new AccessDeniedError('Нет доступа к этой заявке');
        }
        const tripSnapshot = await getTripAccessSnapshot(order.tripId);
        if (!tripSnapshot || tripSnapshot.driverId !== myDriverId) {
            throw new AccessDeniedError('Нет доступа к этой заявке');
        }
        return;
    }

    throw new AccessDeniedError('Нет доступа');
}

/**
 * Checks if a user has access to a specific trip.
 * - Staff roles: access limited by organization scope when present
 * - Driver: only their assigned trips
 * - Client: only trips linked to their orders
 */
export async function assertTripAccess(tripId: string, user: GuardUser): Promise<void> {
    const tripSnapshot = await getTripAccessSnapshot(tripId);

    if (!tripSnapshot) throw new EntityNotFoundError('Рейс не найден');

    assertOrganizationScope(tripSnapshot.organizationIds, user);

    if (hasStaffAccess(user)) return;

    if (user.roles.includes('driver')) {
        const myDriverId = await resolveDriverId(user.userId);
        if (!myDriverId || tripSnapshot.driverId !== myDriverId) {
            throw new AccessDeniedError('Нет доступа к этому рейсу');
        }
        return;
    }

    if (user.roles.includes('client')) {
        const myContractorId = await resolveContractorId(user.userId);
        if (!myContractorId || !tripSnapshot.contractorIds.includes(myContractorId)) {
            throw new AccessDeniedError('Нет доступа к этому рейсу');
        }
        return;
    }

    throw new AccessDeniedError('Нет доступа');
}

/**
 * Checks if a user has access to a specific waybill.
 * - Staff roles: access limited by organization scope when present
 * - Driver: only their own waybills
 */
export async function assertWaybillAccess(waybillId: string, user: GuardUser): Promise<void> {
    const waybillSnapshot = await getWaybillAccessSnapshot(waybillId);

    if (!waybillSnapshot) throw new EntityNotFoundError('Путевой лист не найден');

    assertOrganizationScope(waybillSnapshot.organizationIds, user);

    if (hasStaffAccess(user)) return;

    if (user.roles.includes('driver')) {
        const myDriverId = await resolveDriverId(user.userId);
        if (!myDriverId || waybillSnapshot.driverId !== myDriverId) {
            throw new AccessDeniedError('Нет доступа к этому путевому листу');
        }
        return;
    }

    throw new AccessDeniedError('Нет доступа');
}

/**
 * Checks if a user has access to a specific incident.
 * - Staff roles: access limited by organization scope when present
 * - Driver: only incidents linked to their driver profile
 */
export async function assertIncidentAccess(incidentId: string, user: GuardUser): Promise<void> {
    const incidentSnapshot = await getIncidentAccessSnapshot(incidentId);

    if (!incidentSnapshot) throw new EntityNotFoundError('Инцидент не найден');

    assertOrganizationScope(incidentSnapshot.organizationIds, user);

    if (hasStaffAccess(user)) return;

    if (user.roles.includes('driver')) {
        const myDriverId = await resolveDriverId(user.userId);
        if (!myDriverId || incidentSnapshot.driverId !== myDriverId) {
            throw new AccessDeniedError('Нет доступа к этому инциденту');
        }
        return;
    }

    throw new AccessDeniedError('Нет доступа');
}

/**
 * Custom error class for access denial (HTTP 403).
 */
export class AccessDeniedError extends Error {
    public readonly statusCode = 403;
    constructor(message: string) {
        super(message);
        this.name = 'AccessDeniedError';
    }
}

/**
 * Custom error class for missing entities (HTTP 404).
 */
export class EntityNotFoundError extends Error {
    public readonly statusCode = 404;
    constructor(message: string) {
        super(message);
        this.name = 'EntityNotFoundError';
    }
}
