// ============================================================
// Unit tests for UnisenderEmailProvider.
// Mocks global fetch — verifies URL, headers, body shape, and
// error mapping (transport vs API-level).
// ============================================================
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.hoisted(() => {
    // Provider modules transitively import db/connection.ts which requires
    // DATABASE_URL at import time. Stub it for the test process.
    process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';
});

import { UnisenderEmailProvider, UNISENDER_API_URL, type UnisenderCredentials } from './unisender.js';

const fixtureCreds: UnisenderCredentials = {
    apiKey: 'test-api-key-12345',
    fromAddress: 'no-reply@transpult.ru',
    fromName: 'ТрансПульт',
    listId: '777',
};

describe('UnisenderEmailProvider — send()', () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        fetchMock = vi.fn();
        // @ts-expect-error — overriding global fetch for the test
        globalThis.fetch = fetchMock;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('posts to /sendEmail with form-urlencoded body and required params', async () => {
        fetchMock.mockResolvedValue({
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => ({ result: { email_id: 'abc-123', index: 0 } }),
        });

        const provider = new UnisenderEmailProvider(fixtureCreds);
        await provider.send('user@example.com', 'Тема', '<p>Hi</p>', 'Hi');

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe(`${UNISENDER_API_URL}/sendEmail?format=json`);
        expect(init.method).toBe('POST');
        expect(init.headers['Content-Type']).toBe('application/x-www-form-urlencoded');

        const params = new URLSearchParams(init.body as string);
        expect(params.get('api_key')).toBe('test-api-key-12345');
        expect(params.get('email')).toBe('user@example.com');
        expect(params.get('sender_email')).toBe('no-reply@transpult.ru');
        expect(params.get('sender_name')).toBe('ТрансПульт');
        expect(params.get('subject')).toBe('Тема');
        expect(params.get('body')).toBe('<p>Hi</p>');
        expect(params.get('text_body')).toBe('Hi');
        expect(params.get('list_id')).toBe('777');
        expect(params.get('lang')).toBe('ru');
    });

    it('omits text_body when no plain-text version provided', async () => {
        fetchMock.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ result: { email_id: 'id' } }),
        });

        const provider = new UnisenderEmailProvider(fixtureCreds);
        await provider.send('user@example.com', 'Subj', '<p>Html</p>');

        const params = new URLSearchParams(fetchMock.mock.calls[0]![1].body as string);
        expect(params.has('text_body')).toBe(false);
    });

    it('uses default sender_name "ТрансПульт" when fromName omitted', async () => {
        fetchMock.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ result: { email_id: 'id' } }),
        });

        const provider = new UnisenderEmailProvider({ ...fixtureCreds, fromName: undefined });
        await provider.send('user@example.com', 'Subj', '<p>H</p>');

        const params = new URLSearchParams(fetchMock.mock.calls[0]![1].body as string);
        expect(params.get('sender_name')).toBe('ТрансПульт');
    });

    it('sends one HTTP request per recipient when given an array', async () => {
        fetchMock.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ result: { email_id: 'id' } }),
        });

        const provider = new UnisenderEmailProvider(fixtureCreds);
        await provider.send(['a@example.com', 'b@example.com', 'c@example.com'], 'Subj', '<p>H</p>');

        expect(fetchMock).toHaveBeenCalledTimes(3);
        const recipients = fetchMock.mock.calls.map(
            (c) => new URLSearchParams(c[1].body as string).get('email'),
        );
        expect(recipients).toEqual(['a@example.com', 'b@example.com', 'c@example.com']);
    });

    it('no-ops on empty recipient array (does not call fetch)', async () => {
        const provider = new UnisenderEmailProvider(fixtureCreds);
        await provider.send([], 'Subj', '<p>H</p>');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('throws on transport-level failure (HTTP 5xx)', async () => {
        fetchMock.mockResolvedValue({
            ok: false,
            status: 503,
            statusText: 'Service Unavailable',
        });

        const provider = new UnisenderEmailProvider(fixtureCreds);
        await expect(provider.send('user@example.com', 'Subj', '<p>H</p>'))
            .rejects.toThrow(/Unisender HTTP 503/);
    });

    it('throws on API-level error (HTTP 200 + body.error)', async () => {
        fetchMock.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ error: 'invalid api_key', code: 'invalid_api_key' }),
        });

        const provider = new UnisenderEmailProvider(fixtureCreds);
        await expect(provider.send('user@example.com', 'Subj', '<p>H</p>'))
            .rejects.toThrow(/\[invalid_api_key\].*invalid api_key/);
    });

    it('throws on malformed JSON response', async () => {
        fetchMock.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => { throw new Error('Unexpected token'); },
        });

        const provider = new UnisenderEmailProvider(fixtureCreds);
        await expect(provider.send('user@example.com', 'Subj', '<p>H</p>'))
            .rejects.toThrow(/invalid JSON response/);
    });

    it('uses custom apiUrl from credentials (for staging/mock)', async () => {
        fetchMock.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ result: { email_id: 'id' } }),
        });

        const provider = new UnisenderEmailProvider({
            ...fixtureCreds,
            apiUrl: 'https://mock-unisender.test/api',
        });
        await provider.send('user@example.com', 'Subj', '<p>H</p>');

        expect(fetchMock.mock.calls[0]![0]).toBe('https://mock-unisender.test/api/sendEmail?format=json');
    });
});

