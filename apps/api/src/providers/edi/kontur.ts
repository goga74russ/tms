// ============================================================
// Контур.Диадок is the same product as Diadoc. Some integrators
// reach it through a different brand / Контур.EDI gateway. Treat
// this provider as the corporate EDO entrypoint that goes through
// Контур's umbrella API rather than the diadoc-api host.
// Docs: https://api.kontur.ru/edi/
// ============================================================
import { nowIso, type ProviderHealth } from '../base.js';
import type {
    EdiCallbackEvent, EdiExternalStatus, EdiProvider, EdiSendInput, EdiSendResult,
} from './interface.js';
import { assertValidETrNPayload } from '../../lib/xsd-validator-gate.js';

export const KONTUR_EDI_API_URL = 'https://api.kontur.ru/edi/v1';

export interface KonturEdiCredentials {
    apiKey: string;
    /** Box id for our organization within Контур.Диадок */
    boxId: string;
}

export class KonturEdiProvider implements EdiProvider {
    readonly name = 'kontur';
    readonly providerType = 'edi' as const;
    readonly mode = 'production' as const;

    constructor(private readonly creds: KonturEdiCredentials) { }

    async healthCheck(): Promise<ProviderHealth> {
        return {
            ok: Boolean(this.creds.apiKey && this.creds.boxId),
            mode: 'production',
            detail: 'kontur edi credentials present',
            checkedAt: nowIso(),
        };
    }

    async execute(input: EdiSendInput): Promise<EdiSendResult> {
        return this.sendDocument(input.organizationId, input.documentId, input.payload, input.counterpartyInn);
    }

    async sendDocument(_orgId: string, _documentId: string, payload: string, _counterpartyInn?: string): Promise<EdiSendResult> {
        // Gate: structural ETrN XSD validation. No-op for non-XML payloads.
        assertValidETrNPayload(payload);
        // POST {KONTUR_EDI_API_URL}/messages
        //   Headers: x-kontur-apikey: <apiKey>
        //   Body: { fromBoxId, toInn, attachments: [{ contentBase64, type }] }
        // Response: { messageId, status: 'sent' }
        // TODO(real-impl): wire fetch.
        throw new Error('Kontur EDI sendDocument() not yet implemented — awaiting credentials.');
    }

    async getStatus(_externalId: string): Promise<EdiExternalStatus> {
        // GET {KONTUR_EDI_API_URL}/messages/{externalId}
        return 'sent';
    }

    async handleCallback(payload: Record<string, unknown>): Promise<EdiCallbackEvent> {
        const externalId = String(payload.messageId ?? '');
        const status = (payload.status as EdiExternalStatus | undefined) ?? 'sent';
        return { externalId, status, occurredAt: nowIso(), payload };
    }
}
