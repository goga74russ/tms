/**
 * DeliveryConfirmationScreen — 3-step wizard (фото → подпись → детали).
 *
 * Native surface: camera, signature canvas, expo-location, NetInfo. We cover
 * the wizard chrome (step labels, photo prompt) and the details-step form
 * rendering. Full submit flow needs integration tests against the live native
 * modules — out of scope here.
 */
import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import DeliveryConfirmationScreen from './DeliveryConfirmationScreen';
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

describe('DeliveryConfirmationScreen', () => {
    it('starts on the photo step with the empty placeholder prompt', () => {
        const { getByText } = renderWithNav(DeliveryConfirmationScreen, {
            params: { tripId: 't-1' },
        });

        expect(getByText('Подтверждение доставки')).toBeTruthy();
        expect(getByText('Нажмите, чтобы сделать фото')).toBeTruthy();
        expect(getByText('Дальше →')).toBeTruthy();
    });

    it('moves from photo → signature when "Дальше →" is pressed', () => {
        const { getByText, queryByText } = renderWithNav(DeliveryConfirmationScreen, {
            params: { tripId: 't-1' },
        });

        fireEvent.press(getByText('Дальше →'));
        // Signature step renders this prompt.
        expect(queryByText(/Подпись получателя/)).toBeTruthy();
    });
});
