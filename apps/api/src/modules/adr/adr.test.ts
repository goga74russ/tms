// ============================================================
// ADR (опасные грузы) — pure helper tests.
// Class classifier + UN-number validator + eligibility checker.
// ============================================================
import { describe, it, expect } from 'vitest';
import {
    classifyAdrClass,
    getAdrClassNameRu,
    isValidUnNumber,
    normalizeUnNumber,
    checkAdrEligibility,
    ADR_CLASSES,
} from './helpers.js';

describe('classifyAdrClass', () => {
    it.each(ADR_CLASSES.map((c) => [c]))('accepts top-level class %s', (cls) => {
        expect(classifyAdrClass(cls)).toBe(cls);
    });

    it('accepts sub-classes by keeping the leading digit', () => {
        expect(classifyAdrClass('1.4')).toBe('1');
        expect(classifyAdrClass('6.1')).toBe('6');
        expect(classifyAdrClass('5.2')).toBe('5');
    });

    it('trims whitespace before classifying', () => {
        expect(classifyAdrClass('  3 ')).toBe('3');
    });

    it('returns null for empty / non-numeric / out-of-range input', () => {
        expect(classifyAdrClass(null)).toBeNull();
        expect(classifyAdrClass(undefined)).toBeNull();
        expect(classifyAdrClass('')).toBeNull();
        expect(classifyAdrClass('A')).toBeNull();
        expect(classifyAdrClass('0')).toBeNull();
    });
});

describe('getAdrClassNameRu', () => {
    it('returns the Russian label for a known class', () => {
        expect(getAdrClassNameRu('3')).toContain('воспламен');
        expect(getAdrClassNameRu('7')).toContain('Радиоактив');
    });

    it('returns null for unknown class', () => {
        expect(getAdrClassNameRu('Z')).toBeNull();
    });
});

describe('isValidUnNumber / normalizeUnNumber', () => {
    it.each([
        'UN1203', 'un1203', '1203', '  un0001  ',
    ])('accepts a 4-digit UN number: %s', (v) => {
        expect(isValidUnNumber(v)).toBe(true);
    });

    it.each([
        '', null, undefined, 'UN12', 'UN12345', 'UN12A3', 'ABC1203', '12-03',
    ])('rejects malformed UN number: %s', (v) => {
        expect(isValidUnNumber(v as any)).toBe(false);
    });

    it('normalises to canonical UNNNNN form', () => {
        expect(normalizeUnNumber('1203')).toBe('UN1203');
        expect(normalizeUnNumber('un0001')).toBe('UN0001');
        expect(normalizeUnNumber('  UN1234  ')).toBe('UN1234');
        expect(normalizeUnNumber('invalid')).toBeNull();
    });
});

describe('checkAdrEligibility', () => {
    const now = new Date('2026-05-15T12:00:00Z');
    const validExpiry = new Date('2027-01-01T00:00:00Z');
    const expired = new Date('2025-01-01T00:00:00Z');

    it('ok when driver has valid ADR cert and vehicle is equipped', () => {
        const out = checkAdrEligibility({
            driver: { adrCertificateExpiry: validExpiry },
            vehicle: { adrEquipped: true },
            now,
        });
        expect(out).toEqual({ ok: true, errors: [] });
    });

    it('flags expired driver certificate', () => {
        const out = checkAdrEligibility({
            driver: { adrCertificateExpiry: expired },
            vehicle: { adrEquipped: true },
            now,
        });
        expect(out.ok).toBe(false);
        expect(out.errors).toContain('ADR-сертификат водителя истёк');
    });

    it('flags missing driver certificate', () => {
        const out = checkAdrEligibility({
            driver: { adrCertificateExpiry: null },
            vehicle: { adrEquipped: true },
            now,
        });
        expect(out.errors).toContain('Водитель не имеет действующего ADR-свидетельства');
    });

    it('flags vehicle not equipped', () => {
        const out = checkAdrEligibility({
            driver: { adrCertificateExpiry: validExpiry },
            vehicle: { adrEquipped: false },
            now,
        });
        expect(out.errors).toContain('ТС не оборудовано для ADR-перевозок');
    });

    it('accumulates multiple errors at once', () => {
        const out = checkAdrEligibility({
            driver: null,
            vehicle: null,
            now,
        });
        expect(out.ok).toBe(false);
        expect(out.errors).toContain('Водитель не найден');
        expect(out.errors).toContain('ТС не найдено');
    });
});
