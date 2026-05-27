import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw/server';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/render';
import { navigationMock, linkMock } from '@/test/mocks';

vi.mock('next/navigation', () => navigationMock());
vi.mock('next/link', () => linkMock());

import LoginPage from './page';

describe('LoginPage', () => {
    it('renders title and login form', async () => {
        renderWithProviders(<LoginPage />);
        expect(await screen.findByRole('heading', { name: /Войти в ТрансПульт/i })).toBeInTheDocument();
        expect(screen.getByLabelText(/Электронная почта/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/Пароль/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Войти/i })).toBeInTheDocument();
    });

    it('shows validation error on empty submit', async () => {
        const user = userEvent.setup();
        renderWithProviders(<LoginPage />);
        await user.click(screen.getByRole('button', { name: /Войти/i }));
        expect(await screen.findByText(/Введите электронную почту/i)).toBeInTheDocument();
    });

    // T-47 (W3.5): фикс api.ts — теперь 401 на /auth/* НЕ делает window.location
    // redirect, login-форма получает result.success=false и зовёт setFormError.
    it('shows error banner when API returns 401', async () => {
        server.use(
            http.post('/api/auth/login', () =>
                HttpResponse.json({ success: false, error: 'Неверный логин или пароль' }, { status: 401 }),
            ),
        );
        const user = userEvent.setup();
        renderWithProviders(<LoginPage />);
        await user.type(screen.getByLabelText(/Электронная почта/i), 'a@b.com');
        await user.type(screen.getByLabelText(/Пароль/i), 'wrong123');
        await user.click(screen.getByRole('button', { name: /Войти/i }));
        await waitFor(() => {
            expect(screen.getByRole('alert')).toBeInTheDocument();
        });
    });

    it('includes link to signup', () => {
        renderWithProviders(<LoginPage />);
        const signupLinks = screen.getAllByRole('link', { name: /Зарегистрироваться|Создать аккаунт/i });
        expect(signupLinks.length).toBeGreaterThan(0);
    });
});
