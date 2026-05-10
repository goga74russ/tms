// ============================================================
// Round 2B — Billing HTTP routes.
// Customer-facing endpoints + provider webhook + admin overview.
// ============================================================
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { PLAN_IDS, type PlanId } from '@tms/shared';
import {
    listPlans,
    getActiveSubscription,
    createPayment,
    cancelAtPeriodEnd,
    handlePaymentCallback,
    getUsageReport,
    listPayments,
    listAllSubscriptionsForAdmin,
} from './service.js';

interface AuthUser {
    userId: string;
    roles: string[];
    organizationId?: string | null;
}

function requireOrg(user: AuthUser | undefined): string | null {
    return user?.organizationId ?? null;
}

function isAdmin(user: AuthUser | undefined): boolean {
    return Array.isArray(user?.roles) && user!.roles.includes('admin');
}

const SubscribeSchema = z.object({
    planId: z.enum(PLAN_IDS as [PlanId, ...PlanId[]]),
    returnUrl: z.string().url().optional(),
});

// Subset of ЮKassa webhook envelope (https://yookassa.ru/developers/using-api/webhooks).
const YookassaWebhookSchema = z.object({
    event: z.string(),
    object: z.object({
        id: z.string(),
        status: z.string(),
        cancellation_details: z.object({
            reason: z.string().optional(),
            party: z.string().optional(),
        }).optional(),
        receipt_registration: z.string().optional(),
        metadata: z.record(z.unknown()).optional(),
    }),
});

const billingRoutes: FastifyPluginAsync = async (fastify) => {
    // ---------- Public catalogue ----------
    fastify.get('/billing/plans', {
        schema: { tags: ['Биллинг'], summary: 'Список тарифов', description: 'Public каталог тарифов с лимитами и фичами.' },
    }, async () => {
        const data = await listPlans();
        return { success: true, data };
    });

    // ---------- Org subscription ----------
    fastify.get('/billing/subscription', {
        schema: { tags: ['Биллинг'], summary: 'Подписка организации' },
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        const orgId = requireOrg(request.user as AuthUser);
        if (!orgId) return reply.status(400).send({ success: false, error: 'no organization in token' });
        const data = await getActiveSubscription(orgId);
        return { success: true, data };
    });

    fastify.post('/billing/subscribe', {
        schema: { tags: ['Биллинг'], summary: 'Перейти на платный тариф', description: 'Создаёт платёж, возвращает ссылку на ЮKassa.' },
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        const orgId = requireOrg(request.user as AuthUser);
        if (!orgId) return reply.status(400).send({ success: false, error: 'no organization in token' });
        const parsed = SubscribeSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({ success: false, error: parsed.error.message });
        }
        try {
            const result = await createPayment(
                orgId,
                parsed.data.planId,
                parsed.data.returnUrl ?? `${request.protocol}://${request.hostname}/billing?status=return`,
            );
            return { success: true, data: result };
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'failed to create payment';
            return reply.status(400).send({ success: false, error: msg });
        }
    });

    fastify.post('/billing/cancel', {
        schema: { tags: ['Биллинг'], summary: 'Отменить продление', description: 'Подписка останется активной до конца оплаченного периода.' },
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        const orgId = requireOrg(request.user as AuthUser);
        if (!orgId) return reply.status(400).send({ success: false, error: 'no organization in token' });
        const updated = await cancelAtPeriodEnd(orgId);
        if (!updated) return reply.status(404).send({ success: false, error: 'no active subscription' });
        return { success: true, data: updated };
    });

    fastify.get('/billing/usage', {
        schema: { tags: ['Биллинг'], summary: 'Использование лимитов в текущем периоде' },
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        const orgId = requireOrg(request.user as AuthUser);
        if (!orgId) return reply.status(400).send({ success: false, error: 'no organization in token' });
        const data = await getUsageReport(orgId);
        return { success: true, data };
    });

    fastify.get('/billing/payments', {
        schema: { tags: ['Биллинг'], summary: 'История платежей' },
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        const orgId = requireOrg(request.user as AuthUser);
        if (!orgId) return reply.status(400).send({ success: false, error: 'no organization in token' });
        const data = await listPayments(orgId);
        return { success: true, data };
    });

    // ---------- Provider webhook ----------
    // ЮKassa POSTs `payment.succeeded` / `payment.canceled` / `refund.succeeded`.
    // Signature verification: ЮKassa requires whitelisting source IPs + (optionally)
    // HMAC of the body with `YOOKASSA_WEBHOOK_SECRET`. Real signature check goes
    // here when creds arrive — for now we rely on idempotency of externalId lookup.
    fastify.post('/billing/webhook/yookassa', {
        schema: { tags: ['Биллинг'], summary: 'Webhook ЮKassa (без авторизации)' },
        config: { rawBody: true },
    }, async (request, reply) => {
        const parsed = YookassaWebhookSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({ success: false, error: 'malformed webhook payload' });
        }
        const { object, event } = parsed.data;
        const status = mapYookassaStatus(event, object.status);
        const result = await handlePaymentCallback({
            externalId: object.id,
            status,
        });
        return { success: true, data: result };
    });

    // ---------- Admin overview ----------
    fastify.get('/admin/billing/overview', {
        schema: { tags: ['Биллинг'], summary: 'Все организации (admin)' },
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        const user = request.user as AuthUser;
        if (!isAdmin(user)) {
            return reply.status(403).send({ success: false, error: 'admin only' });
        }
        const data = await listAllSubscriptionsForAdmin();
        return { success: true, data };
    });
};

function mapYookassaStatus(event: string, status: string): 'succeeded' | 'failed' | 'canceled' | 'pending' | 'waiting_for_capture' | 'refunded' {
    if (event === 'refund.succeeded') return 'refunded';
    switch (status) {
        case 'succeeded': return 'succeeded';
        case 'canceled': return 'canceled';
        case 'waiting_for_capture': return 'waiting_for_capture';
        case 'pending': return 'pending';
        default: return 'failed';
    }
}

export default billingRoutes;
