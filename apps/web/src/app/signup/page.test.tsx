import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen, userEvent } from '@/test/render';
import { navigationMock, linkMock } from '@/test/mocks';

vi.mock('next/navigation', () => navigationMock());
vi.mock('next/link', () => linkMock());

import SignupPage from './page';

describe('SignupPage', () => {
    it('renders signup form fields', () => {
        renderWithProviders(<SignupPage />);
        expect(screen.getByRole('heading', { name: /Создайте аккаунт/i })).toBeInTheDocument();
        expect(screen.getByLabelText(/Электронная почта/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/Пароль/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/ФИО/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/Телефон/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/Название компании/i)).toBeInTheDocument();
    });

    it('shows password strength meter when password typed', async () => {
        const user = userEvent.setup();
        renderWithProviders(<SignupPage />);
        await user.type(screen.getByLabelText(/Пароль/i), 'Abcd1234!');
        // strength label appears (one of: Слабый/Средний/Хороший/Отличный)
        expect(screen.getByText(/Слабый|Средний|Хороший|Отличный/)).toBeInTheDocument();
    });

    it('shows consent error when submitting without checkbox', async () => {
        const user = userEvent.setup();
        renderWithProviders(<SignupPage />);
        await user.type(screen.getByLabelText(/Электронная почта/i), 'a@b.com');
        await user.type(screen.getByLabelText(/Пароль/i), 'Abcd1234');
        await user.type(screen.getByLabelText(/ФИО/i), 'Иван Иванов');
        await user.click(screen.getByRole('button', { name: /Создать аккаунт/i }));
        expect(await screen.findByText(/согласие на обработку персональных данных/i)).toBeInTheDocument();
    });

    it('shows email validation error for invalid email', async () => {
        const user = userEvent.setup();
        renderWithProviders(<SignupPage />);
        await user.type(screen.getByLabelText(/Электронная почта/i), 'not-an-email');
        await user.click(screen.getByRole('button', { name: /Создать аккаунт/i }));
        expect(await screen.findByText(/корректный e-mail/i)).toBeInTheDocument();
    });
});
