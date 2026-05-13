// ============================================================
// WebSocket filter helpers — pure tests for org scoping.
// Lock the rules that govern who sees which broadcast.
// ============================================================
import { describe, it, expect } from 'vitest';

import {
    shouldDeliverPosition,
    filterPositionsForSubscription,
    shouldDeliverEvent,
} from './websocket-filters.js';

describe('shouldDeliverPosition', () => {
    it('delivers everything to subscribers without an organizationId (admin)', () => {
        expect(shouldDeliverPosition({ organizationId: 'org-a' }, {})).toBe(true);
        expect(shouldDeliverPosition({ organizationId: null }, {})).toBe(true);
        expect(shouldDeliverPosition({ organizationId: 'org-x' }, { organizationId: null })).toBe(true);
    });

    it('only delivers same-org positions to a scoped subscriber', () => {
        expect(shouldDeliverPosition({ organizationId: 'org-a' }, { organizationId: 'org-a' })).toBe(true);
        expect(shouldDeliverPosition({ organizationId: 'org-b' }, { organizationId: 'org-a' })).toBe(false);
    });

    it('hides org-less (system) positions from scoped subscribers', () => {
        expect(shouldDeliverPosition({ organizationId: null }, { organizationId: 'org-a' })).toBe(false);
        expect(shouldDeliverPosition({}, { organizationId: 'org-a' })).toBe(false);
    });
});

describe('filterPositionsForSubscription', () => {
    const sample = [
        { id: 'v1', plate: 'A1', organizationId: 'org-a' },
        { id: 'v2', plate: 'B2', organizationId: 'org-b' },
        { id: 'v3', plate: 'C3', organizationId: 'org-a' },
        { id: 'v4', plate: 'D4', organizationId: null },
    ];

    it('returns all positions (sans organizationId) for an unscoped subscriber', () => {
        const out = filterPositionsForSubscription(sample, {});
        expect(out).toHaveLength(4);
        for (const row of out) {
            expect(row).not.toHaveProperty('organizationId');
        }
    });

    it('returns only matching-org positions for a scoped subscriber', () => {
        const out = filterPositionsForSubscription(sample, { organizationId: 'org-a' });
        expect(out).toHaveLength(2);
        expect(out.map((p: any) => p.plate)).toEqual(['A1', 'C3']);
    });

    it('strips organizationId from wire payload', () => {
        const out = filterPositionsForSubscription(sample, { organizationId: 'org-b' });
        expect(out).toEqual([{ id: 'v2', plate: 'B2' }]);
    });
});

describe('shouldDeliverEvent', () => {
    it('delivers system-wide events (no payload org) to everyone', () => {
        expect(shouldDeliverEvent(null, 'org-a')).toBe(true);
        expect(shouldDeliverEvent(undefined, null)).toBe(true);
        expect(shouldDeliverEvent(null, undefined)).toBe(true);
    });

    it('delivers any scoped payload to unscoped (admin) subscribers', () => {
        expect(shouldDeliverEvent('org-a', null)).toBe(true);
        expect(shouldDeliverEvent('org-b', undefined)).toBe(true);
    });

    it('requires exact match when both sides are scoped', () => {
        expect(shouldDeliverEvent('org-a', 'org-a')).toBe(true);
        expect(shouldDeliverEvent('org-a', 'org-b')).toBe(false);
    });
});
