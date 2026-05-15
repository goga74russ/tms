/**
 * CheckpointScreen — driver confirms a route point (photo → signature → submit).
 *
 * Heavy native surface (camera, signature canvas, NetInfo). We rely on the
 * existing mocks; this suite covers the entry "details" step. Camera + signature
 * paths require integration tests with the real native modules and are out
 * of scope for unit tests.
 */
import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import CheckpointScreen from './CheckpointScreen';
import { renderWithNav } from '../../test/renderWithNav';

jest.mock('../context/AuthContext', () => ({
    useAuth: () => ({ token: 'jwt', user: { id: 'u1' } }),
}));

jest.mock('../api/offlineQueue', () => ({
    enqueueAction: jest.fn(async () => undefined),
}));

jest.mock('../api/upload', () => ({
    uploadPhoto: jest.fn(async () => 'https://api/photo.jpg'),
}));

describe('CheckpointScreen', () => {
    const params = { tripId: 't-1', routePointId: 'p-1' };

    it('renders the heading + notes input + the two primary action buttons', () => {
        const { getByText, getByPlaceholderText } = renderWithNav(CheckpointScreen, { params });

        expect(getByText('Подтверждение точки')).toBeTruthy();
        expect(getByText('Заметки / расхождения')).toBeTruthy();
        expect(getByText('Сфотографировать')).toBeTruthy();
        expect(getByText('Я прибыл и подписать')).toBeTruthy();
        expect(
            getByPlaceholderText('Опишите состояние груза или расхождения, если они есть')
        ).toBeTruthy();
    });

    it('captures notes text via TextInput onChangeText', () => {
        const { getByPlaceholderText } = renderWithNav(CheckpointScreen, { params });

        const input = getByPlaceholderText('Опишите состояние груза или расхождения, если они есть');
        fireEvent.changeText(input, 'Все хорошо');
        expect(input.props.value).toBe('Все хорошо');
    });

    it('shows the dev-only stub buttons only when __DEV__ is true', () => {
        // __DEV__ is true under jest by default — assert presence.
        const { getByText } = renderWithNav(CheckpointScreen, { params });
        expect(getByText('Простой / задержка')).toBeTruthy();
        expect(getByText('Пропустить точку')).toBeTruthy();
    });
});
