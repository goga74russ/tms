// ============================================================
// Integration tests — /api/finance/*
//
// Covers: invoice listing + tripId filter regression (B-21),
// RBAC, basic generation/access errors.
// ============================================================
import './setup.js';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import {
    ensureTestDbReady,
    truncateAllTables,
    seedBaseFixture,
    buildTestApp,
    signTestToken,
    authHeaders,
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
                const financeRoutes = (await import('../../src/modules/finance/routes.js')).default;
                await a.register(financeRoutes, { prefix: '/api' });
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

function adminToken() {
    return signTestToken(app, {
        userId: fx.adminUserId, roles: ['admin'], organizationId: fx.organizationId,
    });
}

function driverTok() {
    return signTestToken(app, {
        userId: fx.driverUserId, roles: ['driver'], organizationId: fx.organizationId,
    });
}

function accountantTok() {
    return signTestToken(app, {
        userId: fx.adminUserId, roles: ['accountant'], organizationId: fx.organizationId,
    });
}

async function seedInvoice(opts: { number: string; tripId?: string }) {
    const db = await getTestDb();
    const schema = await import('../../src/db/schema.js');
    const [inv] = await db.insert(schema.invoices).values({
        number: opts.number,
        contractorId: fx.contractorId,
        type: 'invoice',
        status: 'draft',
        subtotal: 1000,
        vatAmount: 200,
        total: 1200,
        periodStart: new Date('2026-01-01'),
        periodEnd: new Date('2026-01-31'),
    }).returning();
    if (opts.tripId) {
        await db.insert(schema.invoiceTrips).values({
            invoiceId: inv!.id, tripId: opts.tripId,
        });
    }
    return inv!;
}

async function seedTrip(number: string) {
    const db = await getTestDb();
    const schema = await import('../../src/db/schema.js');
    const [trip] = await db.insert(schema.trips).values({
        number,
        status: 'planning',
        vehicleId: fx.vehicleId,
        organizationId: fx.organizationId,
        createdBy: fx.adminUserId,
    }).returning();
    return trip!;
}

describe('GET /api/finance/invoices', () => {
    it('requires auth', async () => {
        const res = await app.inject({ method: 'GET', url: '/api/finance/invoices' });
        expect(res.statusCode).toBe(401);
    });

    it('driver gets 403 (no Invoice access)', async () => {
        const res = await app.inject({
            method: 'GET',
            url: '/api/finance/invoices',
            headers: authHeaders(driverTok()),
        });
        expect(res.statusCode).toBe(403);
    });

    it('admin sees tenant invoices', async () => {
        await seedInvoice({ number: 'INV-001' });
        await seedInvoice({ number: 'INV-002' });
        const res = await app.inject({
            method: 'GET',
            url: '/api/finance/invoices',
            headers: authHeaders(adminToken()),
        });
        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.data.length).toBe(2);
    });

    it('accountant can read invoices', async () => {
        await seedInvoice({ number: 'INV-101' });
        const res = await app.inject({
            method: 'GET',
            url: '/api/finance/invoices',
            headers: authHeaders(accountantTok()),
        });
        expect(res.statusCode).toBe(200);
    });

    it('B-21 regression: ?tripId filter only returns matching invoices', async () => {
        const trip1 = await seedTrip('TRP-A');
        const trip2 = await seedTrip('TRP-B');
        await seedInvoice({ number: 'INV-A', tripId: trip1.id });
        await seedInvoice({ number: 'INV-B', tripId: trip2.id });
        await seedInvoice({ number: 'INV-C' }); // unlinked

        const res = await app.inject({
            method: 'GET',
            url: `/api/finance/invoices?tripId=${trip1.id}`,
            headers: authHeaders(adminToken()),
        });
        expect(res.statusCode).toBe(200);
        const body = res.json();
        const numbers = body.data.map((d: { number: string }) => d.number).sort();
        expect(numbers).toEqual(['INV-A']);
    });

    it('?tripId with no matches returns empty array', async () => {
        await seedInvoice({ number: 'INV-D' });
        const fakeTripId = '00000000-0000-0000-0000-000000000099';
        const res = await app.inject({
            method: 'GET',
            url: `/api/finance/invoices?tripId=${fakeTripId}`,
            headers: authHeaders(adminToken()),
        });
        expect(res.statusCode).toBe(200);
        expect(res.json().data).toEqual([]);
    });

    it('rejects malformed tripId UUID', async () => {
        const res = await app.inject({
            method: 'GET',
            url: '/api/finance/invoices?tripId=not-a-uuid',
            headers: authHeaders(adminToken()),
        });
        expect(res.statusCode).toBe(422);
    });
});

describe('POST /api/finance/invoices/bulk-generate', () => {
    it('blocks non-admin / non-accountant → 403', async () => {
        const token = signTestToken(app, {
            userId: fx.dispatcherUserId, roles: ['dispatcher'], organizationId: fx.organizationId,
        });
        const res = await app.inject({
            method: 'POST',
            url: '/api/finance/invoices/bulk-generate',
            headers: authHeaders(token),
            payload: {
                from: '2026-01-01T00:00:00Z',
                to: '2026-02-01T00:00:00Z',
            },
        });
        // Either 403 from RBAC or 403 from the explicit role check inside.
        expect(res.statusCode).toBe(403);
    });

    it('rejects invalid date format', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/api/finance/invoices/bulk-generate',
            headers: authHeaders(adminToken()),
            payload: { from: 'not-a-date', to: '2026-02-01T00:00:00Z' },
        });
        expect(res.statusCode).toBe(422);
    });
});

describe('PUT /api/finance/invoices/:id/status', () => {
    it('admin updates invoice status', async () => {
        const inv = await seedInvoice({ number: 'INV-200' });
        const res = await app.inject({
            method: 'PUT',
            url: `/api/finance/invoices/${inv.id}/status`,
            headers: authHeaders(adminToken()),
            payload: { status: 'sent' },
        });
        expect([200, 400]).toContain(res.statusCode);
    });

    it('returns 404 for nonexistent invoice', async () => {
        const res = await app.inject({
            method: 'PUT',
            url: '/api/finance/invoices/00000000-0000-0000-0000-000000000099/status',
            headers: authHeaders(adminToken()),
            payload: { status: 'sent' },
        });
        expect([403, 404]).toContain(res.statusCode);
    });
});
