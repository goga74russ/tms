import { describe, it, expect, vi, beforeEach } from 'vitest';

// C9 (security): серверный DPA-гейт. Раньше проверка была только клиентской и
// fail-open → обход прямым POST /credentials. Тут — что guard действительно
// блокирует, когда согласие требуется-но-не-дано, и пропускает иначе.

const getDpaMock = vi.fn();
const dbRows: unknown[] = [];

vi.mock('./loader.js', () => ({ getDpa: (...a: unknown[]) => getDpaMock(...a) }));
vi.mock('../../db/connection.js', () => ({
    db: {
        select: () => ({
            from: () => ({
                where: () => ({
                    limit: () => Promise.resolve(dbRows),
                }),
            }),
        }),
    },
}));

import { assertDpaAccepted, DpaNotAcceptedError } from './guard.js';

const user = { userId: 'u1', organizationId: 'org1' };

describe('assertDpaAccepted', () => {
    beforeEach(() => {
        getDpaMock.mockReset();
        dbRows.length = 0;
    });

    it('пропускает, если DPA-файла нет (404-провайдер)', async () => {
        getDpaMock.mockResolvedValue(null);
        await expect(assertDpaAccepted('wialon', user)).resolves.toBeUndefined();
    });

    it('пропускает, если requiresAcceptance=false (vendor-infra)', async () => {
        getDpaMock.mockResolvedValue({ frontmatter: { requiresAcceptance: false, version: '1.0' } });
        await expect(assertDpaAccepted('mailru-smtp', user)).resolves.toBeUndefined();
    });

    it('БЛОКИРУЕТ, если согласие требуется, но строки нет', async () => {
        getDpaMock.mockResolvedValue({ frontmatter: { requiresAcceptance: true, version: '2.0' } });
        // dbRows пуст → нет акцепта
        await expect(assertDpaAccepted('diadoc', user)).rejects.toBeInstanceOf(DpaNotAcceptedError);
    });

    it('БЛОКИРУЕТ, если у пользователя нет организации', async () => {
        getDpaMock.mockResolvedValue({ frontmatter: { requiresAcceptance: true, version: '2.0' } });
        await expect(assertDpaAccepted('diadoc', { userId: 'u1', organizationId: null }))
            .rejects.toBeInstanceOf(DpaNotAcceptedError);
    });

    it('пропускает, если есть акцепт актуальной версии', async () => {
        getDpaMock.mockResolvedValue({ frontmatter: { requiresAcceptance: true, version: '2.0' } });
        dbRows.push({ version: '2.0' });
        await expect(assertDpaAccepted('diadoc', user)).resolves.toBeUndefined();
    });
});
