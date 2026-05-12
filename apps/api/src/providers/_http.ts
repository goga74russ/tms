// ============================================================
// A-P2: shared HTTP helper for provider adapters.
// ----------------------------------------------------------------
// Real provider integrations (ЮKassa, Тинькофф, Wialon, CRPT, etc.)
// all need the same plumbing: a timeout, retries on transient 5xx /
// network errors, and exponential-ish backoff. Each adapter rolling
// its own would mean uneven behavior under load and a lot of repeat
// `AbortSignal.timeout(...)` boilerplate.
//
// This is the helper. Adapters opt in incrementally — we are NOT
// refactoring every existing skeleton at once.
// ============================================================

export interface HttpFetchOptions {
    /** Number of retry attempts AFTER the initial request (so retries=3 → up to 4 total tries). */
    retries?: number;
    /** Backoff between retries, in ms. If shorter than retries, the last value is reused. */
    backoffMs?: number[];
    /** Per-attempt timeout in ms (uses AbortSignal.timeout). */
    timeoutMs?: number;
    /** Predicate: should this response trigger a retry? Default: 5xx. */
    shouldRetry?: (res: Response) => boolean;
}

const DEFAULTS: Required<Pick<HttpFetchOptions, 'retries' | 'backoffMs' | 'timeoutMs'>> = {
    retries: 3,
    backoffMs: [200, 500, 2000],
    timeoutMs: 15000,
};

function delayFor(attempt: number, backoff: number[]): number {
    if (backoff.length === 0) return 0;
    const idx = Math.min(attempt, backoff.length - 1);
    return backoff[idx] ?? 0;
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Wrapper over `fetch` that:
 *   - applies a per-attempt AbortSignal.timeout(timeoutMs)
 *   - retries on network errors and 5xx responses (configurable)
 *   - waits `backoffMs[attempt]` between attempts (last value reused)
 *
 * Throws the final network error, or returns the final Response if all
 * retries returned a non-OK status. Callers are still responsible for
 * inspecting `res.ok` and parsing the body.
 *
 * Note: this DOES NOT retry on 4xx by default — a 4xx usually means the
 * request itself is wrong (auth, validation) and retrying just wastes
 * quota. Override via `shouldRetry` if a specific provider needs it.
 */
export async function httpFetch(
    url: string,
    init: RequestInit = {},
    opts: HttpFetchOptions = {},
): Promise<Response> {
    const retries = opts.retries ?? DEFAULTS.retries;
    const backoffMs = opts.backoffMs ?? DEFAULTS.backoffMs;
    const timeoutMs = opts.timeoutMs ?? DEFAULTS.timeoutMs;
    const shouldRetry = opts.shouldRetry ?? ((res: Response) => res.status >= 500 && res.status < 600);

    let lastErr: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            // AbortSignal.timeout is available in Node 18.17+ / 20+. We rely on
            // the API base target (ES2022 + Node 20) so this is safe.
            const signal = init.signal
                ? AbortSignal.any([init.signal, AbortSignal.timeout(timeoutMs)])
                : AbortSignal.timeout(timeoutMs);
            const res = await fetch(url, { ...init, signal });
            if (!shouldRetry(res) || attempt === retries) {
                return res;
            }
            // Retryable status — fall through to backoff.
            lastErr = new Error(`HTTP ${res.status}`);
        } catch (err) {
            lastErr = err;
            if (attempt === retries) throw err;
        }
        await sleep(delayFor(attempt, backoffMs));
    }
    // Should be unreachable, but keep TS happy.
    throw lastErr ?? new Error('httpFetch: exhausted retries');
}
