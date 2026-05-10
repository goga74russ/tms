// ============================================================
// Такском-Касса — REAL skeleton.
// Docs: https://taxcom.ru/about/news/api-kassa/
// Auth: API key (header `X-Api-Key`).
// ============================================================
import type {
    OfdCredentials, OfdFiscalizeInput, OfdProvider, OfdProviderHealth, OfdReceipt,
} from './interface.js';

export const TAXCOM_KASSA_API = 'https://api-kassa.taxcom.ru/v3';

function nowIso(): string { return new Date().toISOString(); }

export class TaxcomKassaProvider implements OfdProvider {
    readonly name = 'taxcom_kassa';
    readonly mode = 'production' as const;

    constructor(private readonly creds: OfdCredentials) { }

    async healthCheck(): Promise<OfdProviderHealth> {
        return {
            ok: Boolean(this.creds.apiKey),
            mode: 'production',
            detail: 'taxcom-kassa credentials present',
            checkedAt: nowIso(),
        };
    }

    async fiscalize(_input: OfdFiscalizeInput): Promise<OfdReceipt> {
        // POST {TAXCOM_KASSA_API}/cashbox/cheque
        //   Headers: X-Api-Key: <apiKey>, Content-Type: application/json
        //   Body: {
        //     externalId: input.paymentId,
        //     type: 'income',
        //     items: [{ name: input.description, price, quantity: 1, amount, vatType, paymentMethod, paymentObject }],
        //     customer: { email | phone },
        //     taxSystem: input.taxSystem,
        //   }
        // Response: { id, fdNumber, fnNumber, fiscalSign, fiscalUrl }
        // TODO(real-impl): wire fetch.
        throw new Error('Такском-Касса fiscalize() not yet implemented — awaiting credentials.');
    }

    async getReceipt(_externalId: string): Promise<OfdReceipt | null> {
        // GET {TAXCOM_KASSA_API}/cashbox/cheque/{externalId}
        // TODO(real-impl).
        throw new Error('Такском-Касса getReceipt() not yet implemented.');
    }
}
