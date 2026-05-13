// ============================================================
// Mock Честный знак provider — generates plausible responses.
// ============================================================
import { nowIso, type ProviderHealth } from '../base.js';
import type {
    MarkingCategoryStatus, MarkingCredentials, MarkingProvider, MarkingVerifyResult,
} from './interface.js';

const CATEGORY_SCHEDULE: Record<string, MarkingCategoryStatus> = {
    milk: { category: 'milk', mandatoryFrom: '2021-06-01', description: 'Молочная продукция', mandatory: true },
    water: { category: 'water', mandatoryFrom: '2022-12-01', description: 'Бутилированная вода', mandatory: true },
    tobacco: { category: 'tobacco', mandatoryFrom: '2019-07-01', description: 'Табак', mandatory: true },
    shoes: { category: 'shoes', mandatoryFrom: '2020-07-01', description: 'Обувь', mandatory: true },
    perfume: { category: 'perfume', mandatoryFrom: '2020-10-01', description: 'Парфюм', mandatory: true },
    beer: { category: 'beer', mandatoryFrom: '2024-04-01', description: 'Пивная продукция', mandatory: true },
};

function hashCode(s: string): number {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) & 0x7fffffff;
    return h;
}

export class MockMarkingProvider implements MarkingProvider {
    readonly name = 'mock';
    readonly providerType = 'marking' as const;
    readonly mode = 'mock' as const;

    async healthCheck(): Promise<ProviderHealth> {
        return { ok: true, mode: 'mock', detail: 'mock marking provider', checkedAt: nowIso() };
    }

    async execute(): Promise<unknown> { return { ok: true }; }

    async verifyCode(_creds: MarkingCredentials, code: string): Promise<MarkingVerifyResult> {
        // 90% valid, 10% invalid by hash bucket.
        const h = hashCode(code);
        const valid = h % 10 !== 0;
        const cats = Object.keys(CATEGORY_SCHEDULE);
        const category = cats[h % cats.length]!;
        // A-P2: real ЦРПТ returns no productName when the code is not valid
        // (the cis simply isn't in their registry). Match that shape so
        // downstream UI doesn't render a fake product name for invalid codes.
        return {
            code,
            valid,
            productName: valid ? `Демо-товар ${code.slice(0, 8)}` : undefined,
            gtin: code.slice(0, 14),
            serial: code.slice(14, 27),
            status: valid ? 'in_circulation' : 'unknown',
            category,
        };
    }

    async bulkVerify(creds: MarkingCredentials, codes: string[]): Promise<MarkingVerifyResult[]> {
        return Promise.all(codes.map(c => this.verifyCode(creds, c)));
    }

    async getCategoryStatus(category: string): Promise<MarkingCategoryStatus> {
        return CATEGORY_SCHEDULE[category] ?? {
            category,
            description: 'Неизвестная категория',
            mandatory: false,
        };
    }
}

export const mockMarkingProvider = new MockMarkingProvider();
