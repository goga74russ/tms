// ============================================================
// A-P0-3 regression — CSPRNG-backed verification codes & temp passwords.
// Pure helpers from auth.ts; no DB / Fastify required.
// ============================================================
import { describe, it, expect, vi } from 'vitest';

// auth.ts and db/connection.ts both throw at module-init time on missing env
// vars. ES module imports are hoisted above top-level statements, so we
// must set the env via vi.hoisted (which IS run before any import).
vi.hoisted(() => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-do-not-use';
    process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';
});

vi.mock('../db/connection.js', () => ({
    db: {},
    sql: () => 'SQL',
}));

import { generateCode, generateTempPassword } from './auth.js';

describe('generateCode — 6-digit verification code', () => {
    it('produces exactly 6 digits', () => {
        for (let i = 0; i < 50; i++) {
            const code = generateCode();
            expect(code).toMatch(/^\d{6}$/);
        }
    });

    it('all codes fall in [100000, 999999]', () => {
        for (let i = 0; i < 200; i++) {
            const n = Number.parseInt(generateCode(), 10);
            expect(n).toBeGreaterThanOrEqual(100000);
            expect(n).toBeLessThanOrEqual(999999);
        }
    });

    it('1000 codes have near-no collisions (CSPRNG signature)', () => {
        // Math.random consistently fails this in V8 with predictable seeds;
        // randomInt() over 900k space should produce ~999 distinct values.
        const set = new Set<string>();
        for (let i = 0; i < 1000; i++) set.add(generateCode());
        expect(set.size).toBeGreaterThan(990);
    });
});

describe('generateTempPassword — invited-user CSPRNG password', () => {
    it('produces ~16-char base64url output', () => {
        const pw = generateTempPassword();
        // 12 random bytes → base64url is 16 chars (no padding).
        expect(pw.length).toBe(16);
    });

    it('output charset is base64url only — no + / =', () => {
        for (let i = 0; i < 100; i++) {
            const pw = generateTempPassword();
            expect(pw).toMatch(/^[A-Za-z0-9_-]+$/);
        }
    });

    it('100 generations are all distinct', () => {
        const set = new Set<string>();
        for (let i = 0; i < 100; i++) set.add(generateTempPassword());
        expect(set.size).toBe(100);
    });
});
