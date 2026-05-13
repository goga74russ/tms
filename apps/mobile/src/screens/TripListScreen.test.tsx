/**
 * TripListScreen — driver's list of trips, sourced from local WatermelonDB.
 *
 * The component subscribes to `database.collections.get('trips').query().observe()`
 * and re-fetches on every emission. Our mock fires the subscription once with
 * the seeded rows. We override the `query().fetch()` per-test before render.
 */
import React from 'react';
import { fireEvent, waitFor } from '@testing-library/react-native';
import TripListScreen from './TripListScreen';
import { renderWithNav } from '../../test/renderWithNav';
import { __setRows, __reset as resetDb, database } from '../../test/mocks/database';

jest.mock('../context/AuthContext', () => ({
    useAuth: () => ({
        user: { id: 'u1', driverId: 'd1', email: 'a@b', role: 'driver', roles: ['driver'] },
        token: 'jwt',
        isLoading: false,
        login: jest.fn(),
        logout: jest.fn(),
    }),
}));

beforeEach(() => {
    resetDb();
});

const tripRow = (overrides: Partial<any> = {}) => ({
    id: 'row-1',
    tripId: 'trip-abcdef12-345',
    route: JSON.stringify([
        { city: 'Москва', address: 'Москва' },
        { city: 'Тверь', address: 'Тверь' },
    ]),
    status: 'in_transit',
    driverId: 'd1',
    vehicleId: 'v1',
    ...overrides,
});

describe('TripListScreen', () => {
    it('renders trips returned by the DB query', async () => {
        __setRows('trips', [tripRow({ status: 'in_transit' })]);
        const { findByText } = renderWithNav(TripListScreen);

        // Route header text is rendered for every card.
        expect(await findByText(/Москва.*Тверь/)).toBeTruthy();
        expect(await findByText('В пути')).toBeTruthy();
    });

    it('renders the empty state when there are no active trips', async () => {
        __setRows('trips', []);
        const { findByText } = renderWithNav(TripListScreen);

        expect(await findByText('Нет активных рейсов')).toBeTruthy();
    });

    it('navigates to TripDetails when a row is pressed', async () => {
        __setRows('trips', [tripRow({ tripId: 'trip-xyz', status: 'in_transit' })]);
        const { findByText, navigation } = renderWithNav(TripListScreen);

        const row = await findByText(/Москва/);
        fireEvent.press(row);

        await waitFor(() =>
            expect(navigation.navigate).toHaveBeenCalledWith('TripDetails', { tripId: 'trip-xyz' })
        );
    });

    it('switches filter to "Завершённые" and shows empty state', async () => {
        __setRows('trips', [tripRow({ status: 'in_transit' })]);
        const { findByText } = renderWithNav(TripListScreen);

        fireEvent.press(await findByText('Завершённые'));
        expect(await findByText('Завершённых рейсов пока нет')).toBeTruthy();
    });
});
