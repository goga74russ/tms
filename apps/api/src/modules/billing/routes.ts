// ============================================================
// Round 2B — Billing HTTP routes.
// Customer-facing endpoints + provider webhook + admin overview.
// ============================================================
import type { FastifyPluginAsync } from 'fastify';
import { createHmac, timingSafeEqual } from 'node:crypto';
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

/**
 * Platform super-admin = role=admin AND organizationId is null/missing.
 * Used to gate cross-tenant views (billing overview, all-orgs lists).
 * Tenant admins (admins of a specific organization) MUST be blocked from
 * these — they would otherwise see other tenants' billing data.
 */
function isSuperAdmin(user: AuthUser | undefined): boolean {
    return isAdmin(user) && !user!.organizationId;
}

const SubscribeSchema = z.object({
    planId: z.enum(PLAN_IDS as [PlanId, ...PlanId[]]),
    returnUrl: z.string().url().optional(),
});

/**
 * Result of HMAC verification on an incoming ЮKassa webhook. Extracted from
 * the route handler so the rules can be unit-tested without spinning up
 * Fastify. See webhook.test.ts.
 */
export type WebhookVerifyOutcome =
    | { ok: true; warn?: string }
    | { ok: false; status: 401 | 503; error: string };

/**
 * A-P0-1: pure HMAC verification logic for the ЮKassa webhook.
 *
 * Production:
 *   - secret missing → 503 (refuse: receiver not configured)
 *   - header or rawBody missing → 401 missing signature
 *   - hex digests mismatch (length or content) → 401 invalid signature
 *
 * Non-production:
 *   - secret + header + body all present and mismatch → ok=true with warn
 *     (dev tolerates so local mock posts still flow)
 *   - anything missing → ok=true (logged warning upstream)
 */
