// ============================================================
// Round 1C — Signature provider interface
// ============================================================
import type { ProviderAdapter, ProviderType } from '../base.js';

export interface SignatureCertInfo {
    subject: string;
    issuer: string;
    serial: string;
    validFrom: string;
    validTo: string;
}

export interface SignatureResult {
    /** Signed XML envelope (XAdES / CMS attached). */
    signedXml: string;
    certInfo: SignatureCertInfo;
    /** For deeplink-driven flows (e.g. Госключ) — pending callback. */
    pending?: boolean;
    deeplink?: string;
    externalId?: string;
}

export interface SignatureInput {
    documentId: string;
    payload: string; // raw XML or base64 of the doc to sign
    userId: string;
    callbackUrl?: string;
}

export interface SignatureProvider extends ProviderAdapter<SignatureInput, SignatureResult> {
    readonly providerType: Extract<ProviderType, 'signature'>;
    sign(documentId: string, payload: string, userId: string, callbackUrl?: string): Promise<SignatureResult>;
    verify(signedXml: string): Promise<boolean>;
}
