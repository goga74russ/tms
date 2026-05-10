// ============================================================
// Round 3C — D13 — Driver scoring tests with mocked DB.
// We script consecutive db.select() calls in computeDriverScore:
//   1) trips for driver  (tripsRows)
//   2) route_points     (only if completedTrips.length > 0)
//   3) temperature_readings (only if tripIds.length > 0)
//   4) tachograph_records
//   5) fines
// Each test pushes the appropriate sequence onto `stages`.
// ============================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';

const stages: any[][] = [];
let stageIdx = 0;

function selectStub() {
    const handler: ProxyHandler<any> = {
        get(_t, prop) {
            if (prop === 'then') {
                const captured = stages[stageIdx] ?? [];
                stageIdx += 1;
                return (resolve: (v: any) => void) => resolve(captured);
            }
            return (..._args: any[]) => proxy;
        },
    };
    const proxy: any = new Proxy(function () { /* noop */ }, handler);
    return proxy;
}

vi.mock('../../db/connection.js', () => ({
    db: { select: selectStub },
    sql: () => 'SQL',
}));

import { computeDriverScore } from './service.js';

beforeEach(() => {
    stages.length = 0;
    stageIdx = 0;
});

describe('computeDriverScore', () => {
    it('returns a perfect 100 when there are no trips, no breaches, no fines', async () => {
        // tripsRows empty → branch 2 (route_points) skipped, branch 3 (temp readings) skipped,
        // tachograph empty, fines empty.
        stages.push([]); // trips
        stages.push([]); // tacho
        stages.push([]); // fines
        const out = await computeDriverScore('d1');
        expect(out.score).toBe(100);
        expect(out.deductions).toEqual([]);
        expect(out.breakdown.tripCount).toBe(0);
    });

    it('deducts 5 points per RTO breach day (>9h)', async () => {
        stages.push([]); // trips
        stages.push([
            // Two days each with 10h driving — both breach.
            { date: new Date('2026-05-05T00:00:00Z'), drivingMinutes: 600 },
            { date: new Date('2026-05-06T00:00:00Z'), drivingMinutes: 600 },
        ]); // tacho
        stages.push([]); // fines
        const out = await computeDriverScore('d1');
        expect(out.breakdown.rtoBreachCount).toBe(2);
        expect(out.score).toBe(100 - 2 * 5);
        expect(out.deductions.find((d) => d.reason.includes('RTO'))?.points).toBe(10);
    });

    it('deducts 2 points per fine', async () => {
        stages.push([]); // trips
        stages.push([]); // tacho
        stages.push([{ id: 'f1' }, { id: 'f2' }, { id: 'f3' }]); // fines
        const out = await computeDriverScore('d1');
        expect(out.breakdown.finesCount).toBe(3);
        expect(out.score).toBe(100 - 6);
    });

    it('deducts 3 points per cold-chain breach', async () => {
        // Need at least one trip so the temp readings branch is taken.
        stages.push([{ id: 't1', status: 'in_transit', actualCompletionAt: null }]); // trips
        // No completed trips so route_points branch is skipped.
        stages.push([{ id: 'tr1' }, { id: 'tr2' }]); // temp readings (breaches)
        stages.push([]); // tacho
        stages.push([]); // fines
        const out = await computeDriverScore('d1');
        expect(out.breakdown.coldChainBreachCount).toBe(2);
        expect(out.score).toBe(100 - 6);
    });

    it('deducts 10 points when on-time ratio drops below 80%', async () => {
        // One completed trip with one route_point that has a window but completedAt past it.
        stages.push([
            { id: 't1', status: 'completed', actualCompletionAt: new Date('2026-05-05T12:00:00Z') },
        ]); // trips
        stages.push([
            {
                tripId: 't1',
                windowTo: new Date('2026-05-05T10:00:00Z'),
                windowEnd: null,
                completedAt: new Date('2026-05-05T12:00:00Z'), // late
            },
        ]); // route_points
        stages.push([]); // temp readings
        stages.push([]); // tacho
        stages.push([]); // fines
        const out = await computeDriverScore('d1');
        expect(out.breakdown.onTimeRatio).toBe(0); // 0/1
        expect(out.deductions.find((d) => d.reason.includes('On-time'))?.points).toBe(10);
        expect(out.score).toBe(90);
    });

    it('does not deduct when on-time ratio is at or above 80%', async () => {
        stages.push([
            { id: 't1', status: 'completed', actualCompletionAt: new Date('2026-05-05T08:00:00Z') },
        ]); // trips
        stages.push([
            {
                tripId: 't1',
                windowTo: new Date('2026-05-05T10:00:00Z'),
                windowEnd: null,
                completedAt: new Date('2026-05-05T09:00:00Z'), // on time
            },
        ]); // route_points
        stages.push([]); // temp readings
        stages.push([]); // tacho
        stages.push([]); // fines
        const out = await computeDriverScore('d1');
        expect(out.breakdown.onTimeRatio).toBe(1);
        expect(out.score).toBe(100);
    });

    it('clamps score to a minimum of 0 when penalties exceed 100', async () => {
        // 25 RTO breaches × 5 = 125 → score should clamp to 0.
        const tachoRows = [];
        for (let i = 0; i < 25; i++) {
            tachoRows.push({
                date: new Date(`2026-05-${String(i + 1).padStart(2, '0')}T00:00:00Z`),
                drivingMinutes: 600,
            });
        }
        stages.push([]); // trips
        stages.push(tachoRows); // tacho
        stages.push([]); // fines
        const out = await computeDriverScore('d1');
        expect(out.score).toBe(0);
        expect(out.breakdown.rtoBreachCount).toBe(25);
    });

    it('returns nulls/zeros for breakdown when there are no trips and no records', async () => {
        stages.push([]); // trips
        stages.push([]); // tacho
        stages.push([]); // fines
        const out = await computeDriverScore('d1');
        expect(out.breakdown.tripCount).toBe(0);
        expect(out.breakdown.completedTripCount).toBe(0);
        expect(out.breakdown.onTimeTripsTotal).toBe(0);
        expect(out.breakdown.onTimeRatio).toBeNull();
    });
});
