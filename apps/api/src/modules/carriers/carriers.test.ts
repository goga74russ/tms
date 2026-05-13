// ============================================================
// Carriers / subcontracting — pure helper tests.
// ============================================================
import { describe, it, expect } from 'vitest';
import {
    num,
    serializeContract,
    canAssignCarrier,
    isInnShape,
    isKppShape,
    isOgrnShape,
    validateContractDraft,
    computeBalance,
} from './helpers.js';

describe('num', () => {
    it('coerces numeric strings (drizzle numeric columns) to numbers', () => {
        expect(num('25.5')).toBe(25.5);
        expect(num('0')).toBe(0);
    });

    it('returns null for null / undefined / non-finite input', () => {
        expect(num(null)).toBeNull();
        expect(num(undefined)).toBeNull();
        expect(num('not-a-number')).toBeNull();
        expect(num(Number.POSITIVE_INFINITY)).toBeNull();
    });
});

describe('serializeContract', () => {
    it('converts rate columns from string to number', () => {
        const row = {
            id: 'c-1',
            number: '001',
            defaultRatePerKm: '25.5',
            defaultRatePerTon: '4000',
        };
        const out = serializeContract(row);
        expect(out.defaultRatePerKm).toBe(25.5);
        expect(out.defaultRatePerTon).toBe(4000);
        expect(out.id).toBe('c-1');
        expect(out.number).toBe('001');
    });

    it('preserves null rates', () => {
        const out = serializeContract({
            defaultRatePerKm: null,
            defaultRatePerTon: null,
        });
        expect(out.defaultRatePerKm).toBeNull();
        expect(out.defaultRatePerTon).toBeNull();
    });
});

describe('canAssignCarrier (trip-status gate)', () => {
    it.each(['planning', 'assigned'])('allows assignment when status is %s', (s) => {
        expect(canAssignCarrier(s)).toBe(true);
    });

    it.each(['in_transit', 'completed', 'cancelled', 'delivered'])(
        'rejects assignment after trip start (%s)',
        (s) => {
            expect(canAssignCarrier(s)).toBe(false);
        },
    );

    it('rejects null / undefined status', () => {
        expect(canAssignCarrier(null)).toBe(false);
        expect(canAssignCarrier(undefined)).toBe(false);
    });
});

describe('isInnShape / isKppShape / isOgrnShape', () => {
    it('isInnShape accepts 10 (юр. лицо) or 12 (ИП) digits', () => {
        expect(isInnShape('1234567890')).toBe(true);
        expect(isInnShape('123456789012')).toBe(true);
        expect(isInnShape('12345')).toBe(false);
        expect(isInnShape('abcdefghij')).toBe(false);
        expect(isInnShape(null)).toBe(false);
    });

    it('isKppShape accepts exactly 9 digits', () => {
        expect(isKppShape('770101001')).toBe(true);
        expect(isKppShape('77010100')).toBe(false);
        expect(isKppShape('7701010012')).toBe(false);
        expect(isKppShape(null)).toBe(false);
    });

    it('isOgrnShape accepts 13 (юр. лицо) or 15 (ИП) digits', () => {
        expect(isOgrnShape('1027700132195')).toBe(true);  // 13
        expect(isOgrnShape('304500116000157')).toBe(true); // 15
        expect(isOgrnShape('123')).toBe(false);
    });
});

describe('validateContractDraft', () => {
    it('accepts a valid open-ended period', () => {
        const out = validateContractDraft({ startDate: '2026-01-01T00:00:00Z' });
        expect(out).toBeNull();
    });

    it('rejects endDate < startDate', () => {
        const out = validateContractDraft({
            startDate: '2026-02-01T00:00:00Z',
            endDate: '2026-01-01T00:00:00Z',
        });
        expect(out).toContain('позже');
    });

    it('rejects negative rates', () => {
        expect(validateContractDraft({
            startDate: '2026-01-01T00:00:00Z',
            defaultRatePerKm: -1,
        })).toContain('неотрицательной');
        expect(validateContractDraft({
            startDate: '2026-01-01T00:00:00Z',
            defaultRatePerTon: -100,
        })).toContain('неотрицательной');
    });

    it('rejects malformed dates', () => {
        expect(validateContractDraft({ startDate: 'not-a-date' })).toContain('валидной');
    });
});

describe('computeBalance', () => {
    it('sums debits and subtracts credits, rounded to 2 decimals', () => {
        expect(computeBalance([
            { type: 'debit', amount: 1000 },
            { type: 'debit', amount: 500.555 },
            { type: 'credit', amount: 250 },
        ])).toBe(1250.56);
    });

    it('returns 0 for empty list', () => {
        expect(computeBalance([])).toBe(0);
    });

    it('skips non-finite amounts defensively', () => {
        expect(computeBalance([
            { type: 'debit', amount: 100 },
            { type: 'debit', amount: Number.NaN },
        ])).toBe(100);
    });
});
