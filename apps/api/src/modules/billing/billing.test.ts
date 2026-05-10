// ============================================================
// Round 2B — Smoke tests for billing helpers + ОФД mock.
// Pure-unit only — no DB. We deliberately avoid importing the
// service / plan-guard modules here because they hit `db/connection`
// at import time, which requires DATABASE_URL.
// ============================================================
import { describe, it, expect } from 'vitest';
import {
    PLAN_IDS,
    TRIAL_DAYS,
    currentBillingPeriodStart,
    formatKopecks,
    kopecksToRubles,
    rublesToKopecks,
} from '@tms/shared';
import { MockOfdProvider } from '../../providers/ofd/mock.js';

describe('billing — kopecks / rubles helpers', () => {
    it('round-trips rubles → kopecks → rubles', () => {
        expect(rublesToKopecks(2900)).toBe(290000);
        expect(kopecksToRubles(290000)).toBe(2900);
        expect(kopecksToRubles(rublesToKopecks(99.99))).toBe(99.99);
    });

    it('formats whole-ruble amounts without decimals', () => {
        expect(formatKopecks(290000)).toMatch(/2[\s ]900\s?₽/);
    });

    it('formats fractional kopecks with two decimals', () => {
        expect(formatKopecks(99950)).toMatch(/999,50\s?₽/);
    });
});

describe('billing — period start', () => {
    it('returns first day of month at UTC midnight', () => {
        const period = currentBillingPeriodStart(new Date('2026-05-15T08:30:00Z'));
        expect(period.toISOString()).toBe('2026-05-01T00:00:00.000Z');
    });
});

describe('billing — plan ids constant', () => {
    it('exposes the four plan tiers', () => {
        expect(PLAN_IDS).toEqual(['free', 'pro', 'business', 'enterprise']);
    });

    it('exposes a 14-day trial constant', () => {
        expect(TRIAL_DAYS).toBe(14);
    });
});

describe('OFD mock provider', () => {
    it('fiscalizes a payment and returns a receipt URL', async () => {
        const ofd = new MockOfdProvider();
        const receipt = await ofd.fiscalize({
            paymentId: 'pay-1',
            amountKopecks: 290000,
            description: 'Подписка TMS',
            customerEmail: 'test@example.com',
        });
        expect(receipt.externalId).toMatch(/^mock-fd-/);
        expect(receipt.receiptUrl).toContain(receipt.externalId);
        expect(receipt.fnNumber).toBeTruthy();
    });

    it('round-trips through getReceipt', async () => {
        const ofd = new MockOfdProvider();
        const r1 = await ofd.fiscalize({
            paymentId: 'pay-2',
            amountKopecks: 100,
            description: 'x',
        });
        const r2 = await ofd.getReceipt(r1.externalId);
        expect(r2?.externalId).toBe(r1.externalId);
    });

    it('reports healthy', async () => {
        const ofd = new MockOfdProvider();
        const h = await ofd.healthCheck();
        expect(h.ok).toBe(true);
        expect(h.mode).toBe('mock');
    });
});
