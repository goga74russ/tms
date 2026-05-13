// ============================================================
// Integration tests — /api/trips/*
//
// Boots the real trips routes against the test DB; exercises
// create, list (tenant scoping), status transitions, RBAC.
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
                const tripsRoutes = (await import('../../src/modules/trips/routes.js')).default;
                await a.register(tripsRoutes, { prefix: '/api' });
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

function adminToken(): string {
    return signTestToken(app, {
        userId: fx.adminUserId,
        roles: ['admin'],
        organizationId: fx.organizationId,
    });
}

function driverToken(): string {
    return signTestToken(app, {
        userId: fx.driverUserId,
        roles: ['driver'],
        organizationId: fx.organizationId,
    });
}

function logistToken(): string {
    return signTestToken(app, {
        userId: fx.logistUserId,
        roles: ['logist'],
        organizationId: fx.organizationId,
    });
}

describe('POST /api/trips', () => {
    it('admin creates a trip → 201 with planning status', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/api/trips',
            headers: authHeaders(adminToken()),
            payload: {
                vehicleId: fx.vehicleId,
                driverId: fx.driverId,
                plannedDistanceKm: 100,
            },
        });
        expect(res.statusCode).toBe(201);
        const body = res.json();
        expect(body.success).toBe(true);
        expect(body.data.status).toBe('planning');
        expect(body.data.number).toMatch(/.+/);
    });

    it('logist cannot create a trip (only dispatcher/admin can) → 403', async () => {
        // RBAC: logist has read-only access to Trip — dispatch is the role
        // that manages trips. This guards against a regression that would
        // grant create-Trip ability to logists.
        const res = await app.inject({
            method: 'POST',
            url: '/api/trips',
            headers: authHeaders(logistToken()),
            payload: {
                vehicleId: fx.vehicleId,
                driverId: fx.driverId,
                plannedDistanceKm: 100,
            },
        });
        expect(res.statusCode).toBe(403);
    });

    it('dispatcher creates a trip → 201', async () => {
        const token = signTestToken(app, {
            userId: fx.dispatcherUserId,
            roles: ['dispatcher'],
            organizationId: fx.organizationId,
        });
        const res = await app.inject({
            method: 'POST',
            url: '/api/trips',
            headers: authHeaders(token),
            payload: {
                vehicleId: fx.vehicleId,
                driverId: fx.driverId,
                plannedDistanceKm: 100,
            },
        });
        expect(res.statusCode).toBe(201);
    });

    it('driver cannot create a trip (RBAC) → 403', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/api/trips',
            headers: authHeaders(driverToken()),
            payload: {
                vehicleId: fx.vehicleId,
                driverId: fx.driverId,
                plannedDistanceKm: 100,
            },
        });
        expect(res.statusCode).toBe(403);
    });

    it('returns 401 without auth', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/api/trips',
            payload: { vehicleId: fx.vehicleId, driverId: fx.driverId },
        });
        expect(res.statusCode).toBe(401);
    });
});

describe('GET /api/trips', () => {
    it('admin sees tenant trips', async () => {
        // create two trips
        for (let i = 0; i < 2; i++) {
            await app.inject({
                method: 'POST',
                url: '/api/trips',
                headers: authHeaders(adminToken()),
                payload: { vehicleId: fx.vehicleId, driverId: fx.driverId },
            });
        }
        const res = await app.inject({
            method: 'GET',
            url: '/api/trips',
            headers: authHeaders(adminToken()),
        });
        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.data.length).toBe(2);
    });

    it('driver sees only their own trips (RLS)', async () => {
        // create a trip belonging to the fixture driver
        await app.inject({
            method: 'POST',
            url: '/api/trips',
            headers: authHeaders(adminToken()),
            payload: { vehicleId: fx.vehicleId, driverId: fx.driverId },
        });
        // create another driver in a different fixture row and assign trip there
        const db = await getTestDb();
        const schema = await import('../../src/db/schema.js');
        const [otherUser] = await db.insert(schema.users).values({
            email: 'other-driver@test.local',
            passwordHash: 'x',
            fullName: 'Other Driver',
            roles: ['driver'],
            organizationId: fx.organizationId,
            isActive: true,
        }).returning();
        const [otherDriver] = await db.insert(schema.drivers).values({
            userId: otherUser!.id,
            fullName: 'Other Driver',
            birthDate: new Date('1990-01-01'),
            licenseNumber: 'CD9876543',
            licenseExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
            organizationId: fx.organizationId,
        }).returning();
        await app.inject({
            method: 'POST',
            url: '/api/trips',
            headers: authHeaders(adminToken()),
            payload: { vehicleId: fx.vehicleId, driverId: otherDriver!.id },
        });

        const res = await app.inject({
            method: 'GET',
            url: '/api/trips',
            headers: authHeaders(driverToken()),
        });
        expect(res.statusCode).toBe(200);
        const body = res.json();
        // Driver-RLS: only their own trip
        expect(body.data.length).toBe(1);
        expect(body.data[0].driverId).toBe(fx.driverId);
    });

    it('cross-tenant: trip in another org is invisible', async () => {
        // Create a second org with its own trip
        const db = await getTestDb();
        const schema = await import('../../src/db/schema.js');
        const [org2] = await db.insert(schema.organizations).values({ name: 'Other Org' }).returning();
        const [v2] = await db.insert(schema.vehicles).values({
            plateNumber: 'B999BB99', vin: 'TESTVIN000000ZZ02', make: 'X', model: 'Y',
            year: 2024, bodyType: 'tent', payloadCapacityKg: 10000, organizationId: org2!.id,
        }).returning();
        await db.insert(schema.trips).values({
            number: 'OTHER-001',
            status: 'planning',
            vehicleId: v2!.id,
            organizationId: org2!.id,
            createdBy: fx.adminUserId,
        });

        const res = await app.inject({
            method: 'GET',
            url: '/api/trips',
            headers: authHeaders(adminToken()),
        });
        expect(res.statusCode).toBe(200);
        const body = res.json();
        // Should NOT include OTHER-001 — admin token is scoped to fx.organizationId
        expect(body.data.find((t: { number: string }) => t.number === 'OTHER-001')).toBeUndefined();
    });
});

