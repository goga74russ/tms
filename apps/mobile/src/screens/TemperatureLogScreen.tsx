import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    ActivityIndicator,
    Alert,
    FlatList,
    Switch,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Location from 'expo-location';
import { RootStackParamList } from '../navigation/AppNavigator';
import {
    getTemperatureReadings,
    getTemperatureSummary,
    submitTemperature,
    TemperatureReading,
    TemperatureSummary,
} from '../api/temperature';

type Props = NativeStackScreenProps<RootStackParamList, 'TemperatureLog'>;

const AUTO_INTERVAL_MS = 60_000;
const MOCK_STEP = 0.3;

function formatTemp(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(value)) return '—';
    const sign = value > 0 ? '+' : '';
    return `${sign}${value.toFixed(1)}°C`;
}

function formatTime(iso: string | null | undefined): string {
    if (!iso) return '—';
    try {
        const d = new Date(iso);
        return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
        return iso;
    }
}

function sourceLabel(src?: string | null): string {
    switch (src) {
        case 'manual':
            return 'Ручной';
        case 'sensor':
            return 'Датчик';
        case 'mock':
            return 'Mock';
        default:
            return '—';
    }
}

export default function TemperatureLogScreen({ route, navigation }: Props) {
    const { tripId } = route.params;
    const [summary, setSummary] = useState<TemperatureSummary | null>(null);
    const [readings, setReadings] = useState<TemperatureReading[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [tempInput, setTempInput] = useState('');
    const [autoMode, setAutoMode] = useState(false);

    const autoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const mockValueRef = useRef<number | null>(null);
    const mountedRef = useRef(true);

    const slaMin = summary?.slaMinC ?? null;
    const slaMax = summary?.slaMaxC ?? null;
    const slaMid = slaMin !== null && slaMax !== null ? (slaMin + slaMax) / 2 : 2;

    const refresh = useCallback(async () => {
        const [s, list] = await Promise.all([
            getTemperatureSummary(tripId),
            getTemperatureReadings(tripId, 30),
        ]);
        if (!mountedRef.current) return;
        setSummary(s);
        setReadings(list.data || []);
    }, [tripId]);

    useEffect(() => {
        mountedRef.current = true;
        (async () => {
            try {
                await refresh();
            } finally {
                if (mountedRef.current) setLoading(false);
            }
        })();
        return () => {
            mountedRef.current = false;
        };
    }, [refresh]);

    const captureLocation = useCallback(async (): Promise<{ latitude?: number; longitude?: number }> => {
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') return {};
            const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        } catch {
            return {};
        }
    }, []);

    const submitReading = useCallback(
        async (tempC: number, source: 'manual' | 'mock'): Promise<void> => {
            const gps = await captureLocation();
            const result = await submitTemperature(tripId, {
                tempC,
                source,
                recordedAt: new Date().toISOString(),
                ...gps,
            });

            if (!mountedRef.current) return;

            if (result.queued) {
                Alert.alert('Сохранено офлайн', 'Замер уйдет на сервер при восстановлении связи.');
            } else if (result.breach) {
                Alert.alert(
                    '⚠ Нарушение температуры',
                    `Замер ${formatTemp(tempC)} вне SLA (${formatTemp(result.slaMinC)} … ${formatTemp(result.slaMaxC)}). Сообщите диспетчеру.`,
                    [{ text: 'OK' }]
                );
            }

            await refresh();
        },
        [tripId, captureLocation, refresh]
    );

    const handleManualSubmit = useCallback(async () => {
        const normalized = tempInput.replace(',', '.').trim();
        const value = Number.parseFloat(normalized);
        if (!Number.isFinite(value)) {
            Alert.alert('Ошибка', 'Введите температуру числом, например -2.5');
            return;
        }
        setSubmitting(true);
        try {
            await submitReading(value, 'manual');
            if (mountedRef.current) setTempInput('');
        } catch (err: any) {
            Alert.alert('Ошибка', err?.message || 'Не удалось сохранить замер.');
        } finally {
            if (mountedRef.current) setSubmitting(false);
        }
    }, [tempInput, submitReading]);

    const stopAutoMode = useCallback(() => {
        if (autoTimerRef.current) {
            clearInterval(autoTimerRef.current);
            autoTimerRef.current = null;
        }
    }, []);

    const tickAuto = useCallback(async () => {
        const center = mockValueRef.current ?? slaMid;
        const drift = (Math.random() * 2 - 1) * MOCK_STEP;
        const next = center + drift;
        // Light clamp so the walker stays close to SLA midpoint.
        const minBound = (slaMin ?? center - 5) - 1;
        const maxBound = (slaMax ?? center + 5) + 1;
        const clamped = Math.min(maxBound, Math.max(minBound, next));
        mockValueRef.current = clamped;
        try {
            await submitReading(Number(clamped.toFixed(2)), 'mock');
        } catch {
            // Swallow — the next tick will retry.
        }
    }, [slaMid, slaMin, slaMax, submitReading]);

    const startAutoMode = useCallback(() => {
        if (autoTimerRef.current) return;
        mockValueRef.current = slaMid;
        // Fire one immediately so the user sees feedback.
        void tickAuto();
        autoTimerRef.current = setInterval(() => {
            void tickAuto();
        }, AUTO_INTERVAL_MS);
    }, [slaMid, tickAuto]);

    useEffect(() => {
        if (autoMode) {
            startAutoMode();
        } else {
            stopAutoMode();
        }
    }, [autoMode, startAutoMode, stopAutoMode]);

    // Stop auto mode on screen blur and on unmount.
    useEffect(() => {
        const unsub = navigation.addListener('blur', () => {
            stopAutoMode();
            setAutoMode(false);
        });
        return unsub;
    }, [navigation, stopAutoMode]);

    useEffect(() => {
        return () => {
            stopAutoMode();
        };
    }, [stopAutoMode]);

    if (loading) {
        return <ActivityIndicator style={{ flex: 1 }} size="large" color="#2563eb" />;
    }

    const slaText =
        slaMin !== null && slaMax !== null
            ? `${formatTemp(slaMin)} … ${formatTemp(slaMax)}`
            : 'SLA не задан';
    const breachCount = summary?.breachCount || 0;

    return (
        <FlatList
            style={styles.container}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            data={readings.slice(0, 30)}
            keyExtractor={(item) => item.id}
            ListHeaderComponent={(
                <View>
                    <View style={styles.headerCard}>
                        <Text style={styles.headerLabel}>SLA-диапазон</Text>
                        <Text style={styles.headerSla}>{slaText}</Text>
                        <View style={styles.headerStatsRow}>
                            <View style={styles.statCell}>
                                <Text style={styles.statValue}>{summary?.count ?? 0}</Text>
                                <Text style={styles.statLabel}>Замеров</Text>
                            </View>
                            <View style={styles.statCell}>
                                <Text style={[styles.statValue, breachCount > 0 && styles.breachValue]}>
                                    {breachCount}
                                </Text>
                                <Text style={styles.statLabel}>Нарушений</Text>
                            </View>
                            <View style={styles.statCell}>
                                <Text style={styles.statValue}>{formatTemp(summary?.avgC ?? null)}</Text>
                                <Text style={styles.statLabel}>Среднее</Text>
                            </View>
                        </View>
                    </View>

                    <View style={styles.inputCard}>
                        <Text style={styles.inputLabel}>Записать замер вручную</Text>
                        <TextInput
                            style={styles.tempInput}
                            value={tempInput}
                            onChangeText={setTempInput}
                            placeholder="например, 4.2"
                            keyboardType="numbers-and-punctuation"
                            editable={!submitting}
                        />
                        <TouchableOpacity
                            style={[styles.primaryButton, submitting && styles.disabledButton]}
                            onPress={handleManualSubmit}
                            disabled={submitting}
                        >
                            {submitting ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <Text style={styles.primaryButtonText}>Записать</Text>
                            )}
                        </TouchableOpacity>
                    </View>

                    <View style={styles.autoCard}>
                        <View style={styles.autoRow}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.autoTitle}>Авто-режим (mock датчик)</Text>
                                <Text style={styles.autoHint}>
                                    Записывает замер каждые 60 секунд вокруг середины SLA. Для тестов и демо.
                                </Text>
                            </View>
                            <Switch
                                value={autoMode}
                                onValueChange={setAutoMode}
                                trackColor={{ false: '#cbd5e1', true: '#93c5fd' }}
                                thumbColor={autoMode ? '#2563eb' : '#f1f5f9'}
                            />
                        </View>
                        {autoMode && (
                            <Text style={styles.autoActive}>● Авто-режим активен</Text>
                        )}
                    </View>

                    <Text style={styles.sectionTitle}>Последние замеры</Text>
                </View>
            )}
            renderItem={({ item }) => (
                <View style={[styles.readingRow, item.breach && styles.readingRowBreach]}>
                    <View style={styles.readingLeft}>
                        <Text style={styles.readingTime}>{formatTime(item.recordedAt)}</Text>
                        <Text style={styles.readingSource}>{sourceLabel(item.source)}</Text>
                    </View>
                    <Text style={[styles.readingTemp, item.breach && styles.readingTempBreach]}>
                        {formatTemp(item.tempC)}
                    </Text>
                    {item.breach && <Text style={styles.breachBadge}>⚠</Text>}
                </View>
            )}
            ListEmptyComponent={(
                <Text style={styles.emptyText}>Замеров пока нет — запишите первый.</Text>
            )}
        />
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f8fafc',
    },
    content: {
        padding: 16,
        paddingBottom: 32,
    },
    headerCard: {
        backgroundColor: '#fff',
        borderRadius: 8,
        padding: 16,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        marginBottom: 12,
    },
    headerLabel: {
        fontSize: 12,
        color: '#64748b',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    headerSla: {
        fontSize: 22,
        fontWeight: '700',
        color: '#0f172a',
        marginTop: 4,
    },
    headerStatsRow: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 12,
    },
    statCell: {
        flex: 1,
        backgroundColor: '#f8fafc',
        borderRadius: 8,
        paddingVertical: 10,
        alignItems: 'center',
    },
    statValue: {
        fontSize: 18,
        fontWeight: '700',
        color: '#0f172a',
    },
    breachValue: {
        color: '#dc2626',
    },
    statLabel: {
        fontSize: 11,
        color: '#64748b',
        marginTop: 2,
    },
    inputCard: {
        backgroundColor: '#fff',
        borderRadius: 8,
        padding: 16,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        marginBottom: 12,
    },
    inputLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: '#0f172a',
        marginBottom: 8,
    },
    tempInput: {
        borderWidth: 1,
        borderColor: '#cbd5e1',
        borderRadius: 8,
        padding: 14,
        fontSize: 28,
        textAlign: 'center',
        marginBottom: 12,
        backgroundColor: '#fff',
        fontWeight: '700',
        color: '#0f172a',
    },
    primaryButton: {
        backgroundColor: '#2563eb',
        padding: 16,
        borderRadius: 8,
        alignItems: 'center',
        minHeight: 56,
        justifyContent: 'center',
    },
    disabledButton: {
        backgroundColor: '#94a3b8',
    },
    primaryButtonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '700',
    },
    autoCard: {
        backgroundColor: '#fff',
        borderRadius: 8,
        padding: 16,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        marginBottom: 16,
    },
    autoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    autoTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#0f172a',
    },
    autoHint: {
        fontSize: 12,
        color: '#64748b',
        marginTop: 4,
    },
    autoActive: {
        marginTop: 10,
        color: '#2563eb',
        fontWeight: '700',
        fontSize: 12,
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#0f172a',
        marginBottom: 8,
    },
    readingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        borderRadius: 8,
        padding: 12,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        marginBottom: 8,
    },
    readingRowBreach: {
        borderColor: '#fecaca',
        backgroundColor: '#fef2f2',
    },
    readingLeft: {
        flex: 1,
    },
    readingTime: {
        fontSize: 14,
        fontWeight: '600',
        color: '#0f172a',
    },
    readingSource: {
        fontSize: 11,
        color: '#64748b',
        marginTop: 2,
    },
    readingTemp: {
        fontSize: 18,
        fontWeight: '700',
        color: '#0f172a',
        marginRight: 8,
    },
    readingTempBreach: {
        color: '#dc2626',
    },
    breachBadge: {
        fontSize: 16,
        color: '#dc2626',
    },
    emptyText: {
        textAlign: 'center',
        color: '#64748b',
        padding: 16,
    },
});
