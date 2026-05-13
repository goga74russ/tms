// ============================================================
// Waybills — pure helpers extracted to lifecycle.ts.
// ============================================================
import { describe, it, expect } from 'vitest';
import { WaybillStatus } from '@tms/shared';

import {
    canTransitionWaybill,
    nextWaybillStatuses,
    classifyPreTripWaybillStatus,
    validateOdometerReadings,
    aggregateEtrnTitles,
    buildCloseComplianceSnapshot,
    classifyDossierReadiness,
} from './lifecycle.js';

describe('canTransitionWaybill', () => {
    it('allows draft → medical_check / technical_check / issued', () => {
        expect(canTransitionWaybill(WaybillStatus.DRAFT, WaybillStatus.MEDICAL_CHECK)).toBe(true);
        expect(canTransitionWaybill(WaybillStatus.DRAFT, WaybillStatus.TECHNICAL_CHECK)).toBe(true);
        expect(canTransitionWaybill(WaybillStatus.DRAFT, WaybillStatus.ISSUED)).toBe(true);
    });

    it('allows issued → closed', () => {
        expect(canTransitionWaybill(WaybillStatus.ISSUED, WaybillStatus.CLOSED)).toBe(true);
    });

    it('forbids closed → anything', () => {
        expect(canTransitionWaybill(WaybillStatus.CLOSED, WaybillStatus.ISSUED)).toBe(false);
        expect(nextWaybillStatuses(WaybillStatus.CLOSED)).toEqual([]);
    });

    it('forbids draft → closed (must go through issued)', () => {
        expect(canTransitionWaybill(WaybillStatus.DRAFT, WaybillStatus.CLOSED)).toBe(false);
    });
});

describe('classifyPreTripWaybillStatus', () => {
    it('returns issued when both tech and med approved and no blocking incidents', () => {
        expect(classifyPreTripWaybillStatus({
            hasTechApproval: true,
            hasMedApproval: true,
            hasBlockingIncidents: false,
        })).toBe('issued');
    });

    it('returns medical_check when only tech approved', () => {
        expect(classifyPreTripWaybillStatus({
            hasTechApproval: true,
            hasMedApproval: false,
            hasBlockingIncidents: false,
        })).toBe('medical_check');
    });

    it('returns technical_check when only med approved', () => {
        expect(classifyPreTripWaybillStatus({
            hasTechApproval: false,
            hasMedApproval: true,
            hasBlockingIncidents: false,
        })).toBe('technical_check');
    });

    it('returns draft when neither approved', () => {
        expect(classifyPreTripWaybillStatus({
            hasTechApproval: false,
            hasMedApproval: false,
            hasBlockingIncidents: false,
        })).toBe('draft');
    });

    it('does NOT return issued when blocking incidents are present (falls back to medical_check)', () => {
        expect(classifyPreTripWaybillStatus({
            hasTechApproval: true,
            hasMedApproval: true,
            hasBlockingIncidents: true,
        })).toBe('medical_check');
    });
});

describe('validateOdometerReadings', () => {
    it('accepts a reasonable forward delta', () => {
        const out = validateOdometerReadings(100000, 100400);
        expect(out.ok).toBe(true);
        expect(out.deltaKm).toBe(400);
    });

    it('rejects rollback (closing < opening)', () => {
        const out = validateOdometerReadings(100000, 99000);
        expect(out.ok).toBe(false);
        expect(out.reason).toBe('rollback');
    });

    it('rejects unrealistic delta > maxDeltaKm', () => {
        const out = validateOdometerReadings(0, 10_000);
        expect(out.ok).toBe(false);
        expect(out.reason).toBe('unrealistic_delta');
    });

    it('honours a custom maxDeltaKm threshold', () => {
        const out = validateOdometerReadings(0, 800, { maxDeltaKm: 500 });
        expect(out.ok).toBe(false);
        expect(out.reason).toBe('unrealistic_delta');
    });

    it('rejects invalid values (negative, NaN, undefined)', () => {
        expect(validateOdometerReadings(-1, 100).ok).toBe(false);
        expect(validateOdometerReadings(100, Number.NaN).ok).toBe(false);
        expect(validateOdometerReadings(undefined, 100).ok).toBe(false);
    });

    it('accepts equal opening/closing as zero delta (no movement)', () => {
        const out = validateOdometerReadings(100000, 100000);
        expect(out.ok).toBe(true);
        expect(out.deltaKm).toBe(0);
    });
});

