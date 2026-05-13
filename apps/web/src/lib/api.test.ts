import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { api } from './api';

describe('ApiClient', () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        fetchMock = vi.fn();
        (global as any).fetch = fetchMock;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    function jsonResponse(body: unknown, init: Partial<{ ok: boolean; status: number }> = {}) {
        return {
            ok: init.ok ?? true,
            status: init.status ?? 200,
            json: async () => body,
        };
    }

    it('GET targets /api{path} with credentials and no body', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, data: [] }));
        await api.get('/trips');

        const [url, options] = fetchMock.mock.calls[0];
        expect(url).toBe('/api/trips');
        expect(options.method).toBe('GET');
        expect(options.credentials).toBe('include');
        expect(options.body).toBeUndefined();
    });

    it('POST sets Content-Type: application/json and stringifies body', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse({ success: true }));
        await api.post('/trips', { name: 'X' });

        const [url, options] = fetchMock.mock.calls[0];
        expect(url).toBe('/api/trips');
        expect(options.method).toBe('POST');
        expect(options.headers['Content-Type']).toBe('application/json');
        expect(options.body).toBe(JSON.stringify({ name: 'X' }));
    });

    it('POST with no body still sends "{}" (server expects JSON)', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse({ success: true }));
        await api.post('/auth/logout');
        const [, options] = fetchMock.mock.calls[0];
        expect(options.body).toBe('{}');
    });

    it('POST with FormData omits Content-Type and sends raw FormData', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse({ success: true }));
        const fd = new FormData();
        fd.append('file', 'x');
        await api.post('/upload', fd);

        const [, options] = fetchMock.mock.calls[0];
        expect(options.headers['Content-Type']).toBeUndefined();
        expect(options.body).toBe(fd);
    });

    it('PUT and PATCH stringify body', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse({ success: true }));
        await api.put('/x', { a: 1 });
        let opts = fetchMock.mock.calls[0][1];
        expect(opts.method).toBe('PUT');
        expect(opts.body).toBe(JSON.stringify({ a: 1 }));

        fetchMock.mockResolvedValueOnce(jsonResponse({ success: true }));
        await api.patch('/y', { b: 2 });
        opts = fetchMock.mock.calls[1][1];
        expect(opts.method).toBe('PATCH');
        expect(opts.body).toBe(JSON.stringify({ b: 2 }));
    });

    it('DELETE sends no body', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse({ success: true }));
        await api.delete('/x/1');
        const [, options] = fetchMock.mock.calls[0];
        expect(options.method).toBe('DELETE');
        expect(options.body).toBeUndefined();
    });

    it('non-ok response throws Error with server-supplied error string', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'Bad request' }, { ok: false, status: 400 }));
        await expect(api.get('/x')).rejects.toThrow('Bad request');
    });

    it('non-ok response without parseable JSON throws "Ошибка запроса"', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: false,
            status: 500,
            json: async () => {
                throw new Error('not json');
            },
        });
        await expect(api.get('/x')).rejects.toThrow('Ошибка запроса');
    });

    it('non-ok response without error field falls back to "HTTP <status>"', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse({}, { ok: false, status: 503 }));
        await expect(api.get('/x')).rejects.toThrow('HTTP 503');
    });

    it('returns parsed JSON body on success', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, data: { id: 7 } }));
        const result = await api.get<{ success: boolean; data: { id: number } }>('/x');
        expect(result.data.id).toBe(7);
    });

    it('login() POSTs to /auth/login with email + password', async () => {
        fetchMock.mockResolvedValueOnce(
            jsonResponse({ success: true, data: { user: { id: 'u1', email: 'a@b', fullName: 'A', roles: ['admin'] } } }),
        );
        await api.login('a@b', 'pw');
        const [url, options] = fetchMock.mock.calls[0];
        expect(url).toBe('/api/auth/login');
        expect(JSON.parse(options.body)).toEqual({ email: 'a@b', password: 'pw' });
    });

    it('logout() swallows errors instead of throwing', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse({}, { ok: false, status: 500 }));
        await expect(api.logout()).resolves.toBeUndefined();
    });
});
