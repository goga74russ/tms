// ============================================================
// Unit-tests for sign-endpoint pure helpers.
//
// Маршрутные хендлеры завязаны на Drizzle + Fastify auth и
// проверяются на уровне docker build / integration. Здесь
// блокируем регрессии тех чистых функций, на которых строится
// юр-логика подписания:
//   • validateMchd — все ветки причины отказа
//   • buildExternalId — совместимость с verifyExternalIdHmac()
// ============================================================
import { describe, it, expect, vi } from 'vitest';
import crypto from 'node:crypto';

vi.hoisted(() => {
    process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';
});
vi.mock('../../db/connection.js', () => ({
    db: {},
    sql: () => 'SQL',
}));
vi.mock('../../providers/index.js', () => ({
    getDefaultRegistry: () => ({ signature: [] }),
    selectAdapter: async () => ({ name: 'mock' }),
}));

import { validateMchd, buildExternalId, type McheckInput } from './sign-endpoint.js';

describe('validateMchd', () => {
    const now = new Date('2026-05-23T12:00:00Z');
    const okRecord: McheckInput = {
        id: 'mchd-1',
        status: 'active',
        issuedAt: new Date('2026-01-01T00:00:00Z'),
        expiresAt: new Date('2027-01-01T00:00:00Z'),
        granteeInn: '7707083893',
        organizationId: 'org-1',
    };

    it('returns empty problems for a valid МЧД', () => {
        expect(validateMchd(okRecord, { documentOrgId: 'org-1', signerInn: '7707083893', now })).toEqual([]);
    });

    it('rejects when record is null', () => {
        const problems = validateMchd(null, { documentOrgId: 'org-1', now });
        expect(problems).toHaveLength(1);
        expect(problems[0]).toMatch(/не найдена/i);
    });

    it('rejects when organization does not match', () => {
        const problems = validateMchd(okRecord, { documentOrgId: 'org-other', now });
        expect(problems.some((p) => /другой организации/i.test(p))).toBe(true);
    });

    it('rejects revoked/expired status', () => {
        const revoked: McheckInput = { ...okRecord, status: 'revoked' };
        const problems = validateMchd(revoked, { documentOrgId: 'org-1', now });
        expect(problems.some((p) => /'revoked'/i.test(p))).toBe(true);
    });

    it('rejects when expiresAt is in the past', () => {
        const expired: McheckInput = { ...okRecord, expiresAt: new Date('2026-01-15T00:00:00Z') };
        const problems = validateMchd(expired, { documentOrgId: 'org-1', now });
        expect(problems.some((p) => /истекла/i.test(p))).toBe(true);
    });

    it('rejects when issuedAt is in the future', () => {
        const future: McheckInput = { ...okRecord, issuedAt: new Date('2027-01-01T00:00:00Z') };
        const problems = validateMchd(future, { documentOrgId: 'org-1', now });
        expect(problems.some((p) => /ещё не действует/i.test(p))).toBe(true);
    });

    it('rejects when signerInn does not match granteeInn', () => {
        const problems = validateMchd(okRecord, {
            documentOrgId: 'org-1',
            signerInn: '0000000000',
            now,
        });
        expect(problems.some((p) => /не совпадает с granteeInn/i.test(p))).toBe(true);
    });

    it('allows omitting signerInn (resolved later from certificate)', () => {
        expect(validateMchd(okRecord, { documentOrgId: 'org-1', now })).toEqual([]);
    });
});

describe('buildExternalId', () => {
    it('returns a bare UUID when no secret is configured', () => {
        const id = buildExternalId(undefined);
        expect(id).toMatch(/^[0-9a-f-]{36}$/);
        expect(id.includes('.')).toBe(false);
    });

    it('returns `<uuid>.<hmac-sha256-hex>` when secret is set, verifiable with the same secret', () => {
        const secret = 'shh-secret-123';
        const id = buildExternalId(secret);
        const dot = id.lastIndexOf('.');
        expect(dot).toBeGreaterThan(0);
        const body = id.slice(0, dot);
        const mac = id.slice(dot + 1);
        expect(body).toMatch(/^[0-9a-f-]{36}$/);
        const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
        expect(mac).toBe(expected);
    });

    it('rotates the body on every call (no replay collision)', () => {
        const a = buildExternalId('s');
        const b = buildExternalId('s');
        expect(a).not.toBe(b);
    });
});
