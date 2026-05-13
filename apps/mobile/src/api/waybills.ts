// ============================================================
// Waybills API Client — Mobile App
// Fetches waybill metadata for the current driver and exposes
// helpers for the PDF endpoint. Mirrors style of trips.ts.
// ============================================================
import { getToken } from './auth';

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

export interface WaybillSummary {
    id: string;
    number: string;
    status: string;
    tripId?: string | null;
    issuedAt?: string | null;
    plannedDepartureAt?: string | null;
    plannedReturnAt?: string | null;
    actualDepartureAt?: string | null;
    actualReturnAt?: string | null;
    odometerStart?: number | null;
    odometerEnd?: number | null;
    vehicle?: {
        id?: string;
        plateNumber?: string | null;
        brand?: string | null;
        model?: string | null;
    } | null;
    driver?: {
        id?: string;
        fullName?: string | null;
    } | null;
    route?: {
        from?: string | null;
        to?: string | null;
        stopsCount?: number | null;
    } | null;
    inspections?: {
        techApproved?: boolean | null;
        medicalApproved?: boolean | null;
    } | null;
}

/**
 * Look up the waybill associated with a trip.
 * Server returns { success, data: WaybillSummary[] } — we pick the first.
 */
export async function getWaybillByTripId(tripId: string): Promise<WaybillSummary | null> {
    const data = await authFetch(`/waybills?tripId=${encodeURIComponent(tripId)}`);
    const list: WaybillSummary[] = Array.isArray(data?.data) ? data.data : [];
    return list[0] || null;
}

/**
 * Fetch a single waybill by id.
 */
export async function getWaybillById(id: string): Promise<WaybillSummary> {
    const data = await authFetch(`/waybills/${id}`);
    return data.data || data;
}

/**
 * Build a PDF URL for the waybill. Token is appended as a query parameter so
 * that Linking.openURL can hand off to the system browser/PDF viewer.
 *
 * TODO: when expo-file-system / expo-sharing are added to deps, switch to
 * downloadAsync + Sharing.shareAsync and pass the auth header instead of
 * leaking the token in the URL.
 */
export async function getWaybillPdfUrl(id: string): Promise<string> {
    const token = await getToken();
    if (!token) throw new Error('Not authenticated');
    return `${API_URL}/waybills/${encodeURIComponent(id)}/pdf?token=${encodeURIComponent(token)}`;
}
