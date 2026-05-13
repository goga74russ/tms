// ============================================================
// Round 3C — D13 — RTO (driving hours) tests with mocked DB.
// We feed tachograph rows via a chainable select stub.
// ============================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';

let nextSelectResult: any[] = [];

function selectStub() {
    const handler: ProxyHandler<any> = {
        get(_t, prop) {
            if (prop === 'then') {
                return (resolve: (v: any) => void) => resolve(nextSelectResult);
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

import {
    getDriverHoursSummary,
    getDriverHosStatus,
    DAY_DRIVING_LIMIT_MIN,
    WEEK_DRIVING_LIMIT_MIN,
} from './service.js';

beforeEach(() => {
    nextSelectResult = [];
});

describe('getDriverHoursSummary', () => {
    it('returns empty dailyHours and zero weekly when no records exist', async () => {
        nextSelectResult = [];
        const out = await getDriverHoursSummary(
            'd1',
            new Date('2026-05-01T00:00:00Z'),
            new Date('2026-05-07T23:59:59Z'),
        );
        expect(out.driverId).toBe('d1');
        expect(out.dailyHours).toEqual({});
        expect(out.weeklyHours).toBe(0);
        expect(out.breaches).toEqual([]);
        expect(out.dayLimit).toBe(9);
        expect(out.weekLimit).toBe(56);
    });

    it('aggregates a single sub-limit day with no breach', async () => {
        nextSelectResult = [
            { date: new Date('2026-05-05T08:00:00Z'), drivingMinutes: 360 }, // 6h
        ];
        const out = await getDriverHoursSummary(
            'd1',
            new Date('2026-05-01T00:00:00Z'),
            new Date('2026-05-07T23:59:59Z'),
        );
        expect(out.dailyHours['2026-05-05']).toBe(6);
        expect(out.weeklyHours).toBe(6);
        expect(out.breaches).toEqual([]);
    });

    it('flags a breach when daily driving exceeds 9 hours', async () => {
        nextSelectResult = [
            { date: new Date('2026-05-05T08:00:00Z'), drivingMinutes: DAY_DRIVING_LIMIT_MIN + 60 }, // 10h
        ];
        const out = await getDriverHoursSummary(
            'd1',
            new Date('2026-05-01T00:00:00Z'),
            new Date('2026-05-07T23:59:59Z'),
        );
        expect(out.breaches.length).toBe(1);
        expect(out.breaches[0].date).toBe('2026-05-05');
        expect(out.breaches[0].dayHours).toBe(10);
    });

    it('sums multiple records on the same day', async () => {
        nextSelectResult = [
            { date: new Date('2026-05-05T08:00:00Z'), drivingMinutes: 240 },
            { date: new Date('2026-05-05T15:00:00Z'), drivingMinutes: 180 },
        ];
        const out = await getDriverHoursSummary(
            'd1',
            new Date('2026-05-01T00:00:00Z'),
            new Date('2026-05-07T23:59:59Z'),
        );
        expect(out.dailyHours['2026-05-05']).toBe(7);
        expect(out.weeklyHours).toBe(7);
    });

    it('treats null drivingMinutes as zero', async () => {
        nextSelectResult = [
            { date: new Date('2026-05-05T08:00:00Z'), drivingMinutes: null },
        ];
        const out = await getDriverHoursSummary(
            'd1',
            new Date('2026-05-01T00:00:00Z'),
            new Date('2026-05-07T23:59:59Z'),
        );
        expect(out.dailyHours['2026-05-05']).toBe(0);
    });

    it('aggregates across multiple days into weekly sum', async () => {
        nextSelectResult = [
            { date: new Date('2026-05-05T00:00:00Z'), drivingMinutes: 480 }, // 8h
            { date: new Date('2026-05-06T00:00:00Z'), drivingMinutes: 480 }, // 8h
            { date: new Date('2026-05-07T00:00:00Z'), drivingMinutes: 240 }, // 4h
        ];
        const out = await getDriverHoursSummary(
            'd1',
            new Date('2026-05-01T00:00:00Z'),
            new Date('2026-05-07T23:59:59Z'),
        );
        expect(out.weeklyHours).toBe(20);
    });
});

describe('getDriverHosStatus', () => {
    it('returns no breach when within both limits', async () => {
        const today = new Date('2026-05-10T12:00:00Z');
        nextSelectResult = [
            { date: today, drivingMinutes: 300 }, // 5h today
        ];
        const out = await getDriverHosStatus('d1', today);
        expect(out.breach).toBe(false);
        expect(out.breachReasons).toEqual([]);
        expect(out.dayHours).toBe(5);
        expect(out.weekHours).toBe(5);
    });

    it('flags day_limit_exceeded when today > 9h', async () => {
        const today = new Date('2026-05-10T20:00:00Z');
        nextSelectResult = [
            { date: today, drivingMinutes: DAY_DRIVING_LIMIT_MIN + 30 },
        ];
        const out = await getDriverHosStatus('d1', today);
        expect(out.breach).toBe(true);
        expect(out.breachReasons.some((r) => r.startsWith('day_limit_exceeded'))).toBe(true);
    });

    it('flags week_limit_exceeded when 7-day rolling > 56h', async () => {
        const today = new Date('2026-05-10T12:00:00Z');
        // Spread across 7 days, total > 56h, today small.
        const day = (offsetDays: number) => new Date(`2026-05-${String(10 - offsetDays).padStart(2, '0')}T08:00:00Z`);
        nextSelectResult = [
            { date: day(0), drivingMinutes: 60 }, // today: 1h
            { date: day(1), drivingMinutes: WEEK_DRIVING_LIMIT_MIN }, // 56h on a different day
        ];
        const out = await getDriverHosStatus('d1', today);
        expect(out.breach).toBe(true);
        expect(out.breachReasons.some((r) => r.startsWith('week_limit_exceeded'))).toBe(true);
    });

    it('flags both day and week breaches independently', async () => {
        const today = new Date('2026-05-10T20:00:00Z');
        nextSelectResult = [
            { date: today, drivingMinutes: DAY_DRIVING_LIMIT_MIN + 60 }, // 10h today
            { date: new Date('2026-05-08T08:00:00Z'), drivingMinutes: WEEK_DRIVING_LIMIT_MIN }, // 56h
        ];
        const out = await getDriverHosStatus('d1', today);
        expect(out.breach).toBe(true);
        expect(out.breachReasons.some((r) => r.startsWith('day_limit_exceeded'))).toBe(true);
        expect(out.breachReasons.some((r) => r.startsWith('week_limit_exceeded'))).toBe(true);
    });

    it('returns todayDate as YYYY-MM-DD', async () => {
        const today = new Date('2026-05-10T23:00:00Z');
        nextSelectResult = [];
        const out = await getDriverHosStatus('d1', today);
        expect(out.todayDate).toBe('2026-05-10');
    });

    it('uses asOf parameter when provided (deterministic)', async () => {
        const fixed = new Date('2025-12-31T12:00:00Z');
        nextSelectResult = [];
        const out = await getDriverHosStatus('d1', fixed);
        expect(out.todayDate).toBe('2025-12-31');
        expect(out.asOf).toBe(fixed.toISOString());
    });
});
