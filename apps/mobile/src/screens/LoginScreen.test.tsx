/**
 * LoginScreen — renders the email/password form and delegates to AuthContext.
 *
 * We stub `useAuth` directly so the test doesn't need the full provider tree.
 */
import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import LoginScreen from './LoginScreen';
import { renderWithNav } from '../../test/renderWithNav';

const loginMock = jest.fn();

jest.mock('../context/AuthContext', () => ({
    useAuth: () => ({
        login: loginMock,
        logout: jest.fn(),
        user: null,
        token: null,
        isLoading: false,
    }),
}));

beforeEach(() => {
    loginMock.mockReset();
});

describe('LoginScreen', () => {
    it('renders form labels and the primary login button', () => {
        const { getByText, getByPlaceholderText } = renderWithNav(LoginScreen);

        expect(getByText('TMS')).toBeTruthy();
        expect(getByText('Вход в систему')).toBeTruthy();
        expect(getByText('Войти в систему')).toBeTruthy();
        expect(getByPlaceholderText('driver@tms.local')).toBeTruthy();
    });

    it('invokes auth.login with email + password on button press', async () => {
        loginMock.mockResolvedValueOnce(undefined);
        const { getByText, getByPlaceholderText } = renderWithNav(LoginScreen);

        fireEvent.changeText(getByPlaceholderText('driver@tms.local'), 'driver@tms.local');
        fireEvent.changeText(getByPlaceholderText('••••••••'), 'pw123');
        fireEvent.press(getByText('Войти в систему'));

        // login is awaited but the press handler is async; flush microtasks.
        await Promise.resolve();
        expect(loginMock).toHaveBeenCalledWith('driver@tms.local', 'pw123');
    });

    it('renders the error banner when login throws (e.g. 401)', async () => {
        loginMock.mockRejectedValueOnce(new Error('Invalid credentials'));
        const { getByText, getByPlaceholderText, findByText } = renderWithNav(LoginScreen);

        fireEvent.changeText(getByPlaceholderText('driver@tms.local'), 'a@b');
        fireEvent.changeText(getByPlaceholderText('••••••••'), 'bad');
        fireEvent.press(getByText('Войти в систему'));

        const err = await findByText('Invalid credentials');
        expect(err).toBeTruthy();
    });
});
