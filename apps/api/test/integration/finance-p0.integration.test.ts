// ============================================================
// Integration tests — P0 finance fixes (full-audit-2026-05-28).
//   S1: cross-tenant IDOR на invoice-workflow (issue/payment/cancel/correction)
//       — actor чужой орг получает 403, не может мутировать чужой счёт.
//   F1: выпуск СФ с vatRate без построчного allocatedVat → vatAmount > 0
//       (раньше всегда 0 → юр-недействительный СФ).
// ============================================================
import './setup.js';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import {
    ensureTestDbReady, truncateAllTables, seedBaseFixture, buildTestApp,
    signTestToken, authHeaders, getTestDb, type BaseFixture,
} from './setup.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;
let fx: BaseFixture;
let orgBId: string;
let orgBUserId: string;
let orgBContractorId: string;

beforeAll(async () => {
    await ensureTestDbReady();
    app = await buildTestApp({
        routes: [async (a) => {
            const financeRoutes = (await import('../../src/modules/finance/routes.js')).default;
            await a.register(financeRoutes, { prefix: '/api' });
        }],
    });
});
afterAll(async () => { await app.close(); });

beforeEach(async () => {
    await truncateAllTables();
    fx = await seedBaseFixture();
    const db = await getTestDb();
    const schema = await import('../../src/db/schema.js');
    const { eq } = await import('drizzle-orm');
    const { hashPassword } = await import('../../src/auth/auth.js');
    await db.update(schema.organizations).set({ taxRegime: 'osno' })
        .where(eq(schema.organizations.id, fx.organizationId));

    const [orgB] = await db.insert(schema.organizations).values({ name: 'Org B', taxRegime: 'osno' }).returning();
    orgBId = orgB!.id;
    const [userB] = await db.insert(schema.users).values({
        email: 'admin-b@test.local', passwordHash: await hashPassword('IntegrationTest1!'),
        fullName: 'B Admin', roles: ['admin'], organizationId: orgBId, isActive: true, emailVerifiedAt: new Date(),
    }).returning();
    orgBUserId = userB!.id;
    const [cB] = await db.insert(schema.contractors).values({
        name: 'B Contractor', inn: '7777777777', legalAddress: 'B', organizationId: orgBId,
    }).returning();
    orgBContractorId = cB!.id;
});

const tokenA = () => signTestToken(app, { userId: fx.adminUserId, roles: ['admin'], organizationId: fx.organizationId });
const tokenB = () => signTestToken(app, { userId: orgBUserId, roles: ['admin'], organizationId: orgBId });

async function seedDeliveredOrder(number: string) {
    const db = await getTestDb();
    const schema = await import('../../src/db/schema.js');
    const [o] = await db.insert(schema.orders).values({
        number, contractorId: fx.contractorId, contractId: fx.contractId, status: 'delivered',
        loadingAddress: 'L', unloadingAddress: 'U', unloadingDate: new Date(),
        cargoDescription: 'C', cargoWeightKg: '1000', cargoVolumeM3: '10',
        organizationId: fx.organizationId, createdBy: fx.adminUserId,
    }).returning();
    return o!;
}

async function createDraftA(): Promise<{ id: string }> {
    const res = await app.inject({
        method: 'POST', url: '/api/finance/invoices/draft',
        headers: authHeaders(tokenA()),
        payload: { invoiceType: 'sf', payerId: fx.contractorId },
    });
    return res.json().data;
}

describe('P0-F1 — VAT рассчитывается при выпуске СФ без построчного allocatedVat', () => {
    it('issue с vatRate=20 (НДС сверху) → vatAmount ≈ 1000/1.2 разница, не 0', async () => {
        const draft = await createDraftA();
        const order = await seedDeliveredOrder('ORD-VAT-1');
        const res = await app.inject({
            method: 'POST', url: `/api/finance/invoices/${draft.id}/issue`,
            headers: authHeaders(tokenA()),
            payload: { basisText: 'Договор № 1', vatRate: 20, includesVat: true, overdueReason: 'demo', invoiceOrders: [{ orderId: order.id, allocatedAmount: 1200 }] },
        });
        expect(res.statusCode).toBe(200);
        // Прочитать выпущенный счёт.
        const get = await app.inject({ method: 'GET', url: `/api/finance/invoices/${draft.id}`, headers: authHeaders(tokenA()) });
        const inv = get.json().data;
        expect(Number(inv.vatAmount)).toBeGreaterThan(0);
        expect(Number(inv.vatAmount)).toBeCloseTo(200, 0); // 1200 - 1200/1.2 = 200
        expect(Number(inv.subtotal)).toBeCloseTo(1000, 0);
    });
});

