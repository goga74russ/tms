// ============================================================
// Trips — pure helpers extracted to state.ts.
// Cover the state machine + aggregations + eligibility checks
// without booting Drizzle / DB.
// ============================================================
import { describe, it, expect } from 'vitest';
import { TripStatus, VehicleStatus } from '@tms/shared';

import {
    canTransitionTrip,
    nextTripStatuses,
    isTerminalTripStatus,
    aggregateCargo,
    effectiveTripDistanceKm,
    checkVehicleEligibility,
    checkDriverEligibility,
    checkHosCompliance,
} from './state.js';

describe('canTransitionTrip', () => {
    it('allows planning → assigned', () => {
        expect(canTransitionTrip(TripStatus.PLANNING, TripStatus.ASSIGNED)).toBe(true);
    });

    it('allows planning → cancelled', () => {
        expect(canTransitionTrip(TripStatus.PLANNING, TripStatus.CANCELLED)).toBe(true);
    });

    it('forbids planning → in_transit (must go through assignment + waybill)', () => {
        expect(canTransitionTrip(TripStatus.PLANNING, TripStatus.IN_TRANSIT)).toBe(false);
    });

    it('forbids backwards transitions from in_transit → loading', () => {
        expect(canTransitionTrip(TripStatus.IN_TRANSIT, TripStatus.LOADING)).toBe(false);
    });

    it('only allows completed → billed (terminal-ish)', () => {
        expect(canTransitionTrip(TripStatus.COMPLETED, TripStatus.BILLED)).toBe(true);
        expect(canTransitionTrip(TripStatus.COMPLETED, TripStatus.CANCELLED)).toBe(false);
    });

    it('treats unknown statuses as transition-less', () => {
        expect(canTransitionTrip('weird', TripStatus.PLANNING)).toBe(false);
    });
});

describe('nextTripStatuses / isTerminalTripStatus', () => {
    it('returns empty list for billed and cancelled', () => {
        expect(nextTripStatuses(TripStatus.BILLED)).toEqual([]);
        expect(nextTripStatuses(TripStatus.CANCELLED)).toEqual([]);
        expect(isTerminalTripStatus(TripStatus.BILLED)).toBe(true);
        expect(isTerminalTripStatus(TripStatus.CANCELLED)).toBe(true);
    });

    it('returns multiple options for mid-flow statuses', () => {
        const next = nextTripStatuses(TripStatus.ASSIGNED);
        expect(next).toContain(TripStatus.WAYBILL_DRAFT);
        expect(next).toContain(TripStatus.CANCELLED);
    });
});

describe('aggregateCargo', () => {
    it('returns zeros for empty list', () => {
        const out = aggregateCargo([]);
        expect(out.totalWeightKg).toBe(0);
        expect(out.totalVolumeM3).toBe(0);
        expect(out.totalPlaces).toBe(0);
        expect(out.hasAdr).toBe(false);
        expect(out.hasColdChain).toBe(false);
        expect(out.requiredTempMinC).toBeNull();
        expect(out.requiredTempMaxC).toBeNull();
    });

    it('sums weight / volume / places across orders', () => {
        const out = aggregateCargo([
            { cargoWeightKg: 1000, cargoVolumeM3: 5, cargoPlaces: 10 },
            { cargoWeightKg: 500, cargoVolumeM3: 2, cargoPlaces: 4 },
            { cargoWeightKg: null, cargoVolumeM3: undefined, cargoPlaces: 0 },
        ]);
        expect(out.totalWeightKg).toBe(1500);
        expect(out.totalVolumeM3).toBe(7);
        expect(out.totalPlaces).toBe(14);
    });

    it('flags ADR when any order has an adrClass', () => {
        const out = aggregateCargo([
            { cargoWeightKg: 100 },
            { cargoWeightKg: 100, adrClass: '3' },
        ]);
        expect(out.hasAdr).toBe(true);
    });

    it('tightens cold-chain temperature range across orders (max of mins, min of maxes)', () => {
        const out = aggregateCargo([
            { coldChainRequired: true, temperatureMinC: -20, temperatureMaxC: -10 },
            { coldChainRequired: true, temperatureMinC: -15, temperatureMaxC: -8 },
        ]);
        expect(out.hasColdChain).toBe(true);
        // Tightest min = highest min → -15 (cooler floor)
        expect(out.requiredTempMinC).toBe(-15);
        // Tightest max = lowest max → -10
        expect(out.requiredTempMaxC).toBe(-10);
    });
});

describe('effectiveTripDistanceKm', () => {
    it('prefers actual distance when set', () => {
        expect(effectiveTripDistanceKm({ actualDistanceKm: 420, plannedDistanceKm: 400 })).toBe(420);
    });

    it('falls back to planned when actual missing', () => {
        expect(effectiveTripDistanceKm({ plannedDistanceKm: 400 })).toBe(400);
    });

    it('returns 0 when both missing or zero', () => {
        expect(effectiveTripDistanceKm({})).toBe(0);
        expect(effectiveTripDistanceKm({ actualDistanceKm: 0, plannedDistanceKm: 0 })).toBe(0);
    });
});

