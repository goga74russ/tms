// ============================================================
// Integration tests — M-batch invoice-workflow.service endpoints.
//
// Covers (T-9 W4):
//   POST /finance/invoices/draft
//   POST /finance/invoices/:id/issue
//   POST /finance/invoices/:id/corrections
//   POST /finance/invoices/:id/register-payment
//   POST /finance/invoices/:id/cancel
//
// Test plan по spec §10 acceptance + invoice-spec-acceptance-M.md:
//   1. draft creation + FSM (immediately can transition draft → issued)
//   2. issue requires basis_text + invoice_orders (422 на отсутствии)
//   3. issue с unspecified tax_regime → TAX_REGIME_MISMATCH
//   4. issue happy-path с osno/sf + vatRate=20
//   5. correction adjustment (КСФ) → has_corrections=true на исходном
//   6. correction replacement (ИСФ) → исходный cancelled с replaced_by:<id>
//   7. payment partial → paid_partial; full → paid_full
//   8. cancel issued → cancelled
//   9. RBAC — driver получает 403
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

function driverToken() {
    return signTestToken(app, {
        userId: fx.driverUserId, roles: ['driver'], organizationId: fx.organizationId,
    });
}

/**
 * Set organization.tax_regime — нужно для большинства тестов выпуска СФ/УПД.
 * default seedBaseFixture создаёт org без tax_regime → unspecified → блок.
 */
async function setOrgRegime(regime: 'osno' | 'usn_with_vat' | 'usn_income') {
    const db = await getTestDb();
    const schema = await import('../../src/db/schema.js');
    const { eq } = await import('drizzle-orm');
    await db.update(schema.organizations)
        .set({ taxRegime: regime })
        .where(eq(schema.organizations.id, fx.organizationId));
}

async function seedOrder(opts: { number: string }) {
    const db = await getTestDb();
    const schema = await import('../../src/db/schema.js');
    const [order] = await db.insert(schema.orders).values({
        number: opts.number,
        contractorId: fx.contractorId,
        contractId: fx.contractId,
        status: 'delivered',
        loadingAddress: 'Тест-адрес погрузки',
        unloadingAddress: 'Тест-адрес выгрузки',
        cargoDescription: 'Тест-груз',
        cargoWeightKg: '1000',
        cargoVolumeM3: '10',
        plannedPickupAt: new Date('2026-01-15'),
        plannedDeliveryAt: new Date('2026-01-16'),
        organizationId: fx.organizationId,
        createdBy: fx.adminUserId,
    }).returning();
    return order!;
}

// ============================================================
// 1) POST /finance/invoices/draft
// ============================================================

describe('POST /api/finance/invoices/draft', () => {
    it('requires auth', async () => {
        const res = await app.inject({
            method: 'POST', url: '/api/finance/invoices/draft', payload: {},
        });
        expect(res.statusCode).toBe(401);
    });

    it('driver gets 403 (no Invoice.manage ability)', async () => {
        const res = await app.inject({
            method: 'POST', url: '/api/finance/invoices/draft',
            headers: authHeaders(driverToken()),
            payload: { invoiceType: 'sf', payerId: fx.contractorId },
        });
        expect(res.statusCode).toBe(403);
    });

    it('creates draft with generated number prefix per invoice type', async () => {
        const res = await app.inject({
            method: 'POST', url: '/api/finance/invoices/draft',
            headers: authHeaders(adminToken()),
            payload: { invoiceType: 'sf', payerId: fx.contractorId },
        });
        expect(res.statusCode).toBe(201);
        const body = res.json();
        expect(body.success).toBe(true);
        expect(body.data.id).toMatch(/^[0-9a-f-]{36}$/);
        expect(body.data.number).toMatch(/^СФ-\d{4}-/);
    });

    it('rejects invalid invoiceType (422)', async () => {
        const res = await app.inject({
            method: 'POST', url: '/api/finance/invoices/draft',
            headers: authHeaders(adminToken()),
            payload: { invoiceType: 'invalid_type', payerId: fx.contractorId },
        });
        expect(res.statusCode).toBe(422);
    });
});

// ============================================================
// 2) POST /finance/invoices/:id/issue — draft → issued
// ============================================================

