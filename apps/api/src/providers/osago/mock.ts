// ============================================================
// Mock OSAGO provider — deterministic by plate hash.
// 90% valid, 10% expired so flows that depend on a "no policy"
// branch can be exercised in tests/demos without external creds.
// ============================================================
import { nowIso, type ProviderHealth } from '../base.js';
import type { OsagoCredentials, OsagoProvider, OsagoStatus } from './interface.js';

function hashCode(s: string): number {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) & 0x7fffffff;
    return h;
}

const INSURERS = ['Ингосстрах', 'РЕСО-Гарантия', 'РОСГОССТРАХ', 'ВСК', 'СОГАЗ', 'АльфаСтрахование'];

export class MockOsagoProvider implements OsagoProvider {
    readonly name = 'mock';
    readonly mode = 'mock' as const;

    async healthCheck(): Promise<ProviderHealth> {
        return { ok: true, mode: 'mock', detail: 'mock osago provider', checkedAt: nowIso() };
    }

    async checkStatus(_creds: OsagoCredentials, plate: string, vin?: string): Promise<OsagoStatus> {
        const h = hashCode(`${plate}|${vin ?? ''}`);
        const expired = h % 10 === 0;
        const insurer = INSURERS[h % INSURERS.length]!;
        // Valid policies expire 1..365 days into the future; expired ones
        // 1..60 days into the past, so demo dashboards show colour bands.
        const offsetDays = expired ? -((h % 60) + 1) : (h % 365) + 1;
        const expiresAt = new Date(Date.now() + offsetDays * 86400000);
        return {
            valid: !expired,
            expiresAt,
            insurer,
            policyNumber: `XXX${(h % 9000000 + 1000000).toString()}`,
            raw: { source: 'mock', plate, vin },
        };
    }
}

export const mockOsagoProvider = new MockOsagoProvider();
