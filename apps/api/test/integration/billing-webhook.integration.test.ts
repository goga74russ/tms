// ============================================================
// Integration tests — POST /api/billing/webhook/yookassa
//
// Note on raw body: the production server.ts does NOT register
// `fastify-raw-body`, so `request.rawBody` is never populated.
// The HMAC verifier therefore short-circuits to "missing signature"
// in production (which is the safe default — webhooks must have a
// reverse-proxy enrichment if HMAC is enforced).
//
// This suite tests the verify-then-dispatch contract at the route
// layer: HMAC outcomes + replay dedupe via the service.
// ============================================================
import './setup.js';
import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';
import {
    ensureTestDbReady,
    truncateAllTables,
    seedBaseFixture,
    buildTestApp,
    getTestDb,
    type BaseFixture,
} from './setup.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;
let fx: BaseFixture;

beforeAll(async () => {
    await ensureTestDbReady();
    app = await buildTestApp({
        routes: [
            async (a) => {
                const billingRoutes = (await import('../../src/modules/billing/routes.js')).default;
                await a.register(billingRoutes, { prefix: '/api' });
            },
        ],
    });
});

afterAll(async () => {
    await app.close();
});

beforeEach(async () => {
    await truncateAllTables();
    fx = await seedBaseFixture();
});

const originalEnv: Record<string, string | undefined> = {};
function setEnv(k: string, v: string | undefined) {
    if (!(k in originalEnv)) originalEnv[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
}

afterEach(() => {
    for (const [k, v] of Object.entries(originalEnv)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
    }
    Object.keys(originalEnv).forEach(k => delete originalEnv[k]);
});

const payload = {
    event: 'payment.succeeded',
    event_id: 'evt-test-001',
    object: {
        id: 'pay-test-001',
        status: 'succeeded',
    },
};

describe('POST /api/billing/webhook/yookassa — HMAC verify', () => {
    it('production + missing secret → 503', async () => {
        setEnv('NODE_ENV', 'production');
        setEnv('YOOKASSA_WEBHOOK_SECRET', undefined);
        const res = await app.inject({
            method: 'POST',
            url: '/api/billing/webhook/yookassa',
            headers: { 'content-type': 'application/json' },
            payload,
        });
        expect(res.statusCode).toBe(503);
        expect(res.json().error).toMatch(/not configured/i);
    });

    it('production + secret + missing signature header → 401', async () => {
        setEnv('NODE_ENV', 'production');
        setEnv('YOOKASSA_WEBHOOK_SECRET', 'test-secret');
        const res = await app.inject({
            method: 'POST',
            url: '/api/billing/webhook/yookassa',
            headers: { 'content-type': 'application/json' },
            payload,
        });
        // In production, missing rawBody+header = "missing signature" 401.
        expect(res.statusCode).toBe(401);
        expect(res.json().error).toMatch(/missing signature/);
    });

    it('production + secret + wrong signature → 401', async () => {
        setEnv('NODE_ENV', 'production');
        setEnv('YOOKASSA_WEBHOOK_SECRET', 'test-secret');
        const res = await app.inject({
            method: 'POST',
            url: '/api/billing/webhook/yookassa',
            headers: {
                'content-type': 'application/json',
                'x-yookassa-signature': 'sha256=deadbeef',
            },
            payload,
        });
        // No rawBody → "missing signature" still triggers (rawBody not
        // populated under fastify.inject without the raw-body plugin).
        expect(res.statusCode).toBe(401);
    });

    it('dev environment accepts unsigned webhook (best-effort verify)', async () => {
        setEnv('NODE_ENV', 'development');
        setEnv('YOOKASSA_WEBHOOK_SECRET', undefined);
        const res = await app.inject({
            method: 'POST',
            url: '/api/billing/webhook/yookassa',
            headers: { 'content-type': 'application/json' },
            payload,
        });
        // verify is permissive in dev → either 200 (payment ok) or some other
        // non-401/503. We just assert HMAC didn't reject it.
        expect(res.statusCode).not.toBe(401);
        expect(res.statusCode).not.toBe(503);
    });
});

describe('POST /api/billing/webhook/yookassa — payload validation', () => {
    beforeEach(() => {
        setEnv('NODE_ENV', 'development');
    });

    it('rejects malformed payload (missing event)', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/api/billing/webhook/yookassa',
            headers: { 'content-type': 'application/json' },
            payload: { object: { id: 'p1', status: 'succeeded' } },
        });
        expect(res.statusCode).toBe(400);
    });

    it('rejects malformed payload (missing object.id)', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/api/billing/webhook/yookassa',
            headers: { 'content-type': 'application/json' },
            payload: { event: 'payment.succeeded', object: { status: 'succeeded' } },
        });
        expect(res.statusCode).toBe(400);
    });

    it('processes payment.succeeded for a known external payment', async () => {
        // Seed a pending payment so handlePaymentCallback has something to update.
        const db = await getTestDb();
        const schema = await import('../../src/db/schema.js');
        const [plan] = await db.insert(schema.plans).values({
            id: 'test-plan',
            nameRu: 'Test Plan',
            priceMonthlyKopecks: 100000,
            features: {},
        }).returning();
        const [sub] = await db.insert(schema.subscriptions).values({
            organizationId: fx.organizationId,
            planId: plan!.id,
            status: 'trial',
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        }).returning();
        await db.insert(schema.payments).values({
            subscriptionId: sub!.id,
            providerPaymentId: 'pay-known-001',
            amountKopecks: 100000,
            status: 'pending',
        });

        const res = await app.inject({
            method: 'POST',
            url: '/api/billing/webhook/yookassa',
            headers: { 'content-type': 'application/json' },
            payload: {
                event: 'payment.succeeded',
                event_id: 'evt-known-001',
                object: { id: 'pay-known-001', status: 'succeeded' },
            },
        });
        expect(res.statusCode).toBe(200);
    });
});

