import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { getToken } from './auth';
import { uploadPhoto } from './upload';

const QUEUE_KEY = 'tms_offline_action_queue';
const FAILED_QUEUE_KEY = 'tms_offline_action_queue.failed';
const CORRUPT_QUEUE_KEY = 'tms_offline_action_queue.corrupt';
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000/api';

/**
 * Serializes writes to the primary queue so concurrent enqueueAction calls
 * (read-modify-write of the same key) cannot clobber each other's elements.
 * Each operation chains off the previous one via this module-level promise.
 */
let queueWriteLock: Promise<void> = Promise.resolve();

function withQueueWriteLock<T>(op: () => Promise<T>): Promise<T> {
    const run = queueWriteLock.then(op, op);
    // Keep the chain alive even if op rejects, without surfacing its error here.
    queueWriteLock = run.then(
        () => undefined,
        () => undefined,
    );
    return run;
}

/**
 * Preserve a payload that failed to decode/parse so it can be diagnosed or
 * recovered later, instead of silently discarding offline actions
 * (tripId/pointId/GPS/photoUrls). Best-effort: never throws.
 */
async function preserveCorruptPayload(sourceKey: string, raw: string, error: unknown): Promise<void> {
    console.warn(`[offlineQueue] Failed to parse "${sourceKey}"; payload preserved in "${CORRUPT_QUEUE_KEY}"`, error);
    try {
        const prevRaw = await AsyncStorage.getItem(CORRUPT_QUEUE_KEY);
        let entries: unknown[] = [];
        if (prevRaw) {
            try {
                const parsed = JSON.parse(prevRaw);
                if (Array.isArray(parsed)) entries = parsed;
            } catch {
                // Existing corrupt-store itself unreadable — start fresh, do not lose new entry.
            }
        }
        entries.push({ sourceKey, raw, at: new Date().toISOString() });
        await AsyncStorage.setItem(CORRUPT_QUEUE_KEY, JSON.stringify(entries));
    } catch (persistErr) {
        console.warn('[offlineQueue] Failed to persist corrupt payload', persistErr);
    }
}

/** Encode queue JSON before storing to prevent casual inspection of offline data */
function encodeQueue(data: string): string {
    try {
        return btoa(unescape(encodeURIComponent(data)));
    } catch {
        return data;
    }
}

/** Decode queue JSON after reading from storage */
function decodeQueue(encoded: string): string {
    try {
        return decodeURIComponent(escape(atob(encoded)));
    } catch {
        // Fallback: may be plain JSON from before encoding was added
        return encoded;
    }
}

export interface OfflineAction {
    id: string;
    type: 'trip_status' | 'checkpoint_confirm' | 'inspection_submit' | 'delivery_confirmation' | 'temperature_reading';
    endpoint: string;
    method: 'POST' | 'PATCH' | 'PUT';
    body: any;
    createdAt: string;
    retries: number;
}

export async function enqueueAction(action: Omit<OfflineAction, 'id' | 'createdAt' | 'retries'>): Promise<void> {
    // Serialize the read-modify-write so concurrent enqueues don't overwrite
    // each other and drop elements.
    await withQueueWriteLock(async () => {
        const queue = await getQueue();
        queue.push({
            ...action,
            id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            createdAt: new Date().toISOString(),
            retries: 0,
        });
        await AsyncStorage.setItem(QUEUE_KEY, encodeQueue(JSON.stringify(queue)));
    });
}

export async function getQueue(): Promise<OfflineAction[]> {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    try {
        return JSON.parse(decodeQueue(raw));
    } catch (error) {
        // Do not silently drop offline actions on corruption: preserve the raw
        // payload for diagnostics/recovery before falling back to empty.
        await preserveCorruptPayload(QUEUE_KEY, raw, error);
        return [];
    }
}

export async function clearQueue(): Promise<void> {
    await Promise.all([
        AsyncStorage.removeItem(QUEUE_KEY),
        AsyncStorage.removeItem(FAILED_QUEUE_KEY),
    ]);
}

/** Returns actions that exceeded the retry budget and were moved to the dead-letter queue. */
export async function getFailedQueue(): Promise<OfflineAction[]> {
    const raw = await AsyncStorage.getItem(FAILED_QUEUE_KEY);
    if (!raw) return [];
    try {
        return JSON.parse(decodeQueue(raw));
    } catch (error) {
        // Same as getQueue: preserve dead-letter payloads instead of dropping.
        await preserveCorruptPayload(FAILED_QUEUE_KEY, raw, error);
        return [];
    }
}

/** Count of actions parked in the dead-letter queue (for UI surfacing). */
export async function getFailedCount(): Promise<number> {
    const failed = await getFailedQueue();
    return failed.length;
}

