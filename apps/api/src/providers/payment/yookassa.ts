// ============================================================
// ЮKassa (Яндекс.Касса) — REAL. РФ default payment provider.
// Docs: https://yookassa.ru/developers/api
// Auth: HTTP Basic — base64(shopId:secretKey).
// Webhook подлинность: НЕ HMAC — IP-allowlist + re-query платежа по id
// (getPayment) как авторитетный источник статуса (см. billing/routes.ts).
// ============================================================
import crypto from 'node:crypto';
import { nowIso, type ProviderHealth } from '../base.js';
import { httpFetch } from '../_http.js';
import type {
    PaymentCreateInput, PaymentProvider, PaymentRefundResult, PaymentResult, PaymentStatus,
} from './interface.js';

// A-P1-25: Idempotence-Key стабилен между ретраями (из orderId), чтобы один
// логический запрос отображался на один платёж ЮKassa, а не плодил дубли.
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

interface YookassaPaymentResponse {
    id: string;
    status: string;
    paid?: boolean;
    amount?: { value?: string; currency?: string };
    confirmation?: { confirmation_url?: string };
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
        try {
            // У ЮKassa нет /me — проверяем креды лёгким list-запросом (limit=1).
            const res = await httpFetch(`${YOOKASSA_API_URL}/payments?limit=1`, {
                method: 'GET',
                headers: { Authorization: this.authHeader },
            }, { timeoutMs: 10000, retries: 1 });
            return {
                ok: res.ok,
                mode: 'production',
                detail: res.ok ? 'ЮKassa: креды валидны' : `ЮKassa: HTTP ${res.status}`,
                checkedAt: nowIso(),
            };
        } catch (err) {
            return { ok: false, mode: 'production', detail: `ЮKassa: ${(err as Error).message}`, checkedAt: nowIso() };
        }
    }

    async execute(input: PaymentCreateInput): Promise<PaymentResult> {
        return this.createPayment(input);
    }

    async createPayment(input: PaymentCreateInput): Promise<PaymentResult> {
        const idempotenceKey = makeIdempotencyKey('create', input);
        const body: Record<string, unknown> = {
            amount: { value: input.amountRub.toFixed(2), currency: input.currency ?? 'RUB' },
            capture: true,
            confirmation: { type: 'redirect', return_url: input.returnUrl },
            description: input.description,
            metadata: { orderId: input.orderId },
        };
        // 54-ФЗ: чек включаем только если переданы контакты покупателя и в кабинете
        // ЮKassa включена фискализация. Иначе ЮKassa формирует чек по своим настройкам.
        if (input.receipt?.email || input.receipt?.phone) {
            body.receipt = {
                customer: { email: input.receipt.email, phone: input.receipt.phone },
                items: [{
                    description: (input.description ?? 'Подписка ТрансПульт').slice(0, 128),
                    quantity: '1.00',
                    amount: { value: input.amountRub.toFixed(2), currency: input.currency ?? 'RUB' },
                    vat_code: 1, // без НДС (УСН/НПД — оператор уточняет под свой режим)
                    payment_subject: 'service',
                    payment_mode: 'full_payment',
                }],
            };
        }
        const res = await httpFetch(`${YOOKASSA_API_URL}/payments`, {
            method: 'POST',
            headers: {
                Authorization: this.authHeader,
                'Idempotence-Key': idempotenceKey,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        }, { timeoutMs: 15000, retries: 2 });
        if (!res.ok) throw new Error(`ЮKassa create payment failed: ${res.status} ${await res.text()}`);
        const data = await res.json() as YookassaPaymentResponse;
        return {
            externalId: data.id,
            status: mapStatus(data.status),
            confirmationUrl: data.confirmation?.confirmation_url,
            raw: data as unknown as Record<string, unknown>,
        };
    }

    async getPayment(externalId: string): Promise<PaymentResult> {
        const res = await httpFetch(`${YOOKASSA_API_URL}/payments/${encodeURIComponent(externalId)}`, {
            method: 'GET',
            headers: { Authorization: this.authHeader },
        }, { timeoutMs: 15000, retries: 2 });
        if (!res.ok) throw new Error(`ЮKassa get payment failed: ${res.status} ${await res.text()}`);
        const data = await res.json() as YookassaPaymentResponse;
        return {
            externalId: data.id,
            status: mapStatus(data.status),
            confirmationUrl: data.confirmation?.confirmation_url,
            raw: data as unknown as Record<string, unknown>,
        };
    }

    async refund(externalId: string, amountRub?: number): Promise<PaymentRefundResult> {
        const idempotenceKey = makeIdempotencyKey('refund', { paymentId: externalId }, 'refund');
        let value = amountRub;
        if (value === undefined) {
            // Полный возврат: сумма из исходного платежа.
            const pay = await this.getPayment(externalId);
            const raw = pay.raw as YookassaPaymentResponse | undefined;
            value = raw?.amount?.value ? Number(raw.amount.value) : undefined;
        }
        if (value === undefined || !Number.isFinite(value)) {
            throw new Error('ЮKassa refund: не удалось определить сумму возврата');
        }
        const res = await httpFetch(`${YOOKASSA_API_URL}/refunds`, {
            method: 'POST',
            headers: {
                Authorization: this.authHeader,
                'Idempotence-Key': idempotenceKey,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                payment_id: externalId,
                amount: { value: value.toFixed(2), currency: 'RUB' },
            }),
        }, { timeoutMs: 15000, retries: 2 });
        if (!res.ok) throw new Error(`ЮKassa refund failed: ${res.status} ${await res.text()}`);
        const data = await res.json() as { id: string; status: string; amount?: { value?: string } };
        return {
            refundId: data.id,
            externalId,
            amountRub: data.amount?.value ? Number(data.amount.value) : value,
            status: data.status === 'succeeded' ? 'succeeded' : data.status === 'canceled' ? 'canceled' : 'pending',
        };
    }
}
