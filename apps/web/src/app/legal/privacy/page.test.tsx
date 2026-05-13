import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen } from '@/test/render';
import { navigationMock, linkMock } from '@/test/mocks';

vi.mock('next/navigation', () => navigationMock());
vi.mock('next/link', () => linkMock());

import PrivacyPolicyPage from './page';

describe('PrivacyPolicyPage', () => {
    it('renders the policy title', () => {
        renderWithProviders(<PrivacyPolicyPage />);
        expect(screen.getByText(/Политика конфиденциальности/i)).toBeInTheDocument();
    });

    it('renders the dateline', () => {
        renderWithProviders(<PrivacyPolicyPage />);
        expect(screen.getByText(/Дата вступления в силу/i)).toBeInTheDocument();
    });

    it('renders TOC sections (общие положения, оператор)', () => {
        renderWithProviders(<PrivacyPolicyPage />);
        expect(screen.getAllByText(/Общие положения/i).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/Оператор/i).length).toBeGreaterThan(0);
    });

    it('references 152-ФЗ', () => {
        renderWithProviders(<PrivacyPolicyPage />);
        expect(screen.getAllByText(/152-ФЗ/).length).toBeGreaterThan(0);
    });
});