describe('aggregateEtrnTitles', () => {
    it('reports ready=true when all titles are signed', () => {
        const out = aggregateEtrnTitles([
            { code: 'TN', status: 'signed', blocking: true },
            { code: 'PUTV', status: 'signed', blocking: true },
        ]);
        expect(out.ready).toBe(true);
        expect(out.blocking).toEqual([]);
        expect(out.unresolved).toEqual([]);
    });

    it('reports ready=false when a blocking title is pending', () => {
        const out = aggregateEtrnTitles([
            { code: 'TN', status: 'pending', blocking: true },
            { code: 'AUX', status: 'pending', blocking: false },
        ]);
        expect(out.ready).toBe(false);
        expect(out.blocking).toHaveLength(1);
        expect(out.blocking[0].code).toBe('TN');
        // Non-blocking still surfaces in unresolved.
        expect(out.unresolved).toHaveLength(2);
    });

    it('treats rejected / expired as unresolved when blocking', () => {
        const out = aggregateEtrnTitles([
            { code: 'TN', status: 'rejected', blocking: true },
        ]);
        expect(out.ready).toBe(false);
    });
});

describe('buildCloseComplianceSnapshot', () => {
    const okOdometer = { ok: true as const, deltaKm: 300 };
    const okEtrn = { blocking: [], unresolved: [], ready: true };

    it('returns canClose=true when everything is green', () => {
        const out = buildCloseComplianceSnapshot({
            waybillStatus: WaybillStatus.ISSUED,
            odometer: okOdometer,
            etrn: okEtrn,
            incompleteRoutePoints: 0,
            hasBlockingIncidents: false,
        });
        expect(out.canClose).toBe(true);
        expect(out.reasons).toEqual([]);
    });

    it('blocks close when waybill status is not "issued"', () => {
        const out = buildCloseComplianceSnapshot({
            waybillStatus: WaybillStatus.DRAFT,
            odometer: okOdometer,
            etrn: okEtrn,
            incompleteRoutePoints: 0,
            hasBlockingIncidents: false,
        });
        expect(out.canClose).toBe(false);
        expect(out.reasons.join(' ')).toContain('issued');
    });

    it('aggregates multiple blocking reasons', () => {
        const out = buildCloseComplianceSnapshot({
            waybillStatus: WaybillStatus.ISSUED,
            odometer: { ok: false, reason: 'rollback', message: 'rollback' },
            etrn: { blocking: [{ code: 'TN', status: 'pending', blocking: true }], unresolved: [], ready: false },
            incompleteRoutePoints: 2,
            hasBlockingIncidents: true,
        });
        expect(out.canClose).toBe(false);
        expect(out.reasons.length).toBe(4);
    });
});

describe('classifyDossierReadiness', () => {
    it('returns empty when nothing is set', () => {
        expect(classifyDossierReadiness({
            hasWaybill: false,
            hasVehicle: false,
            hasDriver: false,
            hasOrders: false,
            hardIssueCount: 0,
        })).toBe('empty');
    });

    it('returns ready when all docs present and no hard issues', () => {
        expect(classifyDossierReadiness({
            hasWaybill: true,
            hasVehicle: true,
            hasDriver: true,
            hasOrders: true,
            hardIssueCount: 0,
        })).toBe('ready');
    });

    it('returns blocked when hard issues are present', () => {
        expect(classifyDossierReadiness({
            hasWaybill: true,
            hasVehicle: true,
            hasDriver: true,
            hasOrders: true,
            hardIssueCount: 1,
        })).toBe('blocked');
    });

    it('returns partial when some docs are missing', () => {
        expect(classifyDossierReadiness({
            hasWaybill: false,
            hasVehicle: true,
            hasDriver: true,
            hasOrders: true,
            hardIssueCount: 0,
        })).toBe('partial');
    });
});
