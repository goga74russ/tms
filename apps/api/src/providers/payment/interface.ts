// ============================================================
// Payment provider interface — ЮKassa / Тинькофф / CloudPayments.
// ============================================================
import type { ProviderAdapter, ProviderType } from '../base.js';

export type PaymentStatus = 'pending' | 'waiting_for_capture' | 'succeeded' | 'canceled' | 'refunded';

export interface PaymentCreateInput {
    amountRub: number;
    orderId: string;
    description?: string;
    returnUrl: string;
    currency?: 'RUB';
    /** Customer email/phone for receipt (54-ФЗ). */
    receipt?: { email?: string; phone?: string };
}

export interface PaymentResult {
    externalId: string;
    status: PaymentStatus;
    confirmationUrl?: string;
    raw?: Record<string, unknown>;
}

export interface PaymentRefundResult {
    refundId: string;
    externalId: string;
    amountRub: number;
    status: 'succeeded' | 'pending' | 'canceled';
}

export interface PaymentCredentials {
    shopId?: string;
    secretKey?: string;
    /** Тинькофф uses TerminalKey + Password. */
    terminalKey?: string;
    password?: string;
    /** CloudPayments uses publicId + apiSecret. */
    publicId?: string;
    apiSecret?: string;
}

export interface PaymentProvider extends ProviderAdapter<PaymentCreateInput, PaymentResult> {
    readonly providerType: Extract<ProviderType, 'payment'>;
    createPayment(input: PaymentCreateInput): Promise<PaymentResult>;
    getPayment(externalId: string): Promise<PaymentResult>;
    refund(externalId: string, amountRub?: number): Promise<PaymentRefundResult>;
}
