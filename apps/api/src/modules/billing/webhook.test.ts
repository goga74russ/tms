// ============================================================
// A-P0-1 regression tests — ЮKassa webhook HMAC + replay dedupe.
// HMAC outcomes use the pure `verifyYookassaWebhookSignature` helper.
// Replay dedupe drives `handlePaymentCallback` with a stubbed db.
// ============================================================
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHmac } from 'node:crypto';

// JWT_SECRET / DATABASE_URL must exist before any auth-touching import runs.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-do-not-use';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';

// -- Replay-dedupe needs handlePaymentCallback to see a payment row that
// already carries a `lastWebhookEventId`. We stub db with mutable state.
const dbState: {
    paymentRow: unknown;
    subRow: unknown;
    updates: Array<{ table: string; values: unknown }>;
} = { paymentRow: null, subRow: null, updates: [] };

function makeChainable<T>(value: T) {
    const handler: ProxyHandler<any> = {
        get(_t, prop) {
            if (prop === 'then') return (resolve: (v: T) => void) => resolve(value);
            return () => proxy;
        },
    };
    const proxy: any = new Proxy(function () { /* noop */ }, handler);
    return proxy;
}

// Capture-aware update stub: returns a chain whose .set() records the values
// and whose .where() resolves to [].
function updateStub(table: { _name?: string } | unknown) {
    const tableName = (table as any)?.tableName ?? (table as any)?._?.name ?? 'unknown';
    return {
        set(values: unknown) {
            return {
                where: () => {
                    dbState.updates.push({ table: String(tableName), values });
                    return makeChainable([]);
                },
            };
        },
    };
}

// Select result is awaitable AND carries .for('update') (P1-C: FOR UPDATE).
function selectResult() {
    // Call-order heuristic: payments queried first, subscriptions second.
    const isFirst = (selectCallCount.n === 0);
    selectCallCount.n += 1;
    const rows = isFirst
        ? (dbState.paymentRow ? [dbState.paymentRow] : [])
        : (dbState.subRow ? [dbState.subRow] : []);
    const p: any = Promise.resolve(rows);
    p.for = () => Promise.resolve(rows); // .for('update') → same rows
    return p;
}

vi.mock('../../db/connection.js', () => {
    const stub: any = {
        select: () => ({
            from: () => ({
                where: () => ({
                    limit: () => selectResult(),
                }),
            }),
        }),
        update: updateStub,
        insert: () => ({ values: () => ({ returning: () => Promise.resolve([]) }) }),
        execute: () => Promise.resolve([]),
        // P1-C: handlePaymentCallback теперь оборачивает всё в db.transaction —
        // прокидываем тот же стаб как tx.
        transaction: async (fn: any) => fn(stub),
    };
    return { db: stub, sql: () => 'SQL' };
});

// Track how many db.select() chains have been resolved per test.
const selectCallCount = { n: 0 };

// Stub the entire providers module: service.ts uses getDefaultRegistry/
// selectAdapter (for createPayment, which we don't test here) and
// getOfdAdapter (for the succeeded-path receipt). Stub minimally.
vi.mock('../../providers/index.js', () => ({
    getDefaultRegistry: () => ({ payment: [] }),
    selectAdapter: async () => ({
        name: 'mock',
        createPayment: async () => ({ externalId: 'x', confirmationUrl: 'https://x' }),
    }),
    getOfdAdapter: () => ({
        fiscalize: async () => ({
            externalId: 'mock-fd', receiptUrl: 'about:blank', fnNumber: 'fn',
        }),
    }),
}));

import { verifyYookassaWebhookSignature } from './routes.js';
import { handlePaymentCallback } from './service.js';

beforeEach(() => {
    dbState.paymentRow = null;
    dbState.subRow = null;
    dbState.updates = [];
    selectCallCount.n = 0;
});

// =================================================================
// HMAC verification — pure function, no Fastify required.
// =================================================================
describe('verifyYookassaWebhookSignature — production', () => {
    const secret = 'topsecret';
    const body = JSON.stringify({ event: 'payment.succeeded', object: { id: 'p_1', status: 'succeeded' } });
    const good = createHmac('sha256', secret).update(body).digest('hex');

    it('accepts matching HMAC', () => {
        const out = verifyYookassaWebhookSignature({
            secret, headerSig: good, rawBody: body, nodeEnv: 'production',
        });
        expect(out.ok).toBe(true);
    });

    it('accepts matching HMAC when header prefixed with sha256=', () => {
        const out = verifyYookassaWebhookSignature({
            secret, headerSig: `sha256=${good}`, rawBody: body, nodeEnv: 'production',
        });
        expect(out.ok).toBe(true);
    });

    it('rejects mismatched HMAC with 401', () => {
        const bad = createHmac('sha256', 'wrong-secret').update(body).digest('hex');
        const out = verifyYookassaWebhookSignature({
            secret, headerSig: bad, rawBody: body, nodeEnv: 'production',
        });
        expect(out).toEqual({ ok: false, status: 401, error: 'invalid signature' });
    });

    it('rejects when signature header is missing (401)', () => {
        const out = verifyYookassaWebhookSignature({
            secret, headerSig: undefined, rawBody: body, nodeEnv: 'production',
        });
        expect(out).toEqual({ ok: false, status: 401, error: 'missing signature' });
    });

    it('rejects when raw body is missing (401)', () => {
        const out = verifyYookassaWebhookSignature({
            secret, headerSig: good, rawBody: undefined, nodeEnv: 'production',
        });
        expect(out).toEqual({ ok: false, status: 401, error: 'missing signature' });
    });

    it('refuses with 503 when secret is not configured', () => {
        const out = verifyYookassaWebhookSignature({
            secret: undefined, headerSig: good, rawBody: body, nodeEnv: 'production',
        });
        expect(out).toEqual({ ok: false, status: 503, error: 'webhook receiver not configured' });
    });

    it('rejects when hex digest length differs (timingSafeEqual would throw)', () => {
        const out = verifyYookassaWebhookSignature({
            secret, headerSig: 'deadbeef', rawBody: body, nodeEnv: 'production',
        });
        expect(out.ok).toBe(false);
        if (!out.ok) expect(out.status).toBe(401);
    });
});

