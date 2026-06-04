import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Импорт billing/service тянет db/connection (throw без DATABASE_URL) — глушим.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-do-not-use';
vi.mock('../../db/connection.js', () => ({ db: {}, sql: () => 'SQL' }));

import { isOnlinePaymentAllowed, createPayment } from './service.js';

// C9 stop-gate (54-ФЗ): онлайн-оплата картой требует фискального чека (ОФД),
// который не подключён. Пилот юр-чист только B2B-юрлица + банк-перевод (счёт).
// Онлайн-приём оплаты ЗАКРЫТ по умолчанию, включается ALLOW_ONLINE_PAYMENTS=true
// когда будет готова ЮKassa-фискализация. Fail-closed.
describe('billing stop-gate (54-ФЗ)', () => {
    const prev = process.env.ALLOW_ONLINE_PAYMENTS;
    beforeEach(() => { delete process.env.ALLOW_ONLINE_PAYMENTS; });
    afterEach(() => {
        if (prev === undefined) delete process.env.ALLOW_ONLINE_PAYMENTS;
        else process.env.ALLOW_ONLINE_PAYMENTS = prev;
    });

    it('по умолчанию онлайн-оплата ЗАКРЫТА (fail-closed)', () => {
        expect(isOnlinePaymentAllowed()).toBe(false);
    });

    it('включается только точным "true"', () => {
        process.env.ALLOW_ONLINE_PAYMENTS = 'true';
        expect(isOnlinePaymentAllowed()).toBe(true);
        process.env.ALLOW_ONLINE_PAYMENTS = '1';
        expect(isOnlinePaymentAllowed()).toBe(false);
        process.env.ALLOW_ONLINE_PAYMENTS = 'TRUE';
        expect(isOnlinePaymentAllowed()).toBe(false);
    });

    it('createPayment отклоняется с подсказкой про счёт, не доходя до БД', async () => {
        await expect(createPayment('org-1', 'pro' as never, 'https://return'))
            .rejects.toThrow(/по счёту|банковский перевод/i);
    });
});
