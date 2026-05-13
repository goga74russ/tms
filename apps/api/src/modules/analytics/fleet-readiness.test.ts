// ============================================================
// Reports / analytics — fleet readiness aggregator.
// buildFleetReadinessSnapshot is the pure heart of the dashboard
// summary (count by severity + grouped issue list). Tests cover the
// three classification bands plus the issue-rollup math.
// ============================================================
import { describe, it, expect } from 'vitest';

import {
    buildFleetReadinessSnapshot,
} from './fleet-readiness.js';

const NOW = new Date('2026-05-13T00:00:00.000Z');

function inDays(d: number) {
    return new Date(NOW.getTime() + d * 86400000).toISOString();
}

describe('buildFleetReadinessSnapshot', () => {
    it('returns empty rollups when fleet is empty', () => {
        const snap = buildFleetReadinessSnapshot([], NOW);
        expect(snap.totalCount).toBe(0);
        expect(snap.readyCount).toBe(0);
        expect(snap.attentionCount).toBe(0);
        expect(snap.blockedCount).toBe(0);
        expect(snap.issues).toEqual([]);
        expect(snap.vehicles).toEqual([]);
    });

    it('classifies a fully-clean vehicle as "ready"', () => {
        const snap = buildFleetReadinessSnapshot([{
            id: 'v1',
            plateNumber: 'А001АА77',
            status: 'available',
            techInspectionExpiry: inDays(180),
            osagoExpiry: inDays(180),
            tachographCalibrationExpiry: inDays(180),
            maintenanceNextDate: inDays(180),
            maintenanceNextKm: 200_000,
            lastOdometerKm: 100_000,
        }], NOW);

        expect(snap.totalCount).toBe(1);
        expect(snap.readyCount).toBe(1);
        expect(snap.attentionCount).toBe(0);
        expect(snap.blockedCount).toBe(0);
        // No issues → no entries in the issues / vehicles roll-ups.
        expect(snap.vehicles).toEqual([]);
    });

    it('flags critical-status vehicles ("broken") as blocked', () => {
        const snap = buildFleetReadinessSnapshot([{
            id: 'v1',
            plateNumber: 'А001АА77',
            status: 'broken',
        }], NOW);
        expect(snap.blockedCount).toBe(1);
        expect(snap.readyCount).toBe(0);
        const reasons = snap.vehicles[0]!.reasons;
        expect(reasons.some(r => r.key === 'status:broken')).toBe(true);
        expect(snap.vehicles[0]!.severity).toBe('critical');
    });

    it('treats expired OSAGO as critical and ≤30-day expiry as warning', () => {
        const snap = buildFleetReadinessSnapshot([
            {
                id: 'expired',
                plateNumber: 'А001АА77',
                status: 'available',
                osagoExpiry: inDays(-1),
            },
            {
                id: 'soon',
                plateNumber: 'А002АА77',
                status: 'available',
                osagoExpiry: inDays(15),
            },
        ], NOW);
        expect(snap.blockedCount).toBe(1);
        expect(snap.attentionCount).toBe(1);

        const expired = snap.vehicles.find(v => v.vehicleId === 'expired')!;
        expect(expired.severity).toBe('critical');
        expect(expired.reasons.some(r => r.key === 'doc:osago:expired')).toBe(true);

        const soon = snap.vehicles.find(v => v.vehicleId === 'soon')!;
        expect(soon.severity).toBe('warning');
        expect(soon.reasons.some(r => r.key === 'doc:osago:due_30')).toBe(true);
    });

    it('flags maintenance by km overrun even with healthy dates', () => {
        const snap = buildFleetReadinessSnapshot([{
            id: 'v1',
            plateNumber: 'А001АА77',
            status: 'available',
            maintenanceNextKm: 100_000,
            lastOdometerKm: 100_500, // already past target
        }], NOW);
        expect(snap.blockedCount).toBe(1);
        const reason = snap.vehicles[0]!.reasons.find(r => r.key === 'maintenance:km_overdue');
        expect(reason).toBeDefined();
        expect(reason!.severity).toBe('critical');
    });

    it('rolls identical issues across vehicles into a single counted entry', () => {
        const snap = buildFleetReadinessSnapshot([
            { id: 'a', plateNumber: 'А001АА77', status: 'available', osagoExpiry: inDays(-1) },
            { id: 'b', plateNumber: 'А002АА77', status: 'available', osagoExpiry: inDays(-1) },
            { id: 'c', plateNumber: 'А003АА77', status: 'available', osagoExpiry: inDays(-1) },
        ], NOW);
        const issue = snap.issues.find(i => i.key === 'doc:osago:expired');
        expect(issue).toBeDefined();
        expect(issue!.count).toBe(3);
        expect(snap.blockedCount).toBe(3);
    });

    it('skips date checks when value is missing or unparseable', () => {
        const snap = buildFleetReadinessSnapshot([{
            id: 'v1',
            plateNumber: 'А001АА77',
            status: 'available',
            osagoExpiry: null,
            techInspectionExpiry: 'not-a-date',
        }], NOW);
        expect(snap.readyCount).toBe(1);
        expect(snap.blockedCount).toBe(0);
    });
});