describe('verifyYookassaWebhookSignature — development', () => {
    it('accepts when signature is missing entirely (logged warning, no reject)', () => {
        const out = verifyYookassaWebhookSignature({
            secret: undefined, headerSig: undefined, rawBody: undefined, nodeEnv: 'development',
        });
        expect(out.ok).toBe(true);
    });

    it('still passes but warns on mismatch when both ends are configured', () => {
        const out = verifyYookassaWebhookSignature({
            secret: 'a', headerSig: 'deadbeef', rawBody: 'x', nodeEnv: 'development',
        });
        expect(out.ok).toBe(true);
        if (out.ok) expect(out.warn).toMatch(/dev, allowed/);
    });
});

// =================================================================
// Replay dedupe in handlePaymentCallback.
// =================================================================
describe('handlePaymentCallback — replay dedupe (A-P0-1)', () => {
    it('returns no-op when eventId already stored in provider_metadata', async () => {
        dbState.paymentRow = {
            id: 'pay-1',
            subscriptionId: 'sub-1',
            amountKopecks: 290000,
            providerMetadata: { lastWebhookEventId: 'evt-1' },
        };
        // subRow shouldn't be loaded — but if it were, dedupe returns first.
        const out = await handlePaymentCallback({
            externalId: 'ext-1',
            status: 'succeeded',
            eventId: 'evt-1',
        });
        expect(out.paymentId).toBe('pay-1');
        expect(out.receiptUrl).toBeNull();
        // No subscription update should have run — period not rolled forward.
        const subUpdates = dbState.updates.filter((u) => /subscription/i.test(u.table));
        expect(subUpdates).toHaveLength(0);
    });

    it('processes first call with new eventId and persists it', async () => {
        dbState.paymentRow = {
            id: 'pay-2',
            subscriptionId: 'sub-2',
            amountKopecks: 290000,
            providerMetadata: null,
        };
        dbState.subRow = { id: 'sub-2' };
        const out = await handlePaymentCallback({
            externalId: 'ext-2',
            status: 'succeeded',
            eventId: 'evt-new',
        });
        expect(out.paymentId).toBe('pay-2');
        // At least one update should have set providerMetadata containing the eventId.
        const persisted = dbState.updates.some((u) => {
            const v = u.values as { providerMetadata?: { lastWebhookEventId?: string } };
            return v?.providerMetadata?.lastWebhookEventId === 'evt-new';
        });
        expect(persisted).toBe(true);
    });

    it('no eventId in payload — call still processes normally', async () => {
        dbState.paymentRow = {
            id: 'pay-3',
            subscriptionId: 'sub-3',
            amountKopecks: 100,
            providerMetadata: { lastWebhookEventId: 'evt-x' },
        };
        dbState.subRow = { id: 'sub-3' };
        // No eventId → dedupe branch should NOT short-circuit even if metadata exists.
        const out = await handlePaymentCallback({
            externalId: 'ext-3',
            status: 'succeeded',
        });
        expect(out.paymentId).toBe('pay-3');
        // The payment row was updated (not deduped).
        expect(dbState.updates.length).toBeGreaterThan(0);
    });

    it('returns nulls when external payment is unknown', async () => {
        dbState.paymentRow = null;
        const out = await handlePaymentCallback({
            externalId: 'unknown',
            status: 'succeeded',
            eventId: 'evt',
        });
        expect(out).toEqual({ paymentId: null, subscriptionId: null, receiptUrl: null });
    });

    it('C2: повторный succeeded на уже-succeeded платёж → no-op (нет дубля подписки/чека)', async () => {
        dbState.paymentRow = {
            id: 'pay-dup',
            subscriptionId: 'sub-dup',
            amountKopecks: 290000,
            providerMetadata: { lastWebhookEventId: 'old' },
            status: 'succeeded',                 // платёж уже проведён ранее
            receiptUrl: 'https://ofd/receipt/1',
        };
        dbState.subRow = { id: 'sub-dup' };
        const out = await handlePaymentCallback({
            externalId: 'ext-dup',
            status: 'succeeded',
            eventId: 'evt-different',             // даже НОВЫЙ eventId — guard по статусу платежа
        });
        expect(out.paymentId).toBe('pay-dup');
        expect(out.receiptUrl).toBe('https://ofd/receipt/1'); // прежний чек, не новый
        // Подписку НЕ катим второй раз: ни одной update по subscriptions.
        const subUpdates = dbState.updates.filter((u) => /subscription/i.test(u.table));
        expect(subUpdates).toHaveLength(0);
    });
});
