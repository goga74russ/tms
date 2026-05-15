// ============================================================
// SBIS sign provider — REAL skeleton.
// Docs: https://saby.ru/help/integration/api/auth
// SBIS uses СБИС.Электронная подпись for cloud signing.
// ============================================================
import { nowIso, type ProviderHealth } from '../base.js';
import type { SignatureInput, SignatureProvider, SignatureResult } from './interface.js';

const SBIS_API_URL = 'https://online.sbis.ru/service/sign/';

export interface SbisSignCredentials {
    appClientId: string;
    appSecret: string;
    /** Tax number for the signing certificate's organization. */
    organizationInn: string;
    sessionToken?: string;
}

export class SbisSignSignatureProvider implements SignatureProvider {
    readonly name = 'sbis_sign';
    readonly providerType = 'signature' as const;
    readonly mode = 'production' as const;

    constructor(private readonly creds: SbisSignCredentials) { }

    async healthCheck(): Promise<ProviderHealth> {
        return {
            ok: Boolean(this.creds.appClientId && this.creds.appSecret),
            mode: 'production',
            detail: 'sbis sign credentials present',
            checkedAt: nowIso(),
        };
    }

    async execute(input: SignatureInput): Promise<SignatureResult> {
        return this.sign(input.documentId, input.payload, input.userId);
    }

    async sign(_documentId: string, _payload: string, _userId: string): Promise<SignatureResult> {
        // Request shape (JSON-RPC 2.0):
        //   POST {SBIS_API_URL}
        //   Body: { jsonrpc: '2.0', method: 'СБИС.Подписать', params: {
        //              Документ: contentBase64, Сертификат: { ИНН: organizationInn } }, id: 1 }
        // Response: { result: { ПодписьBase64, СертификатИнфо } }
        // TODO(real-impl): replace stub with fetch + JSON-RPC call.
        throw new Error('SBIS sign() not yet implemented — awaiting credentials.');
    }

    async verify(_signedXml: string): Promise<boolean> {
        // TODO: real verification via provider API.
        // Until that is wired, surface the gap explicitly — silent `return false`
        // masked failures and led to callers treating valid signatures as invalid.
        throw new Error(`${this.name}.verify() is not implemented yet. Awaiting provider API credentials/sandbox access.`);
    }
}
