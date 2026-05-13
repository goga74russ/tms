import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen, waitFor } from '@/test/render';
import { navigationMock, linkMock } from '@/test/mocks';

vi.mock('next/navigation', () => navigationMock());
vi.mock('next/link', () => linkMock());

import AdminIntegrationsPage from './page';

describe('AdminIntegrationsPage', () => {
    it('renders the integrations title', async () => {
        renderWithProviders(<AdminIntegrationsPage />);
        await waitFor(() => {
            expect(screen.getByText(/Кабинет интеграций/i)).toBeInTheDocument();
        });
    });

    it('renders category pills for provider types', async () => {
        renderWithProviders(<AdminIntegrationsPage />);
        await waitFor(() => {
            // Categories from PROVIDER_CATALOG. Pills + section headings → multi-match OK.
            expect(screen.getAllByText(/Электронная подпись/i).length).toBeGreaterThan(0);
            expect(screen.getAllByText(/ЭДО/).length).toBeGreaterThan(0);
            expect(screen.getAllByText(/Телематика/i).length).toBeGreaterThan(0);
        });
    });

    it('renders a search input', async () => {
        renderWithProviders(<AdminIntegrationsPage />);
        await waitFor(() => {
            const input = screen.queryByPlaceholderText(/Поиск|поиск|Найти/i);
            expect(input).toBeTruthy();
        });
    });
});
