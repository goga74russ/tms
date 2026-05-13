import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen, waitFor } from '@/test/render';
import { navigationMock, linkMock } from '@/test/mocks';

vi.mock('next/navigation', () => navigationMock());
vi.mock('next/link', () => linkMock());

import AdminBillingPage from './page';

describe('AdminBillingPage', () => {
    it('renders billing overview heading', async () => {
        renderWithProviders(<AdminBillingPage />);
        await waitFor(() => {
            expect(screen.getByText(/Биллинг — обзор/i)).toBeInTheDocument();
        });
    });

    it('shows seeded organization from MSW after fetch', async () => {
        renderWithProviders(<AdminBillingPage />);
        await waitFor(
            () => {
                expect(screen.getByText(/ООО «Тест»/)).toBeInTheDocument();
            },
            { timeout: 4000 },
        );
    });

    it('renders MRR or revenue metric card label', async () => {
        renderWithProviders(<AdminBillingPage />);
        await waitFor(() => {
            // MetricCard with MRR/Revenue label
            const text = document.body.textContent || '';
            expect(text).toMatch(/MRR|Выручка|организаций|Активные/i);
        });
    });
});
