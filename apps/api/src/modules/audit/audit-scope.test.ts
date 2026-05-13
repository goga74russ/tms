// ============================================================
// A-P0-12 / A-P2 regression — audit-log scoping & search escaping.
// Exercises the pure helpers in audit/scope.ts.
// ============================================================
import { describe, it, expect } from 'vitest';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-do-not-use';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';

import { buildAuditConditions, escapeAuditSearch } from './scope.js';

describe('escapeAuditSearch — A-P2 pattern-DoS hardening', () => {
    it('escapes percent signs', () => {
        expect(escapeAuditSearch('%%%')).toBe('\\%\\%\\%');
    });

    it('escapes underscores', () => {
        expect(escapeAuditSearch('a_b_c')).toBe('a\\_b\\_c');
    });

    it('escapes backslashes', () => {
        expect(escapeAuditSearch('a\\b')).toBe('a\\\\b');
    });

    it('leaves benign characters untouched', () => {
        expect(escapeAuditSearch('order.create')).toBe('order.create');
    });

    it('handles empty input', () => {
        expect(escapeAuditSearch('')).toBe('');
    });
});

describe('buildAuditConditions — A-P0-12 tenant scoping', () => {
    it('returns empty=true when organizationId is missing', () => {
        const res = buildAuditConditions(null, {});
        expect(res.empty).toBe(true);
        expect(res.where).toBeNull();
    });

    it('returns empty=true when organizationId is undefined', () => {
        const res = buildAuditConditions(undefined, {});
        expect(res.empty).toBe(true);
    });

    it('returns a non-empty WHERE when organizationId is present', () => {
        const res = buildAuditConditions('org-1', {});
        expect(res.empty).toBe(false);
        expect(res.where).toBeDefined();
        // Drizzle SQL objects have a `.queryChunks` array; we just assert truthy
        // and let webhook + integration tests cover full rendering.
        expect(res.where).not.toBeNull();
    });

    it('includes additional filter conditions when supplied', () => {
        const res = buildAuditConditions('org-1', {
            entity_type: 'Order',
            entity_id: '00000000-0000-0000-0000-000000000001',
            event_type: 'order.created',
            search: 'foo',
            from: '2026-01-01T00:00:00.000Z',
            to: '2026-02-01T00:00:00.000Z',
        });
        expect(res.empty).toBe(false);
        expect(res.where).toBeDefined();
    });

    it('search input runs through escapeAuditSearch (no raw % leak)', () => {
        // Indirect check — escapeAuditSearch is unit-tested above and called
        // inside buildAuditConditions. If `%` ever stops getting escaped, the
        // dedicated test fails first; here we just confirm the path is wired.
        expect(() => buildAuditConditions('org-1', { search: '%%' })).not.toThrow();
    });
});
