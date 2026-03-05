// ============================================================
// Orders Module — Business Logic (§3.1, §4.2, Приложение Б.2)
// ============================================================
import { db } from '../../db/connection.js';
import { orders, contractors, trips } from '../../db/schema.js';
import { eq, and, desc, sql, gte, lte, ilike, inArray } from 'drizzle-orm';
import { recordEvent } from '../../events/journal.js';
import { OrderStatus } from '@tms/shared';

// --- State machine transitions (§4.2) ---
const ORDER_TRANSITIONS: Record<string, string[]> = {
    [OrderStatus.DRAFT]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
    [OrderStatus.CONFIRMED]: [OrderStatus.ASSIGNED, OrderStatus.CANCELLED],
    [OrderStatus.ASSIGNED]: [OrderStatus.IN_TRANSIT, OrderStatus.CANCELLED],
    [OrderStatus.IN_TRANSIT]: [OrderStatus.DELIVERED, OrderStatus.RETURNED],
    [OrderStatus.DELIVERED]: [],
    [OrderStatus.RETURNED]: [],
    [OrderStatus.CANCELLED]: [],
};

export function canTransition(from: string, to: string): boolean {
    return ORDER_TRANSITIONS[from]?.includes(to) ?? false;
}

// --- Sequential number generation: ORD-2026-00001 ---
// H-13: FOR UPDATE must run inside a transaction to hold the lock
async function generateOrderNumber(tx: { execute: typeof db.execute }): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `ORD-${year}-`;

    const result = await tx.execute(
        sql`SELECT number FROM orders WHERE number LIKE ${prefix + '%'} ORDER BY number DESC LIMIT 1 FOR UPDATE`
    );

    let seq = 1;
    const rows = result as any[];
    if (rows.length > 0 && rows[0].number) {
        const parts = (rows[0].number as string).split('-');
        seq = parseInt(parts[2], 10) + 1;
    }

    return `${prefix}${String(seq).padStart(5, '0')}`;
}

// --- Types ---
export interface CreateOrderInput {
    contractorId: string;
    contractId?: string;
    cargoDescription: string;
    cargoWeightKg: number;
    cargoVolumeM3?: number;
    cargoPlaces?: number;
    cargoType?: string;
    loadingAddress: string;
    loadingLat?: number;
    loadingLon?: number;
    loadingWindowStart?: string;
    loadingWindowEnd?: string;
    unloadingAddress: string;
    unloadingLat?: number;
    unloadingLon?: number;
    unloadingWindowStart?: string;
    unloadingWindowEnd?: string;
    vehicleRequirements?: string;
    notes?: string;
    createdBy: string;
}

export interface OrderFilters {
    status?: string;
    contractorId?: string;
    dateFrom?: string;
    dateTo?: string;
    search?: string;
    page?: number;
    limit?: number;
    driverId?: string;
}

// --- CRUD ---

export async function createOrder(
    input: CreateOrderInput,
    author: { userId: string; role: string },
) {
    // Wrap number generation + INSERT in single transaction
    // so FOR UPDATE lock holds until INSERT completes
    const order = await db.transaction(async (tx) => {
        const number = await generateOrderNumber(tx);

        const [created] = await tx.insert(orders).values({
            number,
            contractorId: input.contractorId,
            contractId: input.contractId,
            status: 'draft',
            cargoDescription: input.cargoDescription,
            cargoWeightKg: input.cargoWeightKg,
            cargoVolumeM3: input.cargoVolumeM3,
            cargoPlaces: input.cargoPlaces,
            cargoType: input.cargoType,
            loadingAddress: input.loadingAddress,
            loadingLat: input.loadingLat,
            loadingLon: input.loadingLon,
            loadingWindowStart: input.loadingWindowStart ? new Date(input.loadingWindowStart) : undefined,
            loadingWindowEnd: input.loadingWindowEnd ? new Date(input.loadingWindowEnd) : undefined,
            unloadingAddress: input.unloadingAddress,
            unloadingLat: input.unloadingLat,
            unloadingLon: input.unloadingLon,
            unloadingWindowStart: input.unloadingWindowStart ? new Date(input.unloadingWindowStart) : undefined,
            unloadingWindowEnd: input.unloadingWindowEnd ? new Date(input.unloadingWindowEnd) : undefined,
            vehicleRequirements: input.vehicleRequirements,
            notes: input.notes,
            createdBy: input.createdBy,
        }).returning();
        await recordEvent({
            authorId: author.userId,
            authorRole: author.role,
            eventType: 'order.created',
            entityType: 'order',
            entityId: created.id,
            data: { number: created.number, status: created.status, contractorId: created.contractorId },
        }, tx);

        return created;
    });

    return order;
}

