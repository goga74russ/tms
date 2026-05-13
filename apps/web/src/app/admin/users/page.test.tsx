import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen, waitFor } from '@/test/render';
import { navigationMock, linkMock } from '@/test/mocks';

vi.mock('next/navigation', () => navigationMock());
vi.mock('next/link', () => linkMock());

import AdminUsersPage from './page';

describe('AdminUsersPage', () => {
    it('renders the title', async () => {
        renderWithProviders(<AdminUsersPage />);
        await waitFor(() => {
            expect(screen.getByText(/Пользователи/i)).toBeInTheDocument();
        });
    });

    it('eventually shows the seeded admin user from MSW', async () => {
        renderWithProviders(<AdminUsersPage />);
        await waitFor(
            () => {
                expect(screen.getAllByText(/admin@tms\.local/i).length).toBeGreaterThan(0);
            },
            { timeout: 4000 },
        );
    });

    it('shows the add-user button', async () => {
        renderWithProviders(<AdminUsersPage />);
        await waitFor(() => {
            // Either "Добавить пользователя" or icon-only button — page exposes at least one button
            const addBtn = screen.queryByRole('button', { name: /Добавить|Пригласить|Новый/i });
            expect(addBtn).toBeTruthy();
        });
    });
});
