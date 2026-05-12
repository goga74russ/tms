// ============================================================
// Incidents — validator + cold-chain severity classifier.
// The incidents module itself is a thin DB+RBAC layer in
// sprint9/routes.ts. What's actually testable in isolation:
//   • incidentCreateSchema — request body shape + enum guards
//   • severityForBreach    — temperature → incident severity
//     (lives in cold-chain/service.ts, drives the auto-incident
//     row inserted by recordReading() when SLA is breached)
// Pure functions both — no DB, no Fastify.
// ============================================================
import { describe, it, expect, vi } from 'vitest';

vi.hoisted(() => {
    process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';
});

// cold-chain/service.ts imports db/connection.ts at module load.
vi.mock('../../db/connection.js', () => ({
    db: {
        select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) }),
        transaction: async (fn: any) => fn({}),
    },
    sql: () => 'SQL',
}));

import { incidentCreateSchema } from './incidents.validators.js';
import { severityForBreach } from '../cold-chain/service.js';

describe('incidentCreateSchema — POST /incidents body', () => {
    const validBody = {
        type: 'cargo',
        description: 'damaged crate',
    };

    it('accepts a minimal body and applies severity/status/blocksRelease defaults', () => {
        const r = incidentCreateSchema.safeParse(validBody);
        expect(r.success).toBe(true);
        if (r.success) {
            expect(r.data.severity).toBe('low');
            expect(r.data.status).toBe('open');
            expect(r.data.blocksRelease).toBe(false);
        }
    });

    it('rejects empty description (min length 1)', () => {
        expect(incidentCreateSchema.safeParse({ ...validBody, description: '' }).success).toBe(false);
    });

    it('rejects unknown type / severity / status values', () => {
        expect(incidentCreateSchema.safeParse({ ...validBody, type: 'fire' }).success).toBe(false);
        expect(incidentCreateSchema.safeParse({ ...validBody, severity: 'urgent' }).success).toBe(false);
        expect(incidentCreateSchema.safeParse({ ...validBody, status: 'new' }).success).toBe(false);
    });

    it('rejects non-UUID vehicleId / driverId / tripId', () => {
        expect(incidentCreateSchema.safeParse({
            ...validBody,
            vehicleId: 'not-a-uuid',
        }).success).toBe(false);
    });

    it('accepts an ISO datetime for resolvedAt and rejects loose date strings', () => {
        expect(incidentCreateSchema.safeParse({
            ...validBody,
            resolvedAt: '2026-05-13T00:00:00.000Z',
        }).success).toBe(true);

        expect(incidentCreateSchema.safeParse({
            ...validBody,
            resolvedAt: '2026-05-13',
        }).success).toBe(false);
    });
});

describe('severityForBreach — cold-chain auto-incident severity', () => {
    // The rule: delta = how far the reading exceeds the violated bound.
    // delta > 5°C  → 'critical', otherwise 'medium'.
    it('returns "medium" for a small over-max breach (≤ 5°C)', () => {
        expect(severityForBreach(10, { minC: 2, maxC: 8 })).toBe('medium');
        // Boundary: delta exactly 5 stays medium.
        expect(severityForBreach(13, { minC: 2, maxC: 8 })).toBe('medium');
    });

    it('returns "critical" once the over-max delta exceeds 5°C', () => {
        expect(severityForBreach(14, { minC: 2, maxC: 8 })).toBe('critical');
        expect(severityForBreach(50, { minC: 2, maxC: 8 })).toBe('critical');
    });

    it('handles below-min breaches symmetrically', () => {
        expect(severityForBreach(-1, { minC: 2, maxC: 8 })).toBe('medium'); // delta 3
        expect(severityForBreach(-10, { minC: 2, maxC: 8 })).toBe('critical'); // delta 12
    });

    it('treats one-sided SLA bounds correctly', () => {
        // Only an upper bound — under-bound is irrelevant.
        expect(severityForBreach(20, { minC: null, maxC: 8 })).toBe('critical');
        // Only a lower bound — over-bound is irrelevant.
        expect(severityForBreach(-20, { minC: 0, maxC: null })).toBe('critical');
    });
});
