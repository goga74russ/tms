import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen, waitFor } from '@/test/render';
import { navigationMock, linkMock } from '@/test/mocks';

vi.mock('next/navigation', () => navigationMock());
vi.mock('next/link', () => linkMock());

import AdminSettingsPage from './page';

describe('AdminSettingsPage', () => {
    it('renders the cost-model title', async () => {
        renderWithProviders(<AdminSettingsPage />);
        await waitFor(() => {
            expect(screen.getByText(/Настройки себестоимости/i)).toBeInTheDocument();
        });
    });

    it('renders the three cost-model field labels after fetch', async () => {
        renderWithProviders(<AdminSettingsPage />);
        await waitFor(
            () => {
                expect(screen.getByText(/Топливо/)).toBeInTheDocument();
                expect(screen.getByText(/Водитель/)).toBeInTheDocument();
                expect(screen.getByText(/Амортизация ТС/)).toBeInTheDocument();
            },
            { timeout: 4000 },
        );
    });

    it('renders inputs with prefilled values from MSW', async () => {
        renderWithProviders(<AdminSettingsPage />);
        await waitFor(
            () => {
                expect(screen.getByDisplayValue('55')).toBeInTheDocument(); // fuelPricePerLiter
                expect(screen.getByDisplayValue('350')).toBeInTheDocument(); // driverSalary
            },
            { timeout: 4000 },
        );
    });
});
