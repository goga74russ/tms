// ============================================================
// Платформа ОФД — REAL skeleton.
// Docs: https://platformaofd.ru/api/v1/
// Auth: Bearer <apiKey> issued in personal cabinet.
// ============================================================
import { nanoid } from 'nanoid';
import type {
    OfdCredentials, OfdFiscalizeInput, OfdProvider, OfdProviderHealth, OfdReceipt,
} from './interface.js';

export const PLATFORMA_OFD_API = 'https://platformaofd.ru/api/v1';

function nowIso(): string { return new Date().toISOString(); }

export class PlatformaOfdProvider implements OfdProvider {
    readonly name = 'platforma_ofd';
    readonly mode = 'production' as const;

    constructor(private readonly creds: OfdCredentials) { }

    async healthCheck(): Promise<OfdProviderHealth> {
        return {
            ok: Boolean(this.creds.apiKey && this.creds.inn),
            mode: 'production',
            detail: 'platforma-ofd credentials present',
            checkedAt: nowIso(),
        };
    }

    async fiscalize(_input: OfdFiscalizeInput): Promise<OfdReceipt> {
        // POST {PLATFORMA_OFD_API}/receipts
        //   Headers: Authorization: Bearer <apiKey>, Content-Type: application/json,
        //            Idempotency-Key: <uuid>
        //   Body: {
        //     externalId: input.paymentId,
        //     groupCode: this.creds.groupCode,
        //     content: {
        //       type: 'income',
        //       taxationSystem: input.taxSystem ?? 'usnIncome',
        //       items: [{
        //         name: input.description,
        //         price: input.amountKopecks / 100,
        //         quantity: 1,
        //         amount: input.amountKopecks / 100,
        //         vat: { type: input.vatCode ?? 'none' },
        //         paymentMethod: 'fullPayment',
        //         paymentObject: 'service',
        //       }],
        //       customer: input.customerEmail ? { email: input.customerEmail } : { phone: input.customerPhone },
        //     }
        //   }
        // Response: { externalId, receiptUrl, fnNumber, fiscalSign, ... }
        // TODO(real-impl): wire fetch.
        void nanoid;
        throw new Error('Платформа ОФД fiscalize() not yet implemented — awaiting credentials.');
    }

    async getReceipt(_externalId: string): Promise<OfdReceipt | null> {
        // GET {PLATFORMA_OFD_API}/receipts/{externalId}
        // Headers: Authorization: Bearer <apiKey>
        // TODO(real-impl).
        throw new Error('Платформа ОФД getReceipt() not yet implemented.');
    }
}
