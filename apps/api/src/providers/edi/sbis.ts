// ============================================================
// SBIS EDI — REAL skeleton.
// Docs: https://saby.ru/help/integration/api/edo
// Uses JSON-RPC over HTTPS.
// ============================================================
import { nowIso, type ProviderHealth } from '../base.js';
import type {
    EdiCallbackEvent, EdiExternalStatus, EdiProvider, EdiSendInput, EdiSendResult,
} from './interface.js';
import { assertValidETrNPayload } from '../../lib/xsd-validator-gate.js';

export const SBIS_EDI_API_URL = 'https://online.sbis.ru/service/edo/';

export interface SbisEdiCredentials {
    appClientId: string;
    appSecret: string;
    sessionToken?: string;
    organizationInn: string;
}

export class SbisEdiProvider implements EdiProvider {
    readonly name = 'sbis';
    readonly providerType = 'edi' as const;
    readonly mode = 'production' as const;

    constructor(private readonly creds: SbisEdiCredentials) { }

    async healthCheck(): Promise<ProviderHealth> {
        return {
            ok: Boolean(this.creds.appClientId && this.creds.appSecret),
            mode: 'production',
            detail: 'sbis edi credentials present',
            checkedAt: nowIso(),
        };
    }

    async execute(input: EdiSendInput): Promise<EdiSendResult> {
        return this.sendDocument(input.organizationId, input.documentId, input.payload, input.counterpartyInn);
    }

    async sendDocument(_orgId: string, _documentId: string, payload: string, _counterpartyInn?: string): Promise<EdiSendResult> {
        // Gate: structural ETrN XSD validation. No-op for non-XML payloads.
        assertValidETrNPayload(payload);
        // JSON-RPC body:
        //   { jsonrpc: '2.0', id: 1, method: 'СБИС.ОтправитьДокумент',
        //     params: { Документ: { ИНН: counterpartyInn, ФайлBase64: payload } } }
        // Response: { result: { Идентификатор: string, Состояние: string } }
        // TODO(real-impl): wire fetch.
        throw new Error('SBIS EDI sendDocument() not yet implemented — awaiting credentials.');
    }

    async getStatus(_externalId: string): Promise<EdiExternalStatus> {
        // method 'СБИС.ПолучитьСостояние' → 'Принят'/'Отклонен'/'Подписан'
        throw new Error('SBIS EDI getStatus() not yet implemented — awaiting credentials.');
    }

    async handleCallback(payload: Record<string, unknown>): Promise<EdiCallbackEvent> {
        const externalId = String(payload.Идентификатор ?? payload.externalId ?? '');
        const sostoianie = String(payload.Состояние ?? '');
        const status: EdiExternalStatus =
            sostoianie === 'Подписан' ? 'signed_by_client' :
            sostoianie === 'Отклонен' ? 'rejected' :
            sostoianie === 'Принят' ? 'delivered' : 'sent';
        return { externalId, status, occurredAt: nowIso(), payload };
    }
}