describe('checkVehicleEligibility', () => {
    const baseCargo = aggregateCargo([{ cargoWeightKg: 5000 }]);

    it('passes for an available vehicle with capacity', () => {
        const issues = checkVehicleEligibility(
            { status: VehicleStatus.AVAILABLE, payloadCapacityKg: 10000, bodyType: 'тент' },
            baseCargo,
        );
        expect(issues).toEqual([]);
    });

    it('hard-blocks an overweight assignment', () => {
        const issues = checkVehicleEligibility(
            { status: VehicleStatus.AVAILABLE, payloadCapacityKg: 1000 },
            baseCargo,
        );
        expect(issues).toHaveLength(1);
        expect(issues[0].code).toBe('OVERWEIGHT');
        expect(issues[0].type).toBe('hard');
    });

    it('hard-blocks when vehicle status is not available', () => {
        const issues = checkVehicleEligibility(
            { status: 'maintenance', payloadCapacityKg: 10000 },
            baseCargo,
        );
        expect(issues.some((i) => i.code === 'VEHICLE_NOT_AVAILABLE' && i.type === 'hard')).toBe(true);
    });

    it('hard-blocks ADR cargo on a non-ADR vehicle', () => {
        const adrCargo = aggregateCargo([{ cargoWeightKg: 100, adrClass: '3' }]);
        const issues = checkVehicleEligibility(
            { status: VehicleStatus.AVAILABLE, payloadCapacityKg: 10000, adrClasses: [] },
            adrCargo,
        );
        expect(issues.some((i) => i.code === 'ADR_VEHICLE_REQUIRED' && i.type === 'hard')).toBe(true);
    });

    it('hard-blocks when required ADR class is not in allowed list', () => {
        const issues = checkVehicleEligibility(
            { status: VehicleStatus.AVAILABLE, payloadCapacityKg: 10000, adrClasses: ['3'] },
            baseCargo,
            { requiredAdrClass: '6.1' },
        );
        expect(issues.some((i) => i.code === 'ADR_CLASS_NOT_PERMITTED')).toBe(true);
    });

    it('soft-warns on body-type mismatch but does not hard-block', () => {
        const issues = checkVehicleEligibility(
            { status: VehicleStatus.AVAILABLE, payloadCapacityKg: 10000, bodyType: 'тент' },
            baseCargo,
            { requiredBodyType: 'рефрижератор' },
        );
        const mismatch = issues.find((i) => i.code === 'BODY_TYPE_MISMATCH');
        expect(mismatch?.type).toBe('soft');
    });
});

describe('checkDriverEligibility', () => {
    const now = new Date('2026-05-13T12:00:00Z');
    const future = new Date('2027-01-01T00:00:00Z');
    const past = new Date('2025-01-01T00:00:00Z');

    it('passes for an active driver with valid documents', () => {
        const out = checkDriverEligibility(
            { isActive: true, licenseExpiry: future, medCertificateExpiry: future },
            { now },
        );
        expect(out).toEqual([]);
    });

    it('hard-blocks an inactive driver', () => {
        const out = checkDriverEligibility(
            { isActive: false, licenseExpiry: future, medCertificateExpiry: future },
            { now },
        );
        expect(out.some((i) => i.code === 'DRIVER_INACTIVE')).toBe(true);
    });

    it('hard-blocks expired license', () => {
        const out = checkDriverEligibility(
            { isActive: true, licenseExpiry: past, medCertificateExpiry: future },
            { now },
        );
        expect(out.some((i) => i.code === 'LICENSE_EXPIRED')).toBe(true);
    });

    it('hard-blocks expired medical certificate', () => {
        const out = checkDriverEligibility(
            { isActive: true, licenseExpiry: future, medCertificateExpiry: past },
            { now },
        );
        expect(out.some((i) => i.code === 'MED_CERTIFICATE_EXPIRED')).toBe(true);
    });

    it('hard-blocks when required license category missing', () => {
        const out = checkDriverEligibility(
            { isActive: true, licenseExpiry: future, licenseCategories: ['B'] },
            { now, requiredLicenseCategory: 'E' },
        );
        expect(out.some((i) => i.code === 'LICENSE_CATEGORY_MISSING')).toBe(true);
    });

    it('accepts ISO-string expiry dates', () => {
        const out = checkDriverEligibility(
            { isActive: true, licenseExpiry: '2025-01-01T00:00:00Z' },
            { now },
        );
        expect(out.some((i) => i.code === 'LICENSE_EXPIRED')).toBe(true);
    });
});

describe('checkHosCompliance', () => {
    it('returns empty for null record', () => {
        expect(checkHosCompliance(null)).toEqual([]);
        expect(checkHosCompliance(undefined)).toEqual([]);
    });

    it('flags continuous driving > 4.5h as soft', () => {
        const out = checkHosCompliance({ continuousDrivingMinutes: 280 });
        expect(out).toHaveLength(1);
        expect(out[0].code).toBe('RTO_CONTINUOUS_DRIVING_EXCEEDED');
        expect(out[0].type).toBe('soft');
    });

    it('flags daily driving > 10h', () => {
        const out = checkHosCompliance({ drivingMinutes: 650 });
        expect(out.some((i) => i.code === 'RTO_DAILY_DRIVING_EXCEEDED')).toBe(true);
    });

    it('flags weekly rest < 44h', () => {
        const out = checkHosCompliance({ weeklyRestMinutes: 2000 });
        expect(out.some((i) => i.code === 'RTO_WEEKLY_REST_INSUFFICIENT')).toBe(true);
    });

    it('passes a fully-compliant record', () => {
        const out = checkHosCompliance({
            continuousDrivingMinutes: 200,
            drivingMinutes: 500,
            weeklyRestMinutes: 3000,
        });
        expect(out).toEqual([]);
    });
});
