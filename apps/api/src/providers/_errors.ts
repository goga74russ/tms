// ============================================================
// A-P2: shared provider error mapper.
// ----------------------------------------------------------------
// Real provider adapters throw English errors like
// `Error('Wialon login HTTP 401')`. The end-user-facing surface
// (route handlers, UI toasts) needs RU-language messages mapped to
// a stable error code so we can render the right help text and
// retry semantics. Each adapter calls mapProviderError() at the
// edge (catch around the network call) and lets the route convert
// the result to a 4xx/5xx response.
//
// This helper is intentionally minimal — adopt incrementally, do
// NOT refactor every adapter to use it at once.
// ============================================================
import { nowIso } from './base.js';

export type ProviderErrorCode =
    | 'auth_failed'        // 401
    | 'forbidden'          // 403
    | 'not_found'          // 404
    | 'rate_limited'       // 429
    | 'network'            // 5xx + transport errors
    | 'unknown';

export interface MappedProviderError {
    providerType: string;
    providerName: string;
    code: ProviderErrorCode;
    rusMessage: string;
    original?: string;
    mappedAt: string;
}

/**
 * Build the RU surface for a code. We interpolate the provider NAME (not
 * type) because that's what an operator recognises ("ЮKassa", "Wialon"),
 * and we NEVER include the raw provider error message — that can leak
 * tokens, internal endpoints, stack traces.
 */
function rusMessageFor(code: ProviderErrorCode, providerName: string): string {
    switch (code) {
        case 'auth_failed':
            return `Неверные учётные данные провайдера ${providerName}`;
        case 'forbidden':
            return `Доступ запрещён для провайдера ${providerName}`;
        case 'not_found':
            return `Endpoint провайдера ${providerName} не найден`;
        case 'rate_limited':
            return `Превышен лимит запросов к провайдеру ${providerName}`;
        case 'network':
            return `Сервер провайдера ${providerName} недоступен`;
        case 'unknown':
        default:
            return `Ошибка вызова провайдера ${providerName}`;
    }
}

/** Extract a numeric HTTP status from a free-form error message. */
function extractHttpStatus(message: string): number | null {
    // Common shapes: "HTTP 401", "status 429", "failed: 503"
    const m = /(?:HTTP|status|code)\s*[:=]?\s*(\d{3})|\b(\d{3})\b/i.exec(message);
    if (!m) return null;
    const n = Number(m[1] ?? m[2]);
    return Number.isFinite(n) ? n : null;
}

function looksLikeNetworkError(message: string): boolean {
    return /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|ECONNRESET|fetch failed|network|aborted|timeout|timed out/i
        .test(message);
}

/**
 * Map an arbitrary error from a provider adapter into a structured,
 * RU-localized shape. Never throws — `unknown` is the safe default.
 */
export function mapProviderError(
    providerType: string,
    providerName: string,
    err: unknown,
): MappedProviderError {
    const original = err instanceof Error ? err.message : String(err ?? '');
    let code: ProviderErrorCode = 'unknown';

    // Prefer an explicit HTTP status if the message includes one.
    const status = extractHttpStatus(original);
    if (status !== null) {
        if (status === 401) code = 'auth_failed';
        else if (status === 403) code = 'forbidden';
        else if (status === 404) code = 'not_found';
        else if (status === 429) code = 'rate_limited';
        else if (status >= 500 && status < 600) code = 'network';
    } else if (looksLikeNetworkError(original)) {
        code = 'network';
    }

    return {
        providerType,
        providerName,
        code,
        rusMessage: rusMessageFor(code, providerName),
        // We DO keep `original` for server-side observability (logs/audit),
        // but route handlers MUST only surface `rusMessage` to the client.
        original: original || undefined,
        mappedAt: nowIso(),
    };
}
