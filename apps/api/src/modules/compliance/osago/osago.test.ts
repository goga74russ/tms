// ============================================================
// OSAGO compliance — pure classifier tests.
// `classifyOsagoExpiry` lives in @tms/shared/compliance and powers
// the dashboard band (green/yellow/red/unknown) for both the web
// admin UI and the mobile fleet-readiness summary, so locking its
// thresholds is a real regression safety net.
// ============================================================
import { describe, it, expect } from 'vitest';
import { classifyOsagoExpiry } from '@tms/shared';

const NOW = '2026-05-13T00:00:00.000Z';

function daysFromNow(days: number): string {
    return new Date(new Date(NOW).getTime() + days * 86400000).toISOString();
}

describe('classifyOsagoExpiry — three-band classifier', () => {
    it('returns "unknown" when valid is null (no check yet)', () => {
        expect(classifyOsagoExpiry(null, null, NOW)).toBe('unknown');
        expect(classifyOsagoExpiry(null, daysFromNow(60), NOW)).toBe('unknown');
    });

    it('returns "red" when policy is reported invalid regardless of expiry', () => {
        expect(classifyOsagoExpiry(false, null, NOW)).toBe('red');
        expect(classifyOsagoExpiry(false, daysFromNow(60), NOW)).toBe('red');
    });

    it('returns "yellow" when valid but expiry is missing', () => {
        // Bug-safety: a valid=true row without expiry should warn, not green-light.
        expect(classifyOsagoExpiry(true, null, NOW)).toBe('yellow');
    });

    it('returns "red" when expiry is in the past (treated as expired)', () => {
        expect(classifyOsagoExpiry(true, daysFromNow(-1), NOW)).toBe('red');
        expect(classifyOsagoExpiry(true, daysFromNow(0), NOW)).toBe('red');
    });

    it('returns "yellow" within the 30-day warning window', () => {
        expect(classifyOsagoExpiry(true, daysFromNow(1), NOW)).toBe('yellow');
        expect(classifyOsagoExpiry(true, daysFromNow(15), NOW)).toBe('yellow');
        expect(classifyOsagoExpiry(true, daysFromNow(30), NOW)).toBe('yellow');
    });

    it('returns "green" when expiry is beyond 30 days', () => {
        expect(classifyOsagoExpiry(true, daysFromNow(31), NOW)).toBe('green');
        expect(classifyOsagoExpiry(true, daysFromNow(365), NOW)).toBe('green');
    });
});