export async function getOrders(filters: OrderFilters) {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 20, 100); // M-11: cap at 100
    const offset = (page - 1) * limit;

    const conditions = [];

    if (filters.status) {
        conditions.push(eq(orders.status, filters.status as any));
    }
    if (filters.contractorId) {
        conditions.push(eq(orders.contractorId, filters.contractorId));
    }
    if (filters.dateFrom) {
        conditions.push(gte(orders.createdAt, new Date(filters.dateFrom)));
    }
    if (filters.dateTo) {
        conditions.push(lte(orders.createdAt, new Date(filters.dateTo)));
    }
    if (filters.search) {
        conditions.push(ilike(orders.loadingAddress, `%${filters.search}%`));
    }
    if (filters.driverId) {
        conditions.push(
            inArray(
                orders.tripId,
                db.select({ id: trips.id }).from(trips).where(eq(trips.driverId, filters.driverId))
            )
        );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [data, countResult] = await Promise.all([
        db.select()
            .from(orders)
            .where(where)
            .orderBy(desc(orders.createdAt))
            .limit(limit)
            .offset(offset),
        db.select({ count: sql<number>`count(*)::int` })
            .from(orders)
            .where(where),
    ]);

    const total = countResult[0]?.count ?? 0;

    return {
        data,
        total,
        page,
        limit,
    };
}

export async function getOrderById(id: string) {
    const [order] = await db
        .select()
        .from(orders)
        .where(eq(orders.id, id))
        .limit(1);

    return order ?? null;
}

export async function updateOrder(
    id: string,
    updates: Partial<CreateOrderInput>,
) {
    const [order] = await db
        .update(orders)
        .set({
            ...updates,
            loadingWindowStart: updates.loadingWindowStart ? new Date(updates.loadingWindowStart) : undefined,
            loadingWindowEnd: updates.loadingWindowEnd ? new Date(updates.loadingWindowEnd) : undefined,
            unloadingWindowStart: updates.unloadingWindowStart ? new Date(updates.unloadingWindowStart) : undefined,
            unloadingWindowEnd: updates.unloadingWindowEnd ? new Date(updates.unloadingWindowEnd) : undefined,
            updatedAt: new Date(),
        })
        .where(eq(orders.id, id))
        .returning();

    return order ?? null;
}

// --- State transitions ---

export async function changeOrderStatus(
    id: string,
    newStatus: string,
    author: { userId: string; role: string },
    data?: Record<string, unknown>,
) {
    const order = await getOrderById(id);
    if (!order) throw new Error('Заявка не найдена');

    if (!canTransition(order.status, newStatus)) {
        throw new Error(
            `Невозможен переход: ${order.status} → ${newStatus}`,
        );
    }

    // Wrap status update + event in transaction
    const updated = await db.transaction(async (tx) => {
        const [result] = await tx
            .update(orders)
            .set({ status: newStatus as any, updatedAt: new Date() })
            .where(eq(orders.id, id))
            .returning();

        // Map status to event type
        const eventMap: Record<string, string> = {
            [OrderStatus.CONFIRMED]: 'order.confirmed',
            [OrderStatus.ASSIGNED]: 'order.assigned',
            [OrderStatus.IN_TRANSIT]: 'order.in_transit',
            [OrderStatus.DELIVERED]: 'order.delivered',
            [OrderStatus.RETURNED]: 'order.returned',
            [OrderStatus.CANCELLED]: 'order.cancelled',
        };

        const eventType = eventMap[newStatus];
        if (eventType) {
            await recordEvent({
                authorId: author.userId,
                authorRole: author.role,
                eventType,
                entityType: 'order',
                entityId: id,
                data: { previousStatus: order.status, newStatus, ...data },
            }, tx);
        }

        return result;
    });

    return updated;
}

