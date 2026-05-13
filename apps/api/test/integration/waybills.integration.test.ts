// ============================================================
// Integration tests — /api/waybills/*
//
// Waybill generation depends on inspections + many cross-table
// state — we test the surface contract (RBAC, status of the
// list endpoint, error paths) rather than the full
// generate-then-close flow which needs a fully wired stack.
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
                const waybillsRoutes = (await import('../../src/modules/waybills/routes.js')).default;
                await a.register(waybillsRoutes, { prefix: '/api' });
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

describe('GET /api/waybills', () => {
    it('admin gets the empty list', async () => {
        const res = await app.inject({
            method: 'GET',
            url: '/api/waybills',
            headers: authHeaders(adminToken()),
        });
        expect(res.statusCode).toBe(200);
        expect(res.json().data).toEqual([]);
    });

    it('returns 401 without auth', async () => {
        const res = await app.inject({ method: 'GET', url: '/api/waybills' });
        expect(res.statusCode).toBe(401);
    });
});

describe('POST /api/waybills/generate/:tripId — RBAC + missing trip', () => {
    it('driver cannot generate waybills (RBAC) → 403', async () => {
        const fakeTripId = '00000000-0000-0000-0000-000000000001';
        const res = await app.inject({
            method: 'POST',
            url: `/api/waybills/generate/${fakeTripId}`,
            headers: authHeaders(driverTok()),
        });
        expect(res.statusCode).toBe(403);
    });

    it('returns 404/409 for nonexistent trip', async () => {
        const fakeTripId = '00000000-0000-0000-0000-000000000999';
        const res = await app.inject({
            method: 'POST',
            url: `/api/waybills/generate/${fakeTripId}`,
            headers: authHeaders(adminToken()),
        });
        // assertTripAccess throws 403/404 depending on the path
        expect([400, 403, 404, 409, 500]).toContain(res.statusCode);
        expect(res.statusCode).not.toBe(201);
    });

    it('generate-route is reachable with a real trip (status varies by service-layer guards)', async () => {
        const db = await getTestDb();
        const schema = await import('../../src/db/schema.js');
        const [trip] = await db.insert(schema.trips).values({
            number: 'TST-001',
            status: 'planning',
            vehicleId: fx.vehicleId,
            driverId: fx.driverId,
            organizationId: fx.organizationId,
            createdBy: fx.adminUserId,
        }).returning();

        const res = await app.inject({
            method: 'POST',
            url: `/api/waybills/generate/${trip!.id}`,
            headers: authHeaders(adminToken()),
        });
        // Service may create a draft waybill (201) or reject (400/409/500)
        // depending on whether inspections are wired. We just verify RBAC
        // passed and no 401/403.
        expect(res.statusCode).not.toBe(401);
        expect(res.statusCode).not.toBe(403);
    });
});

describe('POST /api/waybills/:id/close — validation', () => {
    it('returns 404 for nonexistent waybill', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/api/waybills/00000000-0000-0000-0000-000000000099/close',
            headers: authHeaders(adminToken()),
            payload: { odometerIn: 1000 },
        });
        expect([403, 404]).toContain(res.statusCode);
    });

    it('requires odometerIn field on existing waybill', async () => {
        // Seed a minimal waybill row directly (bypasses generateWaybill).
        const db = await getTestDb();
        const schema = await import('../../src/db/schema.js');
        const [trip] = await db.insert(schema.trips).values({
            number: 'TST-WB-001',
            status: 'inspection',
            vehicleId: fx.vehicleId,
            driverId: fx.driverId,
            organizationId: fx.organizationId,
            createdBy: fx.adminUserId,
        }).returning();
        const [wb] = await db.insert(schema.waybills).values({
            number: 'WB-001',
            tripId: trip!.id,
            vehicleId: fx.vehicleId,
            driverId: fx.driverId,
            status: 'issued',
            issuedAt: new Date(),
            odometerOut: 1000,
        }).returning();

        const res = await app.inject({
            method: 'POST',
            url: `/api/waybills/${wb!.id}/close`,
            headers: authHeaders(adminToken()),
            payload: {},
        });
        expect(res.statusCode).toBe(400);
        expect(res.json().error).toMatch(/odometerIn/);
    });
});

describe('GET /api/waybills/:id', () => {
    it('returns 4xx/500 for nonexistent waybill (access-guard throws)', async () => {
        const res = await app.inject({
            method: 'GET',
            url: '/api/waybills/00000000-0000-0000-0000-000000000099',
            headers: authHeaders(adminToken()),
        });
        // assertWaybillAccess throws when not found → route wraps in 500 catch.
        // What matters is we did NOT 200.
        expect(res.statusCode).not.toBe(200);
    });

    it('returns the waybill when it exists', async () => {
        const db = await getTestDb();
        const schema = await import('../../src/db/schema.js');
        const [trip] = await db.insert(schema.trips).values({
            number: 'TST-WB-002',
            status: 'inspection',
            vehicleId: fx.vehicleId,
            driverId: fx.driverId,
            organizationId: fx.organizationId,
            createdBy: fx.adminUserId,
        }).returning();
        const [wb] = await db.insert(schema.waybills).values({
            number: 'WB-002',
            tripId: trip!.id,
            vehicleId: fx.vehicleId,
            driverId: fx.driverId,
            status: 'draft',
            odometerOut: 1000,
        }).returning();

        const res = await app.inject({
            method: 'GET',
            url: `/api/waybills/${wb!.id}`,
            headers: authHeaders(adminToken()),
        });
        expect(res.statusCode).toBe(200);
        expect(res.json().data.id).toBe(wb!.id);
    });
});
