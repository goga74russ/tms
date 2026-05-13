/**
 * Tests for the mobile auth API wrapper (login / logout / getMe / AuthError).
 *
 * Strategy: mock `global.fetch` and rely on the in-memory expo-secure-store
 * mock from test/mocks/expo-secure-store.ts. The offlineQueue is also mocked
 * via the existing jest moduleNameMapper, so logout() can safely call clearQueue().
 */

import { login, logout, getToken, getMe, AuthError } from './auth';
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'tms_jwt_token';

beforeEach(() => {
    (global as any).fetch = jest.fn();
    // Reset the in-memory secure-store between tests.
    (SecureStore as any).__reset?.();
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe('login', () => {
    it('200 OK with token under data.token persists token and returns it', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({ data: { token: 'jwt-abc' } }),
        });

        const token = await login('a@b', 'pw');

        expect(token).toBe('jwt-abc');
        expect(await SecureStore.getItemAsync(TOKEN_KEY)).toBe('jwt-abc');
        // Verify the URL and body
        const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
        expect(url).toContain('/auth/mobile/login');
        expect(options.method).toBe('POST');
        expect(JSON.parse(options.body)).toEqual({ email: 'a@b', password: 'pw' });
    });

    it('200 OK with legacy top-level `token` also works', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({ token: 'legacy-token' }),
        });

        await expect(login('a@b', 'pw')).resolves.toBe('legacy-token');
    });

    it('200 OK without a token in the body throws', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({ data: {} }),
        });

        await expect(login('a@b', 'pw')).rejects.toThrow(/No token/);
        expect(await SecureStore.getItemAsync(TOKEN_KEY)).toBeNull();
    });

    it('401 throws with the server-supplied error message', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: false,
            status: 401,
            json: async () => ({ error: 'Invalid credentials' }),
        });

        await expect(login('a@b', 'wrong')).rejects.toThrow('Invalid credentials');
        expect(await SecureStore.getItemAsync(TOKEN_KEY)).toBeNull();
    });

    it('500 with unparseable body falls back to "Failed to login"', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: false,
            status: 500,
            json: async () => {
                throw new Error('not json');
            },
        });

        await expect(login('a@b', 'pw')).rejects.toThrow('Failed to login');
    });

    it('network error surfaces unchanged (not wrapped as AuthError)', async () => {
        (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network request failed'));
        await expect(login('a@b', 'pw')).rejects.toThrow('Network request failed');
    });
});

describe('logout', () => {
    it('clears the persisted token', async () => {
        await SecureStore.setItemAsync(TOKEN_KEY, 'will-be-wiped');
        expect(await SecureStore.getItemAsync(TOKEN_KEY)).toBe('will-be-wiped');

        await logout();

        expect(await SecureStore.getItemAsync(TOKEN_KEY)).toBeNull();
    });
});

describe('getToken', () => {
    it('returns null when no token stored', async () => {
        expect(await getToken()).toBeNull();
    });

    it('returns the stored token', async () => {
        await SecureStore.setItemAsync(TOKEN_KEY, 'persisted-token');
        expect(await getToken()).toBe('persisted-token');
    });
});

describe('getMe', () => {
    it('returns parsed JSON on 200', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({ data: { id: 'u1', email: 'a@b', roles: ['driver'] } }),
        });

        const result = await getMe('jwt-token');
        expect(result.data.id).toBe('u1');

        const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
        expect(url).toContain('/auth/me');
        expect(options.headers.Authorization).toBe('Bearer jwt-token');
    });

    it('throws AuthError with the response status when non-ok', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
            ok: false,
            status: 401,
            json: async () => ({}),
        });

        await expect(getMe('bad-token')).rejects.toBeInstanceOf(AuthError);
        try {
            await getMe('bad-token');
            throw new Error('expected to throw');
        } catch (err) {
            expect(err).toBeInstanceOf(AuthError);
            expect((err as AuthError).status).toBe(401);
        }
    });

    it('AuthError name is "AuthError"', () => {
        const e = new AuthError('m', 403);
        expect(e.name).toBe('AuthError');
        expect(e.status).toBe(403);
        expect(e.message).toBe('m');
    });
});
