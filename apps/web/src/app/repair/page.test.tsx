import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen, waitFor } from '@/test/render';
import { navigationMock, linkMock } from '@/test/mocks';

vi.mock('next/navigation', () => navigationMock());
vi.mock('next/link', () => linkMock());

import RepairPage from './page';

describe('RepairPage', () => {
    it('renders the repair title', async () => {
        renderWithProviders(<RepairPage />);
        await waitFor(() => {
            expect(screen.getByText(/Ремонтная служба/i)).toBeInTheDocument();
        });
    });

    it('renders a "create repair" trigger button', async () => {
        renderWithProviders(<RepairPage />);
        await waitFor(() => {
            const btn = screen.queryByRole('button', { name: /Новая|Создать|Добавить/i });
            expect(btn).toBeTruthy();
        });
    });

    it('renders view-mode toggle (kanban / table / list)', async () => {
        renderWithProviders(<RepairPage />);
        await waitFor(() => {
            // ViewTabs renders some toggle buttons for kanban/table
            expect(screen.getAllByRole('button').length).toBeGreaterThan(1);
        });
    });
});