// --- Template: create from existing order (§3.1) ---

export async function createOrderFromTemplate(
    templateOrderId: string,
    overrides: Partial<CreateOrderInput>,
    author: { userId: string; role: string },
) {
    const template = await getOrderById(templateOrderId);
    if (!template) throw new Error('Шаблон заявки не найден');

    const input: CreateOrderInput = {
        contractorId: overrides.contractorId ?? template.contractorId,
        contractId: overrides.contractId ?? template.contractId ?? undefined,
        cargoDescription: overrides.cargoDescription ?? template.cargoDescription,
        cargoWeightKg: overrides.cargoWeightKg ?? template.cargoWeightKg,
        cargoVolumeM3: overrides.cargoVolumeM3 ?? template.cargoVolumeM3 ?? undefined,
        cargoPlaces: overrides.cargoPlaces ?? template.cargoPlaces ?? undefined,
        cargoType: overrides.cargoType ?? template.cargoType ?? undefined,
        loadingAddress: overrides.loadingAddress ?? template.loadingAddress,
        loadingLat: overrides.loadingLat ?? template.loadingLat ?? undefined,
        loadingLon: overrides.loadingLon ?? template.loadingLon ?? undefined,
        unloadingAddress: overrides.unloadingAddress ?? template.unloadingAddress,
        unloadingLat: overrides.unloadingLat ?? template.unloadingLat ?? undefined,
        unloadingLon: overrides.unloadingLon ?? template.unloadingLon ?? undefined,
        vehicleRequirements: overrides.vehicleRequirements ?? template.vehicleRequirements ?? undefined,
        notes: overrides.notes ?? template.notes ?? undefined,
        createdBy: author.userId,
    };

    return createOrder(input, author);
}

// --- Assign order to trip ---

export async function assignOrderToTrip(
    orderId: string,
    tripId: string,
    author: { userId: string; role: string },
) {
    const order = await getOrderById(orderId);
    if (!order) throw new Error('Заявка не найдена');
    if (order.status !== OrderStatus.CONFIRMED) {
        throw new Error('Заявка должна быть в статусе "Подтверждена" для назначения');
    }

    const [updated] = await db
        .update(orders)
        .set({
            tripId,
            status: 'assigned' as any,
            updatedAt: new Date(),
        })
        .where(eq(orders.id, orderId))
        .returning();

    await recordEvent({
        authorId: author.userId,
        authorRole: author.role,
        eventType: 'order.assigned',
        entityType: 'order',
        entityId: orderId,
        data: { tripId },
    });

    return updated;
}

// --- Get orders by trip ---

export async function getOrdersByTripId(tripId: string) {
    return db
        .select()
        .from(orders)
        .where(eq(orders.tripId, tripId))
        .orderBy(desc(orders.createdAt));
}

// --- Get orders for kanban (grouped by status) ---

export async function getOrdersKanban(filters?: {
    contractorId?: string;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
}) {
    const conditions = [];

    if (filters?.contractorId) {
        conditions.push(eq(orders.contractorId, filters.contractorId));
    }
    if (filters?.dateFrom) {
        conditions.push(gte(orders.createdAt, new Date(filters.dateFrom)));
    }
    if (filters?.dateTo) {
        conditions.push(lte(orders.createdAt, new Date(filters.dateTo)));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const limit = filters?.limit ?? 500;

    const data = await db
        .select()
        .from(orders)
        .where(where)
        .orderBy(desc(orders.createdAt))
        .limit(limit);

    // Group by status
    const kanban: Record<string, typeof data> = {};
    for (const status of Object.values(OrderStatus)) {
        kanban[status] = [];
    }
    for (const order of data) {
        if (kanban[order.status]) {
            kanban[order.status].push(order);
        }
    }

    return kanban;
}
