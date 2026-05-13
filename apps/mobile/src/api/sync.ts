import { synchronize } from '@nozbe/watermelondb/sync';
import { Alert } from 'react-native';
import { database } from '../database';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000/api';

export async function syncDatabase(token: string) {
    try {
        await synchronize({
            database,
            pullChanges: async ({ lastPulledAt, schemaVersion, migration: _migration }) => {
                const response = await fetch(
                    `${API_URL}/sync/pull?lastSyncAt=${lastPulledAt || 0}&schemaVersion=${schemaVersion}`,
                    { headers: { Authorization: `Bearer ${token}` } }
                );
                if (!response.ok) {
                    throw new Error('Failed to pull sync changes');
                }
                const { changes, timestamp } = await response.json();
                return { changes, timestamp: Number(timestamp) };
            },
            pushChanges: async ({ changes, lastPulledAt: _lastPulledAt }) => {
                // NOTE: The server `/sync/events` endpoint is an append-only event
                // stream (see apps/api/src/modules/sync/routes.ts — it validates a
                // discriminated union of event types and stores them via
                // syncService.processSyncEvents). It does NOT accept update/delete
                // semantics, so we only forward `events.created`. `updated`/`deleted`
                // partitions from WatermelonDB are intentionally ignored — events
                // are immutable once recorded locally, and tombstones for trips /
                // route_points are managed server-side via subsequent /sync/pull
                // snapshots, not pushed from the client.
                const localEvents = ((changes as any).events?.created || []).map((event: any) => ({
                    id: event.event_id ?? event.eventId,
                    type: event.type,
                    timestamp: new Date(event.timestamp).toISOString(),
                    payload: typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload,
                }));

                if (localEvents.length > 0) {
                    const response = await fetch(`${API_URL}/sync/events`, {
                        method: 'POST',
                        body: JSON.stringify({ events: localEvents }),
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${token}`
                        },
                    });
                    if (!response.ok) {
                        throw new Error('Failed to push sync changes');
                    }
                }
            },
            migrationsEnabledAtVersion: 1,
        });
    } catch (error) {
        
        Alert.alert(
            'Ошибка синхронизации',
            'Не удалось синхронизировать данные с сервером. Повторите позже - данные сохранены локально.',
            [{ text: 'OK' }]
        );
    }
}




