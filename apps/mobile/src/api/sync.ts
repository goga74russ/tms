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




