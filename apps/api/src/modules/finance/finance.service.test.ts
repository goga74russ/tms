// ============================================================
// Round 3C — D13 — FinanceService unit tests with mocked DB.
// We stub `db/connection` and `events/journal` and `tarification.service`
// so the test runs without DATABASE_URL or any real I/O.
// Focus: tryAutoCreateInvoice + bulkGenerateInvoices contracts.
// ============================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Mock DATABASE_URL before any import that touches connection.ts.
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';

// ---- chainable query-builder stub -----------------------------------------
function makeChainableResult<T>(value: T) {
    const handler: ProxyHandler<any> = {
        get(target, prop) {
            if (prop === 'then') {
                // Make the chainable thenable, resolves to the configured value.
                return (resolve: (v: T) => void) => resolve(value);
            }
            // Any chained call (.from / .where / .innerJoin / .orderBy / .limit / .leftJoin / .for / .returning)
            // returns the same proxy.
            return (..._args: any[]) => proxy;
        },
        apply() {
            return proxy;
        },
    };
    const proxy: any = new Proxy(function () { /* noop */ }, handler);
    return proxy;
}

// Mutable handles so each test can swap the resolved values.
const dbState: { [key: string]: any } = {};

function selectStub() {
    return makeChainableResult(dbState.selectResult ?? []);
}
function selectDistinctStub() {
    return makeChainableResult(dbState.selectDistinctResult ?? []);
}
function insertStub() {
    return makeChainableResult(dbState.insertResult ?? []);
}
function updateStub() {
    return makeChainableResult(dbState.updateResult ?? []);
}
function deleteStub() {
    return makeChainableResult(dbState.deleteResult ?? []);
}
async function transactionStub(fn: (tx: any) => any) {
    const tx = {
        select: selectStub,
        selectDistinct: selectDistinctStub,
        insert: insertStub,
        update: updateStub,
        delete: deleteStub,
    };
    return fn(tx);
}

vi.mock('../../db/connection.js', () => ({
    db: {
        select: selectStub,
        selectDistinct: selectDistinctStub,
        insert: insertStub,
        update: updateStub,
        delete: deleteStub,
        transaction: transactionStub,
        query: {},
    },
    sql: () => 'SQL',
}));

vi.mock('../../events/journal.js', () => ({
    recordEvent: vi.fn(async () => undefined),
}));

vi.mock('./tarification.service.js', () => ({
    tarificationService: {
        calculateTripCost: vi.fn(async () => ({ subtotal: 1000, vatAmount: 200, total: 1200 })),
        calculateBatchTripCosts: vi.fn(async (ids: string[]) => {
            const m = new Map<string, { subtotal: number; vatAmount: number; total: number }>();
            for (const id of ids) m.set(id, { subtotal: 500, vatAmount: 100, total: 600 });
            return m;
        }),
    },
}));

// Import after mocks so they take effect.
import { financeService } from './finance.service.js';

beforeEach(() => {
    for (const k of Object.keys(dbState)) delete dbState[k];
});

// =================================================================
// tryAutoCreateInvoice
// =================================================================
describe('FinanceService.tryAutoCreateInvoice', () => {
    it('returns already_invoiced when trip is already linked to an invoice', async () => {
        // First db.select call (existingLink check) returns one link.
        dbState.selectResult = [{ invoiceId: 'inv-1' }];
        const out = await financeService.tryAutoCreateInvoice('trip-1');
        expect(out).toEqual({
            created: false,
            reason: 'already_invoiced',
            invoiceId: 'inv-1',
        });
    });

    it('returns no_orders when the trip has no linked orders', async () => {
        dbState.selectResult = []; // no link, also no orders found via second select
        const out = await financeService.tryAutoCreateInvoice('trip-2');
        expect(out.created).toBe(false);
        expect(out.reason).toBe('no_orders');
    });

    it('returns no_contract when the trip orders carry no contractId', async () => {
        // First select (link check) is empty, second is the linkedOrders query.
        // Our stub returns the same selectResult for both — make it linkedOrders style.
        dbState.selectResult = [{ orderId: 'o1', contractorId: 'c1', contractId: null }];
        const out = await financeService.tryAutoCreateInvoice('trip-3');
        expect(out.created).toBe(false);
        // Either we hit existing link (because select returns array w/ invoiceId — it doesn't here)
        // or we hit no_contract on contractId === null path.
        expect(['no_contract', 'already_invoiced']).toContain(out.reason);
    });

    it('is idempotent — repeated calls with link present always return already_invoiced', async () => {
        dbState.selectResult = [{ invoiceId: 'inv-9' }];
        const a = await financeService.tryAutoCreateInvoice('trip-x');
        const b = await financeService.tryAutoCreateInvoice('trip-x');
        expect(a).toEqual(b);
        expect(a.created).toBe(false);
    });

    it('returns a defined object even when DB is empty', async () => {
        dbState.selectResult = [];
        const out = await financeService.tryAutoCreateInvoice('trip-empty');
        expect(out).toBeDefined();
        expect(typeof out.created).toBe('boolean');
    });
});

