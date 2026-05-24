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
 * B6.1: PDF URL + Authorization header — без token-в-URL.
 *
 * Раньше: URL с `?token=<JWT>` передавался в Linking.openURL → токен утекал
 * в Referer, share-sheet, системные логи, browser-history. Теперь возвращаем
 * чистый URL + headers, которые caller передаёт в WebView source.
 *
 * WebView (react-native-webview) выполняет first GET с этими headers, дальше
 * ресурсы по cookie-jar (которой у нас нет — endpoint stateless).
 *
 * Если когда-нибудь будут добавлены expo-file-system + expo-sharing —
 * можно перейти на скачивание в кэш + системный viewer.
 */
export interface WaybillPdfRequest {
    url: string;
    headers: { Authorization: string };
}

export async function getWaybillPdfRequest(id: string): Promise<WaybillPdfRequest> {
    const token = await getToken();
    if (!token) throw new Error('Not authenticated');
    return {
        url: `${API_URL}/waybills/${encodeURIComponent(id)}/pdf`,
        headers: { Authorization: `Bearer ${token}` },
    };
}

/**
 * @deprecated B6.1 — оставлено для обратной совместимости тестов.
 * Используйте getWaybillPdfRequest + WebView.source.headers.
 */
export async function getWaybillPdfUrl(id: string): Promise<string> {
    const req = await getWaybillPdfRequest(id);
    return req.url;
}
