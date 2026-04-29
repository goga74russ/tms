import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { getToken } from './auth';
import { uploadPhoto } from './upload';

const QUEUE_KEY = 'tms_offline_action_queue';
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000/api';

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
    type: 'trip_status' | 'checkpoint_confirm' | 'inspection_submit' | 'delivery_confirmation';
    endpoint: string;
    method: 'POST' | 'PATCH' | 'PUT';
    body: any;
    createdAt: string;
    retries: number;
}

export async function enqueueAction(action: Omit<OfflineAction, 'id' | 'createdAt' | 'retries'>): Promise<void> {
    const queue = await getQueue();
    queue.push({
        ...action,
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        createdAt: new Date().toISOString(),
        retries: 0,
    });
    await AsyncStorage.setItem(QUEUE_KEY, encodeQueue(JSON.stringify(queue)));
}

export async function getQueue(): Promise<OfflineAction[]> {
    try {
        const raw = await AsyncStorage.getItem(QUEUE_KEY);
        return raw ? JSON.parse(decodeQueue(raw)) : [];
    } catch {
        return [];
    }
}

export async function clearQueue(): Promise<void> {
    await AsyncStorage.removeItem(QUEUE_KEY);
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

async function prepareBodyForReplay(action: OfflineAction): Promise<any> {
    if (action.type !== 'delivery_confirmation') {
        return action.body;
    }

    const photos = Array.isArray(action.body?.photos) ? action.body.photos : [];
    if (photos.length === 0) {
        return action.body;
    }

    const uploadedPhotos = await Promise.all(
        photos.map(async (photo: unknown) => {
            if (typeof photo === 'string' && isLocalPhotoUri(photo)) {
                return uploadPhoto(photo);
            }

            return photo;
        })
    );

    return {
        ...action.body,
        photos: uploadedPhotos,
    };
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
            }
            failed++;
        } catch {
            action.retries++;
            if (action.retries < 5) {
                remaining.push(action);
            }
            failed++;
        }
    }

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
