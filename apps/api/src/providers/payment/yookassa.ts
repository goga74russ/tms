// ============================================================
// ЮKassa (Яндекс.Касса) — REAL skeleton. РФ default payment provider.
// Docs: https://yookassa.ru/developers/api
// Auth: Basic auth — base64(shopId:secretKey).
// ============================================================
import { nanoid } from 'nanoid';
import { nowIso, type ProviderHealth } from '../base.js';
import type {
    PaymentCreateInput, PaymentProvider, PaymentRefundResult, PaymentResult, PaymentStatus,
} from './interface.js';

export const YOOKASSA_API_URL = 'https://api.yookassa.ru/v3';

export interface YookassaCredentials {
    shopId: string;
    secretKey: string;
}

function mapStatus(s: string): PaymentStatus {
    switch (s) {
        case 'pending': return 'pending';
        case 'waiting_for_capture': return 'waiting_for_capture';
        case 'succeeded': return 'succeeded';
        case 'canceled': return 'canceled';
        case 'refunded': return 'refunded';
        default: return 'pending';
    }
}

export class YookassaPaymentProvider implements PaymentProvider {
    readonly name = 'yookassa';
    readonly providerType = 'payment' as const;
    readonly mode = 'production' as const;

    constructor(private readonly creds: YookassaCredentials) { }

    private get authHeader(): string {
        return `Basic ${Buffer.from(`${this.creds.shopId}:${this.creds.secretKey}`).toString('base64')}`;
    }

    async healthCheck(): Promise<ProviderHealth> {
        return {
            ok: Boolean(this.creds.shopId && this.creds.secretKey),
            mode: 'production',
            detail: 'yookassa credentials present',
            checkedAt: nowIso(),
        };
    }

    async execute(input: PaymentCreateInput): Promise<PaymentResult> {
        return this.createPayment(input);
    }

    async createPayment(_input: PaymentCreateInput): Promise<PaymentResult> {
        // POST {YOOKASSA_API_URL}/payments
        //   Headers: Authorization: <authHeader>, Idempotence-Key: <uuid>, Content-Type: application/json
        //   Body: {
        //     amount: { value: '100.00', currency: 'RUB' },
        //     capture: true,
        //     confirmation: { type: 'redirect', return_url: input.returnUrl },
        //     description: input.description,
        //     metadata: { orderId: input.orderId },
        //     receipt: input.receipt ? {
        //       customer: input.receipt,
        //       items: [{ description, quantity: '1', amount: { value, currency: 'RUB' }, vat_code: 1 }]
        //     } : undefined
        //   }
        // Response: { id, status, confirmation: { confirmation_url }, ... }
        // TODO(real-impl): wire fetch.
        // const idempotenceKey = nanoid();
        // const res = await fetch(`${YOOKASSA_API_URL}/payments`, {
        //     method: 'POST',
        //     headers: {
        //         'Authorization': this.authHeader,
        //         'Idempotence-Key': idempotenceKey,
        //         'Content-Type': 'application/json',
        //     },
        //     body: JSON.stringify({
        //         amount: { value: input.amountRub.toFixed(2), currency: input.currency ?? 'RUB' },
        //         capture: true,
        //         confirmation: { type: 'redirect', return_url: input.returnUrl },
        //         description: input.description,
        //         metadata: { orderId: input.orderId },
        //     }),
        // });
        // if (!res.ok) throw new Error(`ЮKassa create payment failed: ${res.status} ${await res.text()}`);
        // const data = await res.json() as { id: string; status: string; confirmation?: { confirmation_url?: string } };
        // return {
        //     externalId: data.id,
        //     status: mapStatus(data.status),
        //     confirmationUrl: data.confirmation?.confirmation_url,
        //     raw: data as Record<string, unknown>,
        // };
        // Idempotence key reserved for real implementation:
        void nanoid();
        void mapStatus;
        throw new Error('ЮKassa createPayment() not yet implemented — awaiting credentials.');
    }

    async getPayment(_externalId: string): Promise<PaymentResult> {
        // GET {YOOKASSA_API_URL}/payments/{externalId}
        // Headers: Authorization: <authHeader>
        // TODO(real-impl).
        throw new Error('ЮKassa getPayment() not yet implemented.');
    }

    async refund(_externalId: string, _amountRub?: number): Promise<PaymentRefundResult> {
        // POST {YOOKASSA_API_URL}/refunds
        //   Headers: Authorization, Idempotence-Key, Content-Type
        //   Body: { payment_id: externalId, amount: { value, currency: 'RUB' } }
        // Response: { id, status, payment_id, amount: { value }, ... }
        // TODO(real-impl).
        throw new Error('ЮKassa refund() not yet implemented.');
    }
}