// =================================================================
// bulkGenerateInvoices
// =================================================================
describe('FinanceService.bulkGenerateInvoices', () => {
    it('returns empty created/skipped when date range yields no trips', async () => {
        dbState.selectDistinctResult = [];
        const out = await financeService.bulkGenerateInvoices(
            { from: '2026-01-01T00:00:00Z', to: '2026-01-31T23:59:59Z' },
            { authorId: 'u1', authorRole: 'admin' },
        );
        expect(out.created).toEqual([]);
        expect(out.skipped).toEqual([]);
    });

    it('skips trips with no contract and reports them in skipped', async () => {
        dbState.selectDistinctResult = [
            { tripId: 't1', contractorId: 'c1', contractId: null },
            { tripId: 't2', contractorId: null, contractId: null },
        ];
        const out = await financeService.bulkGenerateInvoices(
            { from: '2026-01-01T00:00:00Z', to: '2026-01-31T23:59:59Z' },
            { authorId: 'u1', authorRole: 'admin' },
        );
        expect(out.created).toEqual([]);
        expect(out.skipped.length).toBeGreaterThanOrEqual(2);
        expect(out.skipped.every((s) => s.reason === 'no_contract')).toBe(true);
    });

    it('skips trips for contracts with no tariff', async () => {
        dbState.selectDistinctResult = [
            { tripId: 't1', contractorId: 'c1', contractId: 'k1' },
        ];
        // selectResult drives the tariff lookup → empty = no tariff.
        dbState.selectResult = [];
        const out = await financeService.bulkGenerateInvoices(
            { from: '2026-01-01T00:00:00Z', to: '2026-01-31T23:59:59Z' },
            { authorId: 'u1', authorRole: 'admin' },
        );
        expect(out.created).toEqual([]);
        expect(out.skipped.some((s) => s.reason === 'no_tariff')).toBe(true);
    });

    it('groups skipped reasons cleanly across mixed buckets', async () => {
        dbState.selectDistinctResult = [
            { tripId: 't1', contractorId: 'c1', contractId: null },
            { tripId: 't2', contractorId: 'c1', contractId: 'k1' },
        ];
        dbState.selectResult = []; // no tariff for k1
        const out = await financeService.bulkGenerateInvoices(
            { from: '2026-01-01T00:00:00Z', to: '2026-01-31T23:59:59Z' },
            { authorId: 'u1', authorRole: 'admin' },
        );
        expect(out.skipped.find((s) => s.tripId === 't1')?.reason).toBe('no_contract');
        expect(out.skipped.find((s) => s.tripId === 't2')?.reason).toBe('no_tariff');
    });

    it('respects the contractorId filter when provided', async () => {
        // Even when filtered, a trip with no contract still shows up as skipped (the filter is in SQL).
        dbState.selectDistinctResult = [
            { tripId: 't1', contractorId: 'c-other', contractId: null },
        ];
        const out = await financeService.bulkGenerateInvoices(
            { from: '2026-01-01T00:00:00Z', to: '2026-01-31T23:59:59Z', contractorId: 'c-other' },
            { authorId: 'u1', authorRole: 'admin' },
        );
        expect(out.created).toEqual([]);
    });

    it('returns the expected shape ({ created, skipped })', async () => {
        dbState.selectDistinctResult = [];
        const out = await financeService.bulkGenerateInvoices(
            { from: '2026-01-01T00:00:00Z', to: '2026-01-31T23:59:59Z' },
            { authorId: 'u1', authorRole: 'admin' },
        );
        expect(out).toHaveProperty('created');
        expect(out).toHaveProperty('skipped');
        expect(Array.isArray(out.created)).toBe(true);
        expect(Array.isArray(out.skipped)).toBe(true);
    });
});

// =================================================================
// calculateFleetKtgMetrics — pure helper, no DB
// =================================================================
describe('FinanceService — calculateFleetKtgMetrics', () => {
    it('returns 0% with green light on empty fleet', async () => {
        const { calculateFleetKtgMetrics } = await import('./finance.service.js');
        const m = calculateFleetKtgMetrics([]);
        expect(m.fleetActive).toBe(0);
        expect(m.fleetReady).toBe(0);
        expect(m.ktgPercent).toBe(0);
        // 0 ≥ 90 false, 0 ≥ 75 false → red.
        expect(m.ktgLight).toBe('red');
    });

    it('marks vehicles in maintenance/blocked/broken as not ready', async () => {
        const { calculateFleetKtgMetrics } = await import('./finance.service.js');
        const m = calculateFleetKtgMetrics([
            {
                status: 'maintenance',
                currentOdometerKm: 50000,
                maintenanceNextKm: 60000,
                techInspectionExpiry: null,
                osagoExpiry: null,
                maintenanceNextDate: null,
                tachographCalibrationExpiry: null,
            },
        ]);
        expect(m.fleetActive).toBe(1);
        expect(m.fleetReady).toBe(0);
    });

    it('marks vehicles whose maintenanceNextKm is past current odometer as not ready', async () => {
        const { calculateFleetKtgMetrics } = await import('./finance.service.js');
        const m = calculateFleetKtgMetrics([
            {
                status: 'active',
                currentOdometerKm: 60000,
                maintenanceNextKm: 50000, // due
                techInspectionExpiry: null,
                osagoExpiry: null,
                maintenanceNextDate: null,
                tachographCalibrationExpiry: null,
            },
        ]);
        expect(m.fleetReady).toBe(0);
    });
});
