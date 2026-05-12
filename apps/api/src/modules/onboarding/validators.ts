// ============================================================
// Onboarding wizard — Zod schemas extracted from routes.ts so
// unit tests can import them without pulling in the DB connection.
// Keep these in sync with `routes.ts` (it re-exports them).
// ============================================================
import { z } from 'zod';
import {
    ONBOARDING_SCENARIOS,
    type OnboardingScenario,
    type ProviderType,
    type ProviderName,
} from '@tms/shared';
import { APP_ROLES } from '../../auth/rbac.js';

export const PROVIDER_TYPES: ProviderType[] = [
    'signature', 'edi', 'telematics', 'fuel_card',
    'fines', 'marking', 'payment', 'email',
];

// Provider names accepted on the wizard. Mirrors `ProviderName` in shared/.
export const PROVIDER_NAMES: ProviderName[] = [
    'gosklyuch', 'kontur_sign', 'sbis_sign', 'cadesplugin',
    'diadoc', 'sbis', 'kontur', 'taxcom', 'kaluga_astral',
    'wialon', 'omnicomm', 'glonasssoft',
    'lukoil', 'rosneft', 'gazpromneft',
    'autocode', 'fssp', 'gibdd', 'crpt',
    'yookassa', 'tinkoff', 'cloudpayments',
    'mailru_smtp', 'unisender', 'console', 'mock',
];

export const InnLookupSchema = z.object({
    inn: z.string().regex(/^\d{10}(\d{2})?$/, 'ИНН: 10 или 12 цифр'),
});

export const ProfileSchema = z.object({
    inn: z.string().regex(/^\d{10}(\d{2})?$/),
    name: z.string().min(1).max(500),
    kpp: z.string().nullish(),
    ogrn: z.string().nullish(),
    legalAddress: z.string().nullish(),
    bankBik: z.string().nullish(),
    bankAccount: z.string().nullish(),
});

export const ScenarioSchema = z.object({
    scenario: z.enum(ONBOARDING_SCENARIOS as [OnboardingScenario, ...OnboardingScenario[]]),
});

export const IntegrationChoiceSchema = z.object({
    providerType: z.enum(PROVIDER_TYPES as [ProviderType, ...ProviderType[]]),
    providerName: z.enum(PROVIDER_NAMES as [ProviderName, ...ProviderName[]]),
    defer: z.boolean(),
    credentials: z.record(z.unknown()).optional(),
});

// A-P1-6: constrain roles to APP_ROLES — was z.string() which accepted any
// value, polluting users.roles with strings RBAC ignores.
export const InviteSchema = z.object({
    invites: z.array(z.object({
        email: z.string().email(),
        fullName: z.string().min(1),
        roles: z.array(z.enum(APP_ROLES)).min(1),
    })).min(1).max(50),
});

/**
 * Shape of the response sent by POST /onboarding/invite-team.
 * Documented here so tests can assert the contract — most importantly
 * that no `tempPassword` field is ever leaked (A-P0-3 / A-P0-13).
 */
export interface InviteTeamResponseData {
    invitedCount: number;
    failedToEmail: string[];
}

export function buildInviteResponse(
    createdEmails: ReadonlyArray<{ email: string }>,
    failedToEmail: ReadonlyArray<string>,
): InviteTeamResponseData {
    return {
        invitedCount: createdEmails.length,
        // Surface emails that didn't get the message so admin can resend.
        // Does NOT contain passwords — they are emailed only.
        failedToEmail: [...failedToEmail],
    };
}
