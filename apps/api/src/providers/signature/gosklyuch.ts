// ============================================================
// Госключ (Госуслуги) signature provider — REAL skeleton.
// Documentation: https://www.gosuslugi.ru/help/faq/gosklyuch
// Flow:
//   1. POST /sign-request → returns externalId + deeplink (gosuslugiv://...)
//   2. User opens deeplink in Госключ mobile app, signs.
//   3. Госключ POSTs to our callbackUrl with signed XML.
//   4. We retrieve the signed envelope by externalId.
// ============================================================
import { nowIso, type ProviderHealth } from '../base.js';
import type { SignatureInput, SignatureProvider, SignatureResult } from './interface.js';

const GOSKLYUCH_API_URL = 'https://api.gosuslugi.ru/gosklyuch/v1';
const GOSKLYUCH_DEEPLINK_SCHEME = 'gosuslugiv://signature';

export interface GosklyuchCredentials {
    clientId: string;
    clientSecret: string;
    organizationOgrn: string;
    /** Token obtained from gosuslugi.ru OAuth flow. */
    accessToken?: string;
}

export class GosklyuchSignatureProvider implements SignatureProvider {
    readonly name = 'gosklyuch';
    readonly providerType = 'signature' as const;
    readonly mode = 'production' as const;

    constructor(private readonly creds: GosklyuchCredentials) { }

    async healthCheck(): Promise<ProviderHealth> {
        // TODO: GET /health on Госключ API once token is available.
        const ok = Boolean(this.creds.clientId && this.creds.clientSecret);
        return {
            ok,
            mode: 'production',
            detail: ok ? 'credentials present (no live ping yet)' : 'missing clientId/secret',
            checkedAt: nowIso(),
        };
    }

    async execute(input: SignatureInput): Promise<SignatureResult> {
        return this.sign(input.documentId, input.payload, input.userId, input.callbackUrl);
    }

    async sign(documentId: string, payload: string, _userId: string, callbackUrl?: string): Promise<SignatureResult> {
        // Request shape:
        //   POST {GOSKLYUCH_API_URL}/sign-request
        //   Authorization: Bearer <accessToken>
        //   { documentId, contentBase64, callbackUrl, ogrn }
        // Response shape:
        //   { externalId: string, deeplink: string, expiresAt: string }
        // TODO(real-impl): replace stub below with actual fetch when the API
        //                  contract is confirmed and a sandbox account exists.
        const externalId = `gk-${documentId.slice(0, 8)}-${Date.now()}`;
        const deeplink = `${GOSKLYUCH_DEEPLINK_SCHEME}?docId=${encodeURIComponent(documentId)}`
            + `&extId=${encodeURIComponent(externalId)}`
            + (callbackUrl ? `&callback=${encodeURIComponent(callbackUrl)}` : '');

        // Use httpFetch when wiring up: import { httpFetch } from '../_http.js';
        // const res = await httpFetch(`${GOSKLYUCH_API_URL}/sign-request`, {
        //     method: 'POST',
        //     headers: {
        //         'Authorization': `Bearer ${this.creds.accessToken ?? ''}`,
        //         'Content-Type': 'application/json',
        //     },
        //     body: JSON.stringify({
        //         documentId,
        //         contentBase64: Buffer.from(payload).toString('base64'),
        //         callbackUrl,
        //         ogrn: this.creds.organizationOgrn,
        //     }),
        // }, { timeoutMs: 15000, retries: 2 });
        // if (!res.ok) throw new Error(`Госключ sign-request failed: ${res.status}`);
        // const data = await res.json() as { externalId: string; deeplink: string };

        return {
            signedXml: '',
            certInfo: { subject: '', issuer: '', serial: '', validFrom: '', validTo: '' },
            pending: true,
            deeplink,
            externalId,
        };
    }

    async verify(_signedXml: string): Promise<boolean> {
        // TODO: POST /verify with the signed envelope; Госключ returns
        //       { valid: boolean, certInfo: {...}, errors?: string[] }.
        return false;
    }

    /**
     * Called by our callback handler once Госключ delivers the signed XML.
     * Skeleton — wire to the route that receives Госключ's POST.
     */
    async retrieveSignedDocument(externalId: string): Promise<SignatureResult> {
        // TODO: GET {GOSKLYUCH_API_URL}/sign-request/{externalId}/result
        //       headers: Authorization: Bearer <accessToken>
        //       response: { signedXml: string, cert: { subject, issuer, serial, ... } }
        throw new Error(`Госключ retrieveSignedDocument not yet implemented (extId=${externalId})`);
    }
}