describe('P0-S1 — cross-tenant IDOR заблокирован', () => {
    it('actor орг B не может зарегистрировать оплату по счёту орг A (403)', async () => {
        const draft = await createDraftA();
        const order = await seedDeliveredOrder('ORD-S1-1');
        await app.inject({
            method: 'POST', url: `/api/finance/invoices/${draft.id}/issue`,
            headers: authHeaders(tokenA()),
            payload: { basisText: 'Договор № 1', vatRate: 20, includesVat: true, overdueReason: 'demo', invoiceOrders: [{ orderId: order.id, allocatedAmount: 1200 }] },
        });
        const res = await app.inject({
            method: 'POST', url: `/api/finance/invoices/${draft.id}/register-payment`,
            headers: authHeaders(tokenB()),
            payload: { amount: 100 },
        });
        expect(res.statusCode).toBe(403);
    });

    it('C3 (механизм «б»): org-less admin не может оперировать чужим счётом (workflow guard) → 403', async () => {
        const draft = await createDraftA();
        const order = await seedDeliveredOrder('ORD-ORGLESS-1');
        await app.inject({
            method: 'POST', url: `/api/finance/invoices/${draft.id}/issue`,
            headers: authHeaders(tokenA()),
            payload: { basisText: 'Договор № 1', vatRate: 20, includesVat: true, overdueReason: 'demo', invoiceOrders: [{ orderId: order.id, allocatedAmount: 1200 }] },
        });
        // admin без organizationId (мисконфиг/недо-онбординг) — раньше проходил мимо org-чека.
        const tokenNoOrg = signTestToken(app, { userId: fx.adminUserId, roles: ['admin'] });
        const res = await app.inject({
            method: 'POST', url: `/api/finance/invoices/${draft.id}/register-payment`,
            headers: authHeaders(tokenNoOrg),
            payload: { amount: 100 },
        });
        expect(res.statusCode).toBe(403);
    });

    it('actor орг B не может отменить счёт орг A (403)', async () => {
        const draft = await createDraftA();
        const res = await app.inject({
            method: 'POST', url: `/api/finance/invoices/${draft.id}/cancel`,
            headers: authHeaders(tokenB()),
            payload: { cancellationReason: 'хочу отменить чужой' },
        });
        expect(res.statusCode).toBe(403);
    });

    it('createDraft с payerId чужого контрагента → 403', async () => {
        const res = await app.inject({
            method: 'POST', url: '/api/finance/invoices/draft',
            headers: authHeaders(tokenA()),
            payload: { invoiceType: 'sf', payerId: orgBContractorId },
        });
        expect(res.statusCode).toBe(403);
    });

    it('свой счёт — actor орг A регистрирует оплату успешно (не 403)', async () => {
        const draft = await createDraftA();
        const order = await seedDeliveredOrder('ORD-S1-OWN');
        await app.inject({
            method: 'POST', url: `/api/finance/invoices/${draft.id}/issue`,
            headers: authHeaders(tokenA()),
            payload: { basisText: 'Договор № 1', vatRate: 20, includesVat: true, overdueReason: 'demo', invoiceOrders: [{ orderId: order.id, allocatedAmount: 1200 }] },
        });
        const res = await app.inject({
            method: 'POST', url: `/api/finance/invoices/${draft.id}/register-payment`,
            headers: authHeaders(tokenA()),
            payload: { amount: 100 },
        });
        expect(res.statusCode).not.toBe(403);
    });
});
