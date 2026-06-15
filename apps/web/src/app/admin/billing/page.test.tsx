import { describe, it, expect, vi, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { renderWithProviders, screen, waitFor } from '@/test/render';
import { navigationMock, linkMock } from '@/test/mocks';
import { server } from '@/test/msw/server';

vi.mock('next/navigation', () => navigationMock());
vi.mock('next/link', () => linkMock());

import AdminBillingPage from './page';

describe('AdminBillingPage', () => {
    // P3 wave 2 (#703) ограничил loadRows гейтом user.isSuperAdmin. Дефолтный
    // TEST_USER — обычный admin без isSuperAdmin, поэтому строки не грузятся.
    // Для тестов биллинга подменяем /api/auth/me на платформенного super-admin.
    beforeEach(() => {
        server.use(
            http.get('/api/auth/me', () =>
                HttpResponse.json({
                    success: true,
                    data: {
                        id: 'user-1',
                        email: 'admin@tms.local',
                        fullName: 'Иван Тестов',
                        roles: ['admin'],
                        phone: null,
                        driverId: null,
                        isSuperAdmin: true,
                    },
                }),
            ),
        );
    });

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
