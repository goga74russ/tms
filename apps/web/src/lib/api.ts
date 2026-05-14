// ============================================================
// API Client — используется всеми модулями
// Auth via httpOnly cookie (set by server on login)
// credentials: 'include' → браузер автоматически отправляет cookie
// ============================================================

// Uses Next.js rewrite proxy (same-origin, no cross-origin cookie issues)
// In production: browser hits :3000/api/* → Next.js proxies to :4000/api/*
const API_BASE = '/api';

/**
 * Map of API error codes -> user-facing Russian messages. The API returns
 * stable machine-readable codes (e.g. `PLAN_FEATURE_LOCKED`) so other UI
 * concerns (Paywall modal triggers, retry logic) can branch on them; this
 * map ensures the **fallback** text users see is human Russian instead of
 * the raw SCREAMING_SNAKE_CASE.
 */
const ERROR_CODE_MESSAGES: Record<string, string> = {
    PLAN_FEATURE_LOCKED: 'Эта функция доступна на платных тарифах. Перейдите к оплате.',
    PLAN_LIMIT_EXCEEDED: 'Достигнут лимит вашего тарифа. Перейдите на тариф выше.',
    ABILITY_DENIED: 'Недостаточно прав для этого действия.',
    Unauthorized: 'Требуется авторизация.',
    Forbidden: 'Доступ запрещён.',
};

function translateApiError(payload: Record<string, unknown> | { error?: string }, status: number): string {
    const errStr = typeof (payload as { error?: unknown }).error === 'string'
        ? (payload as { error: string }).error
        : '';
    // 1. Exact code match — covers SCREAMING_SNAKE_CASE codes from the API.
    if (errStr && ERROR_CODE_MESSAGES[errStr]) return ERROR_CODE_MESSAGES[errStr];
    // 2. Already a Russian sentence (server-translated, e.g. requireAbility).
    //    Heuristic: contains Cyrillic. Pass through.
    if (errStr && /[А-Яа-яЁё]/.test(errStr)) return errStr;
    // 3. Otherwise wrap in a generic Russian fallback.
    if (errStr) return `Ошибка: ${errStr}`;
    return `Ошибка запроса (HTTP ${status})`;
}

class ApiClient {
    private async request<T>(
        method: string,
        path: string,
        body?: unknown,
        options?: { headers?: Record<string, string> },
    ): Promise<T> {
        const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
        const shouldSendJsonBody = !isFormData && ['POST', 'PUT', 'PATCH'].includes(method);
        const headers: Record<string, string> = {
            ...options?.headers,
        };

        if (!isFormData) {
            headers['Content-Type'] = 'application/json';
        }

        const requestBody = isFormData
            ? body as FormData
            : body !== undefined
                ? JSON.stringify(body)
                : shouldSendJsonBody
                    ? '{}'
                    : undefined;

        const response = await fetch(`${API_BASE}${path}`, {
            method,
            headers,
            body: requestBody,
            credentials: 'include', // httpOnly cookie sent automatically
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Ошибка запроса' }));
            throw new Error(translateApiError(error, response.status));
        }

        return response.json();
    }

    get<T = any>(path: string) { return this.request<T>('GET', path); }
    post<T = any>(path: string, body?: unknown) { return this.request<T>('POST', path, body); }
    put<T = any>(path: string, body?: unknown) { return this.request<T>('PUT', path, body); }
    patch<T = any>(path: string, body?: unknown) { return this.request<T>('PATCH', path, body); }
    delete<T = any>(path: string) { return this.request<T>('DELETE', path); }

    /**
     * Stream a Server-Sent Events response from POST {path} with JSON body.
     * Yields parsed `{ event, data }` objects (data is parsed JSON when possible).
     * Caller can pass an AbortSignal to cancel.
     */
    async *streamSSE(
        path: string,
        body: unknown,
        signal?: AbortSignal,
    ): AsyncGenerator<{ event: string; data: unknown }, void, void> {
        const response = await fetch(`${API_BASE}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
            body: JSON.stringify(body ?? {}),
            credentials: 'include',
            signal,
        });
        if (!response.ok || !response.body) {
            const err = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
            throw new Error(translateApiError(err as Record<string, unknown>, response.status));
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        try {
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                let sepIdx: number;
                while ((sepIdx = buffer.indexOf('\n\n')) >= 0) {
                    const raw = buffer.slice(0, sepIdx);
                    buffer = buffer.slice(sepIdx + 2);
                    let event = 'message';
                    let dataLine = '';
                    for (const line of raw.split('\n')) {
                        if (line.startsWith('event:')) event = line.slice(6).trim();
                        else if (line.startsWith('data:')) dataLine += line.slice(5).trim();
                    }
                    if (!dataLine) continue;
                    let data: unknown = dataLine;
                    try { data = JSON.parse(dataLine); } catch { /* keep raw */ }
                    yield { event, data };
                }
            }
        } finally {
            try { reader.releaseLock(); } catch { /* noop */ }
        }
    }

    // Auth shortcuts
    async login(email: string, password: string) {
        return this.post<{
            success: boolean;
            data: { user: { id: string; email: string; fullName: string; roles: string[] } };
        }>('/auth/login', { email, password });
    }

    async me() {
        return this.get<{
            success: boolean;
            data: {
                id: string;
                email: string;
                fullName: string;
                roles: string[];
                phone?: string;
                driverId?: string;
            };
        }>('/auth/me');
    }

    async logout() {
        try {
            await this.post('/auth/logout');
        } catch {
            // Ignore errors — server clears cookie
        }
    }
}

export const api = new ApiClient();
