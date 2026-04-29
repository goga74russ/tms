import { db } from '../../db/connection.js';
import { claims, orders, tripOrders, contractors } from '../../db/schema.js';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { recordEvent } from '../../events/journal.js';
import {
    appendSettlementNote,
    buildClaimAttachments,
    classifyClaim,
    enrichClaim,
    getClaimExposure,
    type ClaimCause,
    type ClaimStatus,
    type ClaimType,
} from '../operational-core/claim-policy.js';

export type ClaimCreate = {
    tripId?: string | null;
    orderId?: string | null;
    contractorId?: string | null;
    type?: ClaimType | null;
    cause?: ClaimCause | null;
    amount?: number | null;
    reserveAmount?: number | null;
    estimatedAmount?: number | null;
    description: string;
    attachments?: unknown[];
    settlementNote?: string | null;
    metadata?: Record<string, unknown> | null;
    createdBy: string;
    createdByRole: string;
};

export type ClaimResolve = {
    status: 'resolved' | 'rejected';
    resolvedAmount?: number | null;
    resolution: string;
    settlementNote?: string | null;
    resolvedBy: string;
    resolvedByRole: string;
};

export type ClaimListFilters = {
    contractorId?: string;
    status?: string;
    organizationId?: string | null;
    tripId?: string;
    orderId?: string;
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
    async list(filters: ClaimListFilters = {}) {
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
            conditions.push(eq(claims.status, filters.status as ClaimStatus));
        }
        if (filters.tripId) {
            conditions.push(eq(claims.tripId, filters.tripId));
        }
        if (filters.orderId) {
            conditions.push(eq(claims.orderId, filters.orderId));
        }

        const rows = await db.select().from(claims)
            .where(conditions.length > 0 ? and(...conditions) : undefined)
            .orderBy(desc(claims.createdAt));
        return rows.map(enrichClaim);
    },

    async getById(id: string) {
        const [row] = await db.select().from(claims).where(eq(claims.id, id));
        return row ? enrichClaim(row) : null;
    },

    async exposure(filters: ClaimListFilters = {}) {
        const rows = await this.list(filters);
        const summary = rows.reduce((acc, claim) => {
            const exposure = getClaimExposure(claim);
            const isOpenExposure = claim.status === 'open' || claim.status === 'investigating';
            acc.claimCount += 1;
            acc.claimedAmount += exposure.claimedAmount ?? 0;
            acc.reserveAmount += exposure.reserveAmount ?? 0;
            acc.estimatedAmount += exposure.estimatedAmount ?? 0;
            acc.resolvedAmount += exposure.resolvedAmount ?? 0;
            if (isOpenExposure) {
                acc.openClaimCount += 1;
                acc.openExposureAmount += exposure.effectiveExposureAmount;
            }
            if (claim.status === 'resolved' || claim.status === 'rejected') {
                acc.closedClaimCount += 1;
            }
            return acc;
        }, {
            claimCount: 0,
            openClaimCount: 0,
            closedClaimCount: 0,
            claimedAmount: 0,
            reserveAmount: 0,
            estimatedAmount: 0,
            resolvedAmount: 0,
            openExposureAmount: 0,
        });

        return { summary, claims: rows };
    },

    async create(data: ClaimCreate) {
        const effectiveContractorId = await resolveClaimContractorId(data);
        if (!effectiveContractorId) {
            throw new Error('Claim must be linked to a contractor');
        }

        const classification = classifyClaim({
            type: data.type,
            cause: data.cause,
            description: data.description,
        });
        const attachments = buildClaimAttachments(data.attachments, {
            cause: data.cause ?? (classification.cause !== 'other' ? classification.cause : null),
            reserveAmount: data.reserveAmount,
            estimatedAmount: data.estimatedAmount,
            settlementNote: data.settlementNote,
            metadata: data.metadata,
        });

        const [row] = await db.insert(claims).values({
            tripId: data.tripId ?? null,
            orderId: data.orderId ?? null,
            contractorId: effectiveContractorId,
            type: classification.type,
            status: 'open',
            amount: data.amount != null ? String(data.amount) : null,
            description: data.description,
            attachments,
            createdBy: data.createdBy,
        }).returning();

        await recordEvent({
            authorId: data.createdBy,
            authorRole: data.createdByRole,
            eventType: 'claim_created',
            entityType: 'claim',
            entityId: row.id,
            data: {
                type: classification.type,
                cause: classification.cause,
                amount: data.amount,
                reserveAmount: data.reserveAmount,
                estimatedAmount: data.estimatedAmount,
            },
        });

        return enrichClaim(row);
    },

    async updateStatus(id: string, update: { status: 'investigating' | 'open'; settlementNote?: string | null; updatedBy: string; updatedByRole: string }) {
        let resolution: string | null | undefined;
        if (update.settlementNote) {
            const [existing] = await db.select({ resolution: claims.resolution }).from(claims).where(eq(claims.id, id)).limit(1);
            resolution = appendSettlementNote(existing?.resolution ?? null, update.settlementNote);
        }

        const [row] = await db.update(claims)
            .set({
                status: update.status,
                ...(resolution !== undefined ? { resolution } : {}),
                updatedAt: new Date(),
            })
            .where(eq(claims.id, id))
            .returning();

        if (!row) return null;

        await recordEvent({
            authorId: update.updatedBy,
            authorRole: update.updatedByRole,
            eventType: 'claim_status_changed',
            entityType: 'claim',
            entityId: id,
            data: { status: update.status, settlementNote: update.settlementNote ?? null },
        });

        return enrichClaim(row);
    },

    async resolve(id: string, data: ClaimResolve) {
        const resolution = appendSettlementNote(data.resolution, data.settlementNote);
        const [row] = await db.update(claims)
            .set({
                status: data.status,
                resolvedAmount: data.resolvedAmount != null ? String(data.resolvedAmount) : null,
                resolution,
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
            data: { status: data.status, resolvedAmount: data.resolvedAmount, settlementNote: data.settlementNote ?? null },
        });

        return enrichClaim(row);
    },
};
