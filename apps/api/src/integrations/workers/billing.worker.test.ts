// ============================================================
// Billing daily worker — processor tests.
// We stub financeService.bulkGenerateInvoices and recordEvent and
// assert the date-window calculation + audit-event payload.
// ============================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

interface Capture {
    bulkCalls: any[];
    bulkResult: { created: any[]; skipped: any[] };
    recordedEvents: any[];
}
let capture: Capture;

vi.mock('../../modules/finance/finance.service.js', () => ({
    financeService: {
        bulkGenerateInvoices: vi.fn(async (range: any, actor: any) => {
            capture.bulkCalls.push({ range, actor });
            return capture.bulkResult;
        }),
    },
}));

vi.mock('../../events/journal.js', () => ({
    recordEvent: vi.fn(async (params: any) => { capture.recordedEvents.push(params); }),
}));

// BullMQ Queue/Worker constructors call ioredis during construction in the
// real package. Stub them so module-load (queues.ts) doesn't try to connect.
vi.mock('bullmq', () => ({
    Queue: class { add() {} async getJob() { return null; } async getRepeatableJobs() { return []; } async removeRepeatableByKey() {} },
    Worker: class { on() {} async close() {} },
}));

import { processBillingDaily } from './billing.worker.js';

function fakeJob(data: any = {}) {
    return { id: 'b', data, log: vi.fn() } as any;
}

beforeEach(() => {
    capture = {
        bulkCalls: [],
        bulkResult: { created: [], skipped: [] },
        recordedEvents: [],
    };
});

describe('processBillingDaily', () => {
    it('invokes financeService with a UTC [previous-day, today) window', async () => {
        capture.bulkResult = { created: [], skipped: [] };
        await processBillingDaily(fakeJob());

        expect(capture.bulkCalls).toHaveLength(1);
        const { range } = capture.bulkCalls[0];
        const from = new Date(range.from);
        const to = new Date(range.to);
        // Both at UTC midnight, exactly 24h apart
        expect(to.getTime() - from.getTime()).toBe(24 * 3600 * 1000);
        expect(from.getUTCHours()).toBe(0);
        expect(to.getUTCHours()).toBe(0);
    });

    it('passes the system actor and null org to financeService', async () => {
        await processBillingDaily(fakeJob());
        expect(capture.bulkCalls[0].actor).toEqual({
            authorId: '00000000-0000-0000-0000-000000000000',
            authorRole: 'system',
            organizationId: null,
        });
    });

    it('reports created/skipped counts from bulkGenerateInvoices', async () => {
        capture.bulkResult = {
            created: [{ invoiceId: 'inv-1' }, { invoiceId: 'inv-2' }],
            skipped: [{ tripId: 't-3', reason: 'already_invoiced' }],
        };
        const result = await processBillingDaily(fakeJob());
        expect(result.created).toBe(2);
        expect(result.skipped).toBe(1);
    });

    it('records an integration.billing_daily event with invoice ids and manual flag', async () => {
        capture.bulkResult = {
            created: [{ invoiceId: 'inv-1' }],
            skipped: [],
        };
        await processBillingDaily(fakeJob({ manual: true }));

        expect(capture.recordedEvents).toHaveLength(1);
        const ev = capture.recordedEvents[0];
        expect(ev.eventType).toBe('integration.billing_daily');
        expect(ev.data.createdCount).toBe(1);
        expect(ev.data.createdInvoiceIds).toEqual(['inv-1']);
        expect(ev.data.manual).toBe(true);
    });

    it('defaults manual=false when job.data has no flag', async () => {
        await processBillingDaily(fakeJob());
        const ev = capture.recordedEvents[0];
        expect(ev.data.manual).toBe(false);
    });
});
