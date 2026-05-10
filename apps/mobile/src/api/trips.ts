// ============================================================
// Trips API Client — Mobile App
// Fetches driver's trips from server, handles status transitions
// ============================================================
import { v4 as uuidv4 } from 'uuid';
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

// --- Trips ---

export interface TripOrderSummary {
    id: string;
    number?: string;
    coldChainRequired?: boolean;
}

export interface TripSummary {
    id: string;
    number: string;
    status: string;
    vehicleId: string | null;
    driverId: string | null;
    plannedDepartureAt: string | null;
    actualCompletionAt: string | null;
    routePoints: Array<{
        id: string;
        type: string;
        address: string;
        lat: number | null;
        lon: number | null;
        sequence: number;
        status: string;
        windowFrom?: string | null;
        windowTo?: string | null;
    }>;
    orders?: TripOrderSummary[];
    coldChainRequired?: boolean;
}

export interface OperationExceptionSummary {
    total: number;
    blocking: number;
    warning: number;
    info: number;
}

export interface OperationExceptionItem {
    id: string;
    type: string;
    severity: 'blocking' | 'warning' | 'info';
    title: string;
    message: string;
    tripNumber?: string;
    createdAt?: string | null;
}

export interface OperationExceptionsResponse {
    summary: OperationExceptionSummary;
    exceptions: OperationExceptionItem[];
}

/**
 * Get all trips assigned to the current driver.
 */
export async function getMyTrips(): Promise<TripSummary[]> {
    const data = await authFetch('/trips?limit=50');
    return data.data || [];
}

/**
 * Get a single trip by ID.
 */
export async function getTripById(id: string): Promise<TripSummary> {
    const data = await authFetch(`/trips/${id}`);
    return data.data || data;
}

/**
 * Get operational blockers and warnings for the trip.
 */
export async function getTripOperationExceptions(tripId: string): Promise<OperationExceptionsResponse | null> {
    try {
        const data = await authFetch(`/operations/exceptions?tripId=${tripId}&includeInfo=true&limit=20`);
        return data.data || null;
    } catch {
        return null;
    }
}

/**
 * Update trip status (e.g., depart, arrive, complete).
 */
export async function updateTripStatus(tripId: string, newStatus: string): Promise<any> {
    return authFetch(`/trips/${tripId}/status`, {
        method: 'POST',
        body: JSON.stringify({ status: newStatus }),
    });
}

/**
 * Start a trip (driver presses "Начать рейс"). Records starting odometer and
 * issues the waybill on the server. Returns { trip, waybill }.
 */
export async function startTrip(
    tripId: string,
    payload: { odometerStart: number }
): Promise<{ trip: any; waybill: any }> {
    const data = await authFetch(`/trips/${tripId}/start`, {
        method: 'POST',
        body: JSON.stringify(payload),
    });
    return data.data || data;
}

/**
 * Complete a trip (driver presses "Завершить рейс"). Records final odometer
 * and optional notes. Returns { trip, waybill }.
 */
export async function completeTrip(
    tripId: string,
    payload: { odometerEnd: number; notes?: string }
): Promise<{ trip: any; waybill: any }> {
    const data = await authFetch(`/trips/${tripId}/complete`, {
        method: 'POST',
        body: JSON.stringify(payload),
    });
    return data.data || data;
}

export type DeliveryCondition = 'ok' | 'damaged' | 'short';

export interface DeliveryConfirmationV2Body {
    signedByName: string;
    signatureDataUrl: string;
    photoUrls?: string[];
    condition: DeliveryCondition;
    notes?: string;
}

/**
 * Submit the v2 delivery confirmation. Photos must already be uploaded —
 * pass server URLs in `photoUrls`.
 */
export async function submitDeliveryConfirmationV2(
    tripId: string,
    body: DeliveryConfirmationV2Body
): Promise<any> {
    return authFetch(`/trips/${tripId}/delivery-confirmation/v2`, {
        method: 'POST',
        body: JSON.stringify(body),
    });
}

/**
 * Confirm a route point (checkpoint arrival).
 */
export async function confirmRoutePoint(
    tripId: string,
    routePointId: string,
    data: {
        lat?: number;
        lon?: number;
        photo?: string;
        notes?: string;
        signatureUrl?: string;
    }
): Promise<any> {
    return authFetch('/sync/events', {
        method: 'POST',
        body: JSON.stringify({
            events: [{
                id: uuidv4(),
                type: 'route_point_completed',
                timestamp: new Date().toISOString(),
                payload: {
                    tripId,
                    pointId: routePointId,
                    photoUrls: data.photo ? [data.photo] : [],
                    signatureUrl: data.signatureUrl,
                    notes: data.notes,
                    lat: data.lat,
                    lon: data.lon,
                },
            }],
        }),
    });
}

export interface TripEtaData {
    etaIso: string;
    distanceKm: number;
    currentLatLng: { lat: number; lon: number } | [number, number];
    nextPointId: string;
}

export interface TripEtaResponse {
    data: TripEtaData | null;
    reason?: string;
}

/**
 * Get the driver's ETA to the next route point. Returns `data: null` when GPS
 * is unavailable; `reason` may explain why.
 */
export async function getTripEta(tripId: string): Promise<TripEtaResponse> {
    try {
        const res = await authFetch(`/trips/${tripId}/eta`);
        return { data: res.data ?? null, reason: res.reason };
    } catch {
        return { data: null, reason: 'request_failed' };
    }
}

// --- Inspections ---

export interface InspectionTemplate {
    id: string;
    name: string;
    items: Array<{ id: string; label: string; required: boolean }>;
}

/**
 * Get pre-trip inspection template.
 */
export async function getInspectionTemplate(): Promise<InspectionTemplate | null> {
    try {
        const data = await authFetch('/inspections/tech/checklist');
        return data.data || null;
    } catch {
        return null;
    }
}

/**
 * Submit inspection result.
 */
export async function submitInspection(data: {
    tripId: string;
    vehicleId: string;
    type: string;
    items: Array<{ checkId: string; ok: boolean; comment?: string }>;
    overallResult: 'pass' | 'fail';
    odometerKm?: number;
}): Promise<any> {
    return authFetch('/inspections/tech', {
        method: 'POST',
        body: JSON.stringify(data),
    });
}

