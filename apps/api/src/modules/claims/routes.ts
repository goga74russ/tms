// ============================================================
// Claims Routes — Sprint 12.5 (Претензии к контрагентам)
// ============================================================
import { FastifyInstance, FastifyReply } from 'fastify';
import { requireAbility } from '../../auth/rbac.js';
import { assertOrderAccess, assertTripAccess, resolveContractorId } from '../../auth/guards.js';
import { claimsService } from './service.js';
import { db } from '../../db/connection.js';
import { contractors } from '../../db/schema.js';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

const ClaimCreateSchema = z.object({
    tripId: z.string().uuid().optional().nullable(),
    orderId: z.string().uuid().optional().nullable(),
    contractorId: z.string().uuid().optional().nullable(),
    type: z.enum(['damage', 'delay', 'loss', 'other']),
    amount: z.number().positive().optional().nullable(),
    description: z.string().min(1).max(2000),
    attachments: z.array(z.unknown()).optional(),
});

const ClaimStatusSchema = z.object({
    status: z.enum(['open', 'investigating']),
});

const ClaimResolveSchema = z.object({
    status: z.enum(['resolved', 'rejected']),
    resolvedAmount: z.number().nonnegative().optional().nullable(),
    resolution: z.string().min(1).max(2000),
});

export default async function claimsRoutes(app: FastifyInstance) {
    async function ensureClaimAccess(
        claimId: string,
        user: { userId: string; roles: string[]; organizationId?: string | null },
        reply: FastifyReply,
    ) {
        const claim = await claimsService.getById(claimId);
        if (!claim) {
            reply.status(404).send({ success: false, error: 'Претензия не найдена' });
            return null;
        }

        if (user.organizationId && claim.contractorId) {
            const [contractor] = await db.select({ id: contractors.id })
                .from(contractors)
                .where(and(eq(contractors.id, claim.contractorId), eq(contractors.organizationId, user.organizationId)))
                .limit(1);

            if (!contractor) {
                reply.status(403).send({ success: false, error: 'Access denied' });
                return null;
            }
        }

        if (user.roles.includes('client')) {
            const myContractorId = await resolveContractorId(user.userId);
            if (!myContractorId || claim.contractorId !== myContractorId) {
                reply.status(403).send({ success: false, error: 'Нет доступа' });
                return null;
            }
        }

        return claim;
    }

    // List claims (with optional filters)
    app.get('/claims', {
        schema: { tags: ['Претензии'], summary: 'Список претензий' },
        preHandler: [app.authenticate, requireAbility('read', 'Claim')],
    }, async (request, reply) => {
        const user = request.user as { userId: string; roles: string[]; organizationId?: string };
        const { contractorId, status } = request.query as { contractorId?: string; status?: string };

        let effectiveContractorId = contractorId;

        // Clients only see their own contractor's claims (hard enforcement)
        if (user.roles.includes('client')) {
            const myContractorId = await resolveContractorId(user.userId);
            if (!myContractorId) {
                return reply.status(403).send({ success: false, error: 'Нет привязки к контрагенту' });
            }
            effectiveContractorId = myContractorId; // ignore query param
        }

        const data = await claimsService.list({ contractorId: effectiveContractorId, status, organizationId: user.organizationId });
        return { success: true, data };
    });

    // Get single claim
    app.get('/claims/:id', {
        schema: { tags: ['Претензии'], summary: 'Получить претензию' },
        preHandler: [app.authenticate, requireAbility('read', 'Claim')],
    }, async (request, reply) => {
        const user = request.user as { userId: string; roles: string[]; organizationId?: string };
        const { id } = request.params as { id: string };
        const claim = await claimsService.getById(id);
        if (!claim) return reply.status(404).send({ success: false, error: 'Претензия не найдена' });

        if (user.organizationId && claim.contractorId) {
            const [contractor] = await db.select({ id: contractors.id })
                .from(contractors)
                .where(and(eq(contractors.id, claim.contractorId), eq(contractors.organizationId, user.organizationId)))
                .limit(1);

            if (!contractor) {
                return reply.status(403).send({ success: false, error: 'Access denied' });
            }
        }

        // IDOR protection: client can only see own contractor's claims
        if (user.roles.includes('client')) {
            const myContractorId = await resolveContractorId(user.userId);
            if (!myContractorId || claim.contractorId !== myContractorId) {
                return reply.status(403).send({ success: false, error: 'Нет доступа' });
            }
        }

        return { success: true, data: claim };
    });

    // Create claim
    app.post('/claims', {
        schema: { tags: ['Претензии'], summary: 'Создать претензию' },
        preHandler: [app.authenticate, requireAbility('create', 'Claim')],
    }, async (request, reply) => {
        const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
        const parsed = ClaimCreateSchema.safeParse(request.body);
        if (!parsed.success) {
            const fieldErrors = parsed.error.flatten().fieldErrors;
            const messages = Object.entries(fieldErrors)
                .map(([field, errs]) => `${field}: ${(errs as string[]).join(', ')}`)
                .join('; ');
            return reply.status(400).send({ success: false, error: messages || 'Ошибка валидации', details: parsed.error.flatten() });
        }
        try {
            let effectiveContractorId = parsed.data.contractorId ?? null;
            if (user.roles.includes('client')) {
                const myContractorId = await resolveContractorId(user.userId);
                if (!myContractorId) {
                    return reply.status(403).send({ success: false, error: 'Нет привязки к контрагенту' });
                }
                effectiveContractorId = myContractorId;
            }

            if (parsed.data.orderId) await assertOrderAccess(parsed.data.orderId, user);
            if (parsed.data.tripId) await assertTripAccess(parsed.data.tripId, user);
            if (effectiveContractorId && user.organizationId) {
                const [contractor] = await db.select({ id: contractors.id })
                    .from(contractors)
                    .where(and(eq(contractors.id, effectiveContractorId), eq(contractors.organizationId, user.organizationId)))
                    .limit(1);
                if (!contractor) {
                    return reply.status(403).send({ success: false, error: 'Access denied' });
                }
            }

            const claim = await claimsService.create({
                ...parsed.data,
                contractorId: effectiveContractorId,
                createdBy: user.userId,
                createdByRole: user.roles[0] ?? 'unknown',
            });
            return reply.status(201).send({ success: true, data: claim });
        } catch (err: any) {
            return reply.status(400).send({ success: false, error: err.message });
        }
    });

    // Update status (open → investigating)
    app.patch('/claims/:id/status', {
        schema: { tags: ['Претензии'], summary: 'Изменить статус претензии' },
        preHandler: [app.authenticate, requireAbility('update', 'Claim')],
    }, async (request, reply) => {
        const { id } = request.params as { id: string };
        const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
        const parsed = ClaimStatusSchema.safeParse(request.body);
        if (!parsed.success) {
            const fe = parsed.error.flatten().fieldErrors;
            const msg = Object.entries(fe).map(([f, e]) => `${f}: ${(e as string[]).join(', ')}`).join('; ');
            return reply.status(400).send({ success: false, error: msg || 'Ошибка валидации', details: parsed.error.flatten() });
        }
        const accessible = await ensureClaimAccess(id, user, reply);
        if (!accessible) return;
        const claim = await claimsService.updateStatus(id, {
            status: parsed.data.status,
            updatedBy: user.userId,
            updatedByRole: user.roles[0] ?? 'unknown',
        });
        if (!claim) return reply.status(404).send({ success: false, error: 'Претензия не найдена' });
        return { success: true, data: claim };
    });

    // Resolve or reject claim
    app.post('/claims/:id/resolve', {
        schema: { tags: ['Претензии'], summary: 'Закрыть претензию (resolved/rejected)' },
        preHandler: [app.authenticate, requireAbility('update', 'Claim')],
    }, async (request, reply) => {
        const { id } = request.params as { id: string };
        const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
        const parsed = ClaimResolveSchema.safeParse(request.body);
        if (!parsed.success) {
            const fe = parsed.error.flatten().fieldErrors;
            const msg = Object.entries(fe).map(([f, e]) => `${f}: ${(e as string[]).join(', ')}`).join('; ');
            return reply.status(400).send({ success: false, error: msg || 'Ошибка валидации', details: parsed.error.flatten() });
        }
        const accessible = await ensureClaimAccess(id, user, reply);
        if (!accessible) return;
        const claim = await claimsService.resolve(id, {
            ...parsed.data,
            resolvedBy: user.userId,
            resolvedByRole: user.roles[0] ?? 'unknown',
        });
        if (!claim) return reply.status(404).send({ success: false, error: 'Претензия не найдена' });
        return { success: true, data: claim };
    });
}



