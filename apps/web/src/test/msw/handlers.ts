// ============================================================
// MSW handlers — default mock responses for page-level integration tests.
// Tests can override individual endpoints via `server.use(...)`.
// ============================================================
import { http, HttpResponse } from 'msw';

const okJson = <T,>(data: T, extra: Record<string, unknown> = {}) =>
    HttpResponse.json({ success: true, data, ...extra });

const TEST_USER = {
    id: 'user-1',
    email: 'admin@tms.local',
    fullName: 'Иван Тестов',
    roles: ['admin'],
    phone: null,
    driverId: null,
};

const TRIPS = [
    {
        id: 'trip-1',
        number: 'TR-1001',
        status: 'in_progress',
        plannedDistanceKm: 420,
        actualDistanceKm: 180,
        plannedDepartureAt: '2026-05-13T08:00:00Z',
        createdAt: '2026-05-12T10:00:00Z',
        carrierName: 'ООО «Перевозчик»',
    },
    {
        id: 'trip-2',
        number: 'TR-1002',
        status: 'planned',
        plannedDistanceKm: 220,
        plannedDepartureAt: '2026-05-14T09:00:00Z',
        createdAt: '2026-05-12T11:00:00Z',
    },
    {
        id: 'trip-3',
        number: 'TR-1003',
        status: 'completed',
        plannedDistanceKm: 310,
        actualDistanceKm: 312,
        actualCompletionAt: '2026-05-11T19:30:00Z',
        createdAt: '2026-05-10T08:00:00Z',
    },
];

const WAYBILLS = [
    {
        id: 'wb-1',
        number: 'WB-2001',
        status: 'issued',
        tripId: 'trip-1',
        driverId: 'driver-1',
        vehicleId: 'veh-1',
        odometerOut: 100000,
        odometerIn: null,
        fuelOut: 200,
        fuelIn: null,
        issuedAt: '2026-05-13T07:00:00Z',
        createdAt: '2026-05-13T06:00:00Z',
    },
    {
        id: 'wb-2',
        number: 'WB-2002',
        status: 'closed',
        tripId: 'trip-3',
        driverId: 'driver-2',
        vehicleId: 'veh-2',
        odometerOut: 120000,
        odometerIn: 120400,
        fuelOut: 220,
        fuelIn: 180,
        issuedAt: '2026-05-10T07:00:00Z',
        closedAt: '2026-05-11T20:00:00Z',
        createdAt: '2026-05-10T06:00:00Z',
    },
];

// Даты — относительно «сейчас», иначе тест-таймбомба: /finance дефолтит период
// на MTD (month-to-date), и фиксированные майские даты выпадали из фильтра при
// переходе календаря на следующий месяц (INV-300x переставали рендериться).
const RECENT_ISO = new Date().toISOString();
const INVOICES = Array.from({ length: 5 }).map((_, i) => ({
    id: `inv-${i + 1}`,
    number: `INV-300${i + 1}`,
    status: i === 0 ? 'paid' : i === 1 ? 'overdue' : 'pending',
    contractorId: 'c-1',
    contractorName: 'ООО «Клиент»',
    amount: '100000.00',
    amountKopecks: 10000000,
    issuedAt: RECENT_ISO,
    dueAt: RECENT_ISO,
    createdAt: RECENT_ISO,
}));

