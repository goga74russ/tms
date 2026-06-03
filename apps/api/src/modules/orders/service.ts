// ============================================================
// Orders Module — Business Logic (§3.1, §4.2, Приложение Б.2)
// ============================================================
import { db } from '../../db/connection.js';
import { orders, contractors, trips, tripOrders } from '../../db/schema.js';
import { eq, and, desc, sql, gte, lte, ilike, inArray } from 'drizzle-orm';
import { recordEvent } from '../../events/journal.js';
import { OrderStatus } from '@tms/shared';
import { containsLikePattern } from '../../utils/search.js';
import { canTransitionOrder } from './validators.js';

// --- State machine transitions (§4.2) ---
// Canonical map lives in @tms/shared; the pure helper lives in validators.ts.
export function canTransition(from: string, to: string): boolean {
    return canTransitionOrder(from, to);
}

// --- Sequential number generation: ORD-2026-00001 ---
async function generateOrderNumber(tx: any): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `ORD-${year}-`;

    let seq = 1;
    const [lastOrder] = await tx
        .select({ number: orders.number })
        .from(orders)
        .where(sql`${orders.number} LIKE ${prefix + '%'}`)
        .orderBy(desc(orders.number))
        .limit(1);

    if (lastOrder?.number) {
        const parts = lastOrder.number.split('-');
        seq = parseInt(parts[2], 10) + 1;
    }

    return `${prefix}${String(seq).padStart(5, '0')}`;
}

// --- Types ---
export interface CreateOrderInput {
    contractorId: string;
    contractId?: string;
    organizationId?: string | null;
    cargoDescription: string;
    cargoWeightKg: number;
    cargoVolumeM3?: number;
    cargoPlaces?: number;
    cargoType?: string;
    // Sprint 9
    multiTierAllowed?: boolean;
    maxTiers?: number;
    temperatureMin?: number;
    temperatureMax?: number;
    // Wave 2: Cold chain v0
    coldChainRequired?: boolean;
    temperatureMinC?: number;
    temperatureMaxC?: number;
    loadingType?: string;
    hydraulicLiftRequired?: boolean;
    // Addresses
    loadingAddress: string;
    loadingLat?: number;
    loadingLon?: number;
    loadingDate?: string;
    loadingWindowStart?: string;
    loadingWindowEnd?: string;
    unloadingAddress: string;
    unloadingLat?: number;
    unloadingLon?: number;
    unloadingDate?: string;
    unloadingWindowStart?: string;
    unloadingWindowEnd?: string;
    vehicleRequirements?: string;
    notes?: string;
    // K1 (Этап 2) — стоимость от заказчика
    customerPrice?: number;
    customerPriceCurrency?: string;
    customerPriceIncludesVat?: boolean;
    confirmationMode?: 'none' | 'optional' | 'required';
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
    organizationId?: string | null;
}

// --- CRUD ---

export async function createOrder(
    input: CreateOrderInput,
    author: { userId: string; role: string; organizationId?: string | null },
) {
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
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
                    // Sprint 9
                    multiTierAllowed: input.multiTierAllowed,
                    maxTiers: input.maxTiers,
                    temperatureMin: input.temperatureMin,
                    temperatureMax: input.temperatureMax,
                    coldChainRequired: input.coldChainRequired,
                    temperatureMinC: input.temperatureMinC,
                    temperatureMaxC: input.temperatureMaxC,
                    loadingType: input.loadingType,
                    hydraulicLiftRequired: input.hydraulicLiftRequired,
                    // Addresses
                    loadingAddress: input.loadingAddress,
                    loadingLat: input.loadingLat,
                    loadingLon: input.loadingLon,
                    loadingDate: input.loadingDate ? new Date(input.loadingDate) : undefined,
                    loadingWindowStart: input.loadingWindowStart ? new Date(input.loadingWindowStart) : undefined,
                    loadingWindowEnd: input.loadingWindowEnd ? new Date(input.loadingWindowEnd) : undefined,
                    unloadingAddress: input.unloadingAddress,
                    unloadingLat: input.unloadingLat,
                    unloadingLon: input.unloadingLon,
                    unloadingDate: input.unloadingDate ? new Date(input.unloadingDate) : undefined,
                    unloadingWindowStart: input.unloadingWindowStart ? new Date(input.unloadingWindowStart) : undefined,
                    unloadingWindowEnd: input.unloadingWindowEnd ? new Date(input.unloadingWindowEnd) : undefined,
                    vehicleRequirements: input.vehicleRequirements,
                    notes: input.notes,
                    confirmationMode: input.confirmationMode,
                    // K1 (Этап 2) — pricing
                    customerPrice: input.customerPrice,
                    customerPriceCurrency: input.customerPriceCurrency ?? 'RUB',
                    customerPriceIncludesVat: input.customerPriceIncludesVat ?? false,
                    createdBy: input.createdBy,
                    organizationId: input.organizationId ?? author.organizationId ?? null,
                }).returning();
                await recordEvent({
                    authorId: author.userId,
                    authorRole: author.role,
                    eventType: 'order.created',
                    entityType: 'order',
                    entityId: created.id,
                    data: {
                        number: created.number,
                        status: created.status,
                        contractorId: created.contractorId,
                        // K1 — фиксируем что цена была проставлена при создании
                        customerPriceSet: input.customerPrice != null,
                    },
                }, tx);

                return created;
            });

            return order;
        } catch (error: any) {
            if (error?.code === '23505' && String(error?.message || '').includes('orders_number_unique') && attempt < 2) {
                continue;
            }
            throw error;
        }
    }

    throw new Error('Не удалось сгенерировать уникальный номер заявки');
}

