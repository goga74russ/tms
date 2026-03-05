// ============================================================
// Repairs Service — Business logic (§3.10 ТЗ)
// State machine: created → waiting_parts → in_progress → done
// ============================================================
import { db } from '../../db/connection.js';
import { repairRequests, vehicles } from '../../db/schema.js';
import { eq, and, desc, count, or, ilike, gte, lte, sql, inArray } from 'drizzle-orm';
import { recordEvent } from '../../events/journal.js';

// ================================================================
// State machine
// ================================================================
const REPAIR_STATUS_TRANSITIONS: Record<string, string[]> = {
    created: ['waiting_parts', 'in_progress'],
    waiting_parts: ['in_progress'],
    in_progress: ['done', 'waiting_parts'],
    done: [],
};

type Pagination = { page: number; limit: number };

function paginationDefaults(p?: Partial<Pagination>): Pagination {
    return {
        page: Math.max(1, p?.page ?? 1),
        limit: Math.min(100, Math.max(1, p?.limit ?? 20)),
    };
}

function paginationMeta(total: number, p: Pagination) {
    return { total, page: p.page, limit: p.limit, totalPages: Math.ceil(total / p.limit) };
}

// ================================================================
// CRUD
// ================================================================

export async function listRepairs(
    filters: {
        status?: string; vehicleId?: string;
        search?: string; dateFrom?: string; dateTo?: string;
    },
    pagination?: Partial<Pagination>,
) {
    const p = paginationDefaults(pagination);
    const conditions = [];

    if (filters.status) conditions.push(eq(repairRequests.status, filters.status as any));
    if (filters.vehicleId) conditions.push(eq(repairRequests.vehicleId, filters.vehicleId));
    if (filters.search) {
        conditions.push(
            or(
                ilike(repairRequests.description, `%${filters.search}%`),
                ilike(repairRequests.assignedTo, `%${filters.search}%`),
            ),
        );
    }
    if (filters.dateFrom) conditions.push(gte(repairRequests.createdAt, new Date(filters.dateFrom)));
    if (filters.dateTo) conditions.push(lte(repairRequests.createdAt, new Date(filters.dateTo)));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalResult] = await db.select({ count: count() }).from(repairRequests).where(where);
    const total = totalResult?.count ?? 0;

    const rows = await db.select()
        .from(repairRequests)
        .where(where)
        .orderBy(desc(repairRequests.createdAt))
        .limit(p.limit)
        .offset((p.page - 1) * p.limit);

    return { data: rows, pagination: paginationMeta(total, p) };
}

export async function getRepair(id: string) {
    const [repair] = await db.select().from(repairRequests).where(eq(repairRequests.id, id));
    if (!repair) return null;

    // Fetch vehicle info
    const [vehicle] = await db.select({
        id: vehicles.id,
        plateNumber: vehicles.plateNumber,
        make: vehicles.make,
        model: vehicles.model,
    })
        .from(vehicles)
        .where(eq(vehicles.id, repair.vehicleId));

    return { ...repair, vehicle: vehicle || null };
}

export async function createRepair(
    data: {
        vehicleId: string;
        description: string;
        priority: 'low' | 'medium' | 'high' | 'critical';
        source: 'auto_inspection' | 'driver' | 'mechanic' | 'scheduled';
        inspectionId?: string;
        assignedTo?: string;
        photoUrls?: string[];
        odometerAtRepair?: number;
    },
    user: { userId: string; roles: string[] },
) {
    const vehicleStatus = data.priority === 'critical' ? 'broken' : 'maintenance';

    // H-10 / S-4: Wrap INSERT repair and UPDATE vehicle in a single transaction
    const repair = await db.transaction(async (tx) => {
        const [rep] = await tx.insert(repairRequests).values({
            vehicleId: data.vehicleId,
            description: data.description,
            priority: data.priority,
            source: data.source,
            inspectionId: data.inspectionId,
            assignedTo: data.assignedTo,
            photoUrls: data.photoUrls || [],
            odometerAtRepair: data.odometerAtRepair,
        }).returning();

        // Set vehicle status based on priority
        await tx.update(vehicles)
            .set({ status: vehicleStatus as any, updatedAt: new Date() })
            .where(eq(vehicles.id, data.vehicleId));

        await recordEvent({
            authorId: user.userId,
            authorRole: user.roles[0],
            eventType: 'repair.created',
            entityType: 'repair',
            entityId: rep.id,
            data: {
                vehicleId: data.vehicleId,
                description: data.description,
                priority: data.priority,
                source: data.source,
            },
        }, tx);

        // Also log vehicle status change
        await recordEvent({
            authorId: user.userId,
            authorRole: user.roles[0],
            eventType: 'vehicle.status_changed',
            entityType: 'vehicle',
            entityId: data.vehicleId,
            data: { newStatus: vehicleStatus, reason: `repair_created:${rep.id}` },
        }, tx);

        return rep;
    });

    return repair;
}

