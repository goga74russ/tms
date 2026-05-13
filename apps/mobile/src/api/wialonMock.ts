// ============================================================
// Wialon mock API client — Mobile App
// Best-effort start/stop calls so the dispatcher map can show movement
// during driver test scenarios. Failures are swallowed (logged only).
// ============================================================
import { getToken } from './auth';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000/api';

async function callMock(path: string, body: Record<string, unknown>): Promise<void> {
    try {
        const token = await getToken();
        if (!token) return;

        const res = await fetch(`${API_URL}${path}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(body),
        });

        // 404 → endpoint not deployed in this env, swallow silently.
        if (res.status === 404) return;
        if (!res.ok) {
            // log only, never block UX
            const txt = await res.text().catch(() => '');
            console.warn(`[wialon-mock] ${path} → ${res.status} ${txt}`);
        }
    } catch (err) {
        console.warn('[wialon-mock] network error', err);
    }
}

/**
 * Best-effort: start the mock GPS feed for a vehicle (optionally tied to a trip).
 */
export async function startWialonMock(vehicleId: string, tripId?: string): Promise<void> {
    if (!vehicleId) return;
    await callMock('/integrations/wialon-mock/start', { vehicleId, tripId });
}

/**
 * Best-effort: stop the mock GPS feed for a vehicle.
 */
export async function stopWialonMock(vehicleId: string): Promise<void> {
    if (!vehicleId) return;
    await callMock('/integrations/wialon-mock/stop', { vehicleId });
}
