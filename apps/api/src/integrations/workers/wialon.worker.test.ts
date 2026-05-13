// ============================================================
// Wialon sync worker — processor + pure helper tests.
// decideOdometerUpdate is pure (no DB). processWialonSync needs
// db/connection.js, events/journal.js, providers/index.js and
// wialon mock telemetry mocked at the test seam.
// ============================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';

// ---------- Capture object so tests can inspect side effects ----------
interface Capture {
    selectResults: any[][];
    updates: Array<{ id: string; set: any }>;
    inserts: Array<{ table: string; values: any }>;
    recordedEvents: any[];
    txCalled: number;
}

let capture: Capture;

function makeSelectChain() {
    const result = capture.selectResults.shift() ?? [];
    const chain: any = {
        from: () => chain,
        where: () => chain,
        orderBy: () => chain,
        limit: () => Promise.resolve(result),
        then: (resolve: any) => resolve(result),
    };
    return chain;
}

function makeUpdateChain(tableName: string) {
    let captured: { set?: any; id?: string } = {};
    const chain: any = {
        set: (args: any) => {
            captured.set = args;
            return chain;
        },
        where: () => {
            capture.updates.push({ id: tableName, set: captured.set });
            return chain;
        },
        returning: () => Promise.resolve([]),
        then: (resolve: any) => resolve(undefined),
    };
    return chain;
}

function makeInsertChain(table: string) {
    const chain: any = {
        values: (v: any) => {
            capture.inserts.push({ table, values: v });
            return {
                returning: () => Promise.resolve([{ id: 'inserted-id' }]),
                then: (resolve: any) => resolve(undefined),
            };
        },
    };
    return chain;
}

vi.mock('../../db/connection.js', () => ({
    db: {
        select: () => makeSelectChain(),
        update: () => makeUpdateChain('vehicles'),
        insert: () => makeInsertChain('vehicle_positions'),
        transaction: async (cb: any) => {
            capture.txCalled++;
            const tx = {
                update: () => makeUpdateChain('vehicles'),
            };
            await cb(tx);
        },
    },
    sql: () => 'SQL',
}));

vi.mock('../../events/journal.js', () => ({
    recordEvent: vi.fn(async (params: any) => {
        capture.recordedEvents.push(params);
    }),
}));

vi.mock('../../providers/index.js', () => ({
    selectAdapter: vi.fn(async () => ({ mode: 'mock', healthCheck: async () => ({ ok: true }) })),
    getDefaultRegistry: vi.fn(() => ({ telematics: {} })),
}));

// Deterministic telemetry control so we can drive odometer/track tests.
let telemetryOverrides: Record<string, { odometerKm: number; lat?: number; lon?: number; speed?: number }> = {};

vi.mock('../mocks/wialon.mock.js', () => ({
    getVehicleTelemetry: (plate: string, currentOdometer: number) => {
        const o = telemetryOverrides[plate];
        return {
            plateNumber: plate,
            timestamp: new Date().toISOString(),
            lat: o?.lat ?? 55.7,
            lon: o?.lon ?? 37.6,
            speed: o?.speed ?? 50,
            odometerKm: o?.odometerKm ?? currentOdometer + 10,
            fuelLevelLiters: 40,
            engineOn: true,
        };
    },
}));

vi.mock('../mocks/wialon-track-generator.js', () => ({
    simulateTrack: () => [{
        timestamp: new Date().toISOString(),
        latitude: 55.71,
        longitude: 37.61,
        speedKmh: 60,
        headingDeg: 90,
    }],
}));

// BullMQ Queue/Worker constructors connect to Redis on construction.
vi.mock('bullmq', () => ({
    Queue: class { add() {} async getJob() { return null; } async getRepeatableJobs() { return []; } async removeRepeatableByKey() {} },
    Worker: class { on() {} async close() {} },
}));

// websocket broadcastEvent and ETA service are dynamically imported.
vi.mock('../websocket.js', () => ({
    broadcastEvent: vi.fn(),
}));
vi.mock('../../modules/trips/eta.service.js', () => ({
    computeTripEta: vi.fn(async () => null),
}));

import { processWialonSync, decideOdometerUpdate } from './wialon.worker.js';

function fakeJob(data: any = {}) {
    return { id: 'test-job', data, log: vi.fn() } as any;
}

beforeEach(() => {
    capture = {
        selectResults: [],
        updates: [],
        inserts: [],
        recordedEvents: [],
        txCalled: 0,
    };
    telemetryOverrides = {};
});

