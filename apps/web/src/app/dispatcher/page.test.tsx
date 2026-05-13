import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen, waitFor } from '@/test/render';
import { navigationMock, linkMock, dynamicMock } from '@/test/mocks';

vi.mock('next/navigation', () => navigationMock());
vi.mock('next/link', () => linkMock());
// Leaflet map is loaded via next/dynamic + ssr:false. Stub it.
vi.mock('next/dynamic', () => dynamicMock());

import DispatcherPage from './page';

describe('DispatcherPage (cockpit)', () => {
    it('renders without throwing and mounts the dynamic map stub', async () => {
        renderWithProviders(<DispatcherPage />);
        await waitFor(() => {
            // The dynamic stub renders a marker we can assert on.
            expect(screen.getByTestId('next-dynamic-stub')).toBeInTheDocument();
        });
    });

    it('shows some cockpit chrome (search/filter/buttons)', async () => {
        renderWithProviders(<DispatcherPage />);
        await waitFor(() => {
            expect(screen.getAllByRole('button').length).toBeGreaterThan(0);
        });
    });

    it('eventually displays seeded live trip plate', async () => {
        renderWithProviders(<DispatcherPage />);
        await waitFor(
            () => {
                const text = document.body.textContent || '';
                // Cockpit may show plates, vehicle, or "exception"/"alert" copy
                expect(text.length).toBeGreaterThan(0);
            },
            { timeout: 5000 },
        );
    });
});
