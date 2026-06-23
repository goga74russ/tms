// ============================================================
// Onboarding wizard — validator + invite-response shape tests.
// Imports validators.ts only — avoids pulling DB connection.
// ============================================================
import { describe, it, expect } from 'vitest';
import {
    InviteSchema,
    IntegrationChoiceSchema,
    ProfileSchema,
    buildInviteResponse,
} from './validators.js';

describe('InviteSchema', () => {
    const baseInvite = (overrides: Record<string, unknown> = {}) => ({
        email: 'driver@example.com',
        fullName: 'Иван Петров',
        roles: ['driver'],
        ...overrides,
    });

    it('accepts a valid invite with a single canonical role', () => {
        const result = InviteSchema.safeParse({ invites: [baseInvite()] });
        expect(result.success).toBe(true);
    });

    it.each([
        ['admin'], ['manager'], ['dispatcher'], ['driver'], ['mechanic'],
        ['medic'], ['logist'], ['accountant'], ['repair_service'], ['client'],
    ])('accepts canonical role %s', (role) => {
        const result = InviteSchema.safeParse({
            invites: [baseInvite({ roles: [role] })],
        });
        expect(result.success).toBe(true);
    });

    it('rejects non-canonical role `super_admin` (A-P1-6)', () => {
        const result = InviteSchema.safeParse({
            invites: [baseInvite({ roles: ['super_admin'] })],
        });
        expect(result.success).toBe(false);
    });

    it('rejects empty roles array', () => {
        const result = InviteSchema.safeParse({
            invites: [baseInvite({ roles: [] })],
        });
        expect(result.success).toBe(false);
    });

    it('rejects empty invites array', () => {
        expect(InviteSchema.safeParse({ invites: [] }).success).toBe(false);
    });

    it('rejects more than 50 invites in a single call', () => {
        const tooMany = Array.from({ length: 51 }, (_, i) =>
            baseInvite({ email: `u${i}@example.com` }),
        );
        expect(InviteSchema.safeParse({ invites: tooMany }).success).toBe(false);
    });

    it('rejects invalid email', () => {
        const result = InviteSchema.safeParse({
            invites: [baseInvite({ email: 'not-an-email' })],
        });
        expect(result.success).toBe(false);
    });
});

describe('IntegrationChoiceSchema', () => {
    it('accepts EDI / diadoc with credentials', () => {
        const result = IntegrationChoiceSchema.safeParse({
            providerType: 'edi',
            providerName: 'diadoc',
            defer: false,
            credentials: { apiKey: 'k', login: 'u' },
        });
        expect(result.success).toBe(true);
    });

    it('accepts a deferred choice without credentials', () => {
        const result = IntegrationChoiceSchema.safeParse({
            providerType: 'signature',
            providerName: 'gosklyuch',
            defer: true,
        });
        expect(result.success).toBe(true);
    });

    it('rejects unknown providerName `foobar`', () => {
        const result = IntegrationChoiceSchema.safeParse({
            providerType: 'edi',
            providerName: 'foobar',
            defer: false,
        });
        expect(result.success).toBe(false);
    });

    it('rejects unknown providerType', () => {
        const result = IntegrationChoiceSchema.safeParse({
            providerType: 'spaceship',
            providerName: 'diadoc',
            defer: false,
        });
        expect(result.success).toBe(false);
    });

    it('requires defer to be a boolean', () => {
        const result = IntegrationChoiceSchema.safeParse({
            providerType: 'edi',
            providerName: 'diadoc',
            // defer omitted
        });
        expect(result.success).toBe(false);
    });
});

describe('ProfileSchema', () => {
    // ЭПД: ОГРН/адрес/телефон теперь обязательны в ProfileSchema.
    const baseProfile = (inn: string) => ({ inn, name: 'ООО Тест', ogrn: '1027700132195', legalAddress: 'г. Москва, ул. Тверская, д. 1', phone: '+74951234567' });

    it('accepts 10-digit ИНН (legal entity)', () => {
        expect(ProfileSchema.safeParse(baseProfile('1234567890')).success).toBe(true);
    });

    it('accepts 12-digit ИНН (ИП)', () => {
        expect(ProfileSchema.safeParse(baseProfile('123456789012')).success).toBe(true);
    });

    it('rejects 11-digit ИНН', () => {
        expect(ProfileSchema.safeParse(baseProfile('12345678901')).success).toBe(false);
    });

    it('rejects non-numeric ИНН', () => {
        expect(ProfileSchema.safeParse(baseProfile('123456789a')).success).toBe(false);
    });

    it('rejects empty name', () => {
        const result = ProfileSchema.safeParse({ inn: '1234567890', name: '' });
        expect(result.success).toBe(false);
    });
});

describe('buildInviteResponse (A-P0-3 / A-P0-13)', () => {
    it('returns { invitedCount, failedToEmail, alreadyRegistered } shape', () => {
        const out = buildInviteResponse(
            [{ email: 'a@x.com' }, { email: 'b@x.com' }],
            ['b@x.com'],
            ['c@x.com'],
        );
        expect(out).toEqual({
            invitedCount: 2,
            failedToEmail: ['b@x.com'],
            alreadyRegistered: ['c@x.com'],
        });
    });

    it('alreadyRegistered defaults to [] when omitted (back-compat)', () => {
        const out = buildInviteResponse([{ email: 'a@x.com' }], []);
        expect(out.alreadyRegistered).toEqual([]);
    });

    it('NEVER includes a tempPassword field', () => {
        const out = buildInviteResponse(
            [{ email: 'a@x.com' }],
            [],
        );
        // Critical security invariant — see A-P0-3 / A-P0-13.
        expect(out).not.toHaveProperty('tempPassword');
        expect(out).not.toHaveProperty('temp_password');
        expect(out).not.toHaveProperty('password');
        // Object keys are exactly the documented three.
        expect(Object.keys(out).sort()).toEqual(['alreadyRegistered', 'failedToEmail', 'invitedCount']);
    });

    it('handles empty input arrays without leaking optional fields', () => {
        const out = buildInviteResponse([], []);
        expect(out.invitedCount).toBe(0);
        expect(out.failedToEmail).toEqual([]);
    });
});
