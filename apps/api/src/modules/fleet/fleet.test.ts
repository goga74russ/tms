// ============================================================
// Fleet validators — INN/plate/VIN/license/deadline classifiers.
// All helpers in fleet/validators.ts are pure (no DB, no network)
// except lookupByInn which we exercise indirectly via the mock.
// ============================================================
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

import {
    validateInn,
    validatePlateNumber,
    validateVin,
    validateLicenseNumber,
    getDeadlineColor,
    getVehicleDeadlines,
    hasExpiredDocuments,
} from './validators.js';

describe('validateInn — Russian INN checksum', () => {
    it('rejects malformed length / non-digit input', () => {
        expect(validateInn('').valid).toBe(false);
        expect(validateInn('12345').valid).toBe(false);
        expect(validateInn('abcdefghij').valid).toBe(false);
        expect(validateInn('12345678901').valid).toBe(false); // 11 digits
    });

    it('accepts a known-valid 10-digit INN', () => {
        // 7707083893 — Sberbank (canonical public ИНН used in many fixtures).
        expect(validateInn('7707083893').valid).toBe(true);
    });

    it('rejects a 10-digit INN with wrong check digit', () => {
        // Flip the final digit of the valid Sberbank INN.
        const out = validateInn('7707083890');
        expect(out.valid).toBe(false);
        expect(out.error).toMatch(/контрольная сумма/i);
    });

    it('accepts a known-valid 12-digit individual INN', () => {
        // 500100732259 — published demo individual ИНН used by ФНС examples.
        expect(validateInn('500100732259').valid).toBe(true);
    });

    it('rejects a 12-digit INN with a broken check digit', () => {
        expect(validateInn('500100732250').valid).toBe(false);
    });
});

describe('validatePlateNumber — Russian plate format', () => {
    it('accepts canonical А000АА00 / А000АА000 shapes', () => {
        expect(validatePlateNumber('А123ВС77').valid).toBe(true);
        expect(validatePlateNumber('А123ВС777').valid).toBe(true);
    });

    it('accepts Latin look-alikes (A B E K M H O P C T Y X)', () => {
        expect(validatePlateNumber('A123BC77').valid).toBe(true);
    });

    it('rejects plates with disallowed letters', () => {
        // Я/Z are not in the allowed alphabet for Russian plates.
        expect(validatePlateNumber('Я123ВС77').valid).toBe(false);
        expect(validatePlateNumber('Z123BC77').valid).toBe(false);
    });

    it('rejects wrong digit count / structure', () => {
        expect(validatePlateNumber('А12ВС77').valid).toBe(false);
        expect(validatePlateNumber('123АВС77').valid).toBe(false);
        expect(validatePlateNumber('').valid).toBe(false);
    });
});

describe('validateVin — 17-char VIN with I/O/Q ban', () => {
    it('accepts a clean 17-char VIN', () => {
        expect(validateVin('1HGCM82633A004352').valid).toBe(true);
    });

    it('rejects length ≠ 17', () => {
        expect(validateVin('SHORT').valid).toBe(false);
        expect(validateVin('1HGCM82633A0043521').valid).toBe(false);
    });

    it('rejects VINs containing I, O or Q (any case)', () => {
        expect(validateVin('1HGCM82633A00435I').valid).toBe(false);
        expect(validateVin('1HGCM82633A00435o').valid).toBe(false);
        expect(validateVin('1HGCM82633A00435Q').valid).toBe(false);
    });

    it('rejects non-alphanumeric characters', () => {
        expect(validateVin('1HGCM82633A0043-2').valid).toBe(false);
    });
});

describe('validateLicenseNumber — 10-digit driver license', () => {
    it('accepts 10 digits with or without spaces', () => {
        expect(validateLicenseNumber('7700123456').valid).toBe(true);
        expect(validateLicenseNumber('77 00 123456').valid).toBe(true);
    });

    it('rejects wrong length / non-digit chars', () => {
        expect(validateLicenseNumber('123').valid).toBe(false);
        expect(validateLicenseNumber('77 00 12345A').valid).toBe(false);
    });
});

describe('getDeadlineColor — document-deadline traffic light', () => {
    // Freeze time so the >30 / 7-30 / <7 / expired buckets are deterministic.
    const NOW = new Date('2026-05-13T00:00:00.000Z');
    beforeAll(() => {
        vi.useFakeTimers();
        vi.setSystemTime(NOW);
    });
    afterAll(() => {
        vi.useRealTimers();
    });

    function inDays(d: number) {
        return new Date(NOW.getTime() + d * 86400000);
    }

    it('returns null when no deadline supplied', () => {
        expect(getDeadlineColor(null)).toBeNull();
        expect(getDeadlineColor(undefined)).toBeNull();
    });

    it('returns "blocked" when the deadline is in the past', () => {
        expect(getDeadlineColor(inDays(-1))).toBe('blocked');
    });

    it('returns "red" within the 0–7 day urgent window', () => {
        expect(getDeadlineColor(inDays(1))).toBe('red');
        expect(getDeadlineColor(inDays(6))).toBe('red');
    });

    it('returns "yellow" within the 7–30 day warning window', () => {
        expect(getDeadlineColor(inDays(15))).toBe('yellow');
        expect(getDeadlineColor(inDays(30))).toBe('yellow');
    });

    it('returns "green" beyond 30 days', () => {
        expect(getDeadlineColor(inDays(45))).toBe('green');
        expect(getDeadlineColor(inDays(365))).toBe('green');
    });

    it('accepts ISO date strings as well as Date objects', () => {
        expect(getDeadlineColor(inDays(45).toISOString())).toBe('green');
    });
});

describe('getVehicleDeadlines / hasExpiredDocuments', () => {
    const NOW = new Date('2026-05-13T00:00:00.000Z');
    beforeAll(() => {
        vi.useFakeTimers();
        vi.setSystemTime(NOW);
    });
    afterAll(() => {
        vi.useRealTimers();
    });

    function inDays(d: number) {
        return new Date(NOW.getTime() + d * 86400000);
    }

    it('classifies each deadline independently', () => {
        const out = getVehicleDeadlines({
            techInspectionExpiry: inDays(45),
            osagoExpiry: inDays(15),
            maintenanceNextDate: inDays(3),
            tachographCalibrationExpiry: inDays(-1),
        });
        expect(out).toEqual({
            techInspection: 'green',
            osago: 'yellow',
            maintenance: 'red',
            tachograph: 'blocked',
        });
    });

    it('hasExpiredDocuments is true iff at least one doc is blocked', () => {
        expect(hasExpiredDocuments({
            techInspectionExpiry: inDays(45),
            osagoExpiry: inDays(15),
            maintenanceNextDate: inDays(3),
        })).toBe(false);

        expect(hasExpiredDocuments({
            techInspectionExpiry: inDays(45),
            osagoExpiry: inDays(-1), // expired
        })).toBe(true);
    });
});
