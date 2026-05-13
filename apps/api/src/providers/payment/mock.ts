// ============================================================
// Mock payment provider — succeeds immediately.
// ============================================================
import { nanoid } from 'nanoid';
import { nowIso, type ProviderHealth } from '../base.js';
import type {
    PaymentCreateInput, PaymentProvider, PaymentRefundResult, PaymentResult, PaymentStatus,
} from './interface.js';

const payments = new Map<string, PaymentResult>();

export class MockPaymentProvider implements PaymentProvider {
    readonly name = 'mock';
    readonly providerType = 'payment' as const;
    readonly mode = 'mock' as const;

    async healthCheck(): Promise<ProviderHealth> {
        return { ok: true, mode: 'mock', detail: 'mock payment provider', checkedAt: nowIso() };
    }

    async execute(input: PaymentCreateInput): Promise<PaymentResult> {
        return this.createPayment(input);
    }

    async createPayment(input: PaymentCreateInput): Promise<PaymentResult> {
        const externalId = `mock-pay-${nanoid(10)}`;
        const result: PaymentResult = {
            externalId,
            status: 'pending',
            confirmationUrl: `${input.returnUrl}?mock=1&extId=${externalId}`,
        };
        payments.set(externalId, result);
        // Simulate auto-capture
        setTimeout(() => {
            const existing = payments.get(externalId);
            if (existing) {
                existing.status = 'succeeded';
            }
        }, 500);
        return result;
    }

    async getPayment(externalId: string): Promise<PaymentResult> {
        const existing = payments.get(externalId);
        if (existing) return existing;
        const fallback: PaymentResult = { externalId, status: 'pending' as PaymentStatus };
        return fallback;
    }

    async refund(externalId: string, amountRub?: number): Promise<PaymentRefundResult> {
        const existing = payments.get(externalId);
        if (existing) existing.status = 'refunded';
        return {
            refundId: `mock-rf-${nanoid(8)}`,
            externalId,
            amountRub: amountRub ?? 0,
            status: 'succeeded',
        };
    }
}

export const mockPaymentProvider = new MockPaymentProvider();
