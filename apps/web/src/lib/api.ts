// ============================================================
// API Client — используется всеми модулями
// Auth via httpOnly cookie (set by server on login)
// credentials: 'include' → браузер автоматически отправляет cookie
// ============================================================

// Uses Next.js rewrite proxy (same-origin, no cross-origin cookie issues)
// In production: browser hits :3000/api/* → Next.js proxies to :4000/api/*
const API_BASE = '/api';

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
            throw new Error(error.error || `HTTP ${response.status}`);
        }

        return response.json();
    }

    get<T = any>(path: string) { return this.request<T>('GET', path); }
    post<T = any>(path: string, body?: unknown) { return this.request<T>('POST', path, body); }
    put<T = any>(path: string, body?: unknown) { return this.request<T>('PUT', path, body); }
    patch<T = any>(path: string, body?: unknown) { return this.request<T>('PATCH', path, body); }
    delete<T = any>(path: string) { return this.request<T>('DELETE', path); }

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
