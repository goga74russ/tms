import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen, waitFor } from '@/test/render';
import { navigationMock, linkMock } from '@/test/mocks';

vi.mock('next/navigation', () => navigationMock());
vi.mock('next/link', () => linkMock());

import OnboardingPage from './page';

describe('OnboardingPage', () => {
    it('renders step indicator with INN label', async () => {
        renderWithProviders(<OnboardingPage />);
        await waitFor(() => {
            expect(screen.getAllByText(/ИНН/).length).toBeGreaterThan(0);
        });
    });

    it('renders all 6 step labels', async () => {
        renderWithProviders(<OnboardingPage />);
        await waitFor(() => {
            // Step labels: ИНН, Реквизиты, Сценарий, ЭДО, Подпись, Команда
            expect(screen.getAllByText(/Реквизиты/).length).toBeGreaterThan(0);
            expect(screen.getAllByText(/Сценарий/).length).toBeGreaterThan(0);
            expect(screen.getAllByText(/ЭДО/).length).toBeGreaterThan(0);
            expect(screen.getAllByText(/Подпись/).length).toBeGreaterThan(0);
            expect(screen.getAllByText(/Команда/).length).toBeGreaterThan(0);
        });
    });

    it('renders help sidebar for the first step', async () => {
        renderWithProviders(<OnboardingPage />);
        await waitFor(() => {
            expect(screen.getByText(/Зачем это нужно/i)).toBeInTheDocument();
        });
    });
});
