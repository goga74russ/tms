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
        // TODO: real verification via provider API.
        // Until that is wired, surface the gap explicitly — silent `return false`
        // masked failures and led to callers treating valid signatures as invalid.
        throw new Error(`${this.name}.verify() is not implemented yet. Awaiting provider API credentials/sandbox access.`);
    }
}
