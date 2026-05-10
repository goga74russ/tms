// ============================================================
// Temperature (cold chain) API Client — Mobile App
// Submits and reads temperature readings for cold-chain trips.
// Mirrors the style of trips.ts / inspections.ts.
// ============================================================
import NetInfo from '@react-native-community/netinfo';
import * as Notifications from 'expo-notifications';
import { getToken } from './auth';
import { enqueueAction } from './offlineQueue';

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

export type TemperatureSource = 'sensor' | 'manual' | 'mock';

export interface TemperatureReadingInput {
    tempC: number;
    recordedAt?: string;
    sensorId?: string;
    latitude?: number;
    longitude?: number;
    source?: TemperatureSource;
}

export interface TemperatureReading {
    id: string;
    tempC: number;
    recordedAt: string;
    breach: boolean;
    source?: TemperatureSource;
    sensorId?: string | null;
    latitude?: number | null;
    longitude?: number | null;
}

export interface TemperatureSubmitResult {
    id: string;
    breach: boolean;
    slaMinC: number;
    slaMaxC: number;
    /** True when the request was queued offline rather than sent. */
    queued?: boolean;
}

export interface TemperatureSummary {
    minC: number | null;
    maxC: number | null;
    avgC: number | null;
    count: number;
    breachCount: number;
    slaMinC: number;
    slaMaxC: number;
    firstAt: string | null;
    lastAt: string | null;
}

export interface TemperatureListResponse {
    data: TemperatureReading[];
    breaches: TemperatureReading[];
}

/**
 * Submit a temperature reading. Falls back to the offline queue when
 * the device is offline or the request fails.
 */
export async function submitTemperature(
    tripId: string,
    body: TemperatureReadingInput
): Promise<TemperatureSubmitResult> {
    const endpoint = `/trips/${tripId}/temperature-readings`;

    const netState = await NetInfo.fetch().catch(() => null);
    const isOnline = netState ? netState.isConnected !== false && netState.isInternetReachable !== false : true;

    if (!isOnline) {
        await enqueueAction({
            type: 'temperature_reading',
            endpoint,
            method: 'POST',
            body,
        });
        return { id: '', breach: false, slaMinC: 0, slaMaxC: 0, queued: true };
    }

    try {
        const res = await authFetch(endpoint, {
            method: 'POST',
            body: JSON.stringify(body),
        });
        const data = res?.data || {};
        const result = {
            id: data.id || '',
            breach: Boolean(data.breach),
            slaMinC: typeof data.slaMinC === 'number' ? data.slaMinC : 0,
            slaMaxC: typeof data.slaMaxC === 'number' ? data.slaMaxC : 0,
        };
        // D27 (Round 3C): trigger a local push notification on breach.
        // Permission is requested once at screen mount; if not granted,
        // scheduleNotificationAsync silently no-ops.
        if (result.breach) {
            try {
                await Notifications.scheduleNotificationAsync({
                    content: {
                        title: 'Нарушение температурного режима',
                        body: `Замер ${body.tempC}°C вне SLA (${result.slaMinC} … ${result.slaMaxC}°C). Сообщите диспетчеру.`,
                        priority: Notifications.AndroidNotificationPriority?.HIGH ?? 'high',
                    },
                    trigger: null, // immediate
                });
            } catch {
                // Best-effort — never let a notification failure swallow the API result.
            }
        }
        return result;
    } catch (err) {
        // On transient failure, fall back to queue so the reading is not lost.
        await enqueueAction({
            type: 'temperature_reading',
            endpoint,
            method: 'POST',
            body,
        });
        return { id: '', breach: false, slaMinC: 0, slaMaxC: 0, queued: true };
    }
}

/**
 * Fetch the rolling cold-chain summary for a trip.
 */
export async function getTemperatureSummary(tripId: string): Promise<TemperatureSummary | null> {
    try {
        const res = await authFetch(`/trips/${tripId}/temperature-summary`);
        return (res?.data as TemperatureSummary) || null;
    } catch {
        return null;
    }
}

/**
 * Fetch the most recent temperature readings for a trip.
 */
export async function getTemperatureReadings(
    tripId: string,
    limit = 30
): Promise<TemperatureListResponse> {
    try {
        const res = await authFetch(`/trips/${tripId}/temperature-readings?limit=${limit}`);
        return {
            data: Array.isArray(res?.data) ? res.data : [],
            breaches: Array.isArray(res?.breaches) ? res.breaches : [],
        };
    } catch {
        return { data: [], breaches: [] };
    }
}
