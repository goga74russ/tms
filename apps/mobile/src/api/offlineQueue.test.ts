/**
 * Tests for the offline action queue.
 *
 * Covers:
 *  - enqueue persists to AsyncStorage (encoded)
 *  - successful replay removes the action from the queue
 *  - actions that fail < 5 times stay in the queue with incremented retry count
 *  - actions that fail >= 5 times move to the dead-letter queue
 *  - queue survives "app restart" — getQueue() reads back what was set
 *  - empty-queue replay is a no-op
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as auth from './auth';
import {
    clearQueue,
    enqueueAction,
    getQueue,
    getQueueSize,
    getFailedQueue,
    getFailedCount,
    replayQueue,
} from './offlineQueue';

// btoa/atob are needed by the queue encoder; Node 16+ has them globally.
beforeAll(() => {
    if (typeof (global as any).btoa === 'undefined') {
        (global as any).btoa = (s: string) => Buffer.from(s, 'binary').toString('base64');
    }
    if (typeof (global as any).atob === 'undefined') {
        (global as any).atob = (s: string) => Buffer.from(s, 'base64').toString('binary');
    }
});

beforeEach(async () => {
    (AsyncStorage as any).__reset();
    jest.spyOn(auth, 'getToken').mockResolvedValue('test-jwt-token');
    (global as any).fetch = jest.fn();
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe('offlineQueue — enqueue and persistence', () => {
    it('enqueueAction stores the action and getQueue reads it back', async () => {
        await enqueueAction({
            type: 'trip_status',
            endpoint: '/trips/1/status',
            method: 'POST',
            body: { status: 'completed' },
        });

        const queue = await getQueue();
        expect(queue).toHaveLength(1);
        expect(queue[0]).toMatchObject({
            type: 'trip_status',
            endpoint: '/trips/1/status',
            method: 'POST',
            body: { status: 'completed' },
            retries: 0,
        });
        expect(queue[0].id).toBeTruthy();
        expect(queue[0].createdAt).toBeTruthy();
    });

    it('persists across "app restart" — the encoded blob survives a reload', async () => {
        await enqueueAction({
            type: 'checkpoint_confirm',
            endpoint: '/checkpoints/1/confirm',
            method: 'POST',
            body: { lat: 55.7, lng: 37.6 },
        });

        // Snapshot the storage state — this is what would survive an app kill.
        const storedRaw = await AsyncStorage.getItem('tms_offline_action_queue');
        expect(storedRaw).toBeTruthy();
        // Encoded with btoa — should NOT contain the raw payload string.
        expect(storedRaw).not.toContain('checkpoint_confirm');

        // Module-level state is the same; reading again should yield the same item.
        const reloaded = await getQueue();
        expect(reloaded).toHaveLength(1);
        expect(reloaded[0].type).toBe('checkpoint_confirm');
    });

    it('clearQueue wipes both pending and failed queues', async () => {
        await enqueueAction({
            type: 'trip_status',
            endpoint: '/trips/1/status',
            method: 'POST',
            body: {},
        });
        expect(await getQueueSize()).toBe(1);

        await clearQueue();
        expect(await getQueueSize()).toBe(0);
        expect(await getFailedCount()).toBe(0);
    });
});

describe('offlineQueue — replay', () => {
    it('successful replay removes the action from the queue', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({}),
        });

        await enqueueAction({
            type: 'trip_status',
            endpoint: '/trips/1/status',
            method: 'POST',
            body: { status: 'in_progress' },
        });

        const result = await replayQueue();
        expect(result.success).toBe(1);
        expect(result.failed).toBe(0);
        expect(await getQueueSize()).toBe(0);
    });

    it('treats 409 conflict as success (idempotent replay)', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: false,
            status: 409,
            json: async () => ({ error: 'already exists' }),
        });

        await enqueueAction({
            type: 'checkpoint_confirm',
            endpoint: '/checkpoints/1/confirm',
            method: 'POST',
            body: {},
        });

        const result = await replayQueue();
        expect(result.success).toBe(1);
        expect(await getQueueSize()).toBe(0);
    });

    it('failed action increments retry counter but stays in the queue (< 5 retries)', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: false,
            status: 500,
            json: async () => ({}),
        });

        await enqueueAction({
            type: 'trip_status',
            endpoint: '/trips/1/status',
            method: 'POST',
            body: {},
        });

        const result = await replayQueue();
        expect(result.failed).toBe(1);
        expect(result.success).toBe(0);

        const queue = await getQueue();
        expect(queue).toHaveLength(1);
        expect(queue[0].retries).toBe(1);
    });

    it('moves actions to the dead-letter queue after 5 failures', async () => {
        // Set up an action that already has 4 retries — one more push exhausts it.
        await enqueueAction({
            type: 'trip_status',
            endpoint: '/trips/1/status',
            method: 'POST',
            body: {},
        });
        const queue = await getQueue();
        queue[0].retries = 4;
        await AsyncStorage.setItem(
            'tms_offline_action_queue',
            (global as any).btoa(unescape(encodeURIComponent(JSON.stringify(queue))))
        );

        (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: false,
            status: 500,
            json: async () => ({}),
        });

        await replayQueue();

        expect(await getQueueSize()).toBe(0);
        const failed = await getFailedQueue();
        expect(failed).toHaveLength(1);
        expect(failed[0].retries).toBe(5);
    });

    it('replayQueue is a no-op when the queue is empty', async () => {
        const result = await replayQueue();
        expect(result).toEqual({ success: 0, failed: 0 });
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('replayQueue is a no-op when there is no auth token', async () => {
        jest.spyOn(auth, 'getToken').mockResolvedValueOnce(null);

        await enqueueAction({
            type: 'trip_status',
            endpoint: '/trips/1/status',
            method: 'POST',
            body: {},
        });

        const result = await replayQueue();
        expect(result).toEqual({ success: 0, failed: 0 });
        expect(global.fetch).not.toHaveBeenCalled();
        // Action stays in the queue — we don't drop work just because we're logged out.
        expect(await getQueueSize()).toBe(1);
    });

    it('handles fetch throwing (offline → network error) as a retryable failure', async () => {
        (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network request failed'));

        await enqueueAction({
            type: 'trip_status',
            endpoint: '/trips/1/status',
            method: 'POST',
            body: {},
        });

        const result = await replayQueue();
        expect(result.failed).toBe(1);

        const queue = await getQueue();
        expect(queue).toHaveLength(1);
        expect(queue[0].retries).toBe(1);
    });
});
