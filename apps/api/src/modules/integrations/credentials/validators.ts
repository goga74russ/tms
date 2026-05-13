// ============================================================
// Credential management — request body validators.
// Extracted from routes.ts so the schema can be unit-tested
// without booting Fastify or hitting the DB. Behavior-preserving.
// ============================================================
import { z } from 'zod';
import type {
    ProviderType,
    ProviderStatus,
} from '../../../providers/base.js';

export const PROVIDER_TYPES: readonly ProviderType[] = [
    'signature', 'edi', 'telematics', 'fuel_card',
    'fines', 'marking', 'payment', 'email',
] as const;

export const VALID_STATUSES: readonly ProviderStatus[] = [
    'mock', 'sandbox', 'active', 'disabled', 'error',
] as const;

export const CredentialsCreateSchema = z.object({
    providerType: z.enum(PROVIDER_TYPES as [ProviderType, ...ProviderType[]]),
    providerName: z.string().min(1).max(64),
    credentials: z.record(z.unknown()),
    status: z.enum(VALID_STATUSES as [ProviderStatus, ...ProviderStatus[]]).optional(),
});

export type CredentialsCreatePayload = z.infer<typeof CredentialsCreateSchema>;
