import { describe, it, expect } from 'vitest';
import { verifyGosklyuchEnvelope } from './gosklyuch-envelope.js';

// C1 fail-closed: пока gosklyuch.verify() не реализован, верификация конверта
// ОБЯЗАНА возвращать false — иначе callback пометит произвольный signedXml
// юридически 'signed'. Этот тест — осознанный чекпоинт: когда verify появится
// и helper начнёт возвращать true, тест упадёт и заставит обновить логику/тесты.
describe('verifyGosklyuchEnvelope (C1 fail-closed)', () => {
    it('возвращает false для любого конверта пока verify не реализован', async () => {
        expect(await verifyGosklyuchEnvelope('<любой-xml/>')).toBe(false);
        expect(await verifyGosklyuchEnvelope('')).toBe(false);
        expect(await verifyGosklyuchEnvelope('<x/>', 'cert-base64')).toBe(false);
    });
});
