// ============================================================
// EDI progression worker — processor tests.
// processEdiJob is a thin wrapper around processEdiProgressionJob
// from modules/edi/service.js; we stub that and assert pass-through.
// ============================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

interface Capture {
    calls: any[];
    nextResult: { progressed: boolean };
    nextError: Error | null;
}
let capture: Capture;

vi.mock('../../modules/edi/service.js', () => ({
    processEdiProgressionJob: vi.fn(async (data: any) => {
        capture.calls.push(data);
        if (capture.nextError) throw capture.nextError;
        return capture.nextResult;
    }),
}));

vi.mock('bullmq', () => ({
    Queue: class { add() {} async getJob() { return null; } async getRepeatableJobs() { return []; } async removeRepeatableByKey() {} },
    Worker: class { on() {} async close() {} },
}));

import { processEdiJob } from './edi.worker.js';

function fakeJob(data: any) {
    return { id: 'j', data, log: vi.fn() } as any;
}

beforeEach(() => {
    capture = { calls: [], nextResult: { progressed: false }, nextError: null };
});

describe('processEdiJob (worker wrapper)', () => {
    it('forwards job data unchanged to processEdiProgressionJob', async () => {
        capture.nextResult = { progressed: true };
        const data = { documentId: 'doc-1', provider: 'diadoc', stage: 'carrier' };
        await processEdiJob(fakeJob(data));
        expect(capture.calls).toEqual([data]);
    });

    it('returns whatever the service returns (progressed=true)', async () => {
        capture.nextResult = { progressed: true };
        const out = await processEdiJob(fakeJob({ documentId: 'd', provider: 'sbis', stage: 'client' }));
        expect(out).toEqual({ progressed: true });
    });

    it('returns whatever the service returns (progressed=false, idempotent no-op)', async () => {
        capture.nextResult = { progressed: false };
        const out = await processEdiJob(fakeJob({ documentId: 'd', provider: 'kontur', stage: 'carrier' }));
        expect(out).toEqual({ progressed: false });
    });

    it('propagates service errors so BullMQ retries (does not swallow)', async () => {
        capture.nextError = new Error('DB down');
        await expect(
            processEdiJob(fakeJob({ documentId: 'd', provider: 'diadoc', stage: 'carrier' })),
        ).rejects.toThrow('DB down');
    });

    it('logs both attempt and outcome via job.log', async () => {
        capture.nextResult = { progressed: true };
        const job = fakeJob({ documentId: 'doc-7', provider: 'diadoc', stage: 'client' });
        await processEdiJob(job);
        // First log: "EDI progression: doc=... stage=...", second: result
        const messages = (job.log.mock.calls as any[]).map((c) => c[0]);
        expect(messages.some((m) => m.includes('doc=doc-7') && m.includes('stage=client'))).toBe(true);
        expect(messages.some((m) => m.includes('progressed=true'))).toBe(true);
    });
});