describe('POST /api/finance/invoices/:id/issue', () => {
    async function createDraft(invoiceType: string = 'sf') {
        const res = await app.inject({
            method: 'POST', url: '/api/finance/invoices/draft',
            headers: authHeaders(adminToken()),
            payload: { invoiceType, payerId: fx.contractorId },
        });
        return res.json().data as { id: string; number: string };
    }

    it('blocks issue when tax_regime is unspecified (TAX_REGIME_MISMATCH)', async () => {
        const draft = await createDraft('sf');
        const order = await seedOrder({ number: 'ORD-001' });

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
        expect(res.json().code).toBe('TAX_REGIME_MISMATCH');
    });

    it('rejects issue without basis_text (BASIS_TEXT_REQUIRED via Zod min(5))', async () => {
        await setOrgRegime('osno');
        const draft = await createDraft('sf');
        const order = await seedOrder({ number: 'ORD-002' });

        const res = await app.inject({
            method: 'POST', url: `/api/finance/invoices/${draft.id}/issue`,
            headers: authHeaders(adminToken()),
            payload: {
                basisText: 'кор',
                vatRate: 20,
                invoiceOrders: [{ orderId: order.id, allocatedAmount: 1000 }],
            },
        });
        expect(res.statusCode).toBe(422);
    });

    it('rejects issue without invoiceOrders (Zod min(1))', async () => {
        await setOrgRegime('osno');
        const draft = await createDraft('sf');
        const res = await app.inject({
            method: 'POST', url: `/api/finance/invoices/${draft.id}/issue`,
            headers: authHeaders(adminToken()),
            payload: {
                basisText: 'Договор № 1 от 01.01.2026',
                vatRate: 20,
                invoiceOrders: [],
            },
        });
        expect(res.statusCode).toBe(422);
    });

    it('happy path — osno+sf+vatRate=20 → issued', async () => {
        await setOrgRegime('osno');
        const draft = await createDraft('sf');
        const order = await seedOrder({ number: 'ORD-003' });

        const res = await app.inject({
            method: 'POST', url: `/api/finance/invoices/${draft.id}/issue`,
            headers: authHeaders(adminToken()),
            payload: {
                basisText: 'Договор № 1 от 01.01.2026',
                vatRate: 20,
                includesVat: true,
                invoiceOrders: [
                    { orderId: order.id, allocatedAmount: 1200, allocatedVat: 200 },
                ],
            },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.data.total).toBe(1200);
    });

    it('C2: НДС «сверху» (includesVat=false) — нетто 1000 → total 1200, vat 200, строки грос­сятся', async () => {
        await setOrgRegime('osno');
        const draft = await createDraft('sf');
        const order = await seedOrder({ number: 'ORD-VAT-TOP' });

        const res = await app.inject({
            method: 'POST', url: `/api/finance/invoices/${draft.id}/issue`,
            headers: authHeaders(adminToken()),
            payload: {
                basisText: 'Договор № 1 от 01.01.2026',
                vatRate: 20,
                includesVat: false, // НДС сверху: allocatedAmount = нетто
                invoiceOrders: [{ orderId: order.id, allocatedAmount: 1000 }],
            },
        });
        expect(res.statusCode).toBe(200);
        expect(res.json().data.total).toBe(1200); // раньше был баг: 1000

        const db = await getTestDb();
        const schema = await import('../../src/db/schema.js');
        const { eq } = await import('drizzle-orm');
        const [inv] = await db.select().from(schema.invoices).where(eq(schema.invoices.id, draft.id));
        expect(Number(inv.total)).toBeCloseTo(1200, 2);
        expect(Number(inv.vatAmount)).toBeCloseTo(200, 2);
        expect(Number(inv.subtotal)).toBeCloseTo(1000, 2);
        // Σ allocated_amount должна равняться total (DB CHECK), т.е. строка грос­сена до 1200.
        const lines = await db.select().from(schema.invoiceOrders).where(eq(schema.invoiceOrders.invoiceId, draft.id));
        expect(Number(lines[0].allocatedAmount)).toBeCloseTo(1200, 2);
        expect(Number(lines[0].allocatedVat)).toBeCloseTo(200, 2);
    });

    it('blocks SF for usn_income (no VAT obligation)', async () => {
        await setOrgRegime('usn_income');
        const draft = await createDraft('sf');
        const order = await seedOrder({ number: 'ORD-004' });

        const res = await app.inject({
            method: 'POST', url: `/api/finance/invoices/${draft.id}/issue`,
            headers: authHeaders(adminToken()),
            payload: {
                basisText: 'Договор № 1 от 01.01.2026',
                vatRate: 0,
                invoiceOrders: [{ orderId: order.id, allocatedAmount: 1000 }],
            },
        });
        expect(res.statusCode).toBe(422);
        expect(res.json().code).toBe('TAX_REGIME_MISMATCH');
    });
});

// ============================================================
// 3) POST /finance/invoices/:id/corrections (КСФ/ИСФ)
// ============================================================

describe('POST /api/finance/invoices/:id/corrections', () => {
    async function issueSf() {
        await setOrgRegime('osno');
        const draftRes = await app.inject({
            method: 'POST', url: '/api/finance/invoices/draft',
            headers: authHeaders(adminToken()),
            payload: { invoiceType: 'sf', payerId: fx.contractorId },
        });
        const draft = draftRes.json().data as { id: string; number: string };
        const order = await seedOrder({ number: `ORD-FOR-${draft.number}` });
        await app.inject({
            method: 'POST', url: `/api/finance/invoices/${draft.id}/issue`,
            headers: authHeaders(adminToken()),
            payload: {
                basisText: 'Договор № 1 от 01.01.2026',
                vatRate: 20, includesVat: true,
                invoiceOrders: [{ orderId: order.id, allocatedAmount: 1200, allocatedVat: 200 }],
            },
        });
        return { draft, order };
    }

    it('rejects correction for non-VAT document (act)', async () => {
        await setOrgRegime('usn_income');
        const draftRes = await app.inject({
            method: 'POST', url: '/api/finance/invoices/draft',
            headers: authHeaders(adminToken()),
            payload: { invoiceType: 'act', payerId: fx.contractorId },
        });
        const draft = draftRes.json().data as { id: string };
        const order = await seedOrder({ number: 'ORD-ACT-1' });
        await app.inject({
            method: 'POST', url: `/api/finance/invoices/${draft.id}/issue`,
            headers: authHeaders(adminToken()),
            payload: {
                basisText: 'Акт на услуги',
                invoiceOrders: [{ orderId: order.id, allocatedAmount: 1000 }],
            },
        });

        const res = await app.inject({
            method: 'POST', url: `/api/finance/invoices/${draft.id}/corrections`,
            headers: authHeaders(adminToken()),
            payload: {
                correctionKind: 'adjustment',
                correctionReason: 'Тестовая коррекция',
                subtotal: 100, vatAmount: 0, total: 100,
                invoiceOrders: [{ orderId: order.id, allocatedAmount: 100 }],
            },
        });
        expect(res.statusCode).toBe(422);
        expect(res.json().code).toBe('NOT_VAT_DOCUMENT');
    });

    it('adjustment (КСФ) — orig → corrected + has_corrections=true (H2)', async () => {
        const { draft, order } = await issueSf();

        // КСФ: по spec §5 хранится как отдельный документ с НОВОЙ
        // (скорректированной) общей суммой. UI показывает «до/после/разница»
        // через JOIN на related_invoice_id. Allocated_amount = новая сумма,
        // не diff (DB-trigger Σ allocated = total).
        const res = await app.inject({
            method: 'POST', url: `/api/finance/invoices/${draft.id}/corrections`,
            headers: authHeaders(adminToken()),
            payload: {
                correctionKind: 'adjustment',
                correctionReason: 'Уменьшение цены по доп.соглашению',
                subtotal: 900, vatAmount: 180, total: 1080,
                invoiceOrders: [{ orderId: order.id, allocatedAmount: 1080, allocatedVat: 180 }],
            },
        });
        expect(res.statusCode).toBe(201);
        const body = res.json();
        expect(body.data.correctionKind).toBe('adjustment');
        expect(body.data.number).toMatch(/^КСФ-/);

        const db = await getTestDb();
        const schema = await import('../../src/db/schema.js');
        const { eq } = await import('drizzle-orm');
        const [orig] = await db.select().from(schema.invoices).where(eq(schema.invoices.id, draft.id));
        // H2 (P1-C): оригинал теперь помечается 'corrected' (раньше оставался issued).
        expect(orig.status).toBe('corrected');
        expect(orig.hasCorrections).toBe(true);
    });

    it('replacement (ИСФ) — orig cancelled with replaced_by:<new_id>', async () => {
        const { draft, order } = await issueSf();

        const res = await app.inject({
            method: 'POST', url: `/api/finance/invoices/${draft.id}/corrections`,
            headers: authHeaders(adminToken()),
            payload: {
                correctionKind: 'replacement',
                correctionReason: 'Исправление технической ошибки в реквизитах',
                subtotal: 1000, vatAmount: 200, total: 1200,
                invoiceOrders: [{ orderId: order.id, allocatedAmount: 1200, allocatedVat: 200 }],
            },
        });
        expect(res.statusCode).toBe(201);
        const body = res.json();
        expect(body.data.correctionKind).toBe('replacement');

        const db = await getTestDb();
        const schema = await import('../../src/db/schema.js');
        const { eq } = await import('drizzle-orm');
        const [orig] = await db.select().from(schema.invoices).where(eq(schema.invoices.id, draft.id));
        expect(orig.status).toBe('cancelled');
        expect(orig.cancellationReason).toMatch(/^replaced_by:/);
    });
});

// ============================================================
// 4) POST /finance/invoices/:id/register-payment
// ============================================================

describe('POST /api/finance/invoices/:id/register-payment', () => {
    async function issuedInvoice() {
        await setOrgRegime('osno');
        const draftRes = await app.inject({
            method: 'POST', url: '/api/finance/invoices/draft',
            headers: authHeaders(adminToken()),
            payload: { invoiceType: 'sf', payerId: fx.contractorId },
        });
        const draft = draftRes.json().data as { id: string };
        const order = await seedOrder({ number: 'ORD-PAY-1' });
        await app.inject({
            method: 'POST', url: `/api/finance/invoices/${draft.id}/issue`,
            headers: authHeaders(adminToken()),
            payload: {
                basisText: 'Договор № 1 от 01.01.2026',
                vatRate: 20, includesVat: true,
                invoiceOrders: [{ orderId: order.id, allocatedAmount: 1200, allocatedVat: 200 }],
            },
        });
        return draft;
    }

    it('partial payment → paid_partial', async () => {
        const inv = await issuedInvoice();
        const res = await app.inject({
            method: 'POST', url: `/api/finance/invoices/${inv.id}/register-payment`,
            headers: authHeaders(adminToken()),
            payload: { amount: 500 },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.data.status).toBe('paid_partial');
        expect(body.data.paidAmount).toBe(500);
    });

    it('full payment in 2 steps → paid_full', async () => {
        const inv = await issuedInvoice();
        await app.inject({
            method: 'POST', url: `/api/finance/invoices/${inv.id}/register-payment`,
            headers: authHeaders(adminToken()),
            payload: { amount: 600 },
        });
        const res2 = await app.inject({
            method: 'POST', url: `/api/finance/invoices/${inv.id}/register-payment`,
            headers: authHeaders(adminToken()),
            payload: { amount: 600 },
        });
        expect(res2.statusCode).toBe(200);
        const body = res2.json();
        expect(body.data.status).toBe('paid_full');
        expect(body.data.paidAmount).toBe(1200);
    });

    it('rejects negative amount (Zod positive)', async () => {
        const inv = await issuedInvoice();
        const res = await app.inject({
            method: 'POST', url: `/api/finance/invoices/${inv.id}/register-payment`,
            headers: authHeaders(adminToken()),
            payload: { amount: -100 },
        });
        expect(res.statusCode).toBe(422);
    });
});

// ============================================================
// 5) POST /finance/invoices/:id/cancel
// ============================================================

describe('POST /api/finance/invoices/:id/cancel', () => {
    it('cancels issued invoice with reason', async () => {
        await setOrgRegime('osno');
        const draftRes = await app.inject({
            method: 'POST', url: '/api/finance/invoices/draft',
            headers: authHeaders(adminToken()),
            payload: { invoiceType: 'sf', payerId: fx.contractorId },
        });
        const draft = draftRes.json().data as { id: string };
        const order = await seedOrder({ number: 'ORD-CANCEL-1' });
        await app.inject({
            method: 'POST', url: `/api/finance/invoices/${draft.id}/issue`,
            headers: authHeaders(adminToken()),
            payload: {
                basisText: 'Договор № 1 от 01.01.2026',
                vatRate: 20, includesVat: true,
                invoiceOrders: [{ orderId: order.id, allocatedAmount: 1200, allocatedVat: 200 }],
            },
        });

        const res = await app.inject({
            method: 'POST', url: `/api/finance/invoices/${draft.id}/cancel`,
            headers: authHeaders(adminToken()),
            payload: { cancellationReason: 'Заказ отменён клиентом — счёт не нужен' },
        });
        expect(res.statusCode).toBe(200);

        const db = await getTestDb();
        const schema = await import('../../src/db/schema.js');
        const { eq } = await import('drizzle-orm');
        const [inv] = await db.select().from(schema.invoices).where(eq(schema.invoices.id, draft.id));
        expect(inv.status).toBe('cancelled');
        expect(inv.cancellationReason).toMatch(/Заказ отменён клиентом/);
    });

    it('rejects cancel with short reason (Zod min(5))', async () => {
        await setOrgRegime('osno');
        const draftRes = await app.inject({
            method: 'POST', url: '/api/finance/invoices/draft',
            headers: authHeaders(adminToken()),
            payload: { invoiceType: 'sf', payerId: fx.contractorId },
        });
        const draft = draftRes.json().data as { id: string };
        const res = await app.inject({
            method: 'POST', url: `/api/finance/invoices/${draft.id}/cancel`,
            headers: authHeaders(adminToken()),
            payload: { cancellationReason: 'нет' },
        });
        expect(res.statusCode).toBe(422);
    });
});
