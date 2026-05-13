import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen, waitFor } from '@/test/render';
import { navigationMock, linkMock } from '@/test/mocks';

vi.mock('next/navigation', () => navigationMock());
vi.mock('next/link', () => linkMock());

import AuditLogPage from './page';

describe('AuditLogPage', () => {
    it('renders audit log title', async () => {
        renderWithProviders(<AuditLogPage />);
        await waitFor(() => {
            expect(screen.getByText(/Журнал событий/i)).toBeInTheDocument();
        });
    });

    it('renders filter controls', async () => {
        renderWithProviders(<AuditLogPage />);
        await waitFor(() => {
            // Search field placeholder + apply button both present
            expect(screen.getByPlaceholderText(/Поиск по типу события/i)).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /Применить/i })).toBeInTheDocument();
        });
    });

    it('shows empty-state when there are no events', async () => {
        renderWithProviders(<AuditLogPage />);
        await waitFor(
            () => {
                expect(screen.getByText(/Нет событий/i)).toBeInTheDocument();
            },
            { timeout: 4000 },
        );
    });
});
