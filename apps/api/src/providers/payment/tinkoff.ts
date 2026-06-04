// ============================================================
// Тинькофф Эквайринг — REAL skeleton.
// Docs: https://www.tinkoff.ru/kassa/develop/api/
// Auth: signed body with TerminalKey + Password (sha256 of all params).
// ============================================================
import crypto from 'node:crypto';
import { nowIso, type ProviderHealth } from '../base.js';
import type {
    PaymentCreateInput, PaymentProvider, PaymentRefundResult, PaymentResult, PaymentStatus,
} from './interface.js';

export const TINKOFF_API_URL = 'https://securepay.tinkoff.ru/v2';

export interface TinkoffCredentials {
    terminalKey: string;
    password: string;
}

function mapStatus(s: string): PaymentStatus {
    if (s === 'CONFIRMED') return 'succeeded';
    if (s === 'AUTHORIZED') return 'waiting_for_capture';
    if (s === 'REFUNDED' || s === 'PARTIAL_REFUNDED') return 'refunded';
    if (s === 'CANCELED' || s === 'REJECTED') return 'canceled';
    return 'pending';
}

/**
 * Тинькофф signing — see "Подпись запроса" in docs:
 *   "В вычислении токена не участвуют объекты (Receipt, DATA и т.п.) и
 *    массивы. Сортировка по ключу выполняется только по корневым параметрам
 *    с примитивными значениями."
 *
 * A-P1-27: prior implementation called `String(v)` on every value, which
 * meant nested `Receipt` / `DATA` objects were stringified as
 * "[object Object]" and concatenated into the token — producing an INVALID
 * signature whenever a receipt was attached. We now filter to primitives
 * before sorting + concatenating.
 */
export function signTinkoffRequest(body: Record<string, unknown>, password: string): string {
    const flat: Record<string, string> = { Password: password };
    for (const [k, v] of Object.entries(body)) {
        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
            flat[k] = String(v);
        }
    }
    const ordered = Object.keys(flat).sort().map(k => flat[k]).join('');
    return crypto.createHash('sha256').update(ordered).digest('hex');
}

export class TinkoffPaymentProvider implements PaymentProvider {
    readonly name = 'tinkoff';
    readonly providerType = 'payment' as const;
    readonly mode = 'production' as const;

    constructor(private readonly creds: TinkoffCredentials) { }

    async healthCheck(): Promise<ProviderHealth> {
        // Интеграция не завершена: createPayment/getPayment/refund — заглушки
        // (бросают not-implemented). Нельзя отдавать ok:true, иначе go-live
        // капкан — провайдер считается готовым при нерабочих методах.
        const credsPresent = Boolean(this.creds.terminalKey && this.creds.password);
        return {
            ok: false,
            mode: 'production',
            detail: credsPresent
                ? 'tinkoff credentials present, но интеграция не завершена: методы createPayment/getPayment/refund — заглушки'
                : 'tinkoff credentials отсутствуют; интеграция не завершена',
            checkedAt: nowIso(),
        };
    }

    async execute(input: PaymentCreateInput): Promise<PaymentResult> {
        return this.createPayment(input);
    }

    async createPayment(_input: PaymentCreateInput): Promise<PaymentResult> {
        // POST {TINKOFF_API_URL}/Init
        //   Body (JSON, signed): {
        //     TerminalKey, Amount: <kopecks>, OrderId, Description,
        //     SuccessURL: returnUrl, FailURL: returnUrl, Token: <sha256>
        //   }
        // Response: { Success, Status, PaymentId, PaymentURL }
        // TODO(real-impl): wire fetch. See signTinkoffRequest helper above.
        // const body = {
        //     TerminalKey: this.creds.terminalKey,
        //     Amount: Math.round(input.amountRub * 100),
        //     OrderId: input.orderId,
        //     Description: input.description ?? '',
        //     SuccessURL: input.returnUrl,
        //     FailURL: input.returnUrl,
        // };
        // const Token = signTinkoffRequest(body, this.creds.password);
        // const res = await fetch(`${TINKOFF_API_URL}/Init`, {
        //     method: 'POST',
        //     headers: { 'Content-Type': 'application/json' },
        //     body: JSON.stringify({ ...body, Token }),
        // });
        // const data = await res.json() as { Success: boolean; Status?: string; PaymentId?: string; PaymentURL?: string; Message?: string };
        // if (!data.Success || !data.PaymentId) throw new Error(`Tinkoff Init failed: ${data.Message}`);
        // return { externalId: data.PaymentId, status: mapStatus(data.Status ?? 'NEW'), confirmationUrl: data.PaymentURL, raw: data as Record<string, unknown> };
        void mapStatus;
        throw new Error('Tinkoff createPayment() not yet implemented — awaiting credentials.');
    }

    async getPayment(_externalId: string): Promise<PaymentResult> {
        // POST {TINKOFF_API_URL}/GetState  Body: { TerminalKey, PaymentId, Token }
        // Response: { Success, Status, ... }
        // TODO(real-impl).
        throw new Error('Tinkoff getPayment() not yet implemented.');
    }

    async refund(_externalId: string, _amountRub?: number): Promise<PaymentRefundResult> {
        // POST {TINKOFF_API_URL}/Cancel  Body: { TerminalKey, PaymentId, Amount?, Token }
        // (Cancel does both reversal and refund depending on payment state.)
        // TODO(real-impl).
        throw new Error('Tinkoff refund() not yet implemented.');
    }
}
