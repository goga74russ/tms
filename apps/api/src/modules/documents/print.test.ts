// ============================================================
// PDF helpers (modules/documents) — pure formatter tests.
// Skips PDF binary output (pdfkit + filesystem fonts) — covered
// by integration smoke tests. Focus: formatDate / formatMoney
// (used across all invoices + TTN + waybill) and the CARRIER
// env-defaults loader.
// ============================================================
import { describe, it, expect } from 'vitest';
import { formatDate, formatMoney } from './pdf-base.js';
import { carrierForPdf, assertCarrierConfigured, CarrierNotConfiguredError, NOT_SET } from './carrier-format.js';

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

// ③ — реквизиты исполнителя резолвятся из организации (org-requisites), а не из
// хардкода. carrierForPdf маппит их в формат PDF-генераторов с NOT_SET-fallback.
describe('carrierForPdf', () => {
    it('maps org requisites into PDF carrier fields', () => {
        const c = carrierForPdf({
            name: 'ООО Ромашка', inn: '7700000001', kpp: '770001001', ogrn: '1027700000001',
            address: 'г. Москва', bankBik: '044525104', bankAccount: '40702810000000000001',
            bankName: 'Банк Точка', corrAccount: '30101810000000000104',
        });
        expect(c.name).toBe('ООО Ромашка');
        expect(c.inn).toBe('7700000001');
        expect(c.bank).toBe('Банк Точка');
        expect(c.account).toBe('40702810000000000001');
        expect(c.corr).toBe('30101810000000000104');
    });

    it('falls back to NOT_SET when org is null / fields empty (no foreign requisites)', () => {
        const c = carrierForPdf(null);
        expect(c.name).toBe(NOT_SET);
        expect(c.inn).toBe(NOT_SET);
        expect(c.account).toBe(NOT_SET);
        expect(c.kpp).toBe(''); // ИП — без КПП
    });
});

describe('assertCarrierConfigured (server-PDF gate)', () => {
    const full = {
        name: 'ИП Иванов', inn: '746003023587', kpp: null, ogrn: null,
        address: 'г. Москва', bankBik: '044525104', bankAccount: '40802810000000000001',
        bankName: 'Банк', corrAccount: '30101810000000000104',
    };

    it('passes when name + inn present', () => {
        expect(() => assertCarrierConfigured(full)).not.toThrow();
    });

    it('throws CarrierNotConfiguredError (422) when org unset', () => {
        try {
            assertCarrierConfigured(null);
            expect.unreachable('should have thrown');
        } catch (e: any) {
            expect(e).toBeInstanceOf(CarrierNotConfiguredError);
            expect(e.statusCode).toBe(422);
        }
    });

    it('requireBank: throws when account missing', () => {
        expect(() => assertCarrierConfigured({ ...full, bankAccount: null }, { requireBank: true })).toThrow(CarrierNotConfiguredError);
    });
});
