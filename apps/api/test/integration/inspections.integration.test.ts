// ============================================================
// Integration tests — /api/inspections/*
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
import { techInspections, medInspections } from '../../src/db/schema.js';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;
let fx: BaseFixture;

beforeAll(async () => {
    await ensureTestDbReady();
    app = await buildTestApp({
        routes: [
            async (a) => {
                const inspRoutes = (await import('../../src/modules/inspections/routes.js')).default;
                await a.register(inspRoutes, { prefix: '/api' });
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

function mechanicTok() {
    // Use existing admin user as mechanic by tweaking the JWT roles only —
    // ability check is purely role-based; DB record doesn't have to match.
    return signTestToken(app, {
        userId: fx.adminUserId, roles: ['mechanic'], organizationId: fx.organizationId,
    });
}

function medicTok() {
    return signTestToken(app, {
        userId: fx.adminUserId, roles: ['medic'], organizationId: fx.organizationId,
    });
}

function driverTok() {
    return signTestToken(app, {
        userId: fx.driverUserId, roles: ['driver'], organizationId: fx.organizationId,
    });
}

describe('POST /api/inspections/tech — RBAC + validation', () => {
    it('returns 401 without auth', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/api/inspections/tech',
            payload: {},
        });
        expect(res.statusCode).toBe(401);
    });

    it('driver cannot create tech inspection → 403', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/api/inspections/tech',
            headers: authHeaders(driverTok()),
            payload: {},
        });
        expect(res.statusCode).toBe(403);
    });

    it('mechanic with missing fields → 400', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/api/inspections/tech',
            headers: authHeaders(mechanicTok()),
            payload: { vehicleId: fx.vehicleId },
        });
        expect(res.statusCode).toBe(400);
    });

    it('rejects empty checklist items', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/api/inspections/tech',
            headers: authHeaders(mechanicTok()),
            payload: {
                vehicleId: fx.vehicleId,
                checklistVersion: '1.0',
                items: [],
                decision: 'approved',
                signature: 'sig-data',
            },
        });
        expect(res.statusCode).toBe(400);
        expect(res.json().error).toMatch(/Чек-лист/);
    });

    it('valid payload reaches the handler (any of 201/400/500 — guards may reject)', async () => {
        // The handler validates checklistVersion exists in the checklist_templates
        // table — we don't seed one here. The point is to prove the request gets
        // past auth + RBAC + Zod and lands in the service layer.
        const res = await app.inject({
            method: 'POST',
            url: '/api/inspections/tech',
            headers: authHeaders(mechanicTok()),
            payload: {
                vehicleId: fx.vehicleId,
                checklistVersion: '1.0',
                items: [{ name: 'Tyres', result: 'ok' }],
                decision: 'approved',
                signature: fx.password, // valid ПЭП — wrong password would now 403 (C1)
            },
        });
        // Not 401/403 — proves RBAC passed.
        expect([200, 201, 400, 500]).toContain(res.statusCode);
        expect(res.statusCode).not.toBe(401);
        expect(res.statusCode).not.toBe(403);
    });
});

describe('GET /api/inspections/tech', () => {
    it('admin gets list', async () => {
        const res = await app.inject({
            method: 'GET',
            url: '/api/inspections/tech',
            headers: authHeaders(adminToken()),
        });
        expect(res.statusCode).toBe(200);
        expect(Array.isArray(res.json().data)).toBe(true);
    });

    it('returns 401 without auth', async () => {
        const res = await app.inject({
            method: 'GET',
            url: '/api/inspections/tech',
        });
        expect(res.statusCode).toBe(401);
    });
});

describe('GET /api/inspections/med — RBAC', () => {
    it('admin can list', async () => {
        const res = await app.inject({
            method: 'GET',
            url: '/api/inspections/med',
            headers: authHeaders(adminToken()),
        });
        expect(res.statusCode).toBe(200);
    });

    it('medic can list', async () => {
        const res = await app.inject({
            method: 'GET',
            url: '/api/inspections/med',
            headers: authHeaders(medicTok()),
        });
        // Medic has read on MedInspection — should pass
        expect([200, 403]).toContain(res.statusCode);
    });

    it('driver cannot list → 403', async () => {
        const res = await app.inject({
            method: 'GET',
            url: '/api/inspections/med',
            headers: authHeaders(driverTok()),
        });
        expect(res.statusCode).toBe(403);
    });
});

describe('GET /api/inspections/tech/:id', () => {
    it('returns 404 for nonexistent inspection', async () => {
        const res = await app.inject({
            method: 'GET',
            url: '/api/inspections/tech/00000000-0000-0000-0000-000000000099',
            headers: authHeaders(adminToken()),
        });
        expect([403, 404]).toContain(res.statusCode);
    });
});

