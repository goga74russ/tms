// ============================================================
// РСА (Российский Союз Автостраховщиков) АИС ОСАГО adapter
// skeleton. The public endpoint is dkbm-web.autoins.ru — it is
// captcha-protected, so production integration goes through the
// closed B2B AIS API. Activate by registering creds + flipping
// status to 'active' once РСА keys arrive.
// ============================================================
import { nowIso, type ProviderHealth } from '../base.js';
import type { OsagoCredentials, OsagoProvider, OsagoStatus } from './interface.js';

const RSA_BASE_URL = 'https://dkbm-web.autoins.ru/dkbm-web-1.0';

export class RsaOsagoProvider implements OsagoProvider {
    readonly name = 'rsa';
    readonly mode = 'production' as const;

    async healthCheck(): Promise<ProviderHealth> {
        // TODO(real-rsa): ping a lightweight AIS endpoint when keys arrive.
        return {
            ok: false,
            mode: 'production',
            detail: 'real РСА AIS connection not configured',
            checkedAt: nowIso(),
        };
    }

    async checkStatus(creds: OsagoCredentials, plate: string, vin?: string): Promise<OsagoStatus> {
        // TODO(real-rsa): replace with the actual SOAP/XML call.
        //   POST {RSA_BASE_URL}/policy/check with {licensePlate, vin}
        //   headers: { 'X-Api-Key': creds.apiKey, 'X-Member-Id': creds.memberId }
        //   parse XML → { isActive, dateBegin, dateEnd, insCompany, policyNumber }
        if (!creds.apiKey) {
            throw new Error('РСА: apiKey missing in credentials');
        }
        const _url = `${RSA_BASE_URL}/policy/check?lp=${encodeURIComponent(plate)}${vin ? `&vin=${encodeURIComponent(vin)}` : ''}`;
        // For now, fail fast so callers fall back to mock until the real
        // integration lands.
        throw new Error('РСА AIS adapter is not yet implemented (Round 2A skeleton)');
    }
}

export const rsaOsagoProvider = new RsaOsagoProvider();
