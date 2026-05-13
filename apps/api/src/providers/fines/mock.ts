// ============================================================
// Mock fines provider — deterministic, plate-derived.
// ============================================================
import { nowIso, type ProviderHealth } from '../base.js';
import type {
    FineLookupResult, FinesCredentials, FinesProvider,
} from './interface.js';

function hashCode(s: string): number {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) & 0x7fffffff;
    return h;
}

const ARTICLES = [
    { code: '12.9 ч.2', desc: 'Превышение скорости 20–40 км/ч', amount: 500 },
    { code: '12.9 ч.3', desc: 'Превышение скорости 40–60 км/ч', amount: 1500 },
    { code: '12.16 ч.4', desc: 'Несоблюдение требований дорожных знаков', amount: 1000 },
    { code: '12.19 ч.4', desc: 'Парковка в неположенном месте', amount: 2500 },
    { code: '12.21 ч.1', desc: 'Перевозка крупногабаритного груза без разрешения', amount: 5000 },
];

export class MockFinesProvider implements FinesProvider {
    readonly name = 'mock';
    readonly providerType = 'fines' as const;
    readonly mode = 'mock' as const;

    async healthCheck(): Promise<ProviderHealth> {
        return { ok: true, mode: 'mock', detail: 'mock fines provider', checkedAt: nowIso() };
    }

    async execute(): Promise<unknown> { return { ok: true }; }

    async lookupByPlate(_creds: FinesCredentials, plate: string, vin?: string): Promise<FineLookupResult[]> {
        const h = hashCode(plate);
        const count = h % 4; // 0..3
        const out: FineLookupResult[] = [];
        for (let i = 0; i < count; i++) {
            const a = ARTICLES[(h + i) % ARTICLES.length]!;
            const issued = new Date(Date.now() - ((h + i * 13) % 60) * 86400000);
            out.push({
                source: 'mock',
                externalId: `MOCK-${plate}-${i}-${a.code}`,
                issuedAt: issued.toISOString(),
                article: a.code,
                description: a.desc,
                amountRub: a.amount,
                discountUntil: new Date(issued.getTime() + 20 * 86400000).toISOString(),
                paymentDeadline: new Date(issued.getTime() + 60 * 86400000).toISOString(),
                vehicleInfo: { plate, vin },
            });
        }
        return out;
    }

    async lookupByDriverPassport(_creds: FinesCredentials, passport: string): Promise<FineLookupResult[]> {
        return this.lookupByPlate(_creds, `DRV-${passport.slice(-4)}`);
    }
}

export const mockFinesProvider = new MockFinesProvider();
