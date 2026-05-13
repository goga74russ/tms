import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AuthSplitLayout } from './auth-split-layout';

// next/link's default export expects an app router context in some setups.
// Stub it to a plain <a> so the layout renders deterministically in jsdom.
vi.mock('next/link', () => ({
    default: ({ href, children, ...rest }: any) => (
        <a href={typeof href === 'string' ? href : href?.pathname ?? '#'} {...rest}>
            {children}
        </a>
    ),
}));

describe('AuthSplitLayout', () => {
    it('renders title and subtitle', () => {
        render(
            <AuthSplitLayout title="Вход в систему" subtitle="Введите email и пароль">
                <form>
                    <input type="email" aria-label="Email" />
                </form>
            </AuthSplitLayout>,
        );
        expect(screen.getByRole('heading', { name: 'Вход в систему', level: 1 })).toBeInTheDocument();
        expect(screen.getByText('Введите email и пароль')).toBeInTheDocument();
    });

    it('renders right-panel content', () => {
        render(
            <AuthSplitLayout
                title="Регистрация"
                rightPanel={<div>Безопасные перевозки</div>}
            >
                <div>Форма</div>
            </AuthSplitLayout>,
        );
        // The right panel column has aria-hidden, but text is still in the DOM.
        expect(screen.getByText('Безопасные перевозки')).toBeInTheDocument();
    });

    it('renders topRightLink as a link to the given href', () => {
        render(
            <AuthSplitLayout
                title="Вход"
                topRightLink={{ href: '/signup', label: 'Создать аккаунт' }}
            >
                <div>Форма</div>
            </AuthSplitLayout>,
        );
        const link = screen.getByRole('link', { name: 'Создать аккаунт' });
        expect(link).toBeInTheDocument();
        expect(link).toHaveAttribute('href', '/signup');
    });
});
