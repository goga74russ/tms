// ============================================================
// Inspections — pure classifiers extracted to classifiers.ts.
// No DB / events required.
// ============================================================
import { describe, it, expect } from 'vitest';

import {
    classifyTechInspection,
    classifyMedInspection,
    buildAppendedComment,
    validateDecisionUpdate,
    getDocumentTrafficLight,
} from './classifiers.js';

describe('classifyTechInspection', () => {
    it('approves cleanly when all items pass', () => {
        const out = classifyTechInspection('approved', [
            { name: 'Тормоза', result: 'ok' },
            { name: 'Свет', result: 'ok' },
        ]);
        expect(out.faultCount).toBe(0);
        expect(out.shouldBlockVehicle).toBe(false);
        expect(out.shouldCreateRepairRequest).toBe(false);
    });

    it('on rejection: cascades to block vehicle + create repair request', () => {
        const out = classifyTechInspection('rejected', [
            { name: 'Тормоза', result: 'fault', comment: 'no fluid' },
            { name: 'Свет', result: 'ok' },
        ]);
        expect(out.faultCount).toBe(1);
        expect(out.faultItems).toEqual(['Тормоза']);
        expect(out.shouldBlockVehicle).toBe(true);
        expect(out.shouldCreateRepairRequest).toBe(true);
    });

    it('flags critical fault even when decision is approved (cascades to block)', () => {
        const out = classifyTechInspection('approved', [
            { name: 'Тормоза', result: 'fault', critical: true },
        ]);
        expect(out.hasCriticalFault).toBe(true);
        expect(out.shouldBlockVehicle).toBe(true);
        // Repair request only on rejection.
        expect(out.shouldCreateRepairRequest).toBe(false);
    });

    it('counts critical faults separately from total faults', () => {
        const out = classifyTechInspection('rejected', [
            { name: 'A', result: 'fault', critical: true },
            { name: 'B', result: 'fault', critical: false },
            { name: 'C', result: 'fault' },
        ]);
        expect(out.faultCount).toBe(3);
        expect(out.criticalFaultCount).toBe(1);
    });
});

describe('classifyMedInspection', () => {
    const okVitals = {
        systolicBp: 120,
        diastolicBp: 80,
        heartRate: 70,
        temperature: 36.6,
        alcoholTest: 'negative' as const,
    };

    it('approves normal vitals', () => {
        const out = classifyMedInspection('approved', okVitals);
        expect(out.abnormalVitals).toBe(false);
        expect(out.alcoholPositive).toBe(false);
        expect(out.shouldBlockDriver).toBe(false);
    });

    it('flags abnormal vitals (high BP)', () => {
        const out = classifyMedInspection('approved', { ...okVitals, systolicBp: 160, diastolicBp: 100 });
        expect(out.abnormalVitals).toBe(true);
    });

    it('flags fever as abnormal', () => {
        const out = classifyMedInspection('approved', { ...okVitals, temperature: 38.5 });
        expect(out.abnormalVitals).toBe(true);
    });

    it('positive alcohol always blocks driver, even on approved decision', () => {
        const out = classifyMedInspection('approved', { ...okVitals, alcoholTest: 'positive' });
        expect(out.alcoholPositive).toBe(true);
        expect(out.shouldBlockDriver).toBe(true);
    });

    it('rejection always blocks driver', () => {
        const out = classifyMedInspection('rejected', okVitals);
        expect(out.shouldBlockDriver).toBe(true);
    });
});

describe('buildAppendedComment', () => {
    it('returns existing comment when note is empty', () => {
        expect(buildAppendedComment('old', '')).toBe('old');
        expect(buildAppendedComment('old', null)).toBe('old');
        expect(buildAppendedComment('old', undefined)).toBe('old');
    });

    it('appends note on a new line', () => {
        expect(buildAppendedComment('старое', 'допустить')).toBe('старое\nдопустить');
    });

    it('returns note alone when existing is empty', () => {
        expect(buildAppendedComment(null, 'first note')).toBe('first note');
        expect(buildAppendedComment('', 'first note')).toBe('first note');
    });

    it('trims whitespace from note before appending', () => {
        expect(buildAppendedComment('a', '  b  ')).toBe('a\nb');
    });

    it('returns null when both are empty', () => {
        expect(buildAppendedComment(null, null)).toBeNull();
        expect(buildAppendedComment('', '')).toBe('');
    });
});

describe('validateDecisionUpdate', () => {
    it('accepts approved with or without notes', () => {
        expect(validateDecisionUpdate({ decision: 'approved' }).ok).toBe(true);
        expect(validateDecisionUpdate({ decision: 'approved', notes: 'all good' }).ok).toBe(true);
    });

    it('requires a note on rejection', () => {
        const out = validateDecisionUpdate({ decision: 'rejected' });
        expect(out.ok).toBe(false);
        expect(out.reason).toBe('note_required_on_reject');
    });

    it('accepts rejection when note is present', () => {
        expect(validateDecisionUpdate({ decision: 'rejected', notes: 'unsafe brakes' }).ok).toBe(true);
    });

    it('rejects unknown decisions', () => {
        const out = validateDecisionUpdate({ decision: 'maybe' });
        expect(out.ok).toBe(false);
        expect(out.reason).toBe('unknown_decision');
    });
});

describe('getDocumentTrafficLight', () => {
    const now = new Date('2026-05-13T12:00:00Z');

    it('returns unknown when expiry is null/undefined', () => {
        expect(getDocumentTrafficLight(null, { now })).toBe('unknown');
        expect(getDocumentTrafficLight(undefined, { now })).toBe('unknown');
    });

    it('returns red when expired', () => {
        expect(getDocumentTrafficLight(new Date('2026-01-01'), { now })).toBe('red');
    });

    it('returns yellow within 30 days of expiry', () => {
        expect(getDocumentTrafficLight(new Date('2026-05-20'), { now })).toBe('yellow');
    });

    it('returns green when expiry > 30 days away', () => {
        expect(getDocumentTrafficLight(new Date('2027-01-01'), { now })).toBe('green');
    });

    it('parses ISO strings', () => {
        expect(getDocumentTrafficLight('2027-01-01T00:00:00Z', { now })).toBe('green');
    });
});
