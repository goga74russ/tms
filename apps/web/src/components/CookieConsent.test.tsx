import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderWithProviders, screen, waitFor, userEvent } from '@/test/render';
import { navigationMock, linkMock } from '@/test/mocks';

vi.mock('next/navigation', () => navigationMock());
vi.mock('next/link', () => linkMock());

import { CookieConsent, COOKIE_CONSENT_KEY, readCookieConsent } from './CookieConsent';

describe('CookieConsent', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('показывается при первом визите (нет сохранённого выбора)', async () => {
        renderWithProviders(<CookieConsent />);
        await waitFor(() => {
            expect(screen.getByText(/Мы используем файлы cookie/i)).toBeInTheDocument();
        });
        // три действия по умолчанию
        expect(screen.getByRole('button', { name: 'Принять' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Только необходимые' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Настроить' })).toBeInTheDocument();
    });

    it('«Только необходимые» сохраняет выбор и скрывает баннер', async () => {
        renderWithProviders(<CookieConsent />);
        const btn = await screen.findByRole('button', { name: 'Только необходимые' });
        await userEvent.click(btn);

        await waitFor(() => {
            expect(screen.queryByText(/Мы используем файлы cookie/i)).not.toBeInTheDocument();
        });
        const saved = readCookieConsent();
        expect(saved).toMatchObject({ necessary: true, functional: false, analytics: false, version: 1 });
        expect(saved?.decidedAt).toBeTruthy();
    });

    it('«Принять» включает функциональные и аналитические', async () => {
        renderWithProviders(<CookieConsent />);
        await userEvent.click(await screen.findByRole('button', { name: 'Принять' }));
        expect(readCookieConsent()).toMatchObject({ functional: true, analytics: true });
    });

    it('«Настроить» раскрывает тоглы и сохраняет гранулярный выбор', async () => {
        renderWithProviders(<CookieConsent />);
        await userEvent.click(await screen.findByRole('button', { name: 'Настроить' }));

        // функциональные по умолчанию вкл, аналитические выкл — снимаем функциональные
        const checkboxes = screen.getAllByRole('checkbox');
        // [0] = строго необходимые (disabled), [1] = функциональные, [2] = аналитические
        expect(checkboxes[0]).toBeDisabled();
        await userEvent.click(checkboxes[1]!); // выключаем функциональные

        await userEvent.click(screen.getByRole('button', { name: 'Сохранить выбор' }));
        expect(readCookieConsent()).toMatchObject({ necessary: true, functional: false, analytics: false });
    });

    it('НЕ показывается, если выбор уже сохранён', async () => {
        localStorage.setItem(
            COOKIE_CONSENT_KEY,
            JSON.stringify({ necessary: true, functional: true, analytics: false, decidedAt: '2026-06-16T00:00:00.000Z', version: 1 }),
        );
        renderWithProviders(<CookieConsent />);
        // даём эффекту отработать
        await new Promise((r) => setTimeout(r, 50));
        expect(screen.queryByText(/Мы используем файлы cookie/i)).not.toBeInTheDocument();
    });
});
