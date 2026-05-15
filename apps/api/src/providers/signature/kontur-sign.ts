// ============================================================
// Контур.Подпись (Kontur Sign) — REAL skeleton.
// Docs: https://api.kontur.ru/sign/
// Used for cloud КЭП on Mac/Linux without local crypto pro.
// ============================================================
import { nowIso, type ProviderHealth } from '../base.js';
import type { SignatureInput, SignatureProvider, SignatureResult } from './interface.js';

const KONTUR_SIGN_API_URL = 'https://api.kontur.ru/sign/v2';

export interface KonturSignCredentials {
    apiKey: string;
    /** UUID of certificate registered in Контур.Подпись. */
    certificateId: string;
}

export class KonturSignSignatureProvider implements SignatureProvider {
    readonly name = 'kontur_sign';
    readonly providerType = 'signature' as const;
    readonly mode = 'production' as const;

    constructor(private readonly creds: KonturSignCredentials) { }

    async healthCheck(): Promise<ProviderHealth> {
        return {
            ok: Boolean(this.creds.apiKey && this.creds.certificateId),
            mode: 'production',
            detail: 'kontur sign credentials present',
            checkedAt: nowIso(),
        };
    }

    async execute(input: SignatureInput): Promise<SignatureResult> {
        return this.sign(input.documentId, input.payload, input.userId);
    }

    async sign(_documentId: string, _payload: string, _userId: string): Promise<SignatureResult> {
        // Request shape:
        //   POST {KONTUR_SIGN_API_URL}/signatures
        //   Headers: x-kontur-apikey: <apiKey>; Content-Type: application/json
        //   Body: { certificateId, contentBase64, signatureType: 'CAdES-BES' }
        // Response shape:
        //   { signatureBase64: string, certificate: { subject, issuer, serial, validFrom, validTo } }
        // TODO(real-impl): wire fetch.
        // const res = await fetch(`${KONTUR_SIGN_API_URL}/signatures`, {
        //     method: 'POST',
        //     headers: { 'x-kontur-apikey': this.creds.apiKey, 'Content-Type': 'application/json' },
        //     body: JSON.stringify({
        //         certificateId: this.creds.certificateId,
        //         contentBase64: Buffer.from(payload).toString('base64'),
        //         signatureType: 'CAdES-BES',
        //     }),
        // });
        // if (!res.ok) throw new Error(`Kontur Sign failed: ${res.status}`);
        throw new Error('Kontur Sign sign() not yet implemented — awaiting API key.');
    }

    async verify(_signedXml: string): Promise<boolean> {
        // TODO: real verification via provider API.
        // Until that is wired, surface the gap explicitly — silent `return false`
        // masked failures and led to callers treating valid signatures as invalid.
        throw new Error(`${this.name}.verify() is not implemented yet. Awaiting provider API credentials/sandbox access.`);
    }
}
