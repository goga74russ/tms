// ============================================================
// Mock ОФД provider — generates a fake fiscal receipt.
// Useful in dev/free-box installations where 54-ФЗ fiscalization
// is not required (B2B-only).
// ============================================================
import { nanoid } from 'nanoid';
import type {
    OfdCredentials, OfdFiscalizeInput, OfdProvider, OfdProviderHealth, OfdReceipt,
} from './interface.js';

const receipts = new Map<string, OfdReceipt>();

function nowIso(): string { return new Date().toISOString(); }

export class MockOfdProvider implements OfdProvider {
    readonly name = 'mock';
    readonly mode = 'mock' as const;

    constructor(_creds: OfdCredentials = {}) { /* mock: no creds needed */ }

    async healthCheck(): Promise<OfdProviderHealth> {
        return { ok: true, mode: 'mock', detail: 'mock OFD provider', checkedAt: nowIso() };
    }

    async fiscalize(input: OfdFiscalizeInput): Promise<OfdReceipt> {
        const externalId = `mock-fd-${nanoid(10)}`;
        const fnNumber = `9999078902${String(Math.floor(Math.random() * 1e6)).padStart(6, '0')}`;
        const receipt: OfdReceipt = {
            externalId,
            receiptUrl: `https://ofd.example.com/receipt/${externalId}`,
            fnNumber,
            fiscalSign: String(Math.floor(Math.random() * 1e10)).padStart(10, '0'),
            fiscalizedAt: nowIso(),
            raw: {
                paymentId: input.paymentId,
                amountKopecks: input.amountKopecks,
                taxSystem: input.taxSystem ?? 'usn_income',
                vatCode: input.vatCode ?? 'vat_none',
            },
        };
        receipts.set(externalId, receipt);
        return receipt;
    }

    async getReceipt(externalId: string): Promise<OfdReceipt | null> {
        return receipts.get(externalId) ?? null;
    }
}

export const mockOfdProvider = new MockOfdProvider();
