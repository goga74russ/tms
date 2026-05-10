import { describe, it, expect } from 'vitest';
import { toFiniteNumber, toOptionalFiniteNumber } from './number.js';

describe('toFiniteNumber', () => {
    it('returns 0 fallback for null/undefined/empty string', () => {
        expect(toFiniteNumber(null)).toBe(0);
        expect(toFiniteNumber(undefined)).toBe(0);
        expect(toFiniteNumber('')).toBe(0);
    });

    it('uses provided fallback when value is missing', () => {
        expect(toFiniteNumber(null, 42)).toBe(42);
        expect(toFiniteNumber(undefined, -7)).toBe(-7);
    });

    it('returns numeric values unchanged including 0 and negatives', () => {
        expect(toFiniteNumber(0)).toBe(0);
        expect(toFiniteNumber(-123.45)).toBe(-123.45);
        expect(toFiniteNumber(1e15)).toBe(1e15);
    });

    it('parses numeric strings', () => {
        expect(toFiniteNumber('3.14')).toBe(3.14);
        expect(toFiniteNumber('-99')).toBe(-99);
        expect(toFiniteNumber('0')).toBe(0);
    });

    it('returns fallback for NaN/Infinity-producing inputs', () => {
        expect(toFiniteNumber('abc')).toBe(0);
        expect(toFiniteNumber('abc', 5)).toBe(5);
        expect(toFiniteNumber(Number.POSITIVE_INFINITY)).toBe(0);
        expect(toFiniteNumber(Number.NaN, 9)).toBe(9);
    });

    it('handles boolean and object inputs deterministically', () => {
        // Number(true) === 1, Number(false) === 0, Number({}) === NaN
        expect(toFiniteNumber(true)).toBe(1);
        expect(toFiniteNumber(false)).toBe(0);
        expect(toFiniteNumber({}, 11)).toBe(11);
    });
});

describe('toOptionalFiniteNumber', () => {
    it('returns null for null/undefined/empty string', () => {
        expect(toOptionalFiniteNumber(null)).toBeNull();
        expect(toOptionalFiniteNumber(undefined)).toBeNull();
        expect(toOptionalFiniteNumber('')).toBeNull();
    });

    it('returns finite numbers including 0 and negatives', () => {
        expect(toOptionalFiniteNumber(0)).toBe(0);
        expect(toOptionalFiniteNumber(-1.5)).toBe(-1.5);
        expect(toOptionalFiniteNumber(1e10)).toBe(1e10);
    });

    it('parses numeric strings', () => {
        expect(toOptionalFiniteNumber('2.5')).toBe(2.5);
        expect(toOptionalFiniteNumber('-0')).toBe(-0);
    });

    it('returns null for non-finite or unparsable values', () => {
        expect(toOptionalFiniteNumber('not a number')).toBeNull();
        expect(toOptionalFiniteNumber(Number.POSITIVE_INFINITY)).toBeNull();
        expect(toOptionalFiniteNumber(Number.NaN)).toBeNull();
    });
});
