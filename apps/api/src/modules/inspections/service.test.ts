// ============================================================
// Round 3D — B-1 — Inspection decision-update tests.
// We mock db/connection + recordEvent + waybill sync so we can
// assert that decision/comment updates call the expected drizzle
// update() chain on the inspection tables.
// ============================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';

// ---------- DB stub ----------
// We need:
//   1. db.select().from().where().limit() → existing row
//   2. db.transaction(cb) → call cb(tx) where tx.update().set().where().returning() returns [updated]
//   3. db.select() inside `getTechInspectionById` chain
// We capture the call args so the test can assert what was sent.
// ------------------------------------------------------------

interface Capture {
    selectResults: any[][];
    updateSetArgs: any[];
    updateWhereCalled: boolean;
    txUpdateCalled: boolean;
}

let capture: Capture;

function makeSelectChain() {
    const result = capture.selectResults.shift() ?? [];
    const chain: any = {
        from: () => chain,
        innerJoin: () => chain,
        leftJoin: () => chain,
        where: () => chain,
        orderBy: () => chain,
        limit: () => Promise.resolve(result),
        offset: () => chain,
        then: (resolve: any) => resolve(result),
    };
    return chain;
}

function makeUpdateChain(returningRow: any) {
    const chain: any = {
        set: (args: any) => {
            capture.updateSetArgs.push(args);
            return chain;
        },
        where: () => {
            capture.updateWhereCalled = true;
            return chain;
        },
        returning: () => Promise.resolve([returningRow]),
    };
    return chain;
}

const baseTechRow = {
    id: 'insp-1',
    vehicleId: 'veh-1',
    decision: 'rejected',
    comment: 'old',
    tripId: 'trip-1',
};

const baseMedRow = {
    id: 'insp-2',
    driverId: 'drv-1',
    decision: 'rejected',
    comment: 'old',
    tripId: 'trip-2',
};

let updatedRow: any;

vi.mock('../../db/connection.js', () => ({
    db: {
        select: () => makeSelectChain(),
        update: () => {
            capture.txUpdateCalled = true;
            return makeUpdateChain(updatedRow);
        },
        insert: () => ({
            values: () => Promise.resolve(undefined),
        }),
        transaction: async (cb: any) => {
            return cb({
                update: () => {
                    capture.txUpdateCalled = true;
                    return makeUpdateChain(updatedRow);
                },
                insert: () => ({
                    values: () => Promise.resolve(undefined),
                }),
                select: () => makeSelectChain(),
            });
        },
    },
    sql: () => 'SQL',
}));

vi.mock('../../events/journal.js', () => ({
    recordEvent: vi.fn(async () => undefined),
}));

vi.mock('../waybills/service.js', () => ({
    syncWaybillStateForTrip: vi.fn(async () => undefined),
}));

import {
    updateTechInspectionDecision,
    updateMedInspectionDecision,
} from './service.js';

beforeEach(() => {
    capture = {
        selectResults: [],
        updateSetArgs: [],
        updateWhereCalled: false,
        txUpdateCalled: false,
    };
});

describe('updateTechInspectionDecision', () => {
    it('updates only decision + comment on an existing tech inspection', async () => {
        // First select: getTechInspectionById fetches existing row (approved).
        // organizationId is null so the org-scope sub-select is skipped.
        // Allowed direction: approved→rejected (tightening) with a note.
        capture.selectResults.push([{ ...baseTechRow, decision: 'approved' }]);
        updatedRow = { ...baseTechRow, decision: 'rejected', comment: 'old\nALL OK' };

        const out = await updateTechInspectionDecision(
            'insp-1',
            { decision: 'rejected', notes: 'ALL OK' },
            { userId: 'u1', role: 'mechanic', organizationId: null },
        );

        expect(out).toEqual({ id: 'insp-1', decision: 'rejected', tripId: 'trip-1' });
        expect(capture.txUpdateCalled).toBe(true);
        expect(capture.updateSetArgs).toHaveLength(1);
        const setPayload = capture.updateSetArgs[0];
        // Must touch only decision + comment — nothing else.
        expect(Object.keys(setPayload).sort()).toEqual(['comment', 'decision']);
        expect(setPayload.decision).toBe('rejected');
        expect(setPayload.comment).toContain('ALL OK');
    });

    it('C1: rejected→approved заблокирован (immutability) — throws, без UPDATE', async () => {
        capture.selectResults.push([{ ...baseTechRow, decision: 'rejected' }]);
        await expect(updateTechInspectionDecision(
            'insp-1',
            { decision: 'approved', notes: 'передумал' },
            { userId: 'u1', role: 'mechanic', organizationId: null },
        )).rejects.toThrow(/ретроактивно одобрить/);
        expect(capture.txUpdateCalled).toBe(false);
    });

    it('C1: rejection без notes — throws (note required)', async () => {
        capture.selectResults.push([{ ...baseTechRow, decision: 'approved' }]);
        await expect(updateTechInspectionDecision(
            'insp-1',
            { decision: 'rejected' },
            { userId: 'u1', role: 'mechanic', organizationId: null },
        )).rejects.toThrow();
        expect(capture.txUpdateCalled).toBe(false);
    });

    it('returns null when the inspection cannot be found', async () => {
        capture.selectResults.push([]); // empty getTechInspectionById
        const out = await updateTechInspectionDecision(
            'missing',
            { decision: 'approved' },
            { userId: 'u1', role: 'mechanic', organizationId: null },
        );
        expect(out).toBeNull();
        expect(capture.txUpdateCalled).toBe(false);
    });
});

describe('updateMedInspectionDecision', () => {
    it('updates only decision + comment on an existing med inspection', async () => {
        // Allowed direction: approved→rejected with a note.
        capture.selectResults.push([{ ...baseMedRow, decision: 'approved' }]); // initial fetch
        updatedRow = { ...baseMedRow, decision: 'rejected', comment: 'старое\nне допустить' };

        const out = await updateMedInspectionDecision(
            'insp-2',
            { decision: 'rejected', notes: 'не допустить' },
            { userId: 'm1', role: 'medic', organizationId: null },
        );

        expect(out).toEqual({ id: 'insp-2', decision: 'rejected', tripId: 'trip-2' });
        const setPayload = capture.updateSetArgs[0];
        expect(Object.keys(setPayload).sort()).toEqual(['comment', 'decision']);
    });

    it('C1: rejected→approved заблокирован (immutability) — throws, без UPDATE', async () => {
        capture.selectResults.push([{ ...baseMedRow, decision: 'rejected', alcoholTest: 'positive' }]);
        await expect(updateMedInspectionDecision(
            'insp-2',
            { decision: 'approved', notes: 'x' },
            { userId: 'm1', role: 'medic', organizationId: null },
        )).rejects.toThrow(/ретроактивно одобрить/);
        expect(capture.txUpdateCalled).toBe(false);
    });

    it('returns null when med inspection is missing', async () => {
        capture.selectResults.push([]);
        const out = await updateMedInspectionDecision(
            'missing',
            { decision: 'rejected' },
            { userId: 'm1', role: 'medic', organizationId: null },
        );
        expect(out).toBeNull();
        expect(capture.txUpdateCalled).toBe(false);
    });
});
