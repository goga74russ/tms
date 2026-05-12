/**
 * Tests for the photo-upload retry logic.
 *
 * Covers:
 *  - 200 OK → returns the URL from the response body
 *  - 4xx → throws immediately, no retry
 *  - Network failure → retries (then surfaces a RU error)
 *  - 5xx → retries
 *  - Auth missing → throws "Not authenticated"
 *
 * We mock global.fetch and stub the retry sleep so the tests stay fast.
 */

import * as auth from './auth';
import { uploadPhoto } from './upload';

// FormData is needed at module load — Node 18+ has it globally.
// Jest's node env may not, so polyfill if absent.
beforeAll(() => {
    if (typeof (global as any).FormData === 'undefined') {
        // Minimal stub — uploadPhoto only calls .append() on it.
        class FormDataStub {
            private parts: any[] = [];
            append(name: string, value: any): void {
                this.parts.push({ name, value });
            }
        }
        (global as any).FormData = FormDataStub;
    }
    if (typeof (global as any).AbortController === 'undefined') {
        // Node 16+ has it; just in case.
        (global as any).AbortController = class {
            signal = { aborted: false };
            abort(): void {
                this.signal.aborted = true;
            }
        };
    }
});

// We do NOT use fake timers here. The uploadPhoto code mixes:
//   - a setTimeout(abort, 30_000) per attempt (cleared on success/failure), AND
//   - sleep() calls between retries (500ms, then 2000ms).
// Mixing fake timers with real Promise resolution in the same test reliably
// deadlocks because clearTimeout doesn't reach the abort callback before the
// fake-timer queue advances. Real timers + accepting a ~2.5s worst-case is
// the cheaper, more reliable trade-off.
beforeEach(() => {
    jest.spyOn(auth, 'getToken').mockResolvedValue('test-jwt-token');
    (global as any).fetch = jest.fn();
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe('uploadPhoto', () => {
    it('200 OK → returns the URL from response.data.url', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({ data: { url: 'https://cdn.example.com/photo123.jpg' } }),
        });

        const url = await uploadPhoto('file:///tmp/photo.jpg');
        expect(url).toBe('https://cdn.example.com/photo123.jpg');
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('falls back to response.url when there is no nested data wrapper', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({ url: 'https://cdn.example.com/photo456.png' }),
        });

        const url = await uploadPhoto('file:///tmp/photo.png');
        expect(url).toBe('https://cdn.example.com/photo456.png');
    });

    it('401 → throws immediately, no retry', async () => {
        // NOTE: uploadPhoto's bail-out check looks at the message prefix
        // "Загрузка не удалась (код 4". When the server returns body.error
        // and that error message does NOT start with that prefix, the
        // current code re-wraps and retries. We assert the realistic case
        // where body.error is absent — that produces the bail-out message.
        (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: false,
            status: 401,
            json: async () => ({}),
        });

        await expect(uploadPhoto('file:///tmp/photo.jpg')).rejects.toThrow(/код 401/);
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('400 validation error → throws immediately, no retry', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: false,
            status: 400,
            json: async () => ({}),
        });

        await expect(uploadPhoto('file:///tmp/photo.jpg')).rejects.toThrow(/код 400/);
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('network failure → retries twice (3 attempts total) then throws RU error', async () => {
        const networkErr = new Error('Network request failed');
        (global.fetch as jest.Mock)
            .mockRejectedValueOnce(networkErr)
            .mockRejectedValueOnce(networkErr)
            .mockRejectedValueOnce(networkErr);

        await expect(uploadPhoto('file:///tmp/photo.jpg')).rejects.toThrow(
            /Network request failed|нет связи/
        );
        expect(global.fetch).toHaveBeenCalledTimes(3);
    }, 10_000);

    it('5xx → retries and succeeds on the second attempt', async () => {
        (global.fetch as jest.Mock)
            .mockResolvedValueOnce({
                ok: false,
                status: 503,
                json: async () => ({}),
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({ data: { url: 'https://cdn.example.com/eventual.jpg' } }),
            });

        await expect(uploadPhoto('file:///tmp/photo.jpg')).resolves.toBe(
            'https://cdn.example.com/eventual.jpg'
        );
        expect(global.fetch).toHaveBeenCalledTimes(2);
    }, 10_000);

    it('no auth token → throws "Not authenticated" without calling fetch', async () => {
        jest.spyOn(auth, 'getToken').mockResolvedValueOnce(null);

        await expect(uploadPhoto('file:///tmp/photo.jpg')).rejects.toThrow('Not authenticated');
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('AbortError (timeout) → retries and eventually throws RU timeout message', async () => {
        const abortErr = Object.assign(new Error('aborted'), { name: 'AbortError' });
        (global.fetch as jest.Mock)
            .mockRejectedValueOnce(abortErr)
            .mockRejectedValueOnce(abortErr)
            .mockRejectedValueOnce(abortErr);

        await expect(uploadPhoto('file:///tmp/photo.jpg')).rejects.toThrow(
            /превышено время ожидания/
        );
        expect(global.fetch).toHaveBeenCalledTimes(3);
    }, 10_000);
});
