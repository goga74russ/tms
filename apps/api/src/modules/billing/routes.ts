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
    getPlatformPaymentAdapter,
} from './service.js';

// ЮKassa отправляет webhook'и с фиксированных IP. Мягкая defense-in-depth —
// re-query платежа остаётся авторитетной проверкой (за nginx request.ip ненадёжен).
const YOOKASSA_CIDRS: Array<[string, number]> = [
    ['185.71.76.0', 27], ['185.71.77.0', 27], ['77.75.153.0', 25],
    ['77.75.156.11', 32], ['77.75.156.35', 32], ['77.75.154.128', 25],
];
function ipv4ToInt(ip: string): number | null {
    const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (!m) return null;
    return (((+m[1]! << 24) >>> 0) + (+m[2]! << 16) + (+m[3]! << 8) + (+m[4]!)) >>> 0;
}
function isYookassaSourceIp(ip: string): boolean {
    const ipInt = ipv4ToInt(ip.replace(/^::ffff:/, ''));
    if (ipInt === null) return true; // не IPv4 (IPv6 и пр.) — не блокируем, решает re-query
    return YOOKASSA_CIDRS.some(([base, bits]) => {
        const baseInt = ipv4ToInt(base);
        if (baseInt === null) return false;
        const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
        return (ipInt & mask) === (baseInt & mask);
    });
}

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
        // P1 (код-аудит 2026-06-14, #3): для refund.succeeded `object` — это объект
        // Возврата, чей id — id рефанда, а связанный платёж лежит в payment_id.
        // Без извлечения payment_id lookup по object.id (id рефанда) — всегда no-op.
        payment_id: z.string().optional(),
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
    // Подлинность ЮKassa webhook: НЕ HMAC (ЮKassa уведомления НЕ подписывает).
    // Авторитет — RE-QUERY платежа по id через API нашими кредами: статус берём из
    // ответа ЮKassa, а не из тела → подделать нельзя. IP-allowlist — мягкая
    // defense-in-depth. Replay-dedupe — в handlePaymentCallback по eventId.
    fastify.post('/billing/webhook/yookassa', {
        schema: { tags: ['Биллинг'], summary: 'Webhook ЮKassa (re-query verified)' },
        config: { rawBody: true },
    }, async (request, reply) => {
        const adapter = getPlatformPaymentAdapter();
        if (!adapter) {
            if (process.env.NODE_ENV === 'production') {
                request.log.error('YOOKASSA_SHOP_ID/SECRET_KEY не заданы — webhook нельзя проверить (re-query невозможен).');
                return reply.status(503).send({ success: false, error: 'payment receiver not configured' });
            }
            request.log.warn('ЮKassa webhook (dev): нет env-ключей — доверяем телу без re-query (локальный mock).');
        }

        if (!isYookassaSourceIp(request.ip)) {
            request.log.warn({ ip: request.ip }, 'ЮKassa webhook: IP вне allowlist (re-query остаётся авторитетным).');
        }

        const parsed = YookassaWebhookSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({ success: false, error: 'Некорректные данные вебхука' });
        }
        const { object, event } = parsed.data;
        // #3: для refund.succeeded исходный платёж — по object.payment_id (object.id
        // тут = id рефанда). Для payment.* — по object.id.
        const isRefund = event === 'refund.succeeded';
        const paymentExternalId = isRefund ? object.payment_id : object.id;
        if (!paymentExternalId) {
            request.log.warn({ objectId: object.id }, 'ЮKassa webhook без payment id');
            return reply.status(400).send({ success: false, error: 'webhook без payment id' });
        }

        // Авторитетный статус — из re-query (если адаптер настроен). Тело даёт
        // только тип события (refund vs payment).
        let status: ReturnType<typeof mapYookassaStatus>;
        if (adapter) {
            try {
                const real = await adapter.getPayment(paymentExternalId);
                status = isRefund ? 'refunded' : mapYookassaStatus(event, real.status);
            } catch (err) {
                // Транзиентный сбой re-query → 500, ЮKassa повторит уведомление.
                request.log.warn({ err, paymentExternalId }, 'ЮKassa webhook: re-query не удался — 500 для ретрая');
                return reply.status(500).send({ success: false, error: 're-query failed' });
            }
        } else {
            status = mapYookassaStatus(event, object.status);
        }

        // eventId дедупа — стабилен между ретраями (object.id:status).
        const eventId = `${object.id}:${object.status}`;
        const result = await handlePaymentCallback({ externalId: paymentExternalId, status, eventId });
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
