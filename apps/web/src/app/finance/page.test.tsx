import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen, waitFor } from '@/test/render';
import { navigationMock, linkMock } from '@/test/mocks';

vi.mock('next/navigation', () => navigationMock());
vi.mock('next/link', () => linkMock());

import FinancePage from './page';

describe('FinancePage', () => {
    it('renders finance dashboard title', async () => {
        renderWithProviders(<FinancePage />);
        await waitFor(() => {
            expect(screen.getByText(/Финансы и Бухгалтерия/i)).toBeInTheDocument();
        });
    });

    it('renders the invoices register heading', async () => {
        renderWithProviders(<FinancePage />);
        await waitFor(
            () => {
                expect(screen.getByText(/Реестр счетов/i)).toBeInTheDocument();
            },
            { timeout: 5000 },
        );
    });

    it('shows seeded invoice numbers from MSW', async () => {
        renderWithProviders(<FinancePage />);
        await waitFor(
            () => {
                const text = document.body.textContent || '';
                expect(text).toMatch(/INV-300/);
            },
            { timeout: 5000 },
        );
    });
});
