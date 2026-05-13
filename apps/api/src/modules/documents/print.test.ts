// ============================================================
// PDF helpers (modules/documents) — pure formatter tests.
// Skips PDF binary output (pdfkit + filesystem fonts) — covered
// by integration smoke tests. Focus: formatDate / formatMoney
// (used across all invoices + TTN + waybill) and the CARRIER
// env-defaults loader.
// ============================================================
import { describe, it, expect } from 'vitest';
import { formatDate, formatMoney, CARRIER } from './pdf-base.js';

describe('formatDate', () => {
    it('formats a Date as DD.MM.YYYY (ru-RU)', () => {
        const d = new Date('2026-05-13T12:00:00Z');
        const formatted = formatDate(d);
        // toLocaleDateString output is locale-deterministic on Node ICU.
        // Should contain day "13", month "05", year "2026".
        expect(formatted).toMatch(/^\d{2}\.\d{2}\.2026$/);
        expect(formatted).toContain('2026');
    });

    it('parses ISO strings before formatting', () => {
        expect(formatDate('2026-01-01T00:00:00Z')).toMatch(/^\d{2}\.\d{2}\.2026$/);
    });

    it('returns em-dash for null / undefined / invalid input', () => {
        expect(formatDate(null)).toBe('—');
        expect(formatDate(undefined)).toBe('—');
        expect(formatDate('not-a-date')).toBe('—');
    });
});

describe('formatMoney', () => {
    it('formats integers and floats with 2 decimals + ru-RU thousands separator', () => {
        // ru-RU uses a non-breaking space as thousands separator and comma decimal.
        const a = formatMoney(1234.5);
        // Must end with ",50" and contain "1" then "234".
        expect(a.endsWith(',50')).toBe(true);
        expect(a).toMatch(/1[\s  ]234,50/);
    });

    it('formats string-numeric input by coercion', () => {
        const out = formatMoney('99.9');
        expect(out).toBe('99,90');
    });

    it('returns em-dash for null / undefined', () => {
        expect(formatMoney(null)).toBe('—');
        expect(formatMoney(undefined)).toBe('—');
    });

    it('zero formats as 0,00', () => {
        expect(formatMoney(0)).toBe('0,00');
    });

    it('preserves negative sign', () => {
        const out = formatMoney(-50);
        expect(out.startsWith('-')).toBe(true);
        expect(out).toContain('50,00');
    });
});

describe('CARRIER (env-driven defaults)', () => {
    it('exposes all required fields for invoices / acts / waybills', () => {
        // These are read at module load. Tests run without the env set,
        // so the fallback constants from pdf-base.ts should be used.
        expect(typeof CARRIER.name).toBe('string');
        expect(typeof CARRIER.inn).toBe('string');
        expect(typeof CARRIER.kpp).toBe('string');
        expect(typeof CARRIER.address).toBe('string');
        expect(typeof CARRIER.bank).toBe('string');
        expect(typeof CARRIER.bik).toBe('string');
        expect(typeof CARRIER.account).toBe('string');
        expect(typeof CARRIER.corr).toBe('string');
    });

    it('default ИНН is 10 digits', () => {
        // CARRIER.inn may be set via env — only assert shape when default.
        if (!process.env.CARRIER_INN) {
            expect(CARRIER.inn).toMatch(/^\d{10}$/);
        }
    });

    it('default БИК is 9 digits', () => {
        if (!process.env.CARRIER_BIK) {
            expect(CARRIER.bik).toMatch(/^\d{9}$/);
        }
    });

    it('default account / correspondent are 20 digits', () => {
        if (!process.env.CARRIER_ACCOUNT) {
            expect(CARRIER.account).toMatch(/^\d{20}$/);
        }
        if (!process.env.CARRIER_CORR) {
            expect(CARRIER.corr).toMatch(/^\d{20}$/);
        }
    });
});
