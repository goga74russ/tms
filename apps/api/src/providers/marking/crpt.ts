// ============================================================
// Честный знак (ЦРПТ) — REAL skeleton.
// Public API: https://markirovka.crpt.ru/api-docs
// True endpoint base: https://markirovka.crpt.ru/api/v3
// Auth: ОМС-токен в заголовке clientToken (or Authorization: Bearer).
// ============================================================
import { nowIso, type ProviderHealth } from '../base.js';
import type {
    MarkingCategoryStatus, MarkingCredentials, MarkingProvider, MarkingVerifyResult,
} from './interface.js';

export const CRPT_API_URL = 'https://markirovka.crpt.ru/api/v3';
/** Public verify endpoint for individual codes (does not require token). */
export const CRPT_PUBLIC_VERIFY_URL = 'https://markirovka.crpt.ru/api/v3/true-api/codes/check';

export interface CrptCredentials extends MarkingCredentials {
    omsToken: string;
    organizationInn: string;
}

export class CrptMarkingProvider implements MarkingProvider {
    readonly name = 'crpt';
    readonly providerType = 'marking' as const;
    readonly mode = 'production' as const;

    constructor(private readonly creds: CrptCredentials) { }

    async healthCheck(): Promise<ProviderHealth> {
        return {
            ok: Boolean(this.creds.omsToken && this.creds.organizationInn),
            mode: 'production',
            detail: 'crpt credentials present',
            checkedAt: nowIso(),
        };
    }

    async execute(): Promise<unknown> { return { ok: true }; }

    async verifyCode(_creds: MarkingCredentials, _code: string): Promise<MarkingVerifyResult> {
        // A-P1-26: PUBLIC verify endpoint does not require auth — sending
        // clientToken/Authorization here leaked the OMS token to an endpoint
        // that doesn't need it. NO auth headers below; auth is only attached
        // when calling CRPT_API_URL endpoints like /cises/info.
        //
        // POST {CRPT_PUBLIC_VERIFY_URL}
        //   Headers: Content-Type: application/json   (NO clientToken)
        //   Body: { codes: ['<code>'] }
        // Response: { codes: [{ cis, valid, found, info: { gtin, serial, productName } }] }
        // For full status (in_circulation/sold/withdrawn) use the authenticated
        // path verifyCodeAuthenticated() below.
        // Use httpFetch when wiring up: import { httpFetch } from '../_http.js';
        // const res = await httpFetch(CRPT_PUBLIC_VERIFY_URL, {
        //     method: 'POST',
        //     headers: { 'Content-Type': 'application/json' }, // no auth
        //     body: JSON.stringify({ codes: [code] }),
        // }, { timeoutMs: 8000, retries: 2 });
        // if (!res.ok) throw new Error(`CRPT verify failed: ${res.status}`);
        // const data = await res.json() as { codes: Array<{ cis: string; valid: boolean; found: boolean; info?: any }> };
        // const c = data.codes[0];
        // return { code, valid: c.valid && c.found, gtin: c.info?.gtin, serial: c.info?.serial,
        //          productName: c.info?.productName, status: c.found ? 'in_circulation' : 'unknown' };
        throw new Error('CRPT verifyCode() not yet implemented — awaiting OMS token.');
    }

    async bulkVerify(_creds: MarkingCredentials, _codes: string[]): Promise<MarkingVerifyResult[]> {
        // A-P1-26: same as verifyCode — public endpoint, no clientToken.
        // The endpoint accepts an array of up to 1000 codes.
        // TODO(real-impl).
        throw new Error('CRPT bulkVerify() not yet implemented.');
    }

    // A-P1-26: authenticated endpoints (e.g. POST /cises/info) attach
    // `clientToken: this.creds.omsToken` in their headers. Public endpoints
    // (verifyCode, bulkVerify, getCategoryStatus) MUST NOT — see notes above.

    async getCategoryStatus(_category: string): Promise<MarkingCategoryStatus> {
        // GET {CRPT_API_URL}/categories/{code}/status (public — no auth header)
        // TODO(real-impl).
        throw new Error('CRPT getCategoryStatus() not yet implemented.');
    }
}
