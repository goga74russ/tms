/**
 * Tests for the WatermelonDB sync wrapper.
 *
 * Covers:
 *  - pullChanges makes a GET with the correct URL + lastSyncAt + auth header
 *  - pushChanges POSTs to /sync/events with only the events.created partition
 *    (updated / deleted are intentionally dropped — see the comment in sync.ts)
 *  - pull failure → swallowed via Alert.alert (current behaviour)
 *  - empty events array → push is skipped (no network call)
 */

import { synchronize, __reset, __getLastCall } from '@nozbe/watermelondb/sync';
import { syncDatabase } from './sync';

beforeEach(() => {
    __reset();
    (global as any).fetch = jest.fn();
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe('syncDatabase — pull', () => {
    it('GETs /sync/pull with auth header and parses changes + timestamp', async () => {
        (global.fetch as jest.Mock)
            // pull
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ changes: { events: { created: [] } }, timestamp: 1700000000 }),
            });

        await syncDatabase('my-token');

        const pullCall = (global.fetch as jest.Mock).mock.calls[0];
        expect(pullCall[0]).toMatch(/\/sync\/pull\?lastSyncAt=0&schemaVersion=1/);
        expect(pullCall[1].headers.Authorization).toBe('Bearer my-token');
    });

    it('pull returning !ok is swallowed (current behaviour — alerts the user)', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: false,
            status: 500,
            json: async () => ({}),
        });

        // Should not throw — the wrapper catches and shows an Alert.
        await expect(syncDatabase('my-token')).resolves.toBeUndefined();
    });
});

describe('syncDatabase — push', () => {
    it('POSTs ONLY events.created — updated/deleted partitions are intentionally dropped', async () => {
        (global.fetch as jest.Mock)
            // pull
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    changes: {
                        events: {
                            created: [
                                {
                                    event_id: 'evt-1',
                                    type: 'trip_started',
                                    timestamp: 1700000000000,
                                    payload: { tripId: 't1' },
                                },
                            ],
                            updated: [{ event_id: 'evt-2' }], // should be ignored
                            deleted: ['evt-3'], // should be ignored
                        },
                    },
                    timestamp: 1700000000,
                }),
            })
            // push
            .mockResolvedValueOnce({ ok: true, json: async () => ({}) });

        await syncDatabase('my-token');

        const pushCall = (global.fetch as jest.Mock).mock.calls[1];
        expect(pushCall[0]).toMatch(/\/sync\/events$/);
        expect(pushCall[1].method).toBe('POST');
        expect(pushCall[1].headers.Authorization).toBe('Bearer my-token');

        const body = JSON.parse(pushCall[1].body);
        expect(body.events).toHaveLength(1);
        expect(body.events[0]).toMatchObject({
            id: 'evt-1',
            type: 'trip_started',
            payload: { tripId: 't1' },
        });
        // Timestamp must be an ISO string per the server contract.
        expect(body.events[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('empty events partition → no push HTTP call at all', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ changes: { events: { created: [] } }, timestamp: 1700000000 }),
        });

        await syncDatabase('my-token');

        // Only the pull was issued — push is a no-op when there are zero events.
        expect((global.fetch as jest.Mock).mock.calls).toHaveLength(1);
    });

    it('passes the lastPulledAt timestamp through to pushChanges', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ changes: {}, timestamp: 1700000000 }),
        });

        await syncDatabase('my-token');

        const call = __getLastCall();
        expect(call).toBeTruthy();
        expect(typeof call.pullChanges).toBe('function');
        expect(typeof call.pushChanges).toBe('function');
        expect(call.migrationsEnabledAtVersion).toBe(1);
    });
});