export async function updateRepairStatus(
    id: string,
    newStatus: string,
    user: { userId: string; roles: string[] },
) {
    // Get current repair
    const [repair] = await db.select().from(repairRequests).where(eq(repairRequests.id, id));
    if (!repair) throw new Error('Заявка на ремонт не найдена');

    // Validate transition
    const allowed = REPAIR_STATUS_TRANSITIONS[repair.status] || [];
    if (!allowed.includes(newStatus)) {
        throw new Error(`Недопустимый переход статуса: ${repair.status} → ${newStatus}`);
    }

    const updateData: Record<string, any> = {
        status: newStatus,
        updatedAt: new Date(),
    };

    if (newStatus === 'done') {
        updateData.completedAt = new Date();
    }

    // H-11: Wrap repair status + vehicle status in single transaction
    const updated = await db.transaction(async (tx) => {
        const [result] = await tx.update(repairRequests)
            .set(updateData)
            .where(eq(repairRequests.id, id))
            .returning();

        // On completion, conditionally set vehicle back to available
        // FIX: Only set available if NO other active repairs exist for this vehicle
        if (newStatus === 'done') {
            const otherActiveRepairs = await tx.select({ id: repairRequests.id })
                .from(repairRequests)
                .where(and(
                    eq(repairRequests.vehicleId, repair.vehicleId),
                    inArray(repairRequests.status, ['created', 'waiting_parts', 'in_progress']),
                    sql`${repairRequests.id} != ${id}`
                ))
                .limit(1);

            if (otherActiveRepairs.length === 0) {
                await tx.update(vehicles)
                    .set({ status: 'available' as any, updatedAt: new Date() })
                    .where(eq(vehicles.id, repair.vehicleId));
            }
            // else: vehicle stays in maintenance/broken — other repairs still active
        }

        // Events inside transaction (N-2)
        if (newStatus === 'done') {
            await recordEvent({
                authorId: user.userId,
                authorRole: user.roles[0],
                eventType: 'vehicle.status_changed',
                entityType: 'vehicle',
                entityId: repair.vehicleId,
                data: { newStatus: 'available', reason: `repair_completed:${id}` },
            }, tx);
        }

        const eventType = newStatus === 'done' ? 'repair.completed' : 'repair.status_changed';
        await recordEvent({
            authorId: user.userId,
            authorRole: user.roles[0],
            eventType,
            entityType: 'repair',
            entityId: id,
            data: {
                previousStatus: repair.status,
                newStatus,
                vehicleId: repair.vehicleId,
            },
        }, tx);

        return result;
    });

    return updated;
}

