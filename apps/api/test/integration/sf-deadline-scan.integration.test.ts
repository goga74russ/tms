// ============================================================
// Integration tests — T-14 (2/3) proactive SF-deadline scan.
//
// scanSfDeadlines() находит доставленные заявки плательщиков НДС без
// выпущенного СФ/УПД, у которых приближается/просрочен 5-дневный срок.
// Проверяем: VAT-фильтр, окно (>=3 дней), исключение уже покрытых СФ.
// ============================================================
import './setup.js';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import {
    ensureTestDbReady,
    truncateAllTables,
    seedBaseFixture,
    getTestDb,
    type BaseFixture,
} from './setup.js';
import { scanSfDeadlines } from '../../src/integrations/workers/sf-deadline.worker.js';

let fx: BaseFixture;

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

beforeAll(async () => { await ensureTestDbReady(); });
afterAll(async () => { await truncateAllTables(); });

beforeEach(async () => {
    await truncateAllTables();
    fx = await seedBaseFixture();
    const db = await getTestDb();
    const schema = await import('../../src/db/schema.js');
    const { eq } = await import('drizzle-orm');
    // fx org → плательщик НДС
    await db.update(schema.organizations).set({ taxRegime: 'osno' })
        .where(eq(schema.organizations.id, fx.organizationId));
});

async function seedOrder(opts: { number: string; unloadedDaysAgo: number | null; orgId?: string; status?: string }) {
    const db = await getTestDb();
    const schema = await import('../../src/db/schema.js');
    const [o] = await db.insert(schema.orders).values({
        number: opts.number,
        contractorId: fx.contractorId,
        contractId: fx.contractId,
        status: (opts.status ?? 'delivered') as any,
        loadingAddress: 'L', unloadingAddress: 'U',
        unloadingDate: opts.unloadedDaysAgo == null ? null : daysAgo(opts.unloadedDaysAgo),
        cargoDescription: 'C', cargoWeightKg: '1000', cargoVolumeM3: '10',
        organizationId: opts.orgId ?? fx.organizationId,
        createdBy: fx.adminUserId,
    }).returning();
    return o!;
}

async function seedIssuedSfCovering(orderId: string) {
    const db = await getTestDb();
    const schema = await import('../../src/db/schema.js');
    const [inv] = await db.insert(schema.invoices).values({
        number: `СФ-2026-${Math.floor(Math.random() * 100000)}`,
        contractorId: fx.contractorId,
        type: 'sf', status: 'issued',
        subtotal: 1000, vatAmount: 200, total: 1200,
        periodStart: new Date(), periodEnd: new Date(),
        payerId: fx.contractorId,
        payeeOrganizationId: fx.organizationId,
        issuedAt: new Date(),
    }).returning();
    await db.insert(schema.invoiceOrders).values({
        invoiceId: inv!.id, orderId, allocatedAmount: 1200, allocatedVat: 200,
    });
}

describe('T-14 — scanSfDeadlines', () => {
    it('находит доставленную заявку плательщика НДС без СФ за пределами окна', async () => {
        await seedOrder({ number: 'SCAN-OVD', unloadedDaysAgo: 10 });
        const found = await scanSfDeadlines();
        expect(found.length).toBe(1);
        expect(found[0]!.orderNumber).toBe('SCAN-OVD');
        expect(found[0]!.overdue).toBe(true);
        expect(found[0]!.daysLate).toBeGreaterThan(0);
    });

    it('не трогает свежую разгрузку (1 день назад — вне окна напоминания)', async () => {
        await seedOrder({ number: 'SCAN-FRESH', unloadedDaysAgo: 1 });
        const found = await scanSfDeadlines();
        expect(found.length).toBe(0);
    });

    it('исключает заявку, уже покрытую выпущенным СФ', async () => {
        const order = await seedOrder({ number: 'SCAN-COVERED', unloadedDaysAgo: 10 });
        await seedIssuedSfCovering(order.id);
        const found = await scanSfDeadlines();
        expect(found.find((f) => f.orderId === order.id)).toBeUndefined();
    });

    it('игнорирует орг на спецрежиме без НДС', async () => {
        const db = await getTestDb();
        const schema = await import('../../src/db/schema.js');
        const [orgB] = await db.insert(schema.organizations).values({ name: 'NoVAT Org', taxRegime: 'usn_income' }).returning();
        await seedOrder({ number: 'SCAN-NOVAT', unloadedDaysAgo: 10, orgId: orgB!.id });
        const found = await scanSfDeadlines();
        expect(found.find((f) => f.orderNumber === 'SCAN-NOVAT')).toBeUndefined();
    });

    it('approaching (4 дня) — найдено, но не overdue', async () => {
        await seedOrder({ number: 'SCAN-APPR', unloadedDaysAgo: 4 });
        const found = await scanSfDeadlines();
        const row = found.find((f) => f.orderNumber === 'SCAN-APPR');
        expect(row).toBeDefined();
        expect(row!.overdue).toBe(false);
    });
});
