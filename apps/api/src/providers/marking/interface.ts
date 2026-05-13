// ============================================================
// Marking provider interface — Честный знак (ЦРПТ).
// ============================================================
import type { ProviderAdapter, ProviderType } from '../base.js';

export interface MarkingVerifyResult {
    code: string;
    valid: boolean;
    productName?: string;
    gtin?: string;
    serial?: string;
    status?: 'in_circulation' | 'sold' | 'withdrawn' | 'unknown';
    category?: string;
    /** Original raw response for audit. */
    raw?: Record<string, unknown>;
}

export interface MarkingCategoryStatus {
    category: string;
    mandatoryFrom?: string;
    description: string;
    /** True if labelling is currently mandatory. */
    mandatory: boolean;
}

export interface MarkingCredentials {
    apiKey?: string;
    /** OMS token for the operator's личный кабинет ЦРПТ. */
    omsToken?: string;
    /** Organization INN registered in CRPT. */
    organizationInn?: string;
}

export interface MarkingProvider extends ProviderAdapter {
    readonly providerType: Extract<ProviderType, 'marking'>;
    verifyCode(creds: MarkingCredentials, code: string): Promise<MarkingVerifyResult>;
    bulkVerify(creds: MarkingCredentials, codes: string[]): Promise<MarkingVerifyResult[]>;
    getCategoryStatus(category: string): Promise<MarkingCategoryStatus>;
}
