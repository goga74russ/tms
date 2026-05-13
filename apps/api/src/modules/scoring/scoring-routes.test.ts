// ============================================================
// Driver scoring — route-layer helper tests.
// Composite-score / DB tests live in service.test.ts.
// ============================================================
import { describe, it, expect } from 'vitest';
import {
    scoreToTier,
    resolveScoringWindow,
    clampScoreboardLimit,
    aggregateTiers,
    DEFAULT_SCORING_WINDOW_DAYS,
} from './helpers.js';

describe('scoreToTier', () => {
    it('maps 90+ to platinum', () => {
        expect(scoreToTier(100)).toBe('platinum');
        expect(scoreToTier(95)).toBe('platinum');
        expect(scoreToTier(90)).toBe('platinum');
    });

    it('maps 75-89 to gold', () => {
        expect(scoreToTier(89)).toBe('gold');
        expect(scoreToTier(80)).toBe('gold');
        expect(scoreToTier(75)).toBe('gold');
    });

    it('maps 50-74 to silver', () => {
        expect(scoreToTier(74)).toBe('silver');
        expect(scoreToTier(50)).toBe('silver');
    });

    it('maps 0-49 to bronze', () => {
        expect(scoreToTier(49)).toBe('bronze');
        expect(scoreToTier(0)).toBe('bronze');
    });

    it('clamps out-of-range scores', () => {
        expect(scoreToTier(-10)).toBe('bronze');
        expect(scoreToTier(150)).toBe('platinum');
    });

    it('treats NaN / Infinity as bronze (defensive)', () => {
        expect(scoreToTier(Number.NaN)).toBe('bronze');
        expect(scoreToTier(Number.POSITIVE_INFINITY)).toBe('bronze');
    });
});

describe('resolveScoringWindow', () => {
    const fixedNow = new Date('2026-05-15T12:00:00Z');

    it('defaults to last N days when both from and to are absent', () => {
        const out = resolveScoringWindow(undefined, undefined, fixedNow);
        expect(out.to).toEqual(fixedNow);
        const diffDays = (out.to.getTime() - out.from.getTime()) / (24 * 60 * 60 * 1000);
        expect(diffDays).toBe(DEFAULT_SCORING_WINDOW_DAYS);
    });

    it('respects explicit `to` and defaults from 30d earlier', () => {
        const to = new Date('2026-05-01T00:00:00Z');
        const out = resolveScoringWindow(undefined, to, fixedNow);
        expect(out.to).toEqual(to);
        expect(out.from.toISOString()).toBe('2026-04-01T00:00:00.000Z');
    });

    it('passes through explicit from + to unchanged', () => {
        const from = new Date('2026-01-01T00:00:00Z');
        const to = new Date('2026-02-01T00:00:00Z');
        const out = resolveScoringWindow(from, to, fixedNow);
        expect(out.from).toEqual(from);
        expect(out.to).toEqual(to);
    });
});

describe('clampScoreboardLimit', () => {
    it('defaults to 10 when undefined / nullish / non-finite', () => {
        expect(clampScoreboardLimit(undefined)).toBe(10);
        expect(clampScoreboardLimit(Number.NaN)).toBe(10);
    });

    it('clamps to [1, 200]', () => {
        expect(clampScoreboardLimit(0)).toBe(1);
        expect(clampScoreboardLimit(-5)).toBe(1);
        expect(clampScoreboardLimit(500)).toBe(200);
        expect(clampScoreboardLimit(25)).toBe(25);
    });

    it('floors fractional values', () => {
        expect(clampScoreboardLimit(7.9)).toBe(7);
    });
});

describe('aggregateTiers', () => {
    it('buckets a mixed list of scores by tier', () => {
        const out = aggregateTiers([100, 92, 80, 60, 49, 0]);
        expect(out).toEqual({ platinum: 2, gold: 1, silver: 1, bronze: 2 });
    });

    it('returns zero counts for empty input', () => {
        expect(aggregateTiers([])).toEqual({ bronze: 0, silver: 0, gold: 0, platinum: 0 });
    });
});
