// ============================================================
// РТО route-layer helpers — window guard + severity classifier.
// Service aggregator tests live in service.test.ts.
// ============================================================
import { describe, it, expect } from 'vitest';
import {
    validateWindow,
    classifyDayDrivingSeverity,
    classifyWeekDrivingSeverity,
    formatHoursLabel,
} from './helpers.js';

describe('validateWindow', () => {
    it('accepts a valid ISO range from < to', () => {
        const out = validateWindow('2026-04-01T00:00:00Z', '2026-04-10T00:00:00Z');
        expect(out.ok).toBe(true);
        if (out.ok) {
            expect(out.from.toISOString()).toBe('2026-04-01T00:00:00.000Z');
            expect(out.to.toISOString()).toBe('2026-04-10T00:00:00.000Z');
        }
    });

    it('rejects from > to with `from > to` error', () => {
        const out = validateWindow('2026-04-10T00:00:00Z', '2026-04-01T00:00:00Z');
        expect(out).toEqual({ ok: false, error: 'from > to' });
    });

    it('rejects from == to as inverse? No — equal is allowed (point-in-time)', () => {
        const stamp = '2026-04-01T00:00:00Z';
        expect(validateWindow(stamp, stamp).ok).toBe(true);
    });

    it('rejects unparseable ISO strings', () => {
        expect(validateWindow('not-a-date', '2026-04-01T00:00:00Z'))
            .toEqual({ ok: false, error: 'Invalid ISO date' });
    });
});

describe('classifyDayDrivingSeverity', () => {
    // 9h = 540 min limit.
    it('< 90% → normal', () => {
        expect(classifyDayDrivingSeverity(0)).toBe('normal');
        expect(classifyDayDrivingSeverity(60)).toBe('normal');
        expect(classifyDayDrivingSeverity(485)).toBe('normal'); // 89.8%
    });

    it('≥ 90% but ≤ limit → warning', () => {
        expect(classifyDayDrivingSeverity(486)).toBe('warning'); // ≥90% of 540
        expect(classifyDayDrivingSeverity(540)).toBe('warning'); // at limit
    });

    it('> limit → breach', () => {
        expect(classifyDayDrivingSeverity(541)).toBe('breach');
        expect(classifyDayDrivingSeverity(720)).toBe('breach');
    });
});

describe('classifyWeekDrivingSeverity', () => {
    // 56h = 3360 min limit.
    it('returns normal / warning / breach across thresholds', () => {
        expect(classifyWeekDrivingSeverity(0)).toBe('normal');
        expect(classifyWeekDrivingSeverity(3024)).toBe('warning'); // exactly 90%
        expect(classifyWeekDrivingSeverity(3360)).toBe('warning'); // at limit
        expect(classifyWeekDrivingSeverity(3361)).toBe('breach');
    });
});

describe('formatHoursLabel', () => {
    it('formats whole-hour totals as `N ч`', () => {
        expect(formatHoursLabel(0)).toBe('0 мин');
        expect(formatHoursLabel(60)).toBe('1 ч');
        expect(formatHoursLabel(540)).toBe('9 ч');
    });

    it('formats mixed hours+minutes', () => {
        expect(formatHoursLabel(75)).toBe('1 ч 15 мин');
        expect(formatHoursLabel(125)).toBe('2 ч 5 мин');
    });

    it('formats sub-hour totals as `N мин`', () => {
        expect(formatHoursLabel(30)).toBe('30 мин');
    });
});
