import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen } from '@/test/render';
import { navigationMock, linkMock } from '@/test/mocks';

vi.mock('next/navigation', () => navigationMock());
vi.mock('next/link', () => linkMock());

import ForgotPasswordPage from './page';

describe('ForgotPasswordPage', () => {
    it('renders the recovery title', () => {
        renderWithProviders(<ForgotPasswordPage />);
        expect(screen.getByRole('heading', { name: /Восстановление пароля/i })).toBeInTheDocument();
    });

    it('renders an email input and submit button', () => {
        renderWithProviders(<ForgotPasswordPage />);
        // Label "Электронная почта" is associated with the email field.
        expect(screen.getByLabelText(/Электронная почта/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Отправить ссылку/i })).toBeInTheDocument();
    });

    it('renders a link back to login', () => {
        renderWithProviders(<ForgotPasswordPage />);
        const links = screen.getAllByRole('link', { name: /вход|войти|ко входу|вспомнили/i });
        expect(links.length).toBeGreaterThan(0);
    });
});