export function verifyYookassaWebhookSignature(args: {
    secret: string | undefined;
    headerSig: string | undefined;
    rawBody: string | Buffer | undefined;
    nodeEnv: string | undefined;
}): WebhookVerifyOutcome {
    const { secret, headerSig, rawBody, nodeEnv } = args;
    if (nodeEnv === 'production') {
        if (!secret) return { ok: false, status: 503, error: 'webhook receiver not configured' };
        if (!headerSig || !rawBody) return { ok: false, status: 401, error: 'missing signature' };
        const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
        const expectedBuf = Buffer.from(expected, 'hex');
        const actualBuf = Buffer.from(headerSig.replace(/^sha256=/i, ''), 'hex');
        if (
            expectedBuf.length !== actualBuf.length
            || !timingSafeEqual(expectedBuf, actualBuf)
        ) {
            return { ok: false, status: 401, error: 'invalid signature' };
        }
        return { ok: true };
    }
    // Dev: best-effort verify when configured; never reject.
    if (secret && headerSig && rawBody) {
        const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
        const actual = headerSig.replace(/^sha256=/i, '');
        if (expected !== actual) return { ok: true, warn: 'signature mismatch (dev, allowed)' };
    }
    return { ok: true };
}

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
    }, async (request) => {
        // B-14: seed-data users (admin@tms.local, super@tms.local) have no
        // organization. Treat them as Free-tier so the UI doesn't break.
        const orgId = requireOrg(request.user as AuthUser);
        const data = await getActiveSubscription(orgId);
        return { success: true, data, note: orgId ? undefined : 'no_organization_in_token' };
    });

    fastify.post('/billing/subscribe', {
        schema: { tags: ['Биллинг'], summary: 'Перейти на платный тариф', description: 'Создаёт платёж, возвращает ссылку на ЮKassa.' },
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        const user = request.user as AuthUser;
        const orgId = requireOrg(user);
        if (!orgId) return reply.status(400).send({ success: false, error: 'Организация не найдена в токене' });
        // T-7: платёж за тариф организации — только администратор организации.
        // Без гейта любой член орг (включая driver) мог инициировать платёж.
        if (!isAdmin(user)) return reply.status(403).send({ success: false, error: 'admin only' });
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
        const user = request.user as AuthUser;
        const orgId = requireOrg(user);
        if (!orgId) return reply.status(400).send({ success: false, error: 'Организация не найдена в токене' });
        // T-7: отмена подписки организации — только администратор.
        if (!isAdmin(user)) return reply.status(403).send({ success: false, error: 'admin only' });
        const updated = await cancelAtPeriodEnd(orgId);
        if (!updated) return reply.status(404).send({ success: false, error: 'no active subscription' });
        return { success: true, data: updated };
    });

    fastify.get('/billing/usage', {
        schema: { tags: ['Биллинг'], summary: 'Использование лимитов в текущем периоде' },
        preHandler: [fastify.authenticate],
    }, async (request) => {
        // B-14: graceful 200 with default usage for users without org.
        const orgId = requireOrg(request.user as AuthUser);
        if (!orgId) {
            const { plan } = await getActiveSubscription(null);
            return {
                success: true,
                data: {
                    plan: plan.id,
                    periodStart: new Date(new Date().toISOString().slice(0, 8) + '01T00:00:00.000Z').toISOString(),
                    vehicles: { current: 0, limit: plan.vehicleLimit },
                    orders: { current: 0, limit: plan.monthlyOrdersLimit },
                    copilotMessages: { current: 0, limit: plan.copilotMessagesDaily },
                },
                note: 'no_organization_in_token',
            };
        }
        const data = await getUsageReport(orgId);
        return { success: true, data };
    });

    fastify.get('/billing/payments', {
        schema: { tags: ['Биллинг'], summary: 'История платежей' },
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        const user = request.user as AuthUser;
        const orgId = requireOrg(user);
        if (!orgId) return { success: true, data: [], note: 'no_organization_in_token' };
        // T-7: история платежей — финансовые данные. admin/accountant.
        if (!user.roles?.some((r) => r === 'admin' || r === 'accountant')) {
            return reply.status(403).send({ success: false, error: 'admin/accountant only' });
        }
        const data = await listPayments(orgId);
        return { success: true, data };
    });

    // ---------- Provider webhook ----------
    // A-P0-1: ЮKassa webhook signature verification + replay protection.
    //   - HMAC-SHA256 of the raw request body against YOOKASSA_WEBHOOK_SECRET.
    //   - Persist webhook event_id in `payments.lastWebhookEventId` for replay
    //     dedupe (handled inside handlePaymentCallback via dedupeEventId param).
    //   - When YOOKASSA_WEBHOOK_SECRET is unset, refuse the call entirely in
    //     production. In dev we accept (logged) to allow local testing.
    fastify.post('/billing/webhook/yookassa', {
        schema: { tags: ['Биллинг'], summary: 'Webhook ЮKassa (HMAC-signed)' },
        config: { rawBody: true },
    }, async (request, reply) => {
        const secret = process.env.YOOKASSA_WEBHOOK_SECRET;
        const rawBody = (request as unknown as { rawBody?: string | Buffer }).rawBody;
        const headerSig = request.headers['x-yookassa-signature'] as string | undefined
            ?? request.headers['content-hmac'] as string | undefined;

        const verify = verifyYookassaWebhookSignature({
            secret,
            headerSig,
            rawBody,
            nodeEnv: process.env.NODE_ENV,
        });
        if (!verify.ok) {
            if (verify.status === 503) {
                request.log.error('YOOKASSA_WEBHOOK_SECRET not set; refusing webhook in production.');
            } else {
                request.log.warn({ ip: request.ip }, `YooKassa webhook rejected: ${verify.error}`);
            }
            return reply.status(verify.status).send({ success: false, error: verify.error });
        }
        if (verify.warn) {
            request.log.warn(`YooKassa webhook: ${verify.warn}`);
        }

        const parsed = YookassaWebhookSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({ success: false, error: 'Некорректные данные вебхука' });
        }
        const { object, event } = parsed.data;
        const status = mapYookassaStatus(event, object.status);
        // Replay dedupe key: ЮKassa events include an `event_id` on the envelope.
        // Service layer uses this to skip already-processed events (returns 200
        // to make the webhook idempotent).
        const eventId = (request.body as { event_id?: string }).event_id;
        const result = await handlePaymentCallback({
            externalId: object.id,
            status,
            eventId,
        });
        return { success: true, data: result };
    });

    // ---------- Admin overview ----------
    fastify.get('/admin/billing/overview', {
        schema: { tags: ['Биллинг'], summary: 'Все организации (super-admin)' },
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        const user = request.user as AuthUser;
        // Cross-tenant view — super-admin only. Tenant admins (with their
        // own organizationId) must NOT see other organizations' billing.
        if (!isSuperAdmin(user)) {
            return reply.status(403).send({ success: false, error: 'super-admin only' });
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
