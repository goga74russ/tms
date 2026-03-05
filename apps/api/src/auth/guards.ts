// ============================================================
// Entity Access Guards — Centralized ownership verification
// Prevents IDOR by checking entity belongs to requesting user
// ============================================================
import { db } from '../db/connection.js';
import { orders, trips, waybills, drivers, users } from '../db/schema.js';
import { eq } from 'drizzle-orm';

/**
 * Resolves the contractorId for a user (for client role RLS).
 */
export async function resolveContractorId(userId: string): Promise<string | null> {
    const [user] = await db.select({ contractorId: users.contractorId })
        .from(users).where(eq(users.id, userId)).limit(1);
    return user?.contractorId ?? null;
}

/**
 * Resolves the driverId for a user (for driver role RLS).
 */
export async function resolveDriverId(userId: string): Promise<string | null> {
    const [driver] = await db.select({ id: drivers.id })
        .from(drivers).where(eq(drivers.userId, userId)).limit(1);
    return driver?.id ?? null;
}

/**
 * Checks if a user has access to a specific order.
 * - Staff roles (logist, dispatcher, admin, manager, accountant): full access
 * - Client: only orders belonging to their contractor
 * - Driver: only orders linked to their assigned trips
 * @throws Error with 403-appropriate message if access denied
 */
export async function assertOrderAccess(
    orderId: string,
    user: { userId: string; roles: string[] },
): Promise<void> {
    const staffRoles = ['admin', 'logist', 'dispatcher', 'manager', 'accountant', 'repair_service', 'medic', 'mechanic'];
    if (user.roles.some(r => staffRoles.includes(r))) return; // Staff has full access

    const [order] = await db.select({
        contractorId: orders.contractorId,
        tripId: orders.tripId,
    }).from(orders).where(eq(orders.id, orderId)).limit(1);

    if (!order) throw new AccessDeniedError('Заявка не найдена');

    // Client: must belong to their contractor
    if (user.roles.includes('client')) {
        const myContractorId = await resolveContractorId(user.userId);
        if (!myContractorId || order.contractorId !== myContractorId) {
            throw new AccessDeniedError('Нет доступа к этой заявке');
        }
        return;
    }

    // Driver: must be assigned to the trip
    if (user.roles.includes('driver')) {
        const myDriverId = await resolveDriverId(user.userId);
        if (!myDriverId || !order.tripId) {
            throw new AccessDeniedError('Нет доступа к этой заявке');
        }
        const [trip] = await db.select({ driverId: trips.driverId })
            .from(trips).where(eq(trips.id, order.tripId)).limit(1);
        if (!trip || trip.driverId !== myDriverId) {
            throw new AccessDeniedError('Нет доступа к этой заявке');
        }
        return;
    }

    // Unknown role — deny by default
    throw new AccessDeniedError('Нет доступа');
}

/**
 * Checks if a user has access to a specific trip.
 * - Staff roles: full access
 * - Driver: only their assigned trips
 * - Client: only trips linked to their orders
 */
export async function assertTripAccess(
    tripId: string,
    user: { userId: string; roles: string[] },
): Promise<void> {
    const staffRoles = ['admin', 'logist', 'dispatcher', 'manager', 'accountant', 'repair_service', 'medic', 'mechanic'];
    if (user.roles.some(r => staffRoles.includes(r))) return;

    const [trip] = await db.select({
        driverId: trips.driverId,
    }).from(trips).where(eq(trips.id, tripId)).limit(1);

    if (!trip) throw new AccessDeniedError('Рейс не найден');

    if (user.roles.includes('driver')) {
        const myDriverId = await resolveDriverId(user.userId);
        if (!myDriverId || trip.driverId !== myDriverId) {
            throw new AccessDeniedError('Нет доступа к этому рейсу');
        }
        return;
    }

    throw new AccessDeniedError('Нет доступа');
}

/**
 * Checks if a user has access to a specific waybill.
 * - Staff roles: full access
 * - Driver: only their own waybills
 */
export async function assertWaybillAccess(
    waybillId: string,
    user: { userId: string; roles: string[] },
): Promise<void> {
    const staffRoles = ['admin', 'logist', 'dispatcher', 'manager', 'accountant', 'repair_service', 'medic', 'mechanic'];
    if (user.roles.some(r => staffRoles.includes(r))) return;

    const [waybill] = await db.select({
        driverId: waybills.driverId,
    }).from(waybills).where(eq(waybills.id, waybillId)).limit(1);

    if (!waybill) throw new AccessDeniedError('Путевой лист не найден');

    if (user.roles.includes('driver')) {
        const myDriverId = await resolveDriverId(user.userId);
        if (!myDriverId || waybill.driverId !== myDriverId) {
            throw new AccessDeniedError('Нет доступа к этому путевому листу');
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