export async function updateRepair(
    id: string,
    data: Partial<{
        description: string;
        priority: string;
        assignedTo: string;
        workDescription: string;
        partsUsed: Array<{ name: string; quantity: number; cost: number }>;
        totalCost: number;
        odometerAtRepair: number;
        photoUrls: string[];
    }>,
    _user: { userId: string; roles: string[] },
) {
    const updateData: Record<string, any> = { updatedAt: new Date() };

    if (data.description !== undefined) updateData.description = data.description;
    if (data.priority !== undefined) updateData.priority = data.priority;
    if (data.assignedTo !== undefined) updateData.assignedTo = data.assignedTo;
    if (data.workDescription !== undefined) updateData.workDescription = data.workDescription;
    if (data.partsUsed !== undefined) updateData.partsUsed = data.partsUsed;
    if (data.totalCost !== undefined) updateData.totalCost = data.totalCost;
    if (data.odometerAtRepair !== undefined) updateData.odometerAtRepair = data.odometerAtRepair;
    if (data.photoUrls !== undefined) updateData.photoUrls = data.photoUrls;

    // Auto-calculate totalCost from parts if parts provided but cost isn't
    if (data.partsUsed && data.totalCost === undefined) {
        updateData.totalCost = data.partsUsed.reduce((sum, p) => sum + p.quantity * p.cost, 0);
    }

    const [updated] = await db.update(repairRequests)
        .set(updateData)
        .where(eq(repairRequests.id, id))
        .returning();

    if (!updated) throw new Error('Заявка на ремонт не найдена');
    return updated;
}

// ================================================================
// Scheduled maintenance check
// ================================================================

/**
 * Check all vehicles for scheduled maintenance triggers.
 * Creates repair requests when km or date thresholds are reached.
 * Should be called periodically (e.g., daily cron job).
 */
// C-6: Use filtered DB query instead of loading ALL vehicles into RAM
export async function checkScheduledMaintenance(systemUserId: string) {
    const now = new Date();

    // Only fetch vehicles that actually need maintenance (date or km threshold)
    const vehiclesNeedingMaintenance = await db.select()
        .from(vehicles)
        .where(
            and(
                eq(vehicles.isArchived, false),
                eq(vehicles.status, 'available' as any),
                or(
                    lte(vehicles.maintenanceNextDate, now),
                    sql`${vehicles.currentOdometerKm} >= ${vehicles.maintenanceNextKm}`,
                ),
            ),
        );

    const created: string[] = [];

    for (const vehicle of vehiclesNeedingMaintenance) {
        let reason = '';

        if (vehicle.maintenanceNextDate && vehicle.maintenanceNextDate <= now) {
            reason = `Плановое ТО по дате (${vehicle.maintenanceNextDate.toISOString().slice(0, 10)})`;
        } else if (vehicle.maintenanceNextKm && vehicle.currentOdometerKm >= vehicle.maintenanceNextKm) {
            reason = `Плановое ТО по пробегу (${vehicle.currentOdometerKm} >= ${vehicle.maintenanceNextKm} км)`;
        }

        // Check if there's already an open repair for this vehicle
        const [existing] = await db.select({ id: repairRequests.id })
            .from(repairRequests)
            .where(
                and(
                    eq(repairRequests.vehicleId, vehicle.id),
                    eq(repairRequests.source, 'scheduled' as any),
                    or(
                        eq(repairRequests.status, 'created' as any),
                        eq(repairRequests.status, 'waiting_parts' as any),
                        eq(repairRequests.status, 'in_progress' as any),
                    ),
                ),
            );

        if (!existing) {
            const repair = await createRepair({
                vehicleId: vehicle.id,
                description: reason,
                priority: 'medium',
                source: 'scheduled',
                odometerAtRepair: vehicle.currentOdometerKm,
            }, { userId: systemUserId, roles: ['repair_service'] });

            created.push(repair.id);
        }
    }

    return { created: created.length, repairIds: created };
}

// ================================================================
// Analytics
// ================================================================

export async function repairsCostByVehicle(vehicleId: string) {
    const rows = await db.select({
        totalCost: sql<number>`sum(${repairRequests.totalCost})`,
        count: count(),
    })
        .from(repairRequests)
        .where(eq(repairRequests.vehicleId, vehicleId));

    return rows[0] || { totalCost: 0, count: 0 };
}

export async function repairsByStatus() {
    return db.select({
        status: repairRequests.status,
        count: count(),
    })
        .from(repairRequests)
        .groupBy(repairRequests.status);
}