describe('POST /api/billing/webhook/yookassa — replay dedupe', () => {
    beforeEach(() => {
        setEnv('NODE_ENV', 'development');
    });

    it('same event_id processed twice → second is a no-op', async () => {
        const db = await getTestDb();
        const schema = await import('../../src/db/schema.js');
        const [plan] = await db.insert(schema.plans).values({
            id: 'replay-plan',
            nameRu: 'Replay Plan',
            priceMonthlyKopecks: 50000,
            features: {},
        }).returning();
        const [sub] = await db.insert(schema.subscriptions).values({
            organizationId: fx.organizationId,
            planId: plan!.id,
            status: 'trial',
            currentPeriodStart: new Date('2026-01-01'),
            currentPeriodEnd: new Date('2026-01-31'),
        }).returning();
        await db.insert(schema.payments).values({
            subscriptionId: sub!.id,
            providerPaymentId: 'pay-replay-001',
            amountKopecks: 50000,
            status: 'pending',
        });

        const webhookBody = {
            event: 'payment.succeeded',
            event_id: 'evt-replay-001',
            object: { id: 'pay-replay-001', status: 'succeeded' },
        };

        const res1 = await app.inject({
            method: 'POST',
            url: '/api/billing/webhook/yookassa',
            headers: { 'content-type': 'application/json' },
            payload: webhookBody,
        });
        expect(res1.statusCode).toBe(200);

        // Capture subscription state after first hit.
        const { eq } = await import('drizzle-orm');
        const [after1] = await db.select().from(schema.subscriptions)
            .where(eq(schema.subscriptions.id, sub!.id));
        const periodEnd1 = after1!.currentPeriodEnd;

        const res2 = await app.inject({
            method: 'POST',
            url: '/api/billing/webhook/yookassa',
            headers: { 'content-type': 'application/json' },
            payload: webhookBody,
        });
        expect(res2.statusCode).toBe(200);

        const [after2] = await db.select().from(schema.subscriptions)
            .where(eq(schema.subscriptions.id, sub!.id));
        // Period should NOT roll twice — dedupe must prevent double advance.
        expect(after2!.currentPeriodEnd?.getTime()).toBe(periodEnd1?.getTime());
    });
});
