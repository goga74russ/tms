// ============================================================
// Round 3C — D13 — ETA service tests.
// haversineKm is pure; computeTripEta needs the DB stubbed.
// ============================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';

// ---- chainable query-builder stub ---------------------------------
type Stage = any[];
const stages: Stage[] = [];
let stageIdx = 0;

function makeChainableForCurrent() {
    const handler: ProxyHandler<any> = {
        get(_t, prop) {
            if (prop === 'then') {
                const captured = stages[stageIdx] ?? [];
                stageIdx += 1;
                return (resolve: (v: any) => void) => resolve(captured);
            }
            return (..._args: any[]) => proxy;
        },
    };
    const proxy: any = new Proxy(function () { /* noop */ }, handler);
    return proxy;
}

function selectStub() {
    return makeChainableForCurrent();
}

vi.mock('../../db/connection.js', () => ({
    db: {
        select: selectStub,
    },
    sql: () => 'SQL',
}));

import { computeTripEta, haversineKm } from './eta.service.js';

beforeEach(() => {
    stages.length = 0;
    stageIdx = 0;
});

// =================================================================
// haversineKm — pure
// =================================================================
describe('haversineKm', () => {
    it('returns 0 for identical points', () => {
        expect(haversineKm({ lat: 55.75, lon: 37.62 }, { lat: 55.75, lon: 37.62 })).toBeCloseTo(0, 5);
    });

    it('computes ~111 km for 1° latitude on the equator', () => {
        const km = haversineKm({ lat: 0, lon: 0 }, { lat: 1, lon: 0 });
        expect(km).toBeGreaterThan(110);
        expect(km).toBeLessThan(112);
    });

    it('Moscow → St. Petersburg ≈ 635 km (±20)', () => {
        const km = haversineKm({ lat: 55.7558, lon: 37.6173 }, { lat: 59.9343, lon: 30.3351 });
        expect(km).toBeGreaterThan(615);
        expect(km).toBeLessThan(655);
    });

    it('is symmetric: d(a,b) === d(b,a)', () => {
        const a = { lat: 10, lon: 20 };
        const b = { lat: -30, lon: 100 };
        expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 8);
    });
});

// =================================================================
// computeTripEta
// =================================================================
describe('computeTripEta', () => {
    it('returns null when the trip has no vehicleId', async () => {
        // stages: trip lookup
        stages.push([{ id: 't1', vehicleId: null }]);
        const out = await computeTripEta('t1');
        expect(out).toBeNull();
    });

    it('returns null when there is no recent vehicle position (no GPS)', async () => {
        stages.push([{ id: 't1', vehicleId: 'v1' }]);
        stages.push([]); // no positions
        const out = await computeTripEta('t1');
        expect(out).toBeNull();
    });

    it('returns null when there are no pending route points', async () => {
        stages.push([{ id: 't1', vehicleId: 'v1' }]);
        stages.push([{ latitude: 55.75, longitude: 37.62, recordedAt: new Date() }]);
        stages.push([]); // no pending points
        const out = await computeTripEta('t1');
        expect(out).toBeNull();
    });

    it('computes ETA with proper ISO and distance for valid GPS + pending point', async () => {
        stages.push([{ id: 't1', vehicleId: 'v1' }]);
        stages.push([{ latitude: 55.75, longitude: 37.62, recordedAt: new Date() }]);
        stages.push([{ id: 'rp1', lat: 55.76, lon: 37.63 }]);
        const out = await computeTripEta('t1');
        expect(out).not.toBeNull();
        expect(out?.source).toBe('mock');
        expect(out?.nextPointId).toBe('rp1');
        expect(out?.distanceKm).toBeGreaterThan(0);
        // ISO 8601 sanity check
        expect(out?.etaIso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('handles zero-distance edge: ETA is now-ish, distance is 0', async () => {
        stages.push([{ id: 't1', vehicleId: 'v1' }]);
        stages.push([{ latitude: 55.75, longitude: 37.62, recordedAt: new Date() }]);
        stages.push([{ id: 'rp1', lat: 55.75, lon: 37.62 }]);
        const before = Date.now();
        const out = await computeTripEta('t1');
        const after = Date.now();
        expect(out).not.toBeNull();
        expect(out?.distanceKm).toBe(0);
        const etaMs = new Date(out!.etaIso).getTime();
        // Zero distance ⇒ etaSeconds=0 ⇒ eta ~ now.
        expect(etaMs).toBeGreaterThanOrEqual(before - 5);
        expect(etaMs).toBeLessThanOrEqual(after + 5);
    });

    it('returns null when next pending point has null coordinates', async () => {
        stages.push([{ id: 't1', vehicleId: 'v1' }]);
        stages.push([{ latitude: 55.75, longitude: 37.62, recordedAt: new Date() }]);
        stages.push([{ id: 'rp1', lat: null, lon: null }]);
        const out = await computeTripEta('t1');
        expect(out).toBeNull();
    });

    it('uses 50 km/h flat speed model — 50 km is exactly 1 hour out', async () => {
        // Construct a target ~50 km away — 1° lat ≈ 111km, so 0.45° ≈ 50km.
        stages.push([{ id: 't1', vehicleId: 'v1' }]);
        stages.push([{ latitude: 0, longitude: 0, recordedAt: new Date() }]);
        stages.push([{ id: 'rp1', lat: 0.45, lon: 0 }]);
        const before = Date.now();
        const out = await computeTripEta('t1');
        expect(out).not.toBeNull();
        const etaMs = new Date(out!.etaIso).getTime();
        const elapsedMin = (etaMs - before) / 60_000;
        // ~60 minutes (within tolerance for 0.45° ≈ 50km)
        expect(elapsedMin).toBeGreaterThan(55);
        expect(elapsedMin).toBeLessThan(65);
    });
});
