/**
 * TripCompletionScreen — driver enters final odometer + fuel, submits sync event.
 *
 * The screen calls fetch directly via process.env.EXPO_PUBLIC_API_URL; we mock
 * global.fetch and the offline queue.
 */
import React from 'react';
import { fireEvent, waitFor } from '@testing-library/react-native';
import TripCompletionScreen from './TripCompletionScreen';
import { renderWithNav } from '../../test/renderWithNav';
import { Alert } from 'react-native';

jest.mock('../context/AuthContext', () => ({
    useAuth: () => ({ token: 'jwt', user: { id: 'u1' } }),
}));

jest.mock('../api/offlineQueue', () => ({
    enqueueAction: jest.fn(async () => undefined),
}));

import { enqueueAction } from '../api/offlineQueue';

beforeEach(() => {
    (Alert as any).__reset?.();
    (enqueueAction as jest.Mock).mockReset();
    (global as any).fetch = jest.fn();
});

describe('TripCompletionScreen', () => {
    it('renders the heading + the two big numeric inputs', () => {
        const { getByText, getByPlaceholderText } = renderWithNav(TripCompletionScreen, {
            params: { tripId: 't-1' },
        });

        expect(getByText('Завершение рейса')).toBeTruthy();
        expect(getByText('Показания одометра (км)')).toBeTruthy();
        expect(getByPlaceholderText('145000')).toBeTruthy();
        expect(getByPlaceholderText('45')).toBeTruthy();
    });

    it('alerts when the driver leaves a field blank', () => {
        const { getByText } = renderWithNav(TripCompletionScreen, { params: { tripId: 't-1' } });

        fireEvent.press(getByText('Завершить рейс'));
        const calls = (Alert as any).__getCalls();
        expect(calls.length).toBeGreaterThan(0);
        expect(calls[0].title).toBe('Ошибка');
    });

    it('submits a sync event to /sync/events when both fields are filled', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({ data: { ok: true } }),
        });

        const { getByText, getByPlaceholderText } = renderWithNav(TripCompletionScreen, {
            params: { tripId: 't-1' },
        });

        fireEvent.changeText(getByPlaceholderText('145000'), '150000');
        fireEvent.changeText(getByPlaceholderText('45'), '40');
        fireEvent.press(getByText('Завершить рейс'));

        await waitFor(() => expect(global.fetch).toHaveBeenCalled());
        const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
        expect(url).toContain('/sync/events');
        const body = JSON.parse(init.body);
        expect(body.events[0].payload).toMatchObject({
            tripId: 't-1',
            odometer: 150000,
            fuel: 40,
        });
    });
});
