import { db } from '../../db/connection.js';
import { claims, orders, tripOrders, contractors } from '../../db/schema.js';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { recordEvent } from '../../events/journal.js';

export type ClaimCreate = {
    tripId?: string | null;
    orderId?: string | null;
    contractorId?: string | null;
    type: 'damage' | 'delay' | 'loss' | 'other';
    amount?: number | null;
    description: string;
    attachments?: unknown[];
    createdBy: string;
    createdByRole: string;
};

export type ClaimResolve = {
    status: 'resolved' | 'rejected';
    resolvedAmount?: number | null;
    resolution: string;
    resolvedBy: string;
    resolvedByRole: string;
};


async function resolveClaimContractorId(data: { orderId?: string | null; tripId?: string | null; contractorId?: string | null }) {
    let orderContractorId: string | null = null;
    if (data.orderId) {
        const [order] = await db.select({ contractorId: orders.contractorId })
            .from(orders)
            .where(eq(orders.id, data.orderId))
            .limit(1);
        orderContractorId = order?.contractorId ?? null;
    }

    let tripContractorId: string | null = null;
    if (data.tripId) {
        const [tripOrder] = await db.select({ orderId: tripOrders.orderId })
            .from(tripOrders)
            .where(eq(tripOrders.tripId, data.tripId))
            .limit(1);

        if (tripOrder?.orderId) {
            const [order] = await db.select({ contractorId: orders.contractorId })
                .from(orders)
                .where(eq(orders.id, tripOrder.orderId))
                .limit(1);
            tripContractorId = order?.contractorId ?? null;
        }
    }

    const provided = data.contractorId ?? null;
    const candidates = [provided, orderContractorId, tripContractorId].filter(Boolean);
    const unique = [...new Set(candidates)];

    if (unique.length > 1) {
        throw new Error('Claim contractor does not match linked trip/order');
    }

    return unique[0] ?? null;
}
export const claimsService = {
    async list(filters: { contractorId?: string; status?: string; organizationId?: string | null } = {}) {
        const conditions: ReturnType<typeof eq>[] = [];
        if (filters.organizationId) {
            conditions.push(
                inArray(claims.contractorId,
                    db.select({ id: contractors.id }).from(contractors).where(eq(contractors.organizationId, filters.organizationId))
                ) as any
            );
        }
        if (filters.contractorId) {
            conditions.push(eq(claims.contractorId, filters.contractorId));
        }
        if (filters.status) {
            conditions.push(eq(claims.status, filters.status as 'open' | 'investigating' | 'resolved' | 'rejected'));
        }

        return db.select().from(claims)
            .where(conditions.length > 0 ? and(...conditions) : undefined)
            .orderBy(desc(claims.createdAt));
    },

    async getById(id: string) {
        const [row] = await db.select().from(claims).where(eq(claims.id, id));
        return row ?? null;
    },

    async create(data: ClaimCreate) {
        const effectiveContractorId = await resolveClaimContractorId(data);
        if (!effectiveContractorId) {
            throw new Error('Claim must be linked to a contractor');
        }

        const [row] = await db.insert(claims).values({
            tripId: data.tripId ?? null,
            orderId: data.orderId ?? null,
            contractorId: effectiveContractorId,
            type: data.type,
            status: 'open',
            amount: data.amount != null ? String(data.amount) : null,
            description: data.description,
            attachments: data.attachments ?? [],
            createdBy: data.createdBy,
        }).returning();

        await recordEvent({
            authorId: data.createdBy,
            authorRole: data.createdByRole,
            eventType: 'claim_created',
            entityType: 'claim',
            entityId: row.id,
            data: { type: data.type, amount: data.amount },
        });

        return row;
    },

    async updateStatus(id: string, update: { status: 'investigating' | 'open'; updatedBy: string; updatedByRole: string }) {
        const [row] = await db.update(claims)
            .set({ status: update.status, updatedAt: new Date() })
            .where(eq(claims.id, id))
            .returning();

        if (!row) return null;

        await recordEvent({
            authorId: update.updatedBy,
            authorRole: update.updatedByRole,
            eventType: 'claim_status_changed',
            entityType: 'claim',
            entityId: id,
            data: { status: update.status },
        });

        return row;
    },

    async resolve(id: string, data: ClaimResolve) {
        const [row] = await db.update(claims)
            .set({
                status: data.status,
                resolvedAmount: data.resolvedAmount != null ? String(data.resolvedAmount) : null,
                resolution: data.resolution,
                resolvedBy: data.resolvedBy,
                resolvedAt: new Date(),
                updatedAt: new Date(),
            })
            .where(eq(claims.id, id))
            .returning();

        if (!row) return null;

        await recordEvent({
            authorId: data.resolvedBy,
            authorRole: data.resolvedByRole,
            eventType: 'claim_resolved',
            entityType: 'claim',
            entityId: id,
            data: { status: data.status, resolvedAmount: data.resolvedAmount },
        });

        return row;
    },
};

