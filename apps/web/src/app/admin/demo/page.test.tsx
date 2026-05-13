import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen } from '@/test/render';
import { navigationMock, linkMock } from '@/test/mocks';

vi.mock('next/navigation', () => navigationMock());
vi.mock('next/link', () => linkMock());

import AdminDemoPage from './page';

describe('AdminDemoPage', () => {
    it('renders demo title and primary buttons', () => {
        renderWithProviders(<AdminDemoPage />);
        expect(screen.getByRole('button', { name: /Создать демо-данные/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Удалить демо/i })).toBeInTheDocument();
    });

    it('does not show generated result block on initial render', () => {
        renderWithProviders(<AdminDemoPage />);
        // No "Создано" success summary yet
        expect(screen.queryByText(/Демо-данные созданы/i)).not.toBeInTheDocument();
    });

    it('renders some demo context copy', () => {
        renderWithProviders(<AdminDemoPage />);
        // The page text mentions "Демо" or generation context somewhere
        const html = document.body.textContent || '';
        expect(html).toMatch(/демо/i);
    });
});
