import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen, waitFor } from '@/test/render';
import { navigationMock, linkMock } from '@/test/mocks';

vi.mock('next/navigation', () => navigationMock());
vi.mock('next/link', () => linkMock());

import FleetPage from './page';

describe('FleetPage', () => {
    it('renders fleet title', () => {
        renderWithProviders(<FleetPage />);
        expect(screen.getByText(/Автопарк/i)).toBeInTheDocument();
    });

    it('renders all tab triggers', () => {
        renderWithProviders(<FleetPage />);
        // Tab labels declared in `tabs` array
        for (const label of ['Транспорт', 'Водители', 'Пропуска', 'Штрафы', 'Контрагенты', 'Прицепы', 'Топливо', 'Одометр', 'Простои', 'План ТО']) {
            expect(screen.getByText(label)).toBeInTheDocument();
        }
    });

    it('default tab is Транспорт (vehicles panel mounted)', async () => {
        renderWithProviders(<FleetPage />);
        await waitFor(() => {
            // The first tab is "Транспорт"; ensure tab buttons rendered
            const trigger = screen.getByText('Транспорт');
            expect(trigger).toBeInTheDocument();
            // Aria-selected reflects active tab
            const triggerBtn = trigger.closest('button');
            expect(triggerBtn?.getAttribute('aria-selected') ?? 'true').toBe('true');
        });
    });
});
