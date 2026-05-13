// ============================================================
// RTO / HOS API Client — Mobile App
// Reads driver hours-of-service status and recent hours summary.
// Driver identity is resolved via /auth/me (returns driverId).
// ============================================================
import { getToken, getMe } from './auth';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000/api';

async function authFetch(path: string, options: RequestInit = {}) {
    const token = await getToken();
    if (!token) throw new Error('Not authenticated');

    const res = await fetch(`${API_URL}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            ...options.headers,
        },
    });

    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `API error: ${res.status}`);
    }

    return res.json();
}

async function resolveDriverId(): Promise<string> {
    const token = await getToken();
    if (!token) throw new Error('Not authenticated');
    const me = await getMe(token);
    const data = me?.data ?? me;
    const driverId = data?.driverId ?? data?.driver_id;
    if (!driverId) throw new Error('No driverId on /auth/me');
    return driverId;
}

export interface HosStatus {
    dayHours: number;
    weekHours: number;
    dayLimit: number;
    weekLimit: number;
    breach: boolean;
}

export interface HoursSummary {
    dailyHours: Array<{ date: string; hours: number }>;
    weeklyHours: Array<{ weekStart: string; hours: number }>;
    breaches: Array<{ date: string; type: string; message?: string }>;
}

/**
 * Get HOS status for the currently signed-in driver.
 */
export async function getMyHosStatus(): Promise<HosStatus> {
    const driverId = await resolveDriverId();
    const data = await authFetch(`/drivers/${driverId}/hos-status`);
    return data.data || data;
}

/**
 * Get day-by-day hours summary for the currently signed-in driver.
 */
export async function getMyHoursSummary(fromIso: string, toIso: string): Promise<HoursSummary> {
    const driverId = await resolveDriverId();
    const qs = `from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`;
    const data = await authFetch(`/drivers/${driverId}/hours-summary?${qs}`);
    return data.data || data;
}
