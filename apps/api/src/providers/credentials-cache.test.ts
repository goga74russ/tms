// ============================================================
// A-P1-2 regression — credentials cache (loadCredentials TTL).
// We stub db/connection so loadCredentials reads from a counter we control.
// Each test calls _clearCredentialsCache() up front.
// ============================================================
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-do-not-use';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';
// loadCredentials path itself decrypts when an encryptedCredentials blob is
// present. Our rows return null so getKey() never runs — no CREDENTIALS_KEY
// is needed in this test file.

const dbState = {
    selectCalls: 0,
    rows: [] as Array<Record<string, unknown>>,
};

vi.mock('../db/connection.js', () => ({
    db: {
        select: () => ({
            from: () => ({
                where: () => ({
                    limit: () => {
                        dbState.selectCalls += 1;
                        return Promise.resolve(dbState.rows);
                    },
                }),
            }),
        }),
    },
    sql: () => 'SQL',
}));

import {
    loadCredentials,
    invalidateCredentialsCache,
    _clearCredentialsCache,
} from './base.js';

beforeEach(() => {
    _clearCredentialsCache();
    dbState.selectCalls = 0;
    dbState.rows = [];
});

afterEach(() => {
    vi.useRealTimers();
});

describe('loadCredentials — A-P1-2 TTL cache', () => {
    it('caches a hit: second call without providerName does not re-query', async () => {
        dbState.rows = [{
            id: 'cred-1',
            providerType: 'signature',
            providerName: 'gosklyuch',
            status: 'active',
            encryptedCredentials: null,
        }];
        const a = await loadCredentials('org-1', 'signature');
        const b = await loadCredentials('org-1', 'signature');
        expect(dbState.selectCalls).toBe(1);
        expect(a?.providerName).toBe('gosklyuch');
        expect(b?.providerName).toBe('gosklyuch');
    });

    it('caches a miss: second call still does not re-query', async () => {
        dbState.rows = [];
        const a = await loadCredentials('org-2', 'payment');
        const b = await loadCredentials('org-2', 'payment');
        expect(dbState.selectCalls).toBe(1);
        expect(a).toBeNull();
        expect(b).toBeNull();
    });

    it('explicit providerName bypasses the cache (admin test path)', async () => {
        dbState.rows = [{
            id: 'cred-2',
            providerType: 'telematics',
            providerName: 'wialon',
            status: 'sandbox',
            encryptedCredentials: null,
        }];
        await loadCredentials('org-3', 'telematics', 'wialon');
        await loadCredentials('org-3', 'telematics', 'wialon');
        expect(dbState.selectCalls).toBe(2);
    });

    it('invalidateCredentialsCache forces a re-query', async () => {
        dbState.rows = [{
            id: 'cred-3',
            providerType: 'email',
            providerName: 'smtp',
            status: 'active',
            encryptedCredentials: null,
        }];
        await loadCredentials('org-4', 'email');
        invalidateCredentialsCache('org-4', 'email');
        await loadCredentials('org-4', 'email');
        expect(dbState.selectCalls).toBe(2);
    });

    it('invalidation is scoped to (orgId, providerType)', async () => {
        dbState.rows = [{
            id: 'cred-x',
            providerType: 'email',
            providerName: 'smtp',
            status: 'active',
            encryptedCredentials: null,
        }];
        await loadCredentials('org-5', 'email');
        await loadCredentials('org-6', 'email'); // separate cache entry
        expect(dbState.selectCalls).toBe(2);

        // Invalidate org-5 only → org-6 stays cached.
        invalidateCredentialsCache('org-5', 'email');
        await loadCredentials('org-5', 'email'); // re-queries
        await loadCredentials('org-6', 'email'); // still cached
        expect(dbState.selectCalls).toBe(3);
    });

    it('TTL expiry: advancing past 5 min causes a re-query', async () => {
        vi.useFakeTimers();
        const start = new Date('2026-05-12T00:00:00.000Z').getTime();
        vi.setSystemTime(start);

        dbState.rows = [{
            id: 'cred-4',
            providerType: 'marking',
            providerName: 'crpt',
            status: 'active',
            encryptedCredentials: null,
        }];
        await loadCredentials('org-7', 'marking');
        expect(dbState.selectCalls).toBe(1);

        // Within TTL → still cached.
        vi.setSystemTime(start + 4 * 60_000);
        await loadCredentials('org-7', 'marking');
        expect(dbState.selectCalls).toBe(1);

        // Past TTL (5 min) → re-query.
        vi.setSystemTime(start + 6 * 60_000);
        await loadCredentials('org-7', 'marking');
        expect(dbState.selectCalls).toBe(2);
    });

    it('different orgs do not collide in the cache', async () => {
        dbState.rows = [{
            id: 'cred-5',
            providerType: 'fines',
            providerName: 'autocode',
            status: 'active',
            encryptedCredentials: null,
        }];
        await loadCredentials('org-A', 'fines');
        await loadCredentials('org-B', 'fines');
        await loadCredentials('org-A', 'fines'); // cache hit
        await loadCredentials('org-B', 'fines'); // cache hit
        expect(dbState.selectCalls).toBe(2);
    });
});
