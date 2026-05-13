/**
 * TemperatureLogScreen — manual reading entry + auto-mode toggle.
 *
 * Auto-mode is a known foreground-only timer; the screen displays a warning
 * pill — we assert that pill is present so the limitation stays visible.
 */
import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import TemperatureLogScreen from './TemperatureLogScreen';
import { renderWithNav } from '../../test/renderWithNav';

jest.mock('../api/temperature', () => ({
    getTemperatureSummary: jest.fn(),
    getTemperatureReadings: jest.fn(),
    submitTemperature: jest.fn(),
}));

import {
    getTemperatureSummary,
    getTemperatureReadings,
    submitTemperature,
} from '../api/temperature';

const summaryMock = getTemperatureSummary as jest.MockedFunction<typeof getTemperatureSummary>;
const readingsMock = getTemperatureReadings as jest.MockedFunction<typeof getTemperatureReadings>;
const submitMock = submitTemperature as jest.MockedFunction<typeof submitTemperature>;

beforeEach(() => {
    summaryMock.mockReset();
    readingsMock.mockReset();
    submitMock.mockReset();
});

describe('TemperatureLogScreen', () => {
    it('renders SLA card + manual entry + auto-mode pill', async () => {
        summaryMock.mockResolvedValueOnce({
            tripId: 't-1',
            count: 3,
            avgC: 2.1,
            minC: 1.5,
            maxC: 3.2,
            breachCount: 0,
            slaMinC: 0,
            slaMaxC: 5,
        } as any);
        readingsMock.mockResolvedValueOnce({ data: [] } as any);

        const { findByText, getByPlaceholderText } = renderWithNav(TemperatureLogScreen, {
            params: { tripId: 't-1' },
        });

        expect(await findByText('SLA-диапазон')).toBeTruthy();
        expect(await findByText('Записать замер вручную')).toBeTruthy();
        expect(await findByText('Авто-режим (mock датчик)')).toBeTruthy();
        // The foreground-only warning pill must be present so drivers aren't surprised.
        expect(await findByText('ⓘ Авторежим работает только пока экран открыт')).toBeTruthy();
        expect(getByPlaceholderText('например, 4.2')).toBeTruthy();
    });

    it('submits a manual reading when the user enters a value and presses the button', async () => {
        summaryMock.mockResolvedValue({
            tripId: 't-1',
            count: 0,
            avgC: null,
            minC: null,
            maxC: null,
            breachCount: 0,
            slaMinC: 0,
            slaMaxC: 5,
        } as any);
        readingsMock.mockResolvedValue({ data: [] } as any);
        submitMock.mockResolvedValueOnce({
            id: 'r-1',
            breach: false,
            slaMinC: 0,
            slaMaxC: 5,
            queued: false,
        } as any);

        const { findByPlaceholderText, findByText } = renderWithNav(TemperatureLogScreen, {
            params: { tripId: 't-1' },
        });

        const input = await findByPlaceholderText('например, 4.2');
        fireEvent.changeText(input, '3.4');
        fireEvent.press(await findByText('Записать замер'));

        // submitTemperature is the seam — the screen passes tripId + body, source='manual'.
        await new Promise((r) => setImmediate(r));
        expect(submitMock).toHaveBeenCalled();
        const [tripId, body] = submitMock.mock.calls[0];
        expect(tripId).toBe('t-1');
        expect(body).toMatchObject({ tempC: 3.4, source: 'manual' });
    });
});
