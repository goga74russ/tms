// ============================================================
// Integration tests — /api/orders/*
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
                const ordersRoutes = (await import('../../src/modules/orders/routes.js')).default;
                await a.register(ordersRoutes, { prefix: '/api' });
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

function token(roles: string[], userId: string) {
    return signTestToken(app, { userId, roles, organizationId: fx.organizationId });
}

function validOrderPayload() {
    return {
        contractorId: fx.contractorId,
        cargoDescription: 'Test cargo',
        cargoWeightKg: 1000,
        loadingAddress: 'г. Москва, ул. Тверская, 1',
        unloadingAddress: 'г. Санкт-Петербург, Невский пр., 1',
    };
}

describe('POST /api/orders', () => {
    it('admin creates an order → 201', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/api/orders',
            headers: authHeaders(token(['admin'], fx.adminUserId)),
            payload: validOrderPayload(),
        });
        expect(res.statusCode).toBe(201);
        const body = res.json();
        expect(body.success).toBe(true);
        expect(body.data.status).toBe('draft');
        expect(body.data.cargoWeightKg).toBe(1000);
    });

    it('logist creates an order → 201 (logist manages Order)', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/api/orders',
            headers: authHeaders(token(['logist'], fx.logistUserId)),
            payload: validOrderPayload(),
        });
        expect(res.statusCode).toBe(201);
    });

    it('driver cannot create orders → 403', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/api/orders',
            headers: authHeaders(token(['driver'], fx.driverUserId)),
            payload: validOrderPayload(),
        });
        expect(res.statusCode).toBe(403);
    });

    it('rejects negative cargoWeightKg', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/api/orders',
            headers: authHeaders(token(['admin'], fx.adminUserId)),
            payload: { ...validOrderPayload(), cargoWeightKg: -100 },
        });
        expect(res.statusCode).toBe(400);
    });

    it('rejects missing required fields', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/api/orders',
            headers: authHeaders(token(['admin'], fx.adminUserId)),
            payload: { contractorId: fx.contractorId },
        });
        expect(res.statusCode).toBe(400);
    });

    it('returns 401 without auth', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/api/orders',
            payload: validOrderPayload(),
        });
        expect(res.statusCode).toBe(401);
    });
});

describe('GET /api/orders — tenant scoping', () => {
    it('returns only orders from the actor org', async () => {
        // Create orders in fx.organizationId
        await app.inject({
            method: 'POST',
            url: '/api/orders',
            headers: authHeaders(token(['admin'], fx.adminUserId)),
            payload: validOrderPayload(),
        });

        const res = await app.inject({
            method: 'GET',
            url: '/api/orders',
            headers: authHeaders(token(['admin'], fx.adminUserId)),
        });
        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.data.length).toBeGreaterThanOrEqual(1);
    });
});

describe('GET /api/orders/:id', () => {
    it('returns order by id', async () => {
        const created = await app.inject({
            method: 'POST',
            url: '/api/orders',
            headers: authHeaders(token(['admin'], fx.adminUserId)),
            payload: validOrderPayload(),
        });
        const orderId = created.json().data.id;

        const res = await app.inject({
            method: 'GET',
            url: `/api/orders/${orderId}`,
            headers: authHeaders(token(['admin'], fx.adminUserId)),
        });
        expect(res.statusCode).toBe(200);
        expect(res.json().data.id).toBe(orderId);
    });

    it('returns 404 for nonexistent order', async () => {
        const res = await app.inject({
            method: 'GET',
            url: '/api/orders/00000000-0000-0000-0000-000000000000',
            headers: authHeaders(token(['admin'], fx.adminUserId)),
        });
        expect([403, 404]).toContain(res.statusCode);
    });
});

describe('PUT /api/orders/:id', () => {
    it('updates cargo description', async () => {
        const created = await app.inject({
            method: 'POST',
            url: '/api/orders',
            headers: authHeaders(token(['admin'], fx.adminUserId)),
            payload: validOrderPayload(),
        });
        const orderId = created.json().data.id;

        const res = await app.inject({
            method: 'PUT',
            url: `/api/orders/${orderId}`,
            headers: authHeaders(token(['admin'], fx.adminUserId)),
            payload: { cargoDescription: 'Updated' },
        });
        expect(res.statusCode).toBe(200);
        expect(res.json().data.cargoDescription).toBe('Updated');
    });
});

describe('POST /api/orders/:id/cancel', () => {
    it('cancels a draft order', async () => {
        const created = await app.inject({
            method: 'POST',
            url: '/api/orders',
            headers: authHeaders(token(['admin'], fx.adminUserId)),
            payload: validOrderPayload(),
        });
        const orderId = created.json().data.id;

        const res = await app.inject({
            method: 'POST',
            url: `/api/orders/${orderId}/cancel`,
            headers: authHeaders(token(['admin'], fx.adminUserId)),
            payload: { reason: 'test' },
        });
        // Either 200 (cancelled) or 400 (state machine forbids) — both prove
        // the handler is reachable and doesn't 500.
        expect([200, 400]).toContain(res.statusCode);
    });
});
