// ============================================================
// Co-pilot tool input validation tests
// Imports schemas only — avoids pulling DB connection (DATABASE_URL).
// ============================================================
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { TOOL_NAMES, TOOL_SCHEMAS } from './tools/schemas.js';

describe('copilot tool registry', () => {
    it('exposes all 10 documented tools', () => {
        const expected = [
            'list_active_trips',
            'get_trip_details',
            'get_driver_hos_status',
            'list_trips_at_risk',
            'get_temperature_breaches',
            'compute_trip_cost',
            'propose_reassignment',
            'list_pending_invoices',
            'get_monthly_margin',
            'track_contractor_orders',
        ];
        expect([...TOOL_NAMES].sort()).toEqual([...expected].sort());
        expect(TOOL_NAMES.length).toBe(10);
    });
});

describe('copilot tool input validation', () => {
    it('rejects non-uuid tripId for get_trip_details', () => {
        const result = TOOL_SCHEMAS.get_trip_details.safeParse({ tripId: 'not-a-uuid' });
        expect(result.success).toBe(false);
    });

    it('accepts a valid uuid tripId for get_trip_details', () => {
        const result = TOOL_SCHEMAS.get_trip_details.safeParse({ tripId: '00000000-0000-0000-0000-000000000001' });
        expect(result.success).toBe(true);
    });

    it('caps list_active_trips limit between 1 and 50', () => {
        expect(TOOL_SCHEMAS.list_active_trips.safeParse({ limit: 0 }).success).toBe(false);
        expect(TOOL_SCHEMAS.list_active_trips.safeParse({ limit: 51 }).success).toBe(false);
        expect(TOOL_SCHEMAS.list_active_trips.safeParse({ limit: 10 }).success).toBe(true);
        expect(TOOL_SCHEMAS.list_active_trips.safeParse({}).success).toBe(true);
    });

    it('clamps get_monthly_margin offset to [-12, 0]', () => {
        expect(TOOL_SCHEMAS.get_monthly_margin.safeParse({ monthOffset: 1 }).success).toBe(false);
        expect(TOOL_SCHEMAS.get_monthly_margin.safeParse({ monthOffset: -13 }).success).toBe(false);
        expect(TOOL_SCHEMAS.get_monthly_margin.safeParse({ monthOffset: -1 }).success).toBe(true);
        expect(TOOL_SCHEMAS.get_monthly_margin.safeParse({}).success).toBe(true);
    });

    it('makes tripId optional for get_temperature_breaches', () => {
        expect(TOOL_SCHEMAS.get_temperature_breaches.safeParse({}).success).toBe(true);
        expect(TOOL_SCHEMAS.get_temperature_breaches.safeParse({ tripId: 'bad' }).success).toBe(false);
    });

    it('requires uuid driverId for propose_reassignment', () => {
        expect(TOOL_SCHEMAS.propose_reassignment.safeParse({}).success).toBe(false);
        expect(TOOL_SCHEMAS.propose_reassignment.safeParse({ driverId: 'x' }).success).toBe(false);
        expect(TOOL_SCHEMAS.propose_reassignment.safeParse({ driverId: '00000000-0000-0000-0000-000000000001' }).success).toBe(true);
    });

    it('requires uuid contractorId for track_contractor_orders', () => {
        expect(TOOL_SCHEMAS.track_contractor_orders.safeParse({}).success).toBe(false);
        expect(TOOL_SCHEMAS.track_contractor_orders.safeParse({
            contractorId: '11111111-1111-1111-1111-111111111111',
        }).success).toBe(true);
    });

    it('requires uuid tripId for compute_trip_cost', () => {
        expect(TOOL_SCHEMAS.compute_trip_cost.safeParse({ tripId: 'nope' }).success).toBe(false);
        expect(TOOL_SCHEMAS.compute_trip_cost.safeParse({
            tripId: '22222222-2222-2222-2222-222222222222',
        }).success).toBe(true);
    });

    it('caps list_pending_invoices limit between 1 and 50', () => {
        expect(TOOL_SCHEMAS.list_pending_invoices.safeParse({ limit: 0 }).success).toBe(false);
        expect(TOOL_SCHEMAS.list_pending_invoices.safeParse({ limit: 51 }).success).toBe(false);
        expect(TOOL_SCHEMAS.list_pending_invoices.safeParse({ limit: 25 }).success).toBe(true);
    });

    it('caps list_trips_at_risk limit between 1 and 30', () => {
        expect(TOOL_SCHEMAS.list_trips_at_risk.safeParse({ limit: 0 }).success).toBe(false);
        expect(TOOL_SCHEMAS.list_trips_at_risk.safeParse({ limit: 31 }).success).toBe(false);
        expect(TOOL_SCHEMAS.list_trips_at_risk.safeParse({ limit: 5 }).success).toBe(true);
    });

    it('requires uuid driverId for get_driver_hos_status', () => {
        expect(TOOL_SCHEMAS.get_driver_hos_status.safeParse({}).success).toBe(false);
        expect(TOOL_SCHEMAS.get_driver_hos_status.safeParse({ driverId: 'short' }).success).toBe(false);
        expect(TOOL_SCHEMAS.get_driver_hos_status.safeParse({
            driverId: '00000000-0000-0000-0000-000000000abc',
        }).success).toBe(true);
    });

    it('rejects float limits — must be integer', () => {
        expect(TOOL_SCHEMAS.list_active_trips.safeParse({ limit: 1.5 }).success).toBe(false);
        expect(TOOL_SCHEMAS.list_pending_invoices.safeParse({ limit: 2.7 }).success).toBe(false);
    });

    it('rejects float monthOffset for get_monthly_margin', () => {
        expect(TOOL_SCHEMAS.get_monthly_margin.safeParse({ monthOffset: -0.5 }).success).toBe(false);
    });
});

describe('copilot tool schema registry shape', () => {
    it('every registered tool name maps to a ZodObject schema', () => {
        for (const name of TOOL_NAMES) {
            const schema = TOOL_SCHEMAS[name];
            expect(schema).toBeDefined();
            expect(schema).toBeInstanceOf(z.ZodObject);
        }
    });

    it('TOOL_NAMES has no duplicate entries', () => {
        expect(new Set(TOOL_NAMES).size).toBe(TOOL_NAMES.length);
    });

    it('every tool name uses snake_case lowercase identifiers', () => {
        for (const name of TOOL_NAMES) {
            expect(name).toMatch(/^[a-z][a-z0-9_]*$/);
        }
    });

    it('rejects extra/unknown keys silently (stripped by zod default)', () => {
        // Sanity: passing an extra `foo` does NOT fail, but also does not appear
        // on the parsed output — confirms we're not accidentally on .strict().
        const r = TOOL_SCHEMAS.list_active_trips.safeParse({ limit: 5, foo: 'x' });
        expect(r.success).toBe(true);
        if (r.success) expect((r.data as Record<string, unknown>).foo).toBeUndefined();
    });
});
