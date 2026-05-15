// ============================================================
// Diadoc EDI provider — REAL skeleton.
// Docs: https://api-docs.diadoc.ru
// Auth: x-api-client-id + Authorization: DiadocAuth ddauth_api_client_id=<id>,...
// ============================================================
import { nowIso, type ProviderHealth } from '../base.js';
import type {
    EdiCallbackEvent, EdiExternalStatus, EdiProvider, EdiSendInput, EdiSendResult,
} from './interface.js';
import { assertValidETrNPayload } from '../../lib/xsd-validator-gate.js';

export const DIADOC_API_URL = 'https://diadoc-api.kontur.ru';

export interface DiadocCredentials {
    apiClientId: string;
    /** Авторизационный токен пользователя (из /Authenticate). */
    authToken: string;
    /** Идентификатор ящика отправителя в Диадоке. */
    boxId: string;
}

export class DiadocEdiProvider implements EdiProvider {
    readonly name = 'diadoc';
    readonly providerType = 'edi' as const;
    readonly mode = 'production' as const;

    constructor(private readonly creds: DiadocCredentials) { }

    async healthCheck(): Promise<ProviderHealth> {
        return {
            ok: Boolean(this.creds.apiClientId && this.creds.authToken && this.creds.boxId),
            mode: 'production',
            detail: 'diadoc credentials present',
            checkedAt: nowIso(),
        };
    }

    async execute(input: EdiSendInput): Promise<EdiSendResult> {
        return this.sendDocument(input.organizationId, input.documentId, input.payload, input.counterpartyInn);
    }

    async sendDocument(_orgId: string, _documentId: string, payload: string, _counterpartyInn?: string): Promise<EdiSendResult> {
        // Gate: structural ETrN XSD validation. No-op for non-XML payloads.
        assertValidETrNPayload(payload);
        // Diadoc message protocol:
        //   POST {DIADOC_API_URL}/V3/PostMessage
        //   Headers:
        //     Authorization: DiadocAuth ddauth_api_client_id=<apiClientId>, ddauth_token=<authToken>
        //     Content-Type: application/protobuf  (Diadoc uses protobuf; JSON shim available via /V3/PostMessageJson)
        //   Body (JSON shim): {
        //     FromBoxId: boxId,
        //     ToBoxId: <resolved by counterparty INN>,
        //     IsDraft: false,
        //     SignedContent: { Content: '<base64 payload>' },
        //     DocumentAttachments: [{ Type: 'XmlTorg12', SignedContent: { Content: '<base64>' } }]
        //   }
        // Response: { MessageId: string, EntityId: string }
        // TODO(real-impl): wire fetch + protobuf or JSON shim once ящик id is configured.
        // Use httpFetch when wiring up: import { httpFetch } from '../_http.js';
        // const url = `${DIADOC_API_URL}/V3/PostMessageJson`;
        // const res = await httpFetch(url, {
        //     method: 'POST',
        //     headers: {
        //         'Authorization': `DiadocAuth ddauth_api_client_id=${this.creds.apiClientId}, ddauth_token=${this.creds.authToken}`,
        //         'Content-Type': 'application/json',
        //     },
        //     body: JSON.stringify({
        //         FromBoxId: this.creds.boxId,
        //         ToBoxId: '', // resolved via /V2/GetOrganizationsByInnList
        //         IsDraft: false,
        //         DocumentAttachments: [{ Type: 'XmlTorg12', SignedContent: { Content: payload } }],
        //     }),
        // }, { timeoutMs: 20000, retries: 2 });
        // if (!res.ok) throw new Error(`Diadoc PostMessage failed: ${res.status}`);
        // const data = await res.json() as { MessageId: string; EntityId: string };
        // return { externalId: data.MessageId, status: 'sent' };
        throw new Error('Diadoc sendDocument() not yet implemented — awaiting credentials.');
    }

    async getStatus(_externalId: string): Promise<EdiExternalStatus> {
        // GET {DIADOC_API_URL}/V3/GetMessage?boxId=<>&messageId=<externalId>
        // → MessageStatus enum (Sent, Delivered, RecipientSigned, Rejected, …)
        // TODO: map Diadoc MessageStatus → our EdiExternalStatus.
        return 'sent';
    }

    async handleCallback(payload: Record<string, unknown>): Promise<EdiCallbackEvent> {
        // Diadoc pushes webhook events via configured push URL — see admin panel
        // payload schema: { messageId, eventType: 'Sign'|'Reject'|'Receive', ... }
        const externalId = String(payload.messageId ?? '');
        const eventType = String(payload.eventType ?? '');
        const status: EdiExternalStatus =
            eventType === 'Sign' ? 'signed_by_client' :
            eventType === 'Reject' ? 'rejected' :
            eventType === 'Receive' ? 'delivered' : 'sent';
        return { externalId, status, occurredAt: nowIso(), payload };
    }
}
