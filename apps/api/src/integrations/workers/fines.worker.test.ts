// ============================================================
// Fines sync worker — processor tests.
// Locks dedup-by-resolution-number behaviour and the audit-event
// emission. DB, recordEvent and the GIBDD mock are stubbed.
// ============================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';

interface Capture {
    selectResults: any[][];
    fineInserts: any[];
    recordedEvents: any[];
}
let capture: Capture;

function makeSelectChain() {
    const result = capture.selectResults.shift() ?? [];
    const chain: any = {
        from: () => chain,
        where: () => chain,
        limit: () => Promise.resolve(result),
        then: (resolve: any) => resolve(result),
    };
    return chain;
}

vi.mock('../../db/connection.js', () => ({
    db: {
        select: () => makeSelectChain(),
        insert: (_table: any) => ({
            values: (v: any) => {
                capture.fineInserts.push(v);
                // P3 #701: воркер теперь вызывает .onConflictDoNothing() перед
                // .returning() (БД-дедуп по unique(vehicle_id, resolution_number)).
                const returning = () => Promise.resolve([{ id: `fine-${capture.fineInserts.length}` }]);
                return {
                    onConflictDoNothing: () => ({ returning }),
                    returning,
                };
            },
        }),
    },
    sql: () => 'SQL',
}));

vi.mock('../../events/journal.js', () => ({
    recordEvent: vi.fn(async (params: any) => { capture.recordedEvents.push(params); }),
}));

// BullMQ Queue/Worker constructors connect to Redis on construction.
vi.mock('bullmq', () => ({
    Queue: class { add() {} async getJob() { return null; } async getRepeatableJobs() { return []; } async removeRepeatableByKey() {} },
    Worker: class { on() {} async close() {} },
}));

// GIBDD mock: per-plate response controlled by test.
let gibddResponses: Record<string, any[]> = {};
let gibddThrows: Record<string, Error> = {};
vi.mock('../mocks/gibdd.mock.js', () => ({
    lookupFines: (plate: string) => {
        if (gibddThrows[plate]) throw gibddThrows[plate];
        return gibddResponses[plate] ?? [];
    },
}));

import { processFinesSync } from './fines.worker.js';

function fakeJob(data: any = {}) {
    return { id: 't', data, log: vi.fn() } as any;
}

beforeEach(() => {
    capture = { selectResults: [], fineInserts: [], recordedEvents: [] };
    gibddResponses = {};
    gibddThrows = {};
});

describe('processFinesSync', () => {
    it('inserts new fines as status=new and records per-fine + summary events', async () => {
        // Stage 1: vehicle list
        capture.selectResults.push([
            { id: 'v1', plateNumber: 'A111AA' },
        ]);
        // Stage 2: existing fines pre-fetch (empty → no dups)
        capture.selectResults.push([]);

        gibddResponses['A111AA'] = [
            {
                violationDate: '2025-01-15T10:00:00Z',
                violationType: 'speeding',
                amount: 5000,
                resolutionNumber: 'R-1',
            },
        ];

        const result = await processFinesSync(fakeJob());

        expect(result.imported).toBe(1);
        expect(result.duplicates).toBe(0);
        expect(capture.fineInserts).toHaveLength(1);
        expect(capture.fineInserts[0]).toMatchObject({
            vehicleId: 'v1',
            resolutionNumber: 'R-1',
            amount: 5000,
            status: 'new',
        });
        // 1 per-fine event + 1 summary event
        expect(capture.recordedEvents.map((e) => e.eventType)).toEqual([
            'fine.auto_imported',
            'integration.fines_sync',
        ]);
    });

    it('is idempotent: existing fines with same (vehicleId, resolutionNumber) are skipped', async () => {
        capture.selectResults.push([{ id: 'v1', plateNumber: 'A111AA' }]);
        // Pre-fetch returns an existing fine
        capture.selectResults.push([{ vehicleId: 'v1', resolutionNumber: 'R-1' }]);

        gibddResponses['A111AA'] = [
            {
                violationDate: '2025-01-15T10:00:00Z',
                violationType: 'speeding',
                amount: 5000,
                resolutionNumber: 'R-1', // same as existing
            },
        ];

        const result = await processFinesSync(fakeJob());

        expect(result.imported).toBe(0);
        expect(result.duplicates).toBe(1);
        expect(capture.fineInserts).toHaveLength(0);
    });

    it('counts provider errors per-vehicle and continues with the next', async () => {
        capture.selectResults.push([
            { id: 'v1', plateNumber: 'A111AA' },
            { id: 'v2', plateNumber: 'B222BB' },
        ]);
        capture.selectResults.push([]); // no existing fines

        gibddThrows['A111AA'] = new Error('GIBDD down');
        gibddResponses['B222BB'] = [
            {
                violationDate: '2025-02-01T00:00:00Z',
                violationType: 'parking',
                amount: 1500,
                resolutionNumber: 'R-2',
            },
        ];

        const result = await processFinesSync(fakeJob());

        expect(result.errors).toBe(1);
        expect(result.imported).toBe(1);
        expect(capture.fineInserts[0].resolutionNumber).toBe('R-2');
    });

    it('skips dedup pre-fetch when there are zero vehicles', async () => {
        capture.selectResults.push([]); // empty fleet

        const result = await processFinesSync(fakeJob());
        expect(result).toMatchObject({ imported: 0, duplicates: 0, errors: 0 });
        expect(capture.fineInserts).toHaveLength(0);
        expect(capture.recordedEvents).toHaveLength(0);
    });

    it('emits summary event with manual flag from job data', async () => {
        capture.selectResults.push([{ id: 'v1', plateNumber: 'A111AA' }]);
        capture.selectResults.push([]);
        gibddResponses['A111AA'] = [{
            violationDate: '2025-01-01T00:00:00Z',
            violationType: 'speed',
            amount: 100,
            resolutionNumber: 'R-X',
        }];

        await processFinesSync(fakeJob({ manual: true }));

        const summary = capture.recordedEvents.find((e) => e.eventType === 'integration.fines_sync');
        expect(summary).toBeDefined();
        expect(summary.data.manual).toBe(true);
    });
});
