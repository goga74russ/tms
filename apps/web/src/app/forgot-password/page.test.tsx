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

    it('renders the manual-reset info banner', () => {
        renderWithProviders(<ForgotPasswordPage />);
        expect(screen.getByText(/Пока вручную/i)).toBeInTheDocument();
        expect(screen.getByText(/support@tms\.local/i)).toBeInTheDocument();
    });

    it('renders a link back to login', () => {
        renderWithProviders(<ForgotPasswordPage />);
        const links = screen.getAllByRole('link', { name: /вход|К входу|Вернуться/i });
        expect(links.length).toBeGreaterThan(0);
    });
});
