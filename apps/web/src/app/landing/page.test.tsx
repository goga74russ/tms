import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen } from '@/test/render';
import { navigationMock, linkMock } from '@/test/mocks';

vi.mock('next/navigation', () => navigationMock());
vi.mock('next/link', () => linkMock());

import LandingPage from './page';

describe('LandingPage', () => {
    it('renders without throwing', () => {
        renderWithProviders(<LandingPage />);
        // The page mounts sticky header + hero
        expect(document.body).toBeInTheDocument();
    });

    it('renders the pricing section anchor', () => {
        const { container } = renderWithProviders(<LandingPage />);
        expect(container.querySelector('#pricing')).toBeInTheDocument();
        expect(container.querySelector('#features')).toBeInTheDocument();
        expect(container.querySelector('#faq')).toBeInTheDocument();
    });

    it('renders the how-it-works anchor', () => {
        const { container } = renderWithProviders(<LandingPage />);
        expect(container.querySelector('#how')).toBeInTheDocument();
    });
});
