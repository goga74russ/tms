// ============================================================
// ЮKassa (Яндекс.Касса) — REAL skeleton. РФ default payment provider.
// Docs: https://yookassa.ru/developers/api
// Auth: Basic auth — base64(shopId:secretKey).
// ============================================================
import crypto from 'node:crypto';
import { nowIso, type ProviderHealth } from '../base.js';
import type {
    PaymentCreateInput, PaymentProvider, PaymentRefundResult, PaymentResult, PaymentStatus,
} from './interface.js';

// A-P1-25: ЮKassa Idempotence-Key must be stable across retries so that the
// same logical request (e.g. same orderId) maps to the same Yookassa payment.
// Using a random nanoid() per call would create duplicate payments whenever
// our caller retries on a transient network error. We derive the key from the
// orderId / paymentId for stability; fall back to a sha256 of the payload so
// even unstructured retries collapse onto the same key.
function makeIdempotencyKey(prefix: string, payload: unknown, scope?: string): string {
    const obj = (payload ?? {}) as Record<string, unknown>;
    const id = (obj.orderId as string | undefined)
        ?? (obj.paymentId as string | undefined)
        ?? crypto.createHash('sha256').update(JSON.stringify(payload ?? {})).digest('hex').slice(0, 16);
    return scope ? `tms-${prefix}-${id}:${scope}` : `tms-${prefix}-${id}`;
}

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

    async createPayment(input: PaymentCreateInput): Promise<PaymentResult> {
        // POST {YOOKASSA_API_URL}/payments
        //   Headers: Authorization: <authHeader>, Idempotence-Key: <stable>, Content-Type: application/json
        //   Body: { amount, capture, confirmation, description, metadata, receipt? }
        // Response: { id, status, confirmation: { confirmation_url }, ... }
        //
        // A-P1-25: Idempotence-Key is derived from orderId so retries hit the
        // same Yookassa transaction instead of creating duplicates.
        const _idempotenceKey = makeIdempotencyKey('create', input);
        // TODO(real-impl): wire fetch using _idempotenceKey above.
        // const res = await fetch(`${YOOKASSA_API_URL}/payments`, {
        //     method: 'POST',
        //     headers: {
        //         'Authorization': this.authHeader,
        //         'Idempotence-Key': _idempotenceKey,
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
        void _idempotenceKey;
        void mapStatus;
        throw new Error('ЮKassa createPayment() not yet implemented — awaiting credentials.');
    }

    async getPayment(_externalId: string): Promise<PaymentResult> {
        // GET {YOOKASSA_API_URL}/payments/{externalId}
        // Headers: Authorization: <authHeader>
        // TODO(real-impl).
        throw new Error('ЮKassa getPayment() not yet implemented.');
    }

    async refund(externalId: string, _amountRub?: number): Promise<PaymentRefundResult> {
        // POST {YOOKASSA_API_URL}/refunds
        //   Headers: Authorization, Idempotence-Key, Content-Type
        //   Body: { payment_id: externalId, amount: { value, currency: 'RUB' } }
        // Response: { id, status, payment_id, amount: { value }, ... }
        //
        // A-P1-25: scoped idempotence key — per (paymentId, "refund") so
        // partial-refund retries do not double-refund, and so a separate
        // confirm step on the same payment would use its own scope.
        const _idempotenceKey = makeIdempotencyKey('refund', { paymentId: externalId }, 'refund');
        void _idempotenceKey;
        // TODO(real-impl).
        throw new Error('ЮKassa refund() not yet implemented.');
    }
}
