// ============================================================
// CAdES plugin — local КЭП via КриптоПро / RuToken
// browser-side; server only stores results.
// Docs: https://docs.cryptopro.ru/cades/plugin
// ============================================================
import { nowIso, type ProviderHealth } from '../base.js';
import type { SignatureInput, SignatureProvider, SignatureResult } from './interface.js';

/**
 * On the server side this provider just verifies the envelope the
 * frontend produced via cadesplugin_api. The actual signing happens
 * in-browser. We expose verify() against gosuslugi.ru's verification
 * service or local crypto-pro server-side verify-tool.
 */
export const CADES_VERIFY_URL = 'https://gu.cryptopro.ru/verify-api';

export interface CadespluginCredentials {
    /** Optional: server-side cryptopro CSP endpoint, only used by verify(). */
    serverVerifyUrl?: string;
    /** Optional API key for cryptopro hosted verify service. */
    apiKey?: string;
}

export class CadespluginSignatureProvider implements SignatureProvider {
    readonly name = 'cadesplugin';
    readonly providerType = 'signature' as const;
    readonly mode = 'production' as const;

    constructor(private readonly creds: CadespluginCredentials) { }

    async healthCheck(): Promise<ProviderHealth> {
        return {
            ok: true,
            mode: 'production',
            detail: 'cadesplugin signs in-browser; server only verifies',
            checkedAt: nowIso(),
        };
    }

    async execute(input: SignatureInput): Promise<SignatureResult> {
        return this.sign(input.documentId, input.payload, input.userId);
    }

    async sign(_documentId: string, _payload: string, _userId: string): Promise<SignatureResult> {
        // Server CANNOT sign with CAdES plugin — it is purely client-side.
        // The frontend must call cadesplugin_api and POST the signed envelope
        // back to our /sign-callback. We only persist & verify here.
        throw new Error('cadesplugin: server-side sign() unsupported. Browser must produce the signature.');
    }

    async verify(_signedXml: string): Promise<boolean> {
        // Request shape:
        //   POST {serverVerifyUrl ?? CADES_VERIFY_URL}/verify
        //   Body: { signatureBase64, contentBase64 }
        // Response: { valid: boolean, certInfo: {...} }
        // TODO(real-impl): wire fetch — endpoint depends on the deployment
        //                  (cryptopro server, contour, or gov verify endpoint).
        // const url = `${this.creds.serverVerifyUrl ?? CADES_VERIFY_URL}/verify`;
        // const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json',
        //     ...(this.creds.apiKey ? { 'X-Api-Key': this.creds.apiKey } : {}) },
        //     body: JSON.stringify({ signedXml }) });
        // if (!res.ok) return false;
        // const data = await res.json() as { valid: boolean };
        // return data.valid;
        return false;
    }
}
