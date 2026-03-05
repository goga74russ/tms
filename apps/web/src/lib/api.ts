// ============================================================
// API Client — используется всеми модулями
// H-15: Cookie-based auth (credentials: 'include')
// ============================================================

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

class ApiClient {
    // S-9 FIX: Removed setToken/getToken/clearToken — web uses httpOnly cookies exclusively.
    // Mobile app uses a separate API client with SecureStore.

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
        // httpOnly cookies are sent automatically via credentials: 'include'

        const response = await fetch(`${API_BASE}${path}`, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
            credentials: 'include', // H-15: Send httpOnly cookies automatically
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
        // S-9: Web uses httpOnly cookies, no need to store token
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
    }
}

export const api = new ApiClient();
