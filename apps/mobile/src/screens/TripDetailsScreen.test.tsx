/**
 * TripDetailsScreen — heavy screen with map hero, sticky bar, multiple
 * conditional cards. We focus on:
 *   - smoke render with a trip in the local DB
 *   - the start-trip button appears when trip.status === 'waybill_issued'
 *   - the offline-queue pill appears when queue has items
 */
import React from 'react';
import { waitFor } from '@testing-library/react-native';
import TripDetailsScreen from './TripDetailsScreen';
import { renderWithNav } from '../../test/renderWithNav';
import { __setRows, __reset as resetDb } from '../../test/mocks/database';

jest.mock('../api/trips', () => ({
    getTripById: jest.fn(async () => null),
    getTripEta: jest.fn(async () => ({ data: null })),
    getTripOperationExceptions: jest.fn(async () => ({
        summary: { blocking: 0, warning: 0, info: 0 },
        exceptions: [],
    })),
    startTrip: jest.fn(),
    completeTrip: jest.fn(),
}));

jest.mock('../api/temperature', () => ({
    getTemperatureSummary: jest.fn(async () => null),
}));

jest.mock('../api/offlineQueue', () => ({
    getQueueSummary: jest.fn(async () => ({
        size: 0,
        hasCheckpoint: false,
        hasCompletion: false,
        hasDelivery: false,
        hasInspection: false,
        hasRetries: false,
    })),
}));

jest.mock('../api/wialonMock', () => ({
    startWialonMock: jest.fn(),
    stopWialonMock: jest.fn(),
}));

const tripRow = (status: string) => ({
    id: 'row-1',
    tripId: 'trip-abc',
    route: JSON.stringify([{ city: 'Москва' }, { city: 'Тверь' }]),
    status,
    driverId: 'd1',
    vehicleId: 'v1',
});

const pointRow = (idx: number, status = 'pending') => ({
    id: `pt-${idx}`,
    tripId: 'trip-abc',
    routePointId: `rp-${idx}`,
    address: `Адрес ${idx}`,
    type: idx === 1 ? 'loading' : 'unloading',
    status,
    windowStart: null,
    windowEnd: null,
});

beforeEach(() => {
    resetDb();
});

describe('TripDetailsScreen', () => {
    it('renders the trip title + status caption once data is loaded', async () => {
        __setRows('trips', [tripRow('in_transit')]);
        __setRows('route_points', [pointRow(1, 'completed'), pointRow(2, 'pending')]);

        const { findByText } = renderWithNav(TripDetailsScreen, { params: { tripId: 'trip-abc' } });

        // tripId is truncated to first 8 chars in the title.
        expect(await findByText(/Маршрут № trip-abc/)).toBeTruthy();
        expect(await findByText('Точки маршрута')).toBeTruthy();
    });

    it('shows the "Начать рейс" button when trip status is waybill_issued', async () => {
        __setRows('trips', [tripRow('waybill_issued')]);
        __setRows('route_points', [pointRow(1, 'pending')]);

        const { findByText } = renderWithNav(TripDetailsScreen, { params: { tripId: 'trip-abc' } });

        expect(await findByText('🚀 Начать рейс')).toBeTruthy();
    });

    it('renders the cockpit summary card with zero blockers by default', async () => {
        __setRows('trips', [tripRow('in_transit')]);
        __setRows('route_points', [pointRow(1, 'pending')]);

        const { findByText } = renderWithNav(TripDetailsScreen, { params: { tripId: 'trip-abc' } });

        await waitFor(() => expect(findByText('Контроль рейса')).resolves.toBeTruthy());
        expect(await findByText('Блокеров нет')).toBeTruthy();
    });
});
