// ============================================================
// Marking (ЦРПТ) — pure helper tests. Exercises shape classifier,
// GTIN+serial parser, verification state machine and summary
// aggregator without touching DB / Fastify / network.
// ============================================================
import { describe, it, expect } from 'vitest';
import {
    parseGtinSerial,
    classifyCodeShape,
    classifyVerification,
    summarizeVerify,
} from './helpers.js';
import type { MarkingVerifyResult } from '../../../providers/marking/interface.js';

describe('parseGtinSerial', () => {
    it('splits a 27-char ЦРПТ code into GTIN + serial', () => {
        // 14 digits GTIN, then 13-char serial (alphanumeric in real spec).
        const code = '04601234567894' + 'ABC1234567XYZ';
        const out = parseGtinSerial(code);
        expect(out).toEqual({ gtin: '04601234567894', serial: 'ABC1234567XYZ' });
    });

    it('returns null for codes shorter than the 14-char GTIN', () => {
        expect(parseGtinSerial('123456789')).toBeNull();
        expect(parseGtinSerial('')).toBeNull();
    });

    it('rejects codes whose first 14 chars are not all digits (not a GTIN)', () => {
        expect(parseGtinSerial('NOT-A-GTIN-XXXXserialhere0')).toBeNull();
    });

    it('rejects a 14-char code with empty serial', () => {
        expect(parseGtinSerial('04601234567894')).toBeNull();
    });
});

describe('classifyCodeShape', () => {
    it('classifies a well-formed code as valid', () => {
        expect(classifyCodeShape('04601234567894' + 'SERIAL1234567')).toBe('valid');
    });

    it('classifies empty / whitespace input as empty', () => {
        expect(classifyCodeShape('')).toBe('empty');
        expect(classifyCodeShape('   ')).toBe('empty');
        expect(classifyCodeShape(null)).toBe('empty');
        expect(classifyCodeShape(undefined)).toBe('empty');
    });

    it('classifies short / non-string input as malformed', () => {
        expect(classifyCodeShape('123')).toBe('malformed');
        expect(classifyCodeShape(12345)).toBe('malformed');
    });
});

describe('classifyVerification (state machine: sent → accepted/rejected)', () => {
    const base: MarkingVerifyResult = { code: 'C', valid: false };

    it('valid === true → accepted', () => {
        expect(classifyVerification({ ...base, valid: true })).toBe('accepted');
    });

    it('valid === false → rejected', () => {
        expect(classifyVerification({ ...base, valid: false })).toBe('rejected');
    });
});

describe('summarizeVerify', () => {
    it('counts valid + invalid + total across a batch', () => {
        const rows: MarkingVerifyResult[] = [
            { code: '1', valid: true },
            { code: '2', valid: true },
            { code: '3', valid: false },
        ];
        expect(summarizeVerify(rows)).toEqual({ total: 3, valid: 2, invalid: 1 });
    });

    it('returns zeros for empty batch', () => {
        expect(summarizeVerify([])).toEqual({ total: 0, valid: 0, invalid: 0 });
    });
});
