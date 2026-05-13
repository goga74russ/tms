// ============================================================
// OSAGO provider interface — РСА АИС ОСАГО.
// Returns insurance status by vehicle plate / VIN.
//
// NOTE: OSAGO is not part of the formal `ProviderType` enum in
// providers/base.ts (Round 1C set is fixed). We keep its own minimal
// adapter contract here. Once the РСА integration ships and the
// type enum is opened up, this can be refolded into the framework.
// ============================================================
import type { ProviderHealth, ProviderMode } from '../base.js';

export interface OsagoStatus {
    valid: boolean;
    expiresAt?: Date;
    insurer?: string;
    policyNumber?: string;
    /** Original raw response for audit. */
    raw?: Record<string, unknown>;
}

export interface OsagoCredentials {
    apiKey?: string;
    /** Some РСА endpoints require a member organization id. */
    memberId?: string;
    user?: string;
    password?: string;
}

export interface OsagoProvider {
    readonly name: string;
    readonly mode: ProviderMode;
    healthCheck(): Promise<ProviderHealth>;
    checkStatus(creds: OsagoCredentials, plate: string, vin?: string): Promise<OsagoStatus>;
}
