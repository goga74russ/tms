import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen, waitFor } from '@/test/render';
import { navigationMock, linkMock } from '@/test/mocks';

vi.mock('next/navigation', () => navigationMock());
vi.mock('next/link', () => linkMock());

import ClaimsPage from './page';

describe('ClaimsPage', () => {
    it('renders claims heading', async () => {
        renderWithProviders(<ClaimsPage />);
        await waitFor(() => {
            expect(screen.getByText(/Претензии/i)).toBeInTheDocument();
        });
    });

    it('shows create-button', async () => {
        renderWithProviders(<ClaimsPage />);
        await waitFor(() => {
            // Button labelled "Создать" / "Новая претензия"
            const btn = screen.queryByRole('button', { name: /Создать|Новая|Добавить/i });
            expect(btn).toBeTruthy();
        });
    });

    it('renders stat tiles for claim statuses', async () => {
        renderWithProviders(<ClaimsPage />);
        await waitFor(
            () => {
                // Status labels from CLAIM type: open, investigating, resolved, rejected
                const text = document.body.textContent || '';
                expect(text).toMatch(/Открыт|Расследование|Решён|Отклонен|Всего|претензий/i);
            },
            { timeout: 5000 },
        );
    });
});
