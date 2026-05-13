import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen, waitFor } from '@/test/render';
import { navigationMock, linkMock } from '@/test/mocks';

vi.mock('next/navigation', () => navigationMock());
vi.mock('next/link', () => linkMock());

import TripsPage from './page';

describe('TripsPage', () => {
    it('renders the trips heading', async () => {
        renderWithProviders(<TripsPage />);
        await waitFor(() => {
            expect(screen.getByText(/^Рейсы$/)).toBeInTheDocument();
        });
    });

    it('renders the search input', async () => {
        renderWithProviders(<TripsPage />);
        await waitFor(() => {
            const search = screen.queryByPlaceholderText(/Поиск|поиск|Номер|номер/i);
            expect(search).toBeTruthy();
        });
    });

    it('shows seeded trip numbers from MSW after data loads', async () => {
        renderWithProviders(<TripsPage />);
        await waitFor(
            () => {
                const text = document.body.textContent || '';
                expect(text).toMatch(/TR-1001|TR-1002|TR-1003/);
            },
            { timeout: 5000 },
        );
    });
});
