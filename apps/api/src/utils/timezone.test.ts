import { describe, it, expect } from 'vitest';
import { getBusinessDayBounds, getAppTimezone } from './timezone.js';

describe('getAppTimezone', () => {
    it('returns a non-empty IANA timezone string', () => {
        const tz = getAppTimezone();
        expect(typeof tz).toBe('string');
        expect(tz.length).toBeGreaterThan(0);
    });

    it('defaults to Europe/Moscow when APP_TIMEZONE is not overridden', () => {
        // Module reads env at import time; in CI/local this should default.
        const tz = getAppTimezone();
        expect(['Europe/Moscow', process.env.APP_TIMEZONE]).toContain(tz);
    });
});

describe('getBusinessDayBounds', () => {
    it('returns Date instances for todayStart and todayEnd', () => {
        const { todayStart, todayEnd } = getBusinessDayBounds();
        expect(todayStart).toBeInstanceOf(Date);
        expect(todayEnd).toBeInstanceOf(Date);
        expect(Number.isNaN(todayStart.getTime())).toBe(false);
        expect(Number.isNaN(todayEnd.getTime())).toBe(false);
    });

    it('todayStart is strictly before todayEnd', () => {
        const { todayStart, todayEnd } = getBusinessDayBounds();
        expect(todayStart.getTime()).toBeLessThan(todayEnd.getTime());
    });

    it('the span between start and end is approximately 24 hours', () => {
        const { todayStart, todayEnd } = getBusinessDayBounds();
        const diffMs = todayEnd.getTime() - todayStart.getTime();
        // Should be just under 24h (23:59:59.999)
        expect(diffMs).toBeGreaterThan(23 * 60 * 60 * 1000);
        expect(diffMs).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
    });

    it('current time falls within the business day bounds', () => {
        const { todayStart, todayEnd } = getBusinessDayBounds();
        const now = Date.now();
        // Allow generous slack — bounds are TZ-shifted relative to UTC now.
        // Span covers exactly one local day, so "now" must fall within it.
        expect(now).toBeGreaterThanOrEqual(todayStart.getTime());
        expect(now).toBeLessThanOrEqual(todayEnd.getTime());
    });
});
