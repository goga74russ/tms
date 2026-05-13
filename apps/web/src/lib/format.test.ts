import { describe, it, expect } from 'vitest';
import {
    formatMoney,
    formatCurrency,
    formatKopecksAsRub,
    formatDate,
    formatDateTime,
    pluralize,
    truncate,
    toNumber,
} from './format';

describe('toNumber', () => {
    it('passes through finite numbers', () => {
        expect(toNumber(0)).toBe(0);
        expect(toNumber(42.5)).toBe(42.5);
        expect(toNumber(-1)).toBe(-1);
    });

    it('parses numeric strings', () => {
        expect(toNumber('42')).toBe(42);
        expect(toNumber('3.14')).toBe(3.14);
    });

    it('returns null for null/undefined/empty', () => {
        expect(toNumber(null)).toBeNull();
        expect(toNumber(undefined)).toBeNull();
        expect(toNumber('')).toBeNull();
    });

    it('returns null for non-numeric strings', () => {
        expect(toNumber('abc')).toBeNull();
        expect(toNumber('NaN')).toBeNull();
    });
});

describe('formatMoney', () => {
    it('returns "—" for nullish/empty/NaN input', () => {
        expect(formatMoney(null)).toBe('—');
        expect(formatMoney(undefined)).toBe('—');
        expect(formatMoney('')).toBe('—');
        expect(formatMoney('foo')).toBe('—');
    });

    it('formats integer rubles with RU thousand separator', () => {
        // Use unicode NBSP-aware match: ru-RU uses U+00A0 between thousand groups.
        expect(formatMoney(1234)).toMatch(/^1.234 ₽$/);
        expect(formatMoney(0)).toBe('0 ₽');
    });

    it('handles string numeric inputs', () => {
        expect(formatMoney('1234')).toMatch(/^1.234 ₽$/);
    });
});

describe('formatCurrency', () => {
    it('formats with currency symbol and 2 max fraction digits', () => {
        const out = formatCurrency(1234.5);
        expect(out).toMatch(/₽/);
        expect(out).toMatch(/1.234,5/);
    });

    it('returns "—" for invalid input', () => {
        expect(formatCurrency(null)).toBe('—');
        expect(formatCurrency('xyz')).toBe('—');
    });
});

describe('formatKopecksAsRub', () => {
    it('divides kopecks by 100 then formats', () => {
        // 12345 kopecks -> 123,45 ₽
        const out = formatKopecksAsRub(12345);
        expect(out).toMatch(/123,45/);
        expect(out).toMatch(/₽/);
    });

    it('returns "—" for null', () => {
        expect(formatKopecksAsRub(null)).toBe('—');
    });
});

describe('formatDate', () => {
    it('formats ISO date to RU compact form', () => {
        // ru-RU date formatter outputs "DD.MM.YYYY"
        expect(formatDate('2026-05-13T10:00:00Z')).toMatch(/\d{2}\.\d{2}\.2026/);
    });

    it('accepts Date instances', () => {
        expect(formatDate(new Date(2026, 0, 1))).toMatch(/01\.01\.2026/);
    });

    it('returns "—" on invalid/empty', () => {
        expect(formatDate(null)).toBe('—');
        expect(formatDate(undefined)).toBe('—');
        expect(formatDate('')).toBe('—');
        expect(formatDate('not a date')).toBe('—');
    });
});

describe('formatDateTime', () => {
    it('returns a non-empty RU string for valid date', () => {
        const out = formatDateTime(new Date(2026, 4, 13, 14, 30));
        expect(out).not.toBe('—');
        expect(out).toMatch(/2026/);
    });

    it('returns "—" on invalid', () => {
        expect(formatDateTime('bogus')).toBe('—');
        expect(formatDateTime(null)).toBe('—');
    });
});

describe('pluralize', () => {
    const trips = ['трип', 'трипа', 'трипов'] as [string, string, string];

    it('1 -> singular', () => {
        expect(pluralize(1, trips)).toBe('трип');
        expect(pluralize(21, trips)).toBe('трип');
        expect(pluralize(101, trips)).toBe('трип');
    });

    it('2/3/4 -> few', () => {
        expect(pluralize(2, trips)).toBe('трипа');
        expect(pluralize(3, trips)).toBe('трипа');
        expect(pluralize(4, trips)).toBe('трипа');
        expect(pluralize(22, trips)).toBe('трипа');
    });

    it('5..20 -> many', () => {
        expect(pluralize(5, trips)).toBe('трипов');
        expect(pluralize(11, trips)).toBe('трипов');
        expect(pluralize(12, trips)).toBe('трипов');
        expect(pluralize(14, trips)).toBe('трипов');
        expect(pluralize(20, trips)).toBe('трипов');
    });

    it('0 -> many', () => {
        expect(pluralize(0, trips)).toBe('трипов');
    });

    it('handles negative counts', () => {
        expect(pluralize(-1, trips)).toBe('трип');
        expect(pluralize(-5, trips)).toBe('трипов');
    });
});

describe('truncate', () => {
    it('returns original string if shorter than max', () => {
        expect(truncate('hello', 10)).toBe('hello');
    });

    it('truncates and appends ellipsis', () => {
        expect(truncate('hello world', 5)).toBe('hello…');
    });

    it('trims trailing whitespace before ellipsis', () => {
        expect(truncate('hello       extra', 6)).toBe('hello…');
    });

    it('returns empty for null/undefined', () => {
        expect(truncate(null, 5)).toBe('');
        expect(truncate(undefined, 5)).toBe('');
    });

    it('returns empty when max <= 0', () => {
        expect(truncate('hello', 0)).toBe('');
        expect(truncate('hello', -1)).toBe('');
    });
});