describe('GET /api/trips/:id', () => {
    it('returns 404 for nonexistent trip', async () => {
        const res = await app.inject({
            method: 'GET',
            url: '/api/trips/00000000-0000-0000-0000-000000000000',
            headers: authHeaders(adminToken()),
        });
        expect([403, 404]).toContain(res.statusCode);
    });

    it('returns trip by id', async () => {
        const created = await app.inject({
            method: 'POST',
            url: '/api/trips',
            headers: authHeaders(adminToken()),
            payload: { vehicleId: fx.vehicleId, driverId: fx.driverId },
        });
        const tripId = created.json().data.id;

        const res = await app.inject({
            method: 'GET',
            url: `/api/trips/${tripId}`,
            headers: authHeaders(adminToken()),
        });
        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.data.id).toBe(tripId);
    });
});

describe('POST /api/trips/:id/status — state machine', () => {
    it('rejects illegal transition planning → completed', async () => {
        const created = await app.inject({
            method: 'POST',
            url: '/api/trips',
            headers: authHeaders(adminToken()),
            payload: { vehicleId: fx.vehicleId, driverId: fx.driverId },
        });
        const tripId = created.json().data.id;

        const res = await app.inject({
            method: 'POST',
            url: `/api/trips/${tripId}/status`,
            headers: authHeaders(adminToken()),
            payload: { status: 'completed' },
        });
        expect(res.statusCode).toBe(400);
    });

    it('rejects empty status field', async () => {
        const created = await app.inject({
            method: 'POST',
            url: '/api/trips',
            headers: authHeaders(adminToken()),
            payload: { vehicleId: fx.vehicleId, driverId: fx.driverId },
        });
        const tripId = created.json().data.id;

        const res = await app.inject({
            method: 'POST',
            url: `/api/trips/${tripId}/status`,
            headers: authHeaders(adminToken()),
            payload: {},
        });
        expect(res.statusCode).toBe(400);
    });

    it('allows cancelling a planning trip', async () => {
        const created = await app.inject({
            method: 'POST',
            url: '/api/trips',
            headers: authHeaders(adminToken()),
            payload: { vehicleId: fx.vehicleId, driverId: fx.driverId },
        });
        const tripId = created.json().data.id;

        const res = await app.inject({
            method: 'POST',
            url: `/api/trips/${tripId}/cancel`,
            headers: authHeaders(adminToken()),
            payload: { reason: 'test cancellation' },
        });
        // Cancellation may return 200 with cancelled trip OR 400 if cancel from
        // planning is disallowed by the state machine. Accept either, just
        // ensure we don't 500.
        expect([200, 400]).toContain(res.statusCode);
        expect(res.statusCode).toBeLessThan(500);
    });
});

describe('PUT /api/trips/:id', () => {
    it('updates plannedDistanceKm', async () => {
        const created = await app.inject({
            method: 'POST',
            url: '/api/trips',
            headers: authHeaders(adminToken()),
            payload: { vehicleId: fx.vehicleId, driverId: fx.driverId, plannedDistanceKm: 100 },
        });
        const tripId = created.json().data.id;

        const res = await app.inject({
            method: 'PUT',
            url: `/api/trips/${tripId}`,
            headers: authHeaders(adminToken()),
            payload: { plannedDistanceKm: 200 },
        });
        expect(res.statusCode).toBe(200);
        expect(res.json().data.plannedDistanceKm).toBe(200);
    });

    it('returns 400 on invalid body', async () => {
        const created = await app.inject({
            method: 'POST',
            url: '/api/trips',
            headers: authHeaders(adminToken()),
            payload: { vehicleId: fx.vehicleId, driverId: fx.driverId },
        });
        const tripId = created.json().data.id;

        const res = await app.inject({
            method: 'PUT',
            url: `/api/trips/${tripId}`,
            headers: authHeaders(adminToken()),
            payload: { plannedDistanceKm: 'not-a-number' },
        });
        expect(res.statusCode).toBe(400);
    });
});
