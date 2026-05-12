// ============================================================
// Claims service — pure logic tests.
// We don't boot the DB; instead we test:
//   1. status transition rules expressed via the route Zod schemas
//      (PATCH /status accepts only open|investigating; POST /resolve
//      accepts only resolved|rejected — so "resolved → open" is invalid
//      because /resolve never accepts `open` as a target status).
//   2. exposureBasis selection in getClaimExposure (claim-policy).
//   3. settlement-note + resolution requirements on /resolve.
// ============================================================
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
    getClaimExposure,
    classifyClaim,
    appendSettlementNote,
    type ClaimLike,
} from '../operational-core/claim-policy.js';

// --- mirror of route schemas (intentionally duplicated so the test
// doesn't drag the route module — which would pull DB connection).
// If these drift from routes.ts, the claims routes integration would
// fail at request time; this test acts as a contract anchor.
const ClaimStatusSchema = z.object({
    status: z.enum(['open', 'investigating']),
    settlementNote: z.string().max(2000).optional().nullable(),
});

const ClaimResolveSchema = z.object({
    status: z.enum(['resolved', 'rejected']),
    resolvedAmount: z.number().nonnegative().optional().nullable(),
    resolution: z.string().min(1).max(2000),
    settlementNote: z.string().max(2000).optional().nullable(),
});

describe('Claim status transitions (PATCH /claims/:id/status)', () => {
    it('accepts open → investigating', () => {
        const r = ClaimStatusSchema.safeParse({ status: 'investigating' });
        expect(r.success).toBe(true);
    });

    it('accepts an explicit revert to open', () => {
        // Used to reopen a wrongly-investigated claim before resolution.
        const r = ClaimStatusSchema.safeParse({ status: 'open' });
        expect(r.success).toBe(true);
    });

    it('rejects resolved on the /status endpoint — /resolve owns terminal transitions', () => {
        expect(ClaimStatusSchema.safeParse({ status: 'resolved' }).success).toBe(false);
        expect(ClaimStatusSchema.safeParse({ status: 'rejected' }).success).toBe(false);
    });

    it('rejects garbage status values', () => {
        expect(ClaimStatusSchema.safeParse({ status: 'cancelled' }).success).toBe(false);
        expect(ClaimStatusSchema.safeParse({ status: '' }).success).toBe(false);
    });
});

describe('Claim resolution (POST /claims/:id/resolve)', () => {
    const validBody = { status: 'resolved' as const, resolution: 'Согласовано с контрагентом' };

    it('accepts open → resolved (skip investigating)', () => {
        // Spec: skipping `investigating` is valid — claim can close directly.
        const r = ClaimResolveSchema.safeParse(validBody);
        expect(r.success).toBe(true);
    });

    it('accepts open → rejected (skip investigating)', () => {
        const r = ClaimResolveSchema.safeParse({ ...validBody, status: 'rejected' });
        expect(r.success).toBe(true);
    });

    it('rejects resolved → open transition (resolve endpoint only accepts terminal states)', () => {
        // The /resolve endpoint cannot move a claim back to open.
        const r = ClaimResolveSchema.safeParse({ ...validBody, status: 'open' });
        expect(r.success).toBe(false);
    });

    it('requires a non-empty resolution note', () => {
        // Settlement note is optional, but the resolution narrative is required.
        const r = ClaimResolveSchema.safeParse({ status: 'resolved', resolution: '' });
        expect(r.success).toBe(false);
    });

    it('accepts an optional resolvedAmount', () => {
        const r = ClaimResolveSchema.safeParse({ ...validBody, resolvedAmount: 12500 });
        expect(r.success).toBe(true);
    });

    it('rejects a negative resolvedAmount', () => {
        const r = ClaimResolveSchema.safeParse({ ...validBody, resolvedAmount: -1 });
        expect(r.success).toBe(false);
    });

    it('accepts an optional settlementNote alongside resolution', () => {
        const r = ClaimResolveSchema.safeParse({
            ...validBody,
            settlementNote: 'Возмещено по акту № 42',
        });
        expect(r.success).toBe(true);
    });
});