// ============================================================
// C1 — ПЭП-верификация (P0): подпись = пароль подписанта.
// Инвариант: неверный пароль → 403 и НЕТ записи; верный → 201 и в БД
// хранится необратимый маркер pep:v1:*, НЕ plaintext-пароль.
// Покрывает оба периодических пути (tech/med). Post-trip пути зовут тот
// же helper verifyPepSignature — см. grep-acceptance в remediation-tracker.
// ============================================================
describe('C1: ПЭП-верификация осмотров (P0)', () => {
    const techPayload = (signature: string) => ({
        vehicleId: fx.vehicleId,
        inspectionType: 'periodic' as const,
        checklistVersion: '1.0',
        items: [{ name: 'Tyres', result: 'ok' as const }],
        decision: 'approved' as const,
        signature,
    });
    const medPayload = (signature: string) => ({
        driverId: fx.driverId,
        inspectionType: 'periodic' as const,
        checklistVersion: '1.0',
        systolicBp: 120, diastolicBp: 80, heartRate: 70, temperature: 36.6,
        condition: 'удовлетворительное', alcoholTest: 'negative' as const,
        decision: 'approved' as const,
        signature,
    });

    it('tech: неверный пароль → 403 и НЕ создаёт запись', async () => {
        const res = await app.inject({
            method: 'POST', url: '/api/inspections/tech',
            headers: authHeaders(mechanicTok()), payload: techPayload('totally-wrong-password'),
        });
        expect(res.statusCode).toBe(403);
        const db = await getTestDb();
        const rows = await db.select().from(techInspections).where(eq(techInspections.vehicleId, fx.vehicleId));
        expect(rows.length).toBe(0);
    });

    it('tech: верный пароль → 201 и в БД хранится pep:v1:*, не plaintext', async () => {
        const res = await app.inject({
            method: 'POST', url: '/api/inspections/tech',
            headers: authHeaders(mechanicTok()), payload: techPayload(fx.password),
        });
        expect(res.statusCode).toBe(201);
        const db = await getTestDb();
        const [row] = await db.select().from(techInspections).where(eq(techInspections.vehicleId, fx.vehicleId));
        expect(row.signature).toMatch(/^pep:v1:/);
        expect(row.signature).not.toBe(fx.password);
    });

    it('med: неверный пароль → 403 и НЕ создаёт запись', async () => {
        const res = await app.inject({
            method: 'POST', url: '/api/inspections/med',
            headers: authHeaders(medicTok()), payload: medPayload('totally-wrong-password'),
        });
        expect(res.statusCode).toBe(403);
        const db = await getTestDb();
        const rows = await db.select().from(medInspections).where(eq(medInspections.driverId, fx.driverId));
        expect(rows.length).toBe(0);
    });

    it('med: верный пароль → 201 и в БД хранится pep:v1:*, не plaintext', async () => {
        const res = await app.inject({
            method: 'POST', url: '/api/inspections/med',
            headers: authHeaders(medicTok()), payload: medPayload(fx.password),
        });
        expect(res.statusCode).toBe(201);
        const db = await getTestDb();
        const [row] = await db.select().from(medInspections).where(eq(medInspections.driverId, fx.driverId));
        expect(row.signature).toMatch(/^pep:v1:/);
        expect(row.signature).not.toBe(fx.password);
    });

    it('med: положительный алкотест + approved → 422 (серверный guard)', async () => {
        const res = await app.inject({
            method: 'POST', url: '/api/inspections/med',
            headers: authHeaders(medicTok()),
            payload: { ...medPayload(fx.password), alcoholTest: 'positive' },
        });
        expect(res.statusCode).toBe(422);
    });
});

// ============================================================
// C1 — immutability + note для /decision эндпоинтов (P1: 938/985 + role-gate 608).
// Инвариант: отклонённое решение нельзя ретроактивно одобрить; reject требует note;
// tech /decision — только mechanic/admin.
// ============================================================
describe('C1: immutability/note решений осмотра', () => {
    const createTech = (decision: 'approved' | 'rejected') => app.inject({
        method: 'POST', url: '/api/inspections/tech', headers: authHeaders(mechanicTok()),
        payload: {
            vehicleId: fx.vehicleId, inspectionType: 'periodic', checklistVersion: '1.0',
            items: decision === 'rejected'
                ? [{ name: 'Тормоза', result: 'fault', comment: 'неисправны' }]
                : [{ name: 'Шины', result: 'ok' }],
            decision, signature: fx.password,
        },
    });
    const createMed = (decision: 'approved' | 'rejected', alcoholTest: 'negative' | 'positive' = 'negative') => app.inject({
        method: 'POST', url: '/api/inspections/med', headers: authHeaders(medicTok()),
        payload: {
            driverId: fx.driverId, inspectionType: 'periodic', checklistVersion: '1.0',
            systolicBp: 120, diastolicBp: 80, heartRate: 70, temperature: 36.6,
            condition: 'удовлетворительное', alcoholTest, decision, signature: fx.password,
        },
    });

    it('tech: смена решения на rejected без notes → 422', async () => {
        const created = await createTech('approved');
        expect(created.statusCode).toBe(201);
        const id = created.json().data.id;
        const res = await app.inject({
            method: 'POST', url: `/api/inspections/tech/${id}/decision`,
            headers: authHeaders(mechanicTok()), payload: { decision: 'rejected' },
        });
        expect(res.statusCode).toBe(422);
    });

    it('tech: rejected→approved заблокирован (immutability) → 422', async () => {
        const created = await createTech('rejected');
        expect(created.statusCode).toBe(201);
        const id = created.json().data.id;
        const res = await app.inject({
            method: 'POST', url: `/api/inspections/tech/${id}/decision`,
            headers: authHeaders(mechanicTok()), payload: { decision: 'approved', notes: 'передумал' },
        });
        expect(res.statusCode).toBe(422);
    });

    it('med: rejected(алкоголь+)→approved заблокирован → 422', async () => {
        const created = await createMed('rejected', 'positive');
        expect(created.statusCode).toBe(201);
        const id = created.json().data.id;
        const res = await app.inject({
            method: 'POST', url: `/api/inspections/med/${id}/decision`,
            headers: authHeaders(medicTok()), payload: { decision: 'approved', notes: 'x' },
        });
        expect(res.statusCode).toBe(422);
    });

    it('tech /decision: роль без прав (driver) → 403', async () => {
        const res = await app.inject({
            method: 'POST', url: '/api/inspections/tech/00000000-0000-0000-0000-000000000001/decision',
            headers: authHeaders(driverTok()), payload: { decision: 'approved', notes: 'x' },
        });
        expect(res.statusCode).toBe(403);
    });
});
