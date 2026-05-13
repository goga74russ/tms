/**
 * Central fetch mock for screen-level tests.
 *
 * Tests install it via `installApiMock()` in beforeEach. Routes are matched
 * by substring of the URL. Use `setResponse(matcher, response)` to add
 * per-test behaviour, then `restoreApiMock()` in afterEach.
 *
 * Each handler returns a partial Response object with `ok`, `status`, and
 * an async `json()` — the shape our api/* wrappers expect.
 */

type ApiResponse = {
    ok?: boolean;
    status?: number;
    json?: () => Promise<unknown>;
    text?: () => Promise<string>;
};

type Matcher = string | RegExp | ((url: string, init?: RequestInit) => boolean);

interface Handler {
    matcher: Matcher;
    response: ApiResponse | ((url: string, init?: RequestInit) => ApiResponse);
}

let handlers: Handler[] = [];
let originalFetch: typeof globalThis.fetch | undefined;
let calls: Array<{ url: string; init?: RequestInit }> = [];

function match(handler: Handler, url: string, init?: RequestInit): boolean {
    if (typeof handler.matcher === 'string') return url.includes(handler.matcher);
    if (handler.matcher instanceof RegExp) return handler.matcher.test(url);
    return handler.matcher(url, init);
}

export function setResponse(
    matcher: Matcher,
    response: ApiResponse | ((url: string, init?: RequestInit) => ApiResponse)
): void {
    handlers.unshift({ matcher, response });
}

export function getCalls(): Array<{ url: string; init?: RequestInit }> {
    return calls.slice();
}

export function installApiMock(): void {
    if (!originalFetch) originalFetch = globalThis.fetch;
    handlers = [];
    calls = [];
    (globalThis as any).fetch = jest.fn(async (input: any, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.url;
        calls.push({ url, init });
        for (const h of handlers) {
            if (match(h, url, init)) {
                const resp = typeof h.response === 'function' ? h.response(url, init) : h.response;
                return {
                    ok: resp.ok ?? true,
                    status: resp.status ?? 200,
                    json: resp.json ?? (async () => ({})),
                    text: resp.text ?? (async () => ''),
                } as Response;
            }
        }
        // Default empty 200 OK — keeps tests forgiving for incidental fetches.
        return {
            ok: true,
            status: 200,
            json: async () => ({}),
            text: async () => '',
        } as Response;
    });
}

export function restoreApiMock(): void {
    if (originalFetch) globalThis.fetch = originalFetch;
    handlers = [];
    calls = [];
}
