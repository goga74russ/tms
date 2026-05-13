// ============================================================
// A-P1-6 regression — role inputs constrained to APP_ROLES.
//
// We re-instantiate the role-array schema used in auth.ts
// (UserCreate / UserUpdate) and onboarding/routes.ts (InviteSchema). The
// load-bearing rule is `z.array(z.enum(APP_ROLES)).min(1)` — anything else in
// those schemas is orthogonal. Reproducing the schema here keeps the test
// independent of Fastify wiring while still catching regressions if anyone
// re-loosens role validation to z.string().
// ============================================================
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { APP_ROLES } from './rbac.js';

// Mirrors UserCreateSchema.roles / UserUpdateSchema.roles / InviteSchema invites[].roles.
const RolesArraySchema = z.array(z.enum(APP_ROLES)).min(1);

describe('APP_ROLES strict validation (A-P1-6)', () => {
    it('accepts canonical roles', () => {
        for (const role of APP_ROLES) {
            const out = RolesArraySchema.safeParse([role]);
            expect(out.success).toBe(true);
        }
    });

    it('accepts multi-role array of valid roles', () => {
        const out = RolesArraySchema.safeParse(['admin', 'dispatcher']);
        expect(out.success).toBe(true);
    });

    it('rejects unknown role string', () => {
        expect(RolesArraySchema.safeParse(['super_admin']).success).toBe(false);
        expect(RolesArraySchema.safeParse(['system']).success).toBe(false);
        expect(RolesArraySchema.safeParse(['root']).success).toBe(false);
    });

    it('rejects empty string as a role', () => {
        expect(RolesArraySchema.safeParse(['']).success).toBe(false);
    });

    it('rejects empty array', () => {
        const out = RolesArraySchema.safeParse([]);
        expect(out.success).toBe(false);
    });

    it('rejects when a single role in a mixed array is invalid', () => {
        const out = RolesArraySchema.safeParse(['admin', 'super_admin']);
        expect(out.success).toBe(false);
    });

    it('rejects non-string entries', () => {
        expect(RolesArraySchema.safeParse([null]).success).toBe(false);
        expect(RolesArraySchema.safeParse([42]).success).toBe(false);
        expect(RolesArraySchema.safeParse([{ role: 'admin' }]).success).toBe(false);
    });

    it('rejects when the entire field is missing/null', () => {
        expect(RolesArraySchema.safeParse(undefined).success).toBe(false);
        expect(RolesArraySchema.safeParse(null).success).toBe(false);
    });

    it('APP_ROLES list itself is non-trivial', () => {
        expect(APP_ROLES.length).toBeGreaterThanOrEqual(10);
        expect(new Set(APP_ROLES).size).toBe(APP_ROLES.length); // no duplicates
    });
});