describe('UnisenderEmailProvider — healthCheck()', () => {
    it('reports ok when all required creds present', async () => {
        const provider = new UnisenderEmailProvider(fixtureCreds);
        const h = await provider.healthCheck();
        expect(h.ok).toBe(true);
        expect(h.mode).toBe('production');
        expect(h.detail).toMatch(/no-reply@transpult\.ru/);
    });

    it('reports not-ok when apiKey missing', async () => {
        const provider = new UnisenderEmailProvider({ ...fixtureCreds, apiKey: '' });
        const h = await provider.healthCheck();
        expect(h.ok).toBe(false);
        expect(h.detail).toMatch(/misconfigured/);
    });

    it('reports not-ok when listId missing', async () => {
        const provider = new UnisenderEmailProvider({ ...fixtureCreds, listId: '' });
        const h = await provider.healthCheck();
        expect(h.ok).toBe(false);
    });
});

describe('UnisenderEmailProvider — fromEnv()', () => {
    const original = { ...process.env };

    afterEach(() => {
        // Restore env between tests
        for (const k of ['UNISENDER_API_KEY', 'UNISENDER_FROM_EMAIL', 'UNISENDER_FROM_NAME', 'UNISENDER_LIST_ID']) {
            delete process.env[k];
            if (original[k] !== undefined) process.env[k] = original[k];
        }
    });

    it('returns null when env vars not set', () => {
        delete process.env.UNISENDER_API_KEY;
        delete process.env.UNISENDER_FROM_EMAIL;
        delete process.env.UNISENDER_LIST_ID;
        expect(UnisenderEmailProvider.fromEnv()).toBeNull();
    });

    it('returns null when API_KEY present but LIST_ID missing', () => {
        process.env.UNISENDER_API_KEY = 'k';
        process.env.UNISENDER_FROM_EMAIL = 'a@b.c';
        delete process.env.UNISENDER_LIST_ID;
        expect(UnisenderEmailProvider.fromEnv()).toBeNull();
    });

    it('returns provider when all required env vars set', () => {
        process.env.UNISENDER_API_KEY = 'k';
        process.env.UNISENDER_FROM_EMAIL = 'a@b.c';
        process.env.UNISENDER_LIST_ID = '42';
        process.env.UNISENDER_FROM_NAME = 'Test';
        const provider = UnisenderEmailProvider.fromEnv();
        expect(provider).not.toBeNull();
        expect(provider!.name).toBe('unisender');
    });
});