// ============================================================
// H1 — getOrdersList: denormalized list with contractor + trip
//
// Отдельный читающий метод для общей страницы /orders (table view
// под logist / dispatcher / manager / accountant). Возвращает
// денормализованные данные (имя контрагента, номер рейса), чтобы
// фронту не делать N+1 fetch'ей.
//
// Поиск работает по: orders.number, orders.loadingAddress,
// orders.unloadingAddress, contractors.name (case-insensitive).
// Чувствительность к RBAC обеспечивается отдельно на роуте через
// requireAbility('read', 'Order') + organizationId scope.
// ============================================================
export interface OrdersListFilters {
    status?: string;
    contractorId?: string;
    dateFrom?: string;
    dateTo?: string;
    search?: string;
    page?: number;
    limit?: number;
    organizationId?: string | null;
    hasTrip?: boolean;
}

export interface OrderListRow {
    id: string;
    number: string;
    status: string;
    cargoDescription: string;
    cargoWeightKg: number;
    cargoVolumeM3: number | null;
    loadingAddress: string;
    loadingDate: Date | null;
    unloadingAddress: string;
    unloadingDate: Date | null;
    coldChainRequired: boolean;
    createdAt: Date;
    contractor: { id: string; name: string; inn: string | null } | null;
    trip: { id: string; number: string; status: string } | null;
    // K1 (Этап 2) — pricing fields. Backend всегда select'ит из БД; route handler
    // фильтрует по RBAC (manager+/accountant/admin) до отправки клиенту.
    customerPrice: number | null;
    customerPriceCurrency: string;
    customerPriceIncludesVat: boolean;
}