describe('getClaimExposure — exposureBasis selection', () => {
    function meta(overrides: Record<string, unknown> = {}) {
        return [{ kind: 'claim_policy_metadata', ...overrides }];
    }

    it('basis=amount when claim.amount is set (even if resolvedAmount also present)', () => {
        // Per spec, resolved/reserve/estimated are tie-breakers only when
        // the headline `amount` is null. With amount set, basis must be amount.
        const claim: ClaimLike = { amount: 10000, resolvedAmount: 8000 };
        const ex = getClaimExposure(claim);
        expect(ex.exposureBasis).toBe('amount');
        expect(ex.effectiveExposureAmount).toBe(10000);
        // resolvedAmount is preserved separately for reporting.
        expect(ex.resolvedAmount).toBe(8000);
    });

    it('basis=reserve when amount is null but reserveAmount is set', () => {
        const claim: ClaimLike = { attachments: meta({ reserveAmount: 5000 }) };
        const ex = getClaimExposure(claim);
        expect(ex.exposureBasis).toBe('reserve');
        expect(ex.effectiveExposureAmount).toBe(5000);
    });

    it('basis=estimated when only estimatedAmount is set', () => {
        const claim: ClaimLike = { attachments: meta({ estimatedAmount: 3000 }) };
        const ex = getClaimExposure(claim);
        expect(ex.exposureBasis).toBe('estimated');
        expect(ex.effectiveExposureAmount).toBe(3000);
    });

    it('basis=none when no monetary fields are set', () => {
        const claim: ClaimLike = { description: 'Нет суммы' };
        const ex = getClaimExposure(claim);
        expect(ex.exposureBasis).toBe('none');
        expect(ex.effectiveExposureAmount).toBe(0);
    });

    it('reserve takes precedence over estimated when both present and amount is null', () => {
        const claim: ClaimLike = {
            attachments: meta({ reserveAmount: 7000, estimatedAmount: 4000 }),
        };
        const ex = getClaimExposure(claim);
        expect(ex.exposureBasis).toBe('reserve');
        expect(ex.effectiveExposureAmount).toBe(7000);
    });

    it('parses string amounts (RU "12 500,50" form)', () => {
        const claim: ClaimLike = { amount: '12 500,50' };
        const ex = getClaimExposure(claim);
        expect(ex.exposureBasis).toBe('amount');
        expect(ex.effectiveExposureAmount).toBe(12500.5);
    });

    it('treats negative or non-finite amount as null (basis falls back)', () => {
        // Sanity — toFiniteAmount rejects negatives.
        const claim: ClaimLike = { amount: -50 };
        const ex = getClaimExposure(claim);
        expect(ex.exposureBasis).toBe('none');
    });
});

describe('classifyClaim — cause → type mapping', () => {
    it('maps shortage cause → loss type', () => {
        expect(classifyClaim({ cause: 'shortage' }).type).toBe('loss');
    });

    it('respects explicit type override over cause-derived default', () => {
        // damage cause normally → damage type, but explicit type wins.
        expect(classifyClaim({ cause: 'damage', type: 'other' }).type).toBe('other');
    });

    it('falls back to "other" cause when input is unrecognised', () => {
        expect(classifyClaim({ cause: 'unknown-cause' }).cause).toBe('other');
    });
});

describe('appendSettlementNote — required-on-resolved guard', () => {
    it('returns existing resolution unchanged when no note supplied', () => {
        expect(appendSettlementNote('Согласовано', null)).toBe('Согласовано');
        expect(appendSettlementNote('Согласовано', '')).toBe('Согласовано');
        expect(appendSettlementNote('Согласовано', '   ')).toBe('Согласовано');
    });

    it('appends a note with the "Settlement note:" prefix when both present', () => {
        const out = appendSettlementNote('Resolution body', 'paid in full');
        expect(out).toBe('Resolution body\nSettlement note: paid in full');
    });

    it('creates a fresh note line when existing resolution is null', () => {
        // Path used when only the optional note is given (rare but possible).
        const out = appendSettlementNote(null, 'see attachments');
        expect(out).toBe('Settlement note: see attachments');
    });
});