/** Move actions that exhausted their retry budget into the dead-letter queue. */
async function appendToFailedQueue(actions: OfflineAction[]): Promise<void> {
    if (actions.length === 0) return;
    const existing = await getFailedQueue();
    const merged = [...existing, ...actions];
    await AsyncStorage.setItem(FAILED_QUEUE_KEY, encodeQueue(JSON.stringify(merged)));
}

export async function getQueueSize(): Promise<number> {
    const queue = await getQueue();
    return queue.length;
}

export async function getQueueSummary(): Promise<{ size: number; hasCheckpoint: boolean; hasCompletion: boolean; hasDelivery: boolean; hasInspection: boolean; hasRetries: boolean }> {
    const queue = await getQueue();
    return {
        size: queue.length,
        hasCheckpoint: queue.some((action) => action.type === 'checkpoint_confirm'),
        hasCompletion: queue.some((action) => action.type === 'trip_status'),
        hasDelivery: queue.some((action) => action.type === 'delivery_confirmation'),
        hasInspection: queue.some((action) => action.type === 'inspection_submit'),
        hasRetries: queue.some((action) => action.retries > 0),
    };
}

function isLocalPhotoUri(uri: string): boolean {
    return uri.startsWith('file://') || uri.startsWith('content://') || uri.startsWith('ph://');
}

async function uploadIfLocal(items: unknown[]): Promise<string[]> {
    const out: string[] = [];
    for (const item of items) {
        if (typeof item !== 'string') continue;
        if (isLocalPhotoUri(item)) {
            out.push(await uploadPhoto(item));
        } else {
            out.push(item);
        }
    }
    return out;
}

async function prepareBodyForReplay(action: OfflineAction): Promise<any> {
    if (action.type !== 'delivery_confirmation') {
        return action.body;
    }

    const isV2 = typeof action.endpoint === 'string' && action.endpoint.endsWith('/delivery-confirmation/v2');

    // Legacy body shape: { ..., photos: string[] }
    // v2 body shape:    { ..., photoUrls: string[], photos?: string[] (queue-only local URIs) }
    const legacyPhotos = Array.isArray(action.body?.photos) ? action.body.photos : [];
    const v2PhotoUrls = Array.isArray(action.body?.photoUrls) ? action.body.photoUrls : [];

    if (!isV2) {
        if (legacyPhotos.length === 0) return action.body;
        return { ...action.body, photos: await uploadIfLocal(legacyPhotos) };
    }

    // v2 — merge any queued local URIs (under photos) into the uploaded
    // photoUrls array, then drop the local-only field.
    const merged = [...v2PhotoUrls, ...(await uploadIfLocal(legacyPhotos))];
    const replayBody: Record<string, unknown> = { ...action.body, photoUrls: merged };
    delete replayBody.photos;
    return replayBody;
}

export async function replayQueue(): Promise<{ success: number; failed: number }> {
    const token = await getToken();
    if (!token) {
        return { success: 0, failed: 0 };
    }

    const queue = await getQueue();
    if (queue.length === 0) {
        return { success: 0, failed: 0 };
    }

    let success = 0;
    let failed = 0;
    const remaining: OfflineAction[] = [];
    const exhausted: OfflineAction[] = [];

    for (const action of queue) {
        try {
            const body = await prepareBodyForReplay(action);
            action.body = body;
            const res = await fetch(`${API_URL}${action.endpoint}`, {
                method: action.method,
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(body),
            });

            if (res.ok || res.status === 409) {
                success++;
                continue;
            }

            action.retries++;
            if (action.retries < 5) {
                remaining.push(action);
            } else {
                // Retry budget exhausted — park in the dead-letter queue instead of
                // silently dropping. UI can surface this via getFailedCount().
                exhausted.push(action);
            }
            failed++;
        } catch {
            action.retries++;
            if (action.retries < 5) {
                remaining.push(action);
            } else {
                exhausted.push(action);
            }
            failed++;
        }
    }

    // P2 (код-аудит 2026-06-14): сначала сохраняем exhausted в dead-letter, и только
    // ПОТОМ усекаем основную очередь. Иначе при сбое между двумя записями exhausted-
    // действия терялись (удалены из основной, ещё не в dead-letter). Порядок: сохрани
    // прежде, чем удалить.
    await appendToFailedQueue(exhausted);
    await AsyncStorage.setItem(QUEUE_KEY, encodeQueue(JSON.stringify(remaining)));
    return { success, failed };
}

export function setupAutoReplay(): () => void {
    const unsubscribe = NetInfo.addEventListener(async (state) => {
        if (!state.isConnected || !state.isInternetReachable) {
            return;
        }

        const size = await getQueueSize();
        if (size > 0) {
            await replayQueue();
        }
    });

    return unsubscribe;
}
