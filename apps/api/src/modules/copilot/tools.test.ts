// ============================================================
// Co-pilot tool input validation tests
// Imports schemas only — avoids pulling DB connection (DATABASE_URL).
// ============================================================
import { describe, it, expect } from 'vitest';
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
});
