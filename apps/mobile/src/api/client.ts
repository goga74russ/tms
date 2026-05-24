// ============================================================
// B6.2: Centralized auth-fetch wrapper for mobile API calls.
//
// Назначение:
//   • Один источник истины для headers (Authorization Bearer).
//   • Auto-logout при 401 — раньше каждый api/*.ts независимо
//     выбрасывал AuthError, но AuthContext не получал сигнал и
//     водитель продолжал видеть устаревший UI.
//   • Конкретный AuthError (с status), чтобы caller мог отличить
//     auth-failure от network/server-error.
//
// Использование:
//   const data = await authFetch<MyResp>('/trips?limit=20');
//   await authFetch('/sync/events', { method: 'POST', body: {...} });
//
// AuthContext подписывается на DeviceEventEmitter('tms-auth-logout')
// и делает apiLogout + clear local state.
//
// MIGRATION TODO: каждый api/*.ts (auth, trips, waybills, inspections,
// rto, sync, temperature, upload) использует свой `authFetch`-fn —
// нужно перевести их на этот общий wrapper отдельным батчем.
// ============================================================
import { DeviceEventEmitter } from 'react-native';
import { getToken } from './auth';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000/api';

/** Событие, на которое подписывается AuthContext для centralized logout. */
export const AUTH_LOGOUT_EVENT = 'tms-auth-logout';

export class AuthError extends Error {
    readonly status: number;
    readonly isAuthFailure: boolean;
    constructor(message: string, status: number) {
        super(message);
        this.name = 'AuthError';
        this.status = status;
        this.isAuthFailure = status === 401 || status === 403;
    }
}

export interface AuthFetchOptions {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    /** JSON body — сериализуем сами. Не используйте FormData через этот wrapper. */
    body?: unknown;
    headers?: Record<string, string>;
    /** Если true и API вернул 401 — НЕ испускаем logout-event. Нужно для /auth/me на старте. */
    suppressLogoutOn401?: boolean;
}

export async function authFetch<T = unknown>(path: string, options: AuthFetchOptions = {}): Promise<T> {
    const token = await getToken();
    if (!token) {
        throw new AuthError('Not authenticated', 401);
    }

    const { method = 'GET', body, headers = {}, suppressLogoutOn401 = false } = options;

    const finalHeaders: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        ...headers,
    };

    let requestBody: string | undefined;
    if (body !== undefined) {
        finalHeaders['Content-Type'] = 'application/json';
        requestBody = JSON.stringify(body);
    }

    const res = await fetch(`${API_URL}${path}`, {
        method,
        headers: finalHeaders,
        body: requestBody,
    });

    if (!res.ok) {
        const errorBody = await res.json().catch(() => ({} as Record<string, unknown>));
        const message = typeof (errorBody as { error?: unknown }).error === 'string'
            ? (errorBody as { error: string }).error
            : `API error: ${res.status}`;

        // B6.2: 401 (а в некоторых сценариях 403) на authenticated роуте =
        // токен/сессия больше не валидны. Бросаем централизованный event,
        // чтобы AuthContext очистил state и пользователь увидел login-screen.
        if (res.status === 401 && !suppressLogoutOn401) {
            DeviceEventEmitter.emit(AUTH_LOGOUT_EVENT, { status: res.status, message });
        }

        throw new AuthError(message, res.status);
    }

    return res.json() as Promise<T>;
}
