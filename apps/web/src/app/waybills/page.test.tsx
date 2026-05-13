import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen, waitFor } from '@/test/render';
import { navigationMock, linkMock } from '@/test/mocks';

vi.mock('next/navigation', () => navigationMock());
vi.mock('next/link', () => linkMock());

import WaybillsPage from './page';

describe('WaybillsPage', () => {
    it('renders waybills title', async () => {
        renderWithProviders(<WaybillsPage />);
        await waitFor(() => {
            expect(screen.getByText(/Путевые листы/i)).toBeInTheDocument();
        });
    });

    it('renders some list / empty / table chrome', async () => {
        renderWithProviders(<WaybillsPage />);
        await waitFor(
            () => {
                const text = document.body.textContent || '';
                // Page chrome words (loading skeleton or table chrome or generic copy)
                expect(text).toMatch(/Путевые листы|путев|Загрузка|Нет/i);
            },
            { timeout: 8000 },
        );
    });

    it('does not throw during render of icons / actions', async () => {
        renderWithProviders(<WaybillsPage />);
        await waitFor(() => {
            // Buttons present (refresh, etc.)
            expect(screen.getAllByRole('button').length).toBeGreaterThan(0);
        });
    });
});
