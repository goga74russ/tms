/**
 * MyWaybillScreen — reads waybill summary by trip id, lets driver open PDF.
 *
 * Mock waybills api + react-native Linking.
 */
import React from 'react';
import { fireEvent, waitFor } from '@testing-library/react-native';
import MyWaybillScreen from './MyWaybillScreen';
import { renderWithNav } from '../../test/renderWithNav';
import { Linking } from 'react-native';

jest.mock('../api/waybills', () => ({
    getWaybillByTripId: jest.fn(),
    getWaybillPdfUrl: jest.fn(),
}));

import { getWaybillByTripId, getWaybillPdfUrl } from '../api/waybills';

const mockedSummary = getWaybillByTripId as jest.MockedFunction<typeof getWaybillByTripId>;
const mockedPdfUrl = getWaybillPdfUrl as jest.MockedFunction<typeof getWaybillPdfUrl>;

beforeEach(() => {
    mockedSummary.mockReset();
    mockedPdfUrl.mockReset();
    (Linking as any).__reset?.();
});

const sample = {
    id: 'wb-1',
    number: 'WB-001',
    status: 'issued',
    issuedAt: '2026-05-13T10:00:00Z',
    plannedDepartureAt: null,
    plannedReturnAt: null,
    actualDepartureAt: null,
    actualReturnAt: null,
    odometerStart: 100,
    odometerEnd: 250,
    vehicle: { brand: 'Volvo', model: 'FH', plateNumber: 'А123БВ77' },
    driver: { fullName: 'Иванов И.И.' },
    route: { from: 'Москва', to: 'Тверь', stopsCount: 2 },
    inspections: { techApproved: true, medicalApproved: true },
};

describe('MyWaybillScreen', () => {
    it('renders the waybill number and status pill', async () => {
        mockedSummary.mockResolvedValueOnce(sample);
        const utils = renderWithNav(MyWaybillScreen, { params: { tripId: 't-1' } });

        expect(await utils.findByText('Путевой лист')).toBeTruthy();
        expect(await utils.findByText('№ WB-001')).toBeTruthy();
        // "Выдан" appears in both the status pill and the KeyValueRow label —
        // use getAllByText to tolerate either.
        expect(utils.getAllByText('Выдан').length).toBeGreaterThan(0);
    });

    it('opens the PDF URL via Linking when the download button is pressed', async () => {
        mockedSummary.mockResolvedValueOnce(sample);
        mockedPdfUrl.mockResolvedValueOnce('https://api.local/waybills/wb-1/pdf?token=abc');

        const { findByText } = renderWithNav(MyWaybillScreen, { params: { tripId: 't-1' } });

        const btn = await findByText('Скачать PDF');
        fireEvent.press(btn);

        await waitFor(() => expect(getWaybillPdfUrl).toHaveBeenCalledWith('wb-1'));
        await waitFor(() =>
            expect((Linking as any).__getOpened()).toContain('https://api.local/waybills/wb-1/pdf?token=abc')
        );
    });

    it('shows an error message when waybill is not found', async () => {
        mockedSummary.mockResolvedValueOnce(null);
        const { findByText } = renderWithNav(MyWaybillScreen, { params: { tripId: 't-missing' } });

        expect(await findByText('Путевой лист по этому рейсу не найден')).toBeTruthy();
    });
});
