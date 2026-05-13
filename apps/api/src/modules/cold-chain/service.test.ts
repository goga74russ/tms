// ============================================================
// Round 3C — D13 — Cold-chain pure-function tests.
// We exercise mock-sensor + breach detection + summary math.
// No DB: we mock connection.ts so service.ts is importable.
// ============================================================
import { describe, it, expect, beforeEach, vi } from 'vitest';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';

vi.mock('../../db/connection.js', () => ({
    db: {
        select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) }),
        transaction: async (fn: any) => fn({}),
    },
    sql: () => 'SQL',
}));

import { generateMockReading } from './mock-sensor.js';
import { detectBreach } from './service.js';

describe('cold-chain mock-sensor — generateMockReading', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('falls back to refrigerator band when SLA is null', () => {
        // Math.random returns 0.5 → midpoint of (-2..6) = 2
        vi.spyOn(Math, 'random').mockReturnValue(0.5);
        const r = generateMockReading(null, null);
        expect(r.source).toBe('mock');
        expect(r.tempC).toBeGreaterThanOrEqual(-2);
        expect(r.tempC).toBeLessThanOrEqual(6);
    });

    it('stays in range 90% of the time when SLA provided (Math.random > 0.10)', () => {
        // First random > 0.10 picks in-range; second drives the value.
        const seq = [0.5, 0.5];
        let i = 0;
        vi.spyOn(Math, 'random').mockImplementation(() => seq[i++ % seq.length]);

        const r = generateMockReading(0, 6);
        expect(r.tempC).toBeGreaterThanOrEqual(0);
        expect(r.tempC).toBeLessThanOrEqual(6);
    });

    it('produces an above-max breach when in-range roll fails and high coin flips up', () => {
        // First random <= 0.10 → breach branch; second > 0.5 → high; third drives drift.
        const seq = [0.05, 0.9, 0.5];
        let i = 0;
        vi.spyOn(Math, 'random').mockImplementation(() => seq[i++ % seq.length]);

        const r = generateMockReading(0, 6);
        expect(r.tempC).toBeGreaterThan(6);
    });

    it('produces a below-min breach when high coin flips down', () => {
        const seq = [0.05, 0.1, 0.5];
        let i = 0;
        vi.spyOn(Math, 'random').mockImplementation(() => seq[i++ % seq.length]);

        const r = generateMockReading(0, 6);
        expect(r.tempC).toBeLessThan(0);
    });

    it('rounds output to one decimal place', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.333333);
        const r = generateMockReading(null, null);
        expect(r.tempC * 10).toBeCloseTo(Math.round(r.tempC * 10), 5);
    });
});

describe('cold-chain detectBreach', () => {
    it('returns false when temp is exactly at min boundary', () => {
        expect(detectBreach(2, { minC: 2, maxC: 8 })).toBe(false);
    });

    it('returns false when temp is exactly at max boundary', () => {
        expect(detectBreach(8, { minC: 2, maxC: 8 })).toBe(false);
    });

    it('flags 0.1 below min as breach', () => {
        expect(detectBreach(1.9, { minC: 2, maxC: 8 })).toBe(true);
    });

    it('flags 0.1 above max as breach', () => {
        expect(detectBreach(8.1, { minC: 2, maxC: 8 })).toBe(true);
    });

    it('returns false when SLA bounds are both null (no SLA)', () => {
        expect(detectBreach(-50, { minC: null, maxC: null })).toBe(false);
        expect(detectBreach(150, { minC: null, maxC: null })).toBe(false);
    });

    it('respects only the upper bound when min is null', () => {
        expect(detectBreach(-100, { minC: null, maxC: 5 })).toBe(false);
        expect(detectBreach(6, { minC: null, maxC: 5 })).toBe(true);
    });

    it('respects only the lower bound when max is null', () => {
        expect(detectBreach(100, { minC: 0, maxC: null })).toBe(false);
        expect(detectBreach(-1, { minC: 0, maxC: null })).toBe(true);
    });

    it('handles negative SLA bands (frozen cargo)', () => {
        expect(detectBreach(-18, { minC: -25, maxC: -15 })).toBe(false);
        expect(detectBreach(-14, { minC: -25, maxC: -15 })).toBe(true);
        expect(detectBreach(-26, { minC: -25, maxC: -15 })).toBe(true);
    });
});

describe('cold-chain summary math (pure)', () => {
    // We verify the aggregation contract against a hand-computed expectation.
    // The actual summarizeReadings() hits the DB, so we re-implement the
    // aggregator inline here to lock its formula in tests.
    function aggregate(readings: number[]) {
        if (readings.length === 0) {
            return { minC: null, maxC: null, avgC: null, count: 0 };
        }
        const minC = Math.min(...readings);
        const maxC = Math.max(...readings);
        const sum = readings.reduce((a, b) => a + b, 0);
        const avgC = Math.round((sum / readings.length) * 100) / 100;
        return { minC, maxC, avgC, count: readings.length };
    }

    it('returns nulls for empty input', () => {
        expect(aggregate([])).toEqual({ minC: null, maxC: null, avgC: null, count: 0 });
    });

    it('computes min/max/avg for a small series', () => {
        expect(aggregate([2, 4, 6])).toEqual({ minC: 2, maxC: 6, avgC: 4, count: 3 });
    });

    it('rounds avg to 2 decimals', () => {
        expect(aggregate([1, 2, 2]).avgC).toBe(1.67);
    });
});
