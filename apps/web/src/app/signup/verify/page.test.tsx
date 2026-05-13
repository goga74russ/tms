import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen } from '@/test/render';
import { linkMock } from '@/test/mocks';

// useSearchParams provides "email" so the full UI renders; otherwise the page shows
// a fallback "no email" screen.
vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
    useSearchParams: () => new URLSearchParams('email=user%40example.com'),
    usePathname: () => '/signup/verify',
}));
vi.mock('next/link', () => linkMock());

import VerifyEmailPage from './page';

describe('VerifyEmailPage', () => {
    it('renders the verify heading and email', async () => {
        renderWithProviders(<VerifyEmailPage />);
        expect(await screen.findByRole('heading', { name: /Проверьте почту/i })).toBeInTheDocument();
        expect(await screen.findByText(/user@example\.com/i)).toBeInTheDocument();
    });

    it('renders 6 code input boxes', async () => {
        const { container } = renderWithProviders(<VerifyEmailPage />);
        // Wait for Suspense child to hydrate
        await screen.findByRole('heading', { name: /Проверьте почту/i });
        // The 6 boxes are single-char inputmode="numeric" inputs.
        const codeInputs = container.querySelectorAll('input[maxlength="1"]');
        expect(codeInputs.length).toBe(6);
    });

    it('renders a resend control with a cooldown timer', async () => {
        renderWithProviders(<VerifyEmailPage />);
        await screen.findByRole('heading', { name: /Проверьте почту/i });
        // Cooldown starts at 60s → "1:00" or "0:59" shortly after
        expect(screen.getByText(/\d:\d{2}/)).toBeInTheDocument();
    });

    it('shows fallback when email param is missing', async () => {
        vi.resetModules();
        vi.doMock('next/navigation', () => ({
            useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
            useSearchParams: () => new URLSearchParams(),
            usePathname: () => '/signup/verify',
        }));
        const Mod = await import('./page');
        renderWithProviders(<Mod.default />);
        expect(await screen.findByText(/Не удалось продолжить/i)).toBeInTheDocument();
    });
});
