// ============================================================
// Orders — pure helpers extracted to validators.ts.
// ============================================================
import { describe, it, expect } from 'vitest';
import { OrderStatus } from '@tms/shared';

import {
    canTransitionOrder,
    nextOrderStatuses,
    validateCargoBounds,
    validateTemperatureRange,
    parseAddress,
    isValidConfirmationMode,
    canArchiveOrder,
} from './validators.js';

describe('canTransitionOrder', () => {
    it('allows draft → confirmed', () => {
        expect(canTransitionOrder(OrderStatus.DRAFT, OrderStatus.CONFIRMED)).toBe(true);
    });

    it('forbids draft → delivered (must go through trip)', () => {
        expect(canTransitionOrder(OrderStatus.DRAFT, OrderStatus.DELIVERED)).toBe(false);
    });

    it('forbids backwards transitions (delivered → draft)', () => {
        expect(canTransitionOrder(OrderStatus.DELIVERED, OrderStatus.DRAFT)).toBe(false);
    });

    it('terminal statuses have no next', () => {
        expect(nextOrderStatuses(OrderStatus.DELIVERED)).toEqual([]);
        expect(nextOrderStatuses(OrderStatus.RETURNED)).toEqual([]);
        expect(nextOrderStatuses(OrderStatus.CANCELLED)).toEqual([]);
    });

    it('in_transit → returned is allowed', () => {
        expect(canTransitionOrder(OrderStatus.IN_TRANSIT, OrderStatus.RETURNED)).toBe(true);
    });
});

describe('validateCargoBounds', () => {
    it('rejects zero or negative weight', () => {
        expect(validateCargoBounds({ cargoWeightKg: 0 }).ok).toBe(false);
        expect(validateCargoBounds({ cargoWeightKg: -5 }).ok).toBe(false);
    });

    it('rejects weight above single-vehicle limit', () => {
        const r = validateCargoBounds({ cargoWeightKg: 30_000 });
        expect(r.ok).toBe(false);
        expect(r.reasons.join(' ')).toContain('25 000');
    });

    it('rejects volume above megaliner upper bound', () => {
        const r = validateCargoBounds({ cargoWeightKg: 1000, cargoVolumeM3: 150 });
        expect(r.ok).toBe(false);
    });

    it('passes a normal cargo profile', () => {
        const r = validateCargoBounds({ cargoWeightKg: 5000, cargoVolumeM3: 30, cargoPlaces: 10 });
        expect(r.ok).toBe(true);
        expect(r.reasons).toEqual([]);
    });
});

describe('validateTemperatureRange', () => {
    it('skips validation when coldChain is not required', () => {
        expect(validateTemperatureRange({ coldChainRequired: false }).ok).toBe(true);
        expect(validateTemperatureRange({}).ok).toBe(true);
    });

    it('rejects missing bounds when coldChain required', () => {
        const r = validateTemperatureRange({ coldChainRequired: true });
        expect(r.ok).toBe(false);
        expect(r.reason).toBe('missing_range');
    });

    it('rejects inverted range (min > max)', () => {
        const r = validateTemperatureRange({
            coldChainRequired: true,
            temperatureMinC: 5,
            temperatureMaxC: -5,
        });
        expect(r.ok).toBe(false);
        expect(r.reason).toBe('inverted_range');
    });

    it('rejects out-of-bounds range', () => {
        const r = validateTemperatureRange({
            coldChainRequired: true,
            temperatureMinC: -40,
            temperatureMaxC: 0,
        });
        expect(r.ok).toBe(false);
        expect(r.reason).toBe('out_of_bounds');
    });

    it('accepts a frozen-goods range', () => {
        const r = validateTemperatureRange({
            coldChainRequired: true,
            temperatureMinC: -20,
            temperatureMaxC: -18,
        });
        expect(r.ok).toBe(true);
    });
});

describe('parseAddress', () => {
    it('returns empty result for null/empty input', () => {
        expect(parseAddress(null).raw).toBe('');
        expect(parseAddress('').isStructured).toBe(false);
    });

    it('extracts city from "г. <name>," prefix', () => {
        const out = parseAddress('г. Москва, ул. Тверская, 1');
        expect(out.city).toBe('Москва');
        expect(out.isStructured).toBe(true);
    });

    it('falls back to first comma segment as city', () => {
        const out = parseAddress('Новосибирск, проспект Ленина, 5');
        expect(out.city).toBe('Новосибирск');
    });

    it('marks single-segment input as unstructured', () => {
        const out = parseAddress('Just one line');
        expect(out.isStructured).toBe(false);
        expect(out.city).toBeUndefined();
    });
});

describe('isValidConfirmationMode', () => {
    it('accepts the three known modes', () => {
        expect(isValidConfirmationMode('none')).toBe(true);
        expect(isValidConfirmationMode('optional')).toBe(true);
        expect(isValidConfirmationMode('required')).toBe(true);
    });

    it('rejects anything else', () => {
        expect(isValidConfirmationMode('REQUIRED')).toBe(false);
        expect(isValidConfirmationMode('')).toBe(false);
        expect(isValidConfirmationMode(null)).toBe(false);
        expect(isValidConfirmationMode(undefined)).toBe(false);
    });
});

describe('canArchiveOrder', () => {
    it('allows draft', () => {
        expect(canArchiveOrder({ status: 'draft' }).ok).toBe(true);
    });

    it('allows cancelled', () => {
        expect(canArchiveOrder({ status: 'cancelled' }).ok).toBe(true);
    });

    it('blocks orders linked to a trip', () => {
        const r = canArchiveOrder({ status: 'draft', tripId: 'trip-1' });
        expect(r.ok).toBe(false);
        expect(r.reason).toContain('linked to a trip');
    });

    it('blocks in-transit orders even without tripId', () => {
        const r = canArchiveOrder({ status: 'in_transit' });
        expect(r.ok).toBe(false);
    });
});
