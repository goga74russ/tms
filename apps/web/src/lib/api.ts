// ============================================================
// API Client — используется всеми модулями
// Uses Bearer token auth (stored in localStorage after login)
// ============================================================

// API Client — uses Next.js rewrite proxy (same-origin, no cross-origin cookie issues)
// In production: browser hits :3000/api/* → Next.js proxies to :4000/api/*
const API_BASE = '/api';

const TOKEN_KEY = 'tms_token';

class ApiClient {
    private getToken(): string | null {
        if (typeof window === 'undefined') return null;
        return localStorage.getItem(TOKEN_KEY);
    }

    private setToken(token: string) {
        if (typeof window !== 'undefined') {
            localStorage.setItem(TOKEN_KEY, token);
        }
    }

    clearToken() {
        if (typeof window !== 'undefined') {
            localStorage.removeItem(TOKEN_KEY);
        }
    }

    private async request<T>(
        method: string,
        path: string,
        body?: unknown,
        options?: { headers?: Record<string, string> },
    ): Promise<T> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            ...options?.headers,
        };

        // Add Bearer token if available
        const token = this.getToken();
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch(`${API_BASE}${path}`, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
            credentials: 'include', // Still send cookies if available
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Request failed' }));
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
        const result = await this.post<{
            success: boolean;
            data: { token?: string; user: { id: string; email: string; fullName: string; roles: string[] } };
        }>('/auth/login', { email, password });
        // Store token from response for Bearer auth
        if (result.success && result.data.token) {
            this.setToken(result.data.token);
        }
        return result;
    }

    async me() {
        return this.get<{
            success: boolean;
            data: { id: string; email: string; fullName: string; roles: string[] };
        }>('/auth/me');
    }

    async logout() {
        try {
            await this.post('/auth/logout');
        } catch {
            // Ignore errors — clear local state regardless
        }
        this.clearToken();
    }
}

export const api = new ApiClient();

