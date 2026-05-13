/**
 * MechanicInspectionScreen — multi-step queue → checklist → decision → signature.
 *
 * We mock the inspections api and verify the queue list renders. Camera /
 * signature paths share the same native limitation as Checkpoint and Delivery
 * screens.
 */
import React from 'react';
import { fireEvent, waitFor } from '@testing-library/react-native';
import MechanicInspectionScreen from './MechanicInspectionScreen';
import { renderWithNav } from '../../test/renderWithNav';

jest.mock('../api/inspections', () => ({
    getTechQueue: jest.fn(),
    getTechChecklist: jest.fn(),
    submitTechInspection: jest.fn(),
}));

jest.mock('../api/upload', () => ({
    uploadPhoto: jest.fn(async () => 'https://api/photo.jpg'),
}));

import { getTechQueue, getTechChecklist } from '../api/inspections';

const queueMock = getTechQueue as jest.MockedFunction<typeof getTechQueue>;
const checklistMock = getTechChecklist as jest.MockedFunction<typeof getTechChecklist>;

beforeEach(() => {
    queueMock.mockReset();
    checklistMock.mockReset();
});

describe('MechanicInspectionScreen', () => {
    it('renders the queue header + empty state when there are no vehicles', async () => {
        queueMock.mockResolvedValueOnce([]);
        checklistMock.mockResolvedValueOnce({ version: 1, items: [{ name: 'Тормоза' }] } as any);

        const { findByText } = renderWithNav(MechanicInspectionScreen);

        expect(await findByText('Очередь техосмотра')).toBeTruthy();
        expect(await findByText('Нет ТС, ожидающих осмотра')).toBeTruthy();
    });

    it('renders queue cards for each vehicle awaiting inspection', async () => {
        queueMock.mockResolvedValueOnce([
            {
                vehicle: { id: 'v1', plateNumber: 'А123БВ77', make: 'Volvo', model: 'FH' },
                trip: { id: 't1', number: 'TR-001', plannedDepartureAt: null },
            },
        ] as any);
        checklistMock.mockResolvedValueOnce({ version: 2, items: [{ name: 'Тормоза' }] } as any);

        const { findByText } = renderWithNav(MechanicInspectionScreen);

        expect(await findByText('А123БВ77')).toBeTruthy();
        expect(await findByText('Volvo FH')).toBeTruthy();
        expect(await findByText('Рейс TR-001')).toBeTruthy();
    });

    it('enters the checklist step when a queue card is pressed', async () => {
        queueMock.mockResolvedValueOnce([
            {
                vehicle: { id: 'v1', plateNumber: 'А123БВ77', make: 'Volvo', model: 'FH' },
                trip: { id: 't1', number: 'TR-001', plannedDepartureAt: null },
            },
        ] as any);
        checklistMock.mockResolvedValueOnce({
            version: 2,
            items: [{ name: 'Тормоза' }, { name: 'Фары' }],
        } as any);

        const { findByText } = renderWithNav(MechanicInspectionScreen);

        const card = await findByText('А123БВ77');
        fireEvent.press(card);

        await waitFor(() => expect(findByText('Техосмотр')).resolves.toBeTruthy());
        expect(await findByText('1. Тормоза')).toBeTruthy();
        expect(await findByText('2. Фары')).toBeTruthy();
    });
});