// =================================================================
// decideOdometerUpdate — pure
// =================================================================
describe('decideOdometerUpdate (pure)', () => {
    it('returns an update record when telemetry odometer is higher', () => {
        const out = decideOdometerUpdate(
            { id: 'v1', plateNumber: 'A1', currentOdometerKm: 1000 },
            { odometerKm: 1050 },
        );
        expect(out).toEqual({ id: 'v1', plateNumber: 'A1', oldOdometer: 1000, odometerKm: 1050 });
    });

    it('returns null when telemetry odometer equals current (no movement)', () => {
        const out = decideOdometerUpdate(
            { id: 'v1', plateNumber: 'A1', currentOdometerKm: 1000 },
            { odometerKm: 1000 },
        );
        expect(out).toBeNull();
    });

    it('returns null when telemetry odometer DECREASED (sanity check)', () => {
        const out = decideOdometerUpdate(
            { id: 'v1', plateNumber: 'A1', currentOdometerKm: 1000 },
            { odometerKm: 950 },
        );
        expect(out).toBeNull();
    });
});

// =================================================================
// processWialonSync — integration with mocked DB
// =================================================================
describe('processWialonSync (processor)', () => {
    it('updates vehicles whose odometer increased and skips the rest', async () => {
        // Stage 1: vehicle list
        capture.selectResults.push([
            { id: 'v1', plateNumber: 'AAA', currentOdometerKm: 100, organizationId: 'org-1' },
            { id: 'v2', plateNumber: 'BBB', currentOdometerKm: 200, organizationId: 'org-1' },
        ]);
        // Stage 2+3: active-trip lookups for v1 + v2 (empty = no active trip)
        capture.selectResults.push([]); // v1 active trip lookup
        capture.selectResults.push([]); // v2 active trip lookup

        telemetryOverrides['AAA'] = { odometerKm: 150 }; // +50
        telemetryOverrides['BBB'] = { odometerKm: 200 }; // no change

        const result = await processWialonSync(fakeJob());

        expect(result.synced).toBe(1);
        expect(result.errors).toBe(0);
        expect(result.details).toEqual([
            { plateNumber: 'AAA', oldOdometer: 100, newOdometer: 150 },
        ]);
        expect(capture.txCalled).toBe(1);
    });

    it('records an integration.wialon_sync event when at least one vehicle synced', async () => {
        capture.selectResults.push([
            { id: 'v1', plateNumber: 'AAA', currentOdometerKm: 0, organizationId: 'org-1' },
        ]);
        capture.selectResults.push([]); // no active trip
        telemetryOverrides['AAA'] = { odometerKm: 5 };

        await processWialonSync(fakeJob({ manual: true }));

        expect(capture.recordedEvents).toHaveLength(1);
        expect(capture.recordedEvents[0]).toMatchObject({
            eventType: 'integration.wialon_sync',
            data: expect.objectContaining({ synced: 1, manual: true }),
        });
    });

    it('writes a track sample when an active trip with waypoints exists', async () => {
        capture.selectResults.push([
            { id: 'v1', plateNumber: 'AAA', currentOdometerKm: 100, organizationId: 'org-1' },
        ]);
        // Active trip lookup → returns trip
        capture.selectResults.push([{ id: 'trip-1' }]);
        // Route points lookup → 2 waypoints (>= 2 required for simulateTrack)
        capture.selectResults.push([
            { lat: 55.7, lon: 37.6 },
            { lat: 55.8, lon: 37.7 },
        ]);
        telemetryOverrides['AAA'] = { odometerKm: 150 };

        await processWialonSync(fakeJob());

        const positionInsert = capture.inserts.find((i) => i.table === 'vehicle_positions');
        expect(positionInsert).toBeDefined();
        expect(positionInsert!.values).toMatchObject({
            vehicleId: 'v1',
            latitude: 55.71,
            longitude: 37.61,
            source: 'mock',
        });
    });

    it('does NOT write a track sample when there is no active trip', async () => {
        capture.selectResults.push([
            { id: 'v1', plateNumber: 'AAA', currentOdometerKm: 100, organizationId: 'org-1' },
        ]);
        capture.selectResults.push([]); // no active trip
        telemetryOverrides['AAA'] = { odometerKm: 150 };

        await processWialonSync(fakeJob());

        const positionInsert = capture.inserts.find((i) => i.table === 'vehicle_positions');
        expect(positionInsert).toBeUndefined();
    });

    it('handles an empty vehicle fleet without errors', async () => {
        capture.selectResults.push([]); // no vehicles

        const result = await processWialonSync(fakeJob());
        expect(result).toEqual({ synced: 0, errors: 0, details: [] });
        expect(capture.recordedEvents).toHaveLength(0); // no event when synced=0
        expect(capture.txCalled).toBe(0);
    });
});