export async function getOrdersList(filters: OrdersListFilters): Promise<{
    data: OrderListRow[];
    total: number;
    page: number;
    limit: number;
}> {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 25, 100);
    const offset = (page - 1) * limit;

    const conditions = [];
    if (filters.status) conditions.push(eq(orders.status, filters.status as any));
    if (filters.contractorId) conditions.push(eq(orders.contractorId, filters.contractorId));
    if (filters.dateFrom) conditions.push(gte(orders.createdAt, new Date(filters.dateFrom)));
    if (filters.dateTo) conditions.push(lte(orders.createdAt, new Date(filters.dateTo)));
    if (filters.search) {
        const pat = containsLikePattern(filters.search);
        conditions.push(
            sql`(${orders.number} ILIKE ${pat}
                OR ${orders.loadingAddress} ILIKE ${pat}
                OR ${orders.unloadingAddress} ILIKE ${pat}
                OR ${contractors.name} ILIKE ${pat})`,
        );
    }
    if (filters.organizationId) conditions.push(eq(orders.organizationId, filters.organizationId));
    if (filters.hasTrip === true) conditions.push(sql`${orders.tripId} IS NOT NULL`);
    if (filters.hasTrip === false) conditions.push(sql`${orders.tripId} IS NULL`);

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, countResult] = await Promise.all([
        db.select({
            id: orders.id,
            number: orders.number,
            status: orders.status,
            cargoDescription: orders.cargoDescription,
            cargoWeightKg: orders.cargoWeightKg,
            cargoVolumeM3: orders.cargoVolumeM3,
            loadingAddress: orders.loadingAddress,
            loadingDate: orders.loadingDate,
            unloadingAddress: orders.unloadingAddress,
            unloadingDate: orders.unloadingDate,
            coldChainRequired: orders.coldChainRequired,
            createdAt: orders.createdAt,
            contractorId: contractors.id,
            contractorName: contractors.name,
            contractorInn: contractors.inn,
            tripId: trips.id,
            tripNumber: trips.number,
            tripStatus: trips.status,
            // K1 (Этап 2) — pricing fields (RBAC применяется на route)
            customerPrice: orders.customerPrice,
            customerPriceCurrency: orders.customerPriceCurrency,
            customerPriceIncludesVat: orders.customerPriceIncludesVat,
        })
            .from(orders)
            .leftJoin(contractors, eq(orders.contractorId, contractors.id))
            .leftJoin(trips, eq(orders.tripId, trips.id))
            .where(where)
            .orderBy(desc(orders.createdAt))
            .limit(limit)
            .offset(offset),
        db.select({ count: sql<number>`count(*)::int` })
            .from(orders)
            .leftJoin(contractors, eq(orders.contractorId, contractors.id))
            .where(where),
    ]);

    const data: OrderListRow[] = rows.map((r) => ({
        id: r.id,
        number: r.number,
        status: r.status,
        cargoDescription: r.cargoDescription,
        cargoWeightKg: r.cargoWeightKg,
        cargoVolumeM3: r.cargoVolumeM3,
        loadingAddress: r.loadingAddress,
        loadingDate: r.loadingDate,
        unloadingAddress: r.unloadingAddress,
        unloadingDate: r.unloadingDate,
        coldChainRequired: r.coldChainRequired,
        createdAt: r.createdAt,
        contractor: r.contractorId
            ? { id: r.contractorId, name: r.contractorName ?? '', inn: r.contractorInn ?? null }
            : null,
        trip: r.tripId
            ? { id: r.tripId, number: r.tripNumber ?? '', status: r.tripStatus ?? '' }
            : null,
        customerPrice: r.customerPrice,
        customerPriceCurrency: r.customerPriceCurrency ?? 'RUB',
        customerPriceIncludesVat: r.customerPriceIncludesVat ?? false,
    }));

    const total = countResult[0]?.count ?? 0;
    return { data, total, page, limit };
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
        // A-P2: escape %/_/\ so a user-supplied "%%%" can't blow up
        // into a quadratic LIKE-pattern scan.
        conditions.push(ilike(orders.loadingAddress, containsLikePattern(filters.search)));
    }
    if (filters.driverId) {
        conditions.push(
            inArray(
                orders.tripId,
                db.select({ id: trips.id }).from(trips).where(eq(trips.driverId, filters.driverId))
            )
        );
    }
    if (filters.organizationId) {
        conditions.push(eq(orders.organizationId, filters.organizationId));
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

/**
 * B3.4: defense-in-depth org-scope в WHERE. Изначально assertOrderAccess
 * на роуте достаточно (он отбрасывает чужой order до updateOrder), но
 * паттерн без org-guard в WHERE — единственный анти-паттерн среди
 * fleet-сервисов (updateVehicle/updateDriver/updateContractor его имеют).
 * Передаём organizationId опционально, чтобы caller-ы постепенно мигрировали.
 */
export async function updateOrder(
    id: string,
    updates: Partial<CreateOrderInput>,
    actorOrganizationId?: string | null,
    author?: { userId: string; role: string },
) {
    const whereClause = actorOrganizationId
        ? and(eq(orders.id, id), eq(orders.organizationId, actorOrganizationId))
        : eq(orders.id, id);

    // K1 — для аудита изменения customer_price нужно знать предыдущее значение.
    let previousCustomerPrice: number | null = null;
    if (updates.customerPrice !== undefined && author) {
        const [prev] = await db.select({ customerPrice: orders.customerPrice })
            .from(orders).where(whereClause).limit(1);
        previousCustomerPrice = prev?.customerPrice ?? null;
    }

    const [order] = await db
        .update(orders)
        .set({
            ...updates,
            loadingDate: updates.loadingDate ? new Date(updates.loadingDate) : undefined,
            loadingWindowStart: updates.loadingWindowStart ? new Date(updates.loadingWindowStart) : undefined,
            loadingWindowEnd: updates.loadingWindowEnd ? new Date(updates.loadingWindowEnd) : undefined,
            unloadingDate: updates.unloadingDate ? new Date(updates.unloadingDate) : undefined,
            unloadingWindowStart: updates.unloadingWindowStart ? new Date(updates.unloadingWindowStart) : undefined,
            unloadingWindowEnd: updates.unloadingWindowEnd ? new Date(updates.unloadingWindowEnd) : undefined,
            updatedAt: new Date(),
        })
        .where(whereClause)
        .returning();

    // K1 — audit-event для изменения цены (коммерческое событие).
    if (order && updates.customerPrice !== undefined && author && previousCustomerPrice !== updates.customerPrice) {
        await recordEvent({
            authorId: author.userId,
            authorRole: author.role,
            eventType: 'order.customer_price_changed',
            entityType: 'order',
            entityId: order.id,
            data: {
                oldValue: previousCustomerPrice,
                newValue: updates.customerPrice ?? null,
                currency: order.customerPriceCurrency,
                includesVat: order.customerPriceIncludesVat,
            },
        });
    }

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
    author: { userId: string; role: string; organizationId?: string | null },
) {
    const template = await getOrderById(templateOrderId);
    if (!template) throw new Error('Шаблон заявки не найден');
    // C3 (механизм «а»): шаблон обязан принадлежать орг автора — иначе cross-tenant
    // IDOR (копирование чужой заявки/реквизитов по UUID). org-less → не найден.
    if (!author.organizationId || template.organizationId !== author.organizationId) {
        throw new Error('Шаблон заявки не найден');
    }

    const input: CreateOrderInput = {
        contractorId: overrides.contractorId ?? template.contractorId,
        contractId: overrides.contractId ?? template.contractId ?? undefined,
        cargoDescription: overrides.cargoDescription ?? template.cargoDescription,
        cargoWeightKg: overrides.cargoWeightKg ?? template.cargoWeightKg,
        cargoVolumeM3: overrides.cargoVolumeM3 ?? template.cargoVolumeM3 ?? undefined,
        cargoPlaces: overrides.cargoPlaces ?? template.cargoPlaces ?? undefined,
        cargoType: overrides.cargoType ?? template.cargoType ?? undefined,
        // Sprint 9
        multiTierAllowed: overrides.multiTierAllowed ?? template.multiTierAllowed ?? undefined,
        maxTiers: overrides.maxTiers ?? template.maxTiers ?? undefined,
        temperatureMin: overrides.temperatureMin ?? template.temperatureMin ?? undefined,
        temperatureMax: overrides.temperatureMax ?? template.temperatureMax ?? undefined,
        loadingType: overrides.loadingType ?? template.loadingType ?? undefined,
        hydraulicLiftRequired: overrides.hydraulicLiftRequired ?? template.hydraulicLiftRequired ?? undefined,
        // Addresses
        loadingAddress: overrides.loadingAddress ?? template.loadingAddress,
        loadingLat: overrides.loadingLat ?? template.loadingLat ?? undefined,
        loadingLon: overrides.loadingLon ?? template.loadingLon ?? undefined,
        unloadingAddress: overrides.unloadingAddress ?? template.unloadingAddress,
        unloadingLat: overrides.unloadingLat ?? template.unloadingLat ?? undefined,
        unloadingLon: overrides.unloadingLon ?? template.unloadingLon ?? undefined,
        vehicleRequirements: overrides.vehicleRequirements ?? template.vehicleRequirements ?? undefined,
        notes: overrides.notes ?? template.notes ?? undefined,
        createdBy: author.userId,
        organizationId: author.organizationId ?? template.organizationId ?? null,
    };

    return createOrder(input, author);
}

// --- Assign order to trip ---

export async function assignOrderToTrip(
    orderId: string,
    tripId: string,
    author: { userId: string; role: string; organizationId?: string | null },
) {
    const order = await getOrderById(orderId);
    if (!order) throw new Error('Заявка не найдена');
    if (author.organizationId && order.organizationId !== author.organizationId) {
        throw new Error('Order is outside current organization');
    }
    if (order.status !== OrderStatus.CONFIRMED) {
        throw new Error('Заявка должна быть в статусе "Подтверждена" для назначения');
    }
    if (order.tripId && order.tripId !== tripId) {
        throw new Error('Заявка уже привязана к другому рейсу');
    }

    const updated = await db.transaction(async (tx) => {
        const [assigned] = await tx
            .update(orders)
            .set({
                tripId,
                status: 'assigned' as any,
                updatedAt: new Date(),
            })
            .where(eq(orders.id, orderId))
            .returning();

        await tx.insert(tripOrders).values({ tripId, orderId }).onConflictDoNothing();

        await recordEvent({
            authorId: author.userId,
            authorRole: author.role,
            eventType: 'order.assigned',
            entityType: 'order',
            entityId: orderId,
            data: { tripId },
        }, tx);

        return assigned;
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
    organizationId?: string | null;
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
    if (filters?.organizationId) {
        conditions.push(eq(orders.organizationId, filters.organizationId));
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
