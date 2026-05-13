// ============================================================
// A-P0-4 regression — real-adapter factory registry.
// The registry lives in providers/index.ts; we exercise `hasRealAdapter`
// directly. Mock db/connection to keep the module load-time graph isolated.
// ============================================================
import { describe, it, expect, vi } from 'vitest';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-do-not-use';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';

vi.mock('../db/connection.js', () => ({
    db: {
        select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) }),
        update: () => ({ set: () => ({ where: () => Promise.resolve([]) }) }),
        insert: () => ({ values: () => ({ returning: () => Promise.resolve([]) }) }),
    },
    sql: () => 'SQL',
}));

import { hasRealAdapter } from './index.js';

describe('hasRealAdapter — A-P0-4 factory map', () => {
    it('returns true for registered signature provider gosklyuch', () => {
        expect(hasRealAdapter('signature', 'gosklyuch')).toBe(true);
    });

    it('returns true for payment:yookassa', () => {
        expect(hasRealAdapter('payment', 'yookassa')).toBe(true);
    });

    it('returns true for telematics wialon / omnicomm / glonasssoft', () => {
        expect(hasRealAdapter('telematics', 'wialon')).toBe(true);
        expect(hasRealAdapter('telematics', 'omnicomm')).toBe(true);
        expect(hasRealAdapter('telematics', 'glonasssoft')).toBe(true);
    });

    it('returns true for edi:diadoc and marking:crpt', () => {
        expect(hasRealAdapter('edi', 'diadoc')).toBe(true);
        expect(hasRealAdapter('marking', 'crpt')).toBe(true);
    });

    it('returns true for email smtp variants', () => {
        expect(hasRealAdapter('email', 'smtp')).toBe(true);
        expect(hasRealAdapter('email', 'mailru_smtp')).toBe(true);
    });

    it('returns false for unknown provider names', () => {
        expect(hasRealAdapter('signature', 'nonexistent')).toBe(false);
        expect(hasRealAdapter('payment', 'stripe')).toBe(false);
        expect(hasRealAdapter('telematics', 'made-up-vendor')).toBe(false);
    });

    it('returns false for an unknown provider TYPE branch', () => {
        // We cast through unknown to feign a fake type; the helper should
        // simply not have the key and return false.
        expect(hasRealAdapter('fuel_card', 'lukoil')).toBe(false);
        expect(hasRealAdapter('fines', 'autocode')).toBe(false);
    });
});
