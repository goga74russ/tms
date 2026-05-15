/**
 * MyHoursScreen — driver HOS (день/неделя) bars + recent-day breakdown.
 *
 * We mock the rto api module rather than the lower-level fetch, since the
 * screen calls getMyHosStatus + getMyHoursSummary directly.
 */
import React from 'react';
import { waitFor } from '@testing-library/react-native';
import MyHoursScreen from './MyHoursScreen';
import { renderWithNav } from '../../test/renderWithNav';

jest.mock('../api/rto', () => ({
    getMyHosStatus: jest.fn(),
    getMyHoursSummary: jest.fn(),
}));

import { getMyHosStatus, getMyHoursSummary } from '../api/rto';

const mockedStatus = getMyHosStatus as jest.MockedFunction<typeof getMyHosStatus>;
const mockedSummary = getMyHoursSummary as jest.MockedFunction<typeof getMyHoursSummary>;

beforeEach(() => {
    mockedStatus.mockReset();
    mockedSummary.mockReset();
});

describe('MyHoursScreen', () => {
    it('renders day + week cards with the value from the api', async () => {
        mockedStatus.mockResolvedValueOnce({
            dayHours: 6.5,
            weekHours: 42,
            dayLimit: 9,
            weekLimit: 56,
            breach: false,
        });
        mockedSummary.mockResolvedValueOnce({ dailyHours: [], weeklyHours: [], breaches: [] });

        const { findByText } = renderWithNav(MyHoursScreen);

        expect(await findByText('Сегодня')).toBeTruthy();
        expect(await findByText('Неделя')).toBeTruthy();
        expect(await findByText(/6\.5/)).toBeTruthy();
        expect(await findByText(/42/)).toBeTruthy();
    });

    it('renders the breach banner when status.breach=true', async () => {
        mockedStatus.mockResolvedValueOnce({
            dayHours: 11,
            weekHours: 60,
            dayLimit: 9,
            weekLimit: 56,
            breach: true,
        });
        mockedSummary.mockResolvedValueOnce({ dailyHours: [], weeklyHours: [], breaches: [] });

        const { findByText } = renderWithNav(MyHoursScreen);
        expect(await findByText('Превышены лимиты РТО')).toBeTruthy();
    });

    it('renders the daily breakdown rows from summary.dailyHours', async () => {
        mockedStatus.mockResolvedValueOnce({
            dayHours: 4,
            weekHours: 30,
            dayLimit: 9,
            weekLimit: 56,
            breach: false,
        });
        mockedSummary.mockResolvedValueOnce({
            dailyHours: [
                { date: '2026-05-07', hours: 8 },
                { date: '2026-05-08', hours: 4 },
            ],
            weeklyHours: [],
            breaches: [],
        });

        const { findByText } = renderWithNav(MyHoursScreen);
        await waitFor(() => expect(getMyHoursSummary).toHaveBeenCalled());
        expect(await findByText('Последние 7 дней')).toBeTruthy();
        expect(await findByText(/8 ч/)).toBeTruthy();
    });
});
