// ============================================================
// Integration tests — T-14 «5-day SF warning» (invoice-spec.md §6).
//
// ст. 168 ч. 3 НК: СФ/УПД выпускается в течение 5 календарных дней от даты
// реализации. Реализация = MAX(unloading_date) связанных заявок.
//
// Покрывает:
//   • выпуск СФ позже 5 дней без причины → 422 SF_OVERDUE_WARNING (soft-gate)
//   • тот же выпуск С причиной → проходит (issued), факт+причина в журнале
//   • выпуск в срок → без warning
//   • GET /finance/invoices/overdue → отчёт с daysLate + причиной, org-scoped
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
    // СФ/УПД разрешены только плательщикам НДС.
    const db = await getTestDb();
    const schema = await import('../../src/db/schema.js');
    const { eq } = await import('drizzle-orm');
    await db.update(schema.organizations).set({ taxRegime: 'osno' })
        .where(eq(schema.organizations.id, fx.organizationId));
});

function adminToken() {
    return signTestToken(app, { userId: fx.adminUserId, roles: ['admin'], organizationId: fx.organizationId });
}

async function seedDeliveredOrder(opts: { number: string; unloadedDaysAgo: number }) {
    const db = await getTestDb();
    const schema = await import('../../src/db/schema.js');
    const unloadingDate = new Date(Date.now() - opts.unloadedDaysAgo * 24 * 60 * 60 * 1000);
    const [order] = await db.insert(schema.orders).values({
        number: opts.number,
        contractorId: fx.contractorId,
        contractId: fx.contractId,
        status: 'delivered',
        loadingAddress: 'Погрузка',
        unloadingAddress: 'Выгрузка',
        unloadingDate,
        cargoDescription: 'Груз',
        cargoWeightKg: '1000',
        cargoVolumeM3: '10',
        organizationId: fx.organizationId,
        createdBy: fx.adminUserId,
    }).returning();
    return order!;
}

async function createSfDraft() {
    const res = await app.inject({
        method: 'POST', url: '/api/finance/invoices/draft',
        headers: authHeaders(adminToken()),
        payload: { invoiceType: 'sf', payerId: fx.contractorId },
    });
    return res.json().data as { id: string; number: string };
}

describe('T-14 — выпуск СФ с просрочкой (reactive warning)', () => {
    it('просрочка >5 дней без причины → 422 SF_OVERDUE_WARNING с деталями', async () => {
        const draft = await createSfDraft();
        const order = await seedDeliveredOrder({ number: 'ORD-OVD-1', unloadedDaysAgo: 30 });

        const res = await app.inject({
            method: 'POST', url: `/api/finance/invoices/${draft.id}/issue`,
            headers: authHeaders(adminToken()),
            payload: {
                basisText: 'Договор № 1 от 01.01.2026',
                vatRate: 20,
                invoiceOrders: [{ orderId: order.id, allocatedAmount: 1000 }],
            },
        });
        expect(res.statusCode).toBe(422);
        const body = res.json();
        expect(body.code).toBe('SF_OVERDUE_WARNING');
        expect(body.details.daysLate).toBeGreaterThan(0);
        expect(body.details.requiresOverdueReason).toBe(true);
    });

    it('та же просрочка С причиной → выпуск проходит (issued)', async () => {
        const draft = await createSfDraft();
        const order = await seedDeliveredOrder({ number: 'ORD-OVD-2', unloadedDaysAgo: 30 });

        const res = await app.inject({
            method: 'POST', url: `/api/finance/invoices/${draft.id}/issue`,
            headers: authHeaders(adminToken()),
            payload: {
                basisText: 'Договор № 1 от 01.01.2026',
                vatRate: 20,
                overdueReason: 'Поздно получили первичку от заказчика',
                invoiceOrders: [{ orderId: order.id, allocatedAmount: 1000 }],
            },
        });
        expect(res.statusCode).toBe(200);
        expect(res.json().data.overdue).toBe(true);
    });

    it('выпуск в срок (разгрузка 2 дня назад) → без warning', async () => {
        const draft = await createSfDraft();
        const order = await seedDeliveredOrder({ number: 'ORD-INTIME', unloadedDaysAgo: 2 });

        const res = await app.inject({
            method: 'POST', url: `/api/finance/invoices/${draft.id}/issue`,
            headers: authHeaders(adminToken()),
            payload: {
                basisText: 'Договор № 1 от 01.01.2026',
                vatRate: 20,
                invoiceOrders: [{ orderId: order.id, allocatedAmount: 1000 }],
            },
        });
        expect(res.statusCode).toBe(200);
        expect(res.json().data.overdue).toBeUndefined();
    });
});

describe('T-14 — отчёт GET /finance/invoices/overdue (spec §6)', () => {
    it('возвращает выпущенный с просрочкой СФ с daysLate и причиной', async () => {
        const draft = await createSfDraft();
        const order = await seedDeliveredOrder({ number: 'ORD-RPT', unloadedDaysAgo: 20 });
        await app.inject({
            method: 'POST', url: `/api/finance/invoices/${draft.id}/issue`,
            headers: authHeaders(adminToken()),
            payload: {
                basisText: 'Договор № 1 от 01.01.2026',
                vatRate: 20,
                overdueReason: 'Просрочка по вине заказчика',
                invoiceOrders: [{ orderId: order.id, allocatedAmount: 1000 }],
            },
        });

        const res = await app.inject({
            method: 'GET', url: '/api/finance/invoices/overdue',
            headers: authHeaders(adminToken()),
        });
        expect(res.statusCode).toBe(200);
        const rows = res.json().data as Array<{ id: string; daysLate: number; overdueReason: string | null }>;
        expect(rows.length).toBe(1);
        expect(rows[0]!.id).toBe(draft.id);
        expect(rows[0]!.daysLate).toBeGreaterThan(0);
        expect(rows[0]!.overdueReason).toBe('Просрочка по вине заказчика');
    });

    it('счёт, выпущенный в срок, в отчёт НЕ попадает', async () => {
        const draft = await createSfDraft();
        const order = await seedDeliveredOrder({ number: 'ORD-RPT-OK', unloadedDaysAgo: 1 });
        await app.inject({
            method: 'POST', url: `/api/finance/invoices/${draft.id}/issue`,
            headers: authHeaders(adminToken()),
            payload: {
                basisText: 'Договор № 1 от 01.01.2026',
                vatRate: 20,
                invoiceOrders: [{ orderId: order.id, allocatedAmount: 1000 }],
            },
        });
        const res = await app.inject({
            method: 'GET', url: '/api/finance/invoices/overdue',
            headers: authHeaders(adminToken()),
        });
        expect(res.statusCode).toBe(200);
        expect((res.json().data as unknown[]).length).toBe(0);
    });
});