export const handlers = [
    // ────────────────── auth ──────────────────
    http.post('/api/auth/login', () => okJson({ user: TEST_USER })),
    http.post('/api/auth/logout', () => HttpResponse.json({ success: true })),
    http.get('/api/auth/me', () => okJson(TEST_USER)),
    http.post('/api/auth/signup', () =>
        HttpResponse.json({ success: true, codeSent: true }),
    ),
    http.post('/api/auth/verify-email', () => okJson({ verified: true })),
    http.post('/api/auth/resend-code', () => HttpResponse.json({ success: true })),

    // ────────────────── onboarding ──────────────────
    http.get('/api/onboarding/status', () =>
        okJson({
            currentStep: 0,
            completedSteps: [] as string[],
            organizationId: null,
            inn: null,
            companyName: null,
            scenario: null,
            ediProvider: null,
            signatureProvider: null,
            teamInvitesSent: 0,
        }),
    ),
    http.post('/api/onboarding/inn', () => okJson({ ok: true })),
    http.post('/api/onboarding/profile', () => okJson({ ok: true })),
    http.post('/api/onboarding/scenario', () => okJson({ ok: true })),

    // ────────────────── trips / waybills ──────────────────
    http.get('/api/trips', () => okJson(TRIPS)),
    http.get('/api/trips/:id', ({ params }) =>
        okJson({ ...TRIPS[0], id: params.id, dossier: { documents: [], temperature: [] } }),
    ),
    http.get('/api/trips/:id/cold-chain', () =>
        okJson({ coldChainRequired: false, breachCount: 0, minC: null, maxC: null }),
    ),
    http.get('/api/waybills', () => okJson(WAYBILLS)),
    http.get('/api/waybills/:id', ({ params }) => okJson({ ...WAYBILLS[0], id: params.id })),

    // ────────────────── finance ──────────────────
    http.get('/api/finance/invoices', () => okJson(INVOICES)),
    http.get('/api/finance/summary', () =>
        okJson({
            totalRevenue: 500000,
            totalPaid: 100000,
            totalPending: 300000,
            totalOverdue: 100000,
        }),
    ),
    http.get('/api/finance/doc-returns', () => okJson([])),
    http.get('/api/contractors', () => okJson([{ id: 'c-1', name: 'ООО «Клиент»', inn: '7700000000' }])),

    // ────────────────── claims ──────────────────
    http.get('/api/claims', () => okJson([])),
    http.get('/api/claims/summary', () =>
        okJson({ open: 0, investigating: 0, resolved: 0, rejected: 0, totalExposure: 0 }),
    ),

    // ────────────────── dispatcher ──────────────────
    http.get('/api/dispatcher/exceptions', () =>
        okJson([
            {
                id: 'exc-1',
                tripId: 'trip-1',
                severity: 'blocker',
                title: 'Опоздание на погрузку',
                description: 'Задержка > 60 минут',
                createdAt: '2026-05-13T09:00:00Z',
            },
        ]),
    ),
    http.get('/api/dispatcher/live', () =>
        okJson([
            { tripId: 'trip-1', plate: 'А123БВ77', status: 'in_progress', lat: 55.7, lon: 37.6 },
            { tripId: 'trip-2', plate: 'В456ГД77', status: 'planned', lat: 59.9, lon: 30.3 },
        ]),
    ),
    http.get('/api/dispatcher/vehicles', () => okJson([])),
    http.get('/api/dispatcher/orders/unassigned', () => okJson([])),
    http.get('/api/dispatcher/positions', () => okJson([])),

    // ────────────────── admin: billing ──────────────────
    http.get('/api/admin/billing/overview', () =>
        okJson([
            {
                organizationId: 'org-1',
                organizationName: 'ООО «Тест»',
                inn: '7700000000',
                planId: 'free',
                status: 'active',
                currentPeriodEnd: '2026-06-01T00:00:00Z',
                mrrKopecks: 0,
            },
        ]),
    ),

    // ────────────────── admin: integrations ──────────────────
    http.get('/api/integrations/credentials', () => okJson([])),
    http.post('/api/integrations/credentials', () => okJson({ id: 'cred-1' })),
    http.delete('/api/integrations/credentials/:id', () => okJson({ ok: true })),

    // ────────────────── admin: users ──────────────────
    http.get('/api/auth/users', () =>
        okJson([
            {
                id: 'user-1',
                email: 'admin@tms.local',
                fullName: 'Иван Тестов',
                phone: null,
                roles: ['admin'],
                isActive: true,
                contractorId: null,
                organizationId: 'org-1',
                createdAt: '2026-01-01T00:00:00Z',
            },
        ]),
    ),

    // ────────────────── admin: settings ──────────────────
    http.get('/api/settings/cost-model', () =>
        okJson({
            fuelPricePerLiter: { value: 55, source: 'manual', description: 'Цена за литр ДТ', updatedAt: '2026-05-01T00:00:00Z' },
            driverSalaryPerHour: { value: 350, source: 'manual', description: 'Ставка водителя', updatedAt: '2026-05-01T00:00:00Z' },
            amortizationPerKm: { value: 3.5, source: 'manual', description: 'Амортизация', updatedAt: '2026-05-01T00:00:00Z' },
        }),
    ),

    // ────────────────── admin: audit-log ──────────────────
    http.get('/api/audit-log', () =>
        HttpResponse.json({
            success: true,
            data: [],
            pagination: { page: 1, limit: 50, total: 0, pages: 1 },
        }),
    ),
    http.get('/api/audit-log/types', () =>
        okJson({ eventTypes: ['trip.created'], entityTypes: ['trip'] }),
    ),

    // ────────────────── repair / fleet ──────────────────
    http.get('/api/repairs', () => okJson([])),
    http.get('/api/repairs/summary', () => okJson({ open: 0, in_progress: 0, completed: 0 })),
    http.get('/api/repairs/catalog', () => okJson([])),
    http.get('/api/fleet/vehicles', () => okJson([])),
    http.get('/api/fleet/drivers', () => okJson([])),
    http.get('/api/fleet/trailers', () => okJson([])),
    http.get('/api/fleet/permits', () => okJson([])),
    http.get('/api/fleet/fines', () => okJson([])),
    http.get('/api/fleet/contractors', () => okJson([])),
    http.get('/api/fleet/fuel-records', () => okJson([])),
    http.get('/api/fleet/odometer-history', () => okJson([])),
    http.get('/api/fleet/downtime', () => okJson([])),
    http.get('/api/fleet/maintenance-schedule', () => okJson([])),

    // ────────────────── orders / operations ──────────────────
    http.get('/api/orders', () => okJson([])),
    http.get('/api/operations/exceptions', () => okJson([])),

    // ────────────────── repair extras ──────────────────
    http.get('/api/repairs/parts/catalog/meta', () => okJson({})),
    http.get('/api/repairs/analytics/by-status', () => okJson([])),

    // ────────────────── ws / misc ──────────────────
    http.get('/api/auth/ws-token', () => okJson({ token: 'test-ws-token' })),

    // ────────────────── misc fallbacks ──────────────────
    http.get('/api/copilot/quota', () =>
        okJson({ used: 0, limit: 10, plan: 'free' }),
    ),
];
