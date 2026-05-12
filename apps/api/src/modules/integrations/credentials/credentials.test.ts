// ============================================================
// Credentials POST / PUT body schema — locked validators.
// CredentialsCreateSchema gates every encrypted-secret write into
// `provider_credentials`. A malformed payload here would let the
// route write garbage into a row whose ciphertext can't be decrypted
// later — so we exercise both the happy path and the rejection
// cases (bad providerType, bad status, non-record credentials).
// ============================================================
import { describe, it, expect } from 'vitest';

import { CredentialsCreateSchema, PROVIDER_TYPES, VALID_STATUSES } from './validators.js';

describe('CredentialsCreateSchema — POST /integrations/credentials body', () => {
    it('accepts a minimal valid payload (status defaults via route to "sandbox")', () => {
        const result = CredentialsCreateSchema.safeParse({
            providerType: 'signature',
            providerName: 'gosklyuch',
            credentials: { apiKey: 'secret', endpoint: 'https://api.example' },
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.providerType).toBe('signature');
            expect(result.data.status).toBeUndefined(); // route layer applies default
        }
    });

    it('accepts every documented status value', () => {
        for (const status of VALID_STATUSES) {
            const r = CredentialsCreateSchema.safeParse({
                providerType: 'payment',
                providerName: 'yookassa',
                credentials: { shopId: 'x', secretKey: 'y' },
                status,
            });
            expect(r.success).toBe(true);
        }
    });

    it('rejects unknown providerType values', () => {
        const r = CredentialsCreateSchema.safeParse({
            providerType: 'unknown_type',
            providerName: 'foo',
            credentials: {},
        });
        expect(r.success).toBe(false);
    });

    it('rejects unknown status values (typo guard)', () => {
        const r = CredentialsCreateSchema.safeParse({
            providerType: 'signature',
            providerName: 'gosklyuch',
            credentials: {},
            status: 'enabled', // not in the enum — admin would expect "active"
        });
        expect(r.success).toBe(false);
    });

    it('rejects providerName at length boundaries', () => {
        expect(CredentialsCreateSchema.safeParse({
            providerType: 'signature',
            providerName: '',
            credentials: {},
        }).success).toBe(false);

        const tooLong = 'a'.repeat(65);
        expect(CredentialsCreateSchema.safeParse({
            providerType: 'signature',
            providerName: tooLong,
            credentials: {},
        }).success).toBe(false);

        // 64-char boundary is the inclusive max.
        expect(CredentialsCreateSchema.safeParse({
            providerType: 'signature',
            providerName: 'a'.repeat(64),
            credentials: {},
        }).success).toBe(true);
    });

    it('rejects non-record credentials (must be an object, not array/string)', () => {
        expect(CredentialsCreateSchema.safeParse({
            providerType: 'signature',
            providerName: 'gosklyuch',
            credentials: 'a-string',
        }).success).toBe(false);

        expect(CredentialsCreateSchema.safeParse({
            providerType: 'signature',
            providerName: 'gosklyuch',
            credentials: ['apiKey', 'value'],
        }).success).toBe(false);
    });

    it('exports the full set of provider types so admin UI stays in sync', () => {
        // Snapshot the canonical list — any new provider type must explicitly
        // appear here AND in the schema.
        expect([...PROVIDER_TYPES].sort()).toEqual([
            'edi', 'email', 'fines', 'fuel_card',
            'marking', 'payment', 'signature', 'telematics',
        ]);
    });
});
