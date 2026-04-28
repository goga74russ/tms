// ============================================================
// Trips API Client — Mobile App
// Fetches driver's trips from server, handles status transitions
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

// --- Trips ---

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
    }>;
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
 * Update trip status (e.g., depart, arrive, complete).
 */
export async function updateTripStatus(tripId: string, newStatus: string): Promise<any> {
    return authFetch(`/trips/${tripId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
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
    }
): Promise<any> {
    return authFetch(`/trips/${tripId}/route-points/${routePointId}/confirm`, {
        method: 'POST',
        body: JSON.stringify(data),
    });
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

