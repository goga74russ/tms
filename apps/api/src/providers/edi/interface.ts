// ============================================================
// EDI provider interface — Diadoc / SBIS / Kontur EDO.
// ============================================================
import type { ProviderAdapter, ProviderType } from '../base.js';

export type EdiExternalStatus =
    | 'sent'
    | 'delivered'
    | 'signed_by_carrier'
    | 'signed_by_client'
    | 'rejected';

export interface EdiSendResult {
    externalId: string;
    status: EdiExternalStatus;
}

export interface EdiCallbackEvent {
    externalId: string;
    status: EdiExternalStatus;
    occurredAt: string;
    payload?: Record<string, unknown>;
}

export interface EdiSendInput {
    organizationId: string;
    documentId: string;
    payload: string; // base64 of doc content (PDF/XML)
    /** ИНН of the counterparty so the provider can resolve their box-id. */
    counterpartyInn?: string;
}

export interface EdiProvider extends ProviderAdapter<EdiSendInput, EdiSendResult> {
    readonly providerType: Extract<ProviderType, 'edi'>;
    sendDocument(orgId: string, documentId: string, payload: string, counterpartyInn?: string): Promise<EdiSendResult>;
    getStatus(externalId: string): Promise<EdiExternalStatus>;
    handleCallback(payload: Record<string, unknown>): Promise<EdiCallbackEvent>;
}
