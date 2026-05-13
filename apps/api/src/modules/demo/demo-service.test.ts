// ============================================================
// Demo data — pure helper tests. Generator + cleanup (DB-bound)
// are out of scope here; integration tests cover those.
// ============================================================
import { describe, it, expect } from 'vitest';
import {
    isDemoFlagged,
    isDemoSeedAllowed,
    isDemoPlateShape,
    EXPECTED_DEMO_SCENARIO,
    DEMO_PREFIX,
} from './helpers.js';

describe('isDemoFlagged', () => {
    it('flags contractor / driver / vehicle rows by [ДЕМО] prefix', () => {
        expect(isDemoFlagged('contractor', `${DEMO_PREFIX} ООО Тест`)).toBe(true);
        expect(isDemoFlagged('driver', `${DEMO_PREFIX} Иванов`)).toBe(true);
        expect(isDemoFlagged('vehicle', `${DEMO_PREFIX} ГАЗ`)).toBe(true);
    });

    it('flags trailer rows by ДМО prefix (plate format)', () => {
        expect(isDemoFlagged('trailer', 'ДМО123477')).toBe(true);
        expect(isDemoFlagged('trailer', 'А12377')).toBe(false);
    });

    it('flags order rows by DEMO- number prefix', () => {
        expect(isDemoFlagged('order', 'DEMO-123456-1')).toBe(true);
        expect(isDemoFlagged('order', 'ORD-2026-001')).toBe(false);
    });

    it('flags trip rows by DEMO-T- number prefix', () => {
        expect(isDemoFlagged('trip', 'DEMO-T-123456-2')).toBe(true);
        expect(isDemoFlagged('trip', 'DEMO-123456')).toBe(false); // not trip prefix
    });

    it('returns false for null / non-string input', () => {
        expect(isDemoFlagged('order', null)).toBe(false);
        expect(isDemoFlagged('order', undefined)).toBe(false);
    });
});

describe('isDemoSeedAllowed (A-P2 production safety gate)', () => {
    it('allows when ALLOW_DEMO_SEED=true regardless of NODE_ENV', () => {
        expect(isDemoSeedAllowed({ ALLOW_DEMO_SEED: 'true', NODE_ENV: 'production' }))
            .toBe(true);
    });

    it('allows in non-production when ALLOW_DEMO_SEED unset', () => {
        expect(isDemoSeedAllowed({ NODE_ENV: 'development' })).toBe(true);
        expect(isDemoSeedAllowed({ NODE_ENV: 'test' })).toBe(true);
        expect(isDemoSeedAllowed({})).toBe(true);
    });

    it('blocks production without explicit opt-in', () => {
        expect(isDemoSeedAllowed({ NODE_ENV: 'production' })).toBe(false);
        expect(isDemoSeedAllowed({ NODE_ENV: 'production', ALLOW_DEMO_SEED: 'false' }))
            .toBe(false);
    });
});

describe('isDemoPlateShape', () => {
    it('accepts a well-formed demo plate', () => {
        // Allowed letters: АВЕКМНОРСТУХ
        expect(isDemoPlateShape('А123ВС77')).toBe(true);
        expect(isDemoPlateShape('М999УР77')).toBe(true);
    });

    it('rejects malformed plates', () => {
        expect(isDemoPlateShape('')).toBe(false);
        expect(isDemoPlateShape(null)).toBe(false);
        expect(isDemoPlateShape('А12ВС77')).toBe(false); // 2 digits only
        expect(isDemoPlateShape('Я123ВС77')).toBe(false); // disallowed letter
        expect(isDemoPlateShape('А123ВС99')).toBe(false); // wrong region
    });
});

describe('EXPECTED_DEMO_SCENARIO (documents what generateDemoData creates)', () => {
    it('expects 1 contractor with 1 contract + tariff', () => {
        expect(EXPECTED_DEMO_SCENARIO.contractors).toBe(1);
        expect(EXPECTED_DEMO_SCENARIO.contracts).toBe(1);
        expect(EXPECTED_DEMO_SCENARIO.tariffs).toBe(1);
    });

    it('expects 2 vehicles (tent + reefer) + 1 trailer + 2 drivers', () => {
        expect(EXPECTED_DEMO_SCENARIO.vehicles).toBe(2);
        expect(EXPECTED_DEMO_SCENARIO.trailers).toBe(1);
        expect(EXPECTED_DEMO_SCENARIO.drivers).toBe(2);
    });

    it('expects 2 trips (completed + in_transit) and 3 orders (incl. cold-chain draft)', () => {
        expect(EXPECTED_DEMO_SCENARIO.trips).toBe(2);
        expect(EXPECTED_DEMO_SCENARIO.orders).toBe(3);
    });
});
