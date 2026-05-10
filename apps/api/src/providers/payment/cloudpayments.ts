// ============================================================
// CloudPayments — REAL skeleton.
// Docs: https://developers.cloudpayments.ru/
// Auth: Basic auth — base64(publicId:apiSecret).
// ============================================================
import { nowIso, type ProviderHealth } from '../base.js';
import type {
    PaymentCreateInput, PaymentProvider, PaymentRefundResult, PaymentResult, PaymentStatus,
} from './interface.js';

export const CLOUDPAYMENTS_API_URL = 'https://api.cloudpayments.ru';

export interface CloudPaymentsCredentials {
    publicId: string;
    apiSecret: string;
}

function mapStatus(s: string): PaymentStatus {
    if (s === 'Completed') return 'succeeded';
    if (s === 'Authorized') return 'waiting_for_capture';
    if (s === 'Cancelled' || s === 'Declined') return 'canceled';
    if (s === 'Refunded') return 'refunded';
    return 'pending';
}

export class CloudPaymentsProvider implements PaymentProvider {
    readonly name = 'cloudpayments';
    readonly providerType = 'payment' as const;
    readonly mode = 'production' as const;

    constructor(private readonly creds: CloudPaymentsCredentials) { }

    private get authHeader(): string {
        return `Basic ${Buffer.from(`${this.creds.publicId}:${this.creds.apiSecret}`).toString('base64')}`;
    }

    async healthCheck(): Promise<ProviderHealth> {
        return {
            ok: Boolean(this.creds.publicId && this.creds.apiSecret),
            mode: 'production',
            detail: 'cloudpayments credentials present',
            checkedAt: nowIso(),
        };
    }

    async execute(input: PaymentCreateInput): Promise<PaymentResult> {
        return this.createPayment(input);
    }

    async createPayment(_input: PaymentCreateInput): Promise<PaymentResult> {
        // CloudPayments works with widget on FE; backend mainly handles
        // recurring/charge endpoints. For 1-step charge:
        //   POST {CLOUDPAYMENTS_API_URL}/payments/charge
        //   Headers: Authorization: <authHeader>
        //   Body: { Amount, Currency: 'RUB', InvoiceId: orderId, AccountId, CardCryptogramPacket }
        // For redirect flow we typically return widget config to FE — here we
        // just stub, real impl might call /orders/create for invoice link:
        //   POST {CLOUDPAYMENTS_API_URL}/orders/create
        //   Body: { Amount, Currency: 'RUB', Description, RequireConfirmation: true }
        // TODO(real-impl): wire fetch.
        void mapStatus;
        throw new Error('CloudPayments createPayment() not yet implemented — awaiting credentials.');
    }

    async getPayment(_externalId: string): Promise<PaymentResult> {
        // POST {CLOUDPAYMENTS_API_URL}/payments/get  Body: { TransactionId }
        // TODO(real-impl).
        throw new Error('CloudPayments getPayment() not yet implemented.');
    }

    async refund(_externalId: string, _amountRub?: number): Promise<PaymentRefundResult> {
        // POST {CLOUDPAYMENTS_API_URL}/payments/refund  Body: { TransactionId, Amount }
        // TODO(real-impl).
        throw new Error('CloudPayments refund() not yet implemented.');
    }
}
