import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { RootStackParamList } from '../navigation/AppNavigator';
import {
    TemperatureReading,
    TemperatureSummary,
    getTemperatureReadings,
    getTemperatureSummary,
    submitTemperature,
} from '../api/temperature';
import { READING_SOURCE_LABELS, label } from '@tms/shared';
import { Button, Card, Pill } from '../components/ui';
import { colors, radius, spacing, typography } from '../theme/tokens';

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

export default function TemperatureLogScreen({ route, navigation }: Props) {
    const { tripId } = route.params;
    const [summary, setSummary] = useState<TemperatureSummary | null>(null);
    const [readings, setReadings] = useState<TemperatureReading[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [tempInput, setTempInput] = useState('');
    const [autoMode, setAutoMode] = useState(false);
    const [pushPermission, setPushPermission] = useState<'granted' | 'denied' | 'undetermined'>('undetermined');

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

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const existing = await Notifications.getPermissionsAsync();
                if (existing.status === 'granted') {
                    if (!cancelled) setPushPermission('granted');
                    return;
                }
                if (existing.status === 'denied' && !existing.canAskAgain) {
                    if (!cancelled) setPushPermission('denied');
                    return;
                }
                const requested = await Notifications.requestPermissionsAsync();
                if (!cancelled) setPushPermission(requested.status === 'granted' ? 'granted' : 'denied');
            } catch {
                if (!cancelled) setPushPermission('denied');
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

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
                    'Нарушение температуры',
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
        const minBound = (slaMin ?? center - 5) - 1;
        const maxBound = (slaMax ?? center + 5) + 1;
        const clamped = Math.min(maxBound, Math.max(minBound, next));
        mockValueRef.current = clamped;
        try {
            await submitReading(Number(clamped.toFixed(2)), 'mock');
        } catch {
            // next tick will retry
        }
    }, [slaMid, slaMin, slaMax, submitReading]);

    const startAutoMode = useCallback(() => {
        if (autoTimerRef.current) return;
        mockValueRef.current = slaMid;
        void tickAuto();
        autoTimerRef.current = setInterval(() => void tickAuto(), AUTO_INTERVAL_MS);
    }, [slaMid, tickAuto]);

    useEffect(() => {
        if (autoMode) startAutoMode();
        else stopAutoMode();
    }, [autoMode, startAutoMode, stopAutoMode]);

    useEffect(() => {
        const unsub = navigation.addListener('blur', () => {
            stopAutoMode();
            setAutoMode(false);
        });
        return unsub;
    }, [navigation, stopAutoMode]);

    useEffect(() => () => stopAutoMode(), [stopAutoMode]);

    if (loading) {
        return <ActivityIndicator style={{ flex: 1 }} size="large" color={colors.brand[600]} />;
    }

    const slaText =
        slaMin !== null && slaMax !== null ? `${formatTemp(slaMin)} … ${formatTemp(slaMax)}` : 'SLA не задан';
    const breachCount = summary?.breachCount || 0;

    return (
        <FlatList
            style={styles.container}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            data={readings.slice(0, 30)}
            keyExtractor={(item) => item.id}
            ListHeaderComponent={
                <View>
                    {/* SLA header */}
                    <Card>
                        <View style={styles.slaHeader}>
                            <Text style={styles.slaLabel}>SLA-диапазон</Text>
                            <Pill
                                label={breachCount > 0 ? `Нарушений: ${breachCount}` : 'В норме'}
                                tone={breachCount > 0 ? 'danger' : 'success'}
                            />
                        </View>
                        <Text style={styles.slaValue}>{slaText}</Text>
                        <View style={styles.statRow}>
                            <View style={styles.statCell}>
                                <Text style={styles.statValue}>{summary?.count ?? 0}</Text>
                                <Text style={styles.statLabel}>Замеров</Text>
                            </View>
                            <View style={styles.statCell}>
                                <Text style={[styles.statValue, breachCount > 0 && { color: colors.danger[600] }]}>
                                    {breachCount}
                                </Text>
                                <Text style={styles.statLabel}>Нарушений</Text>
                            </View>
                            <View style={styles.statCell}>
                                <Text style={styles.statValue}>{formatTemp(summary?.avgC ?? null)}</Text>
                                <Text style={styles.statLabel}>Среднее</Text>
                            </View>
                        </View>
                    </Card>

                    {/* Manual input */}
                    <Card style={{ marginTop: spacing.md }}>
                        <Text style={styles.cardTitle}>Записать замер вручную</Text>
                        <TextInput
                            style={styles.bigTempInput}
                            value={tempInput}
                            onChangeText={setTempInput}
                            placeholder="например, 4.2"
                            placeholderTextColor={colors.neutral[300]}
                            keyboardType="numbers-and-punctuation"
                            editable={!submitting}
                        />
                        <Button
                            title="Записать замер"
                            variant="primary"
                            size="lg"
                            fullWidth
                            isLoading={submitting}
                            onPress={handleManualSubmit}
                        />
                    </Card>

                    {/* Auto mode
                        Known limitation: this is a foreground-only timer. If the
                        screen is unmounted (navigation blur) or the app is
                        force-killed, the interval is gone — there's no
                        persistence or background task. Real fix would be
                        server-side scheduled polling; out of scope here.
                        We surface the limitation to the driver via a pill
                        below so it's not a silent surprise mid-trip. */}
                    <Card style={{ marginTop: spacing.md }}>
                        <View style={styles.autoRow}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.cardTitle}>Авто-режим (демо-датчик)</Text>
                                <Text style={styles.cardHint}>
                                    Замер каждые 60 секунд вокруг середины SLA. Для тестов и демо.
                                </Text>
                            </View>
                            <Switch
                                value={autoMode}
                                onValueChange={setAutoMode}
                                trackColor={{ false: colors.neutral[300], true: colors.brand[100] }}
                                thumbColor={autoMode ? colors.brand[600] : colors.neutral[100]}
                            />
                        </View>
                        {autoMode && (
                            <View style={{ marginTop: spacing.sm }}>
                                <Pill label="● Авто-режим активен" tone="brand" />
                            </View>
                        )}
                        <View style={{ marginTop: spacing.sm }}>
                            <Pill
                                label="ⓘ Авторежим работает только пока экран открыт"
                                tone="warning"
                            />
                        </View>
                        {pushPermission === 'denied' && (
                            <View style={{ marginTop: spacing.sm }}>
                                <Pill label="Push отключены" tone="danger" />
                            </View>
                        )}
                        {pushPermission === 'granted' && (
                            <View style={{ marginTop: spacing.sm }}>
                                <Pill label="Push о нарушениях включены" tone="success" />
                            </View>
                        )}
                    </Card>

                    <Text style={styles.sectionTitle}>Последние замеры</Text>
                </View>
            }
            renderItem={({ item }) => (
                <View style={[styles.readingRow, item.breach && styles.readingRowBreach]}>
                    <View style={styles.readingLeft}>
                        <Text style={styles.readingTime}>{formatTime(item.recordedAt)}</Text>
                        <Text style={styles.readingSource}>{label(READING_SOURCE_LABELS, item.source)}</Text>
                    </View>
                    <Text style={[styles.readingTemp, item.breach && styles.readingTempBreach]}>
                        {formatTemp(item.tempC)}
                    </Text>
                    {item.breach && (
                        <Pill label="Нарушение" tone="danger" style={{ marginLeft: spacing.sm }} />
                    )}
                </View>
            )}
            ListEmptyComponent={<Text style={styles.emptyText}>Замеров пока нет — запишите первый.</Text>}
        />
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.neutral[50] },
    content: { padding: spacing.lg, paddingBottom: spacing.xxxl },
    slaHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    slaLabel: {
        ...typography.captionBold,
        color: colors.neutral[500],
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    slaValue: { ...typography.title, color: colors.neutral[900], marginTop: spacing.xs },
    statRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
    statCell: {
        flex: 1,
        backgroundColor: colors.neutral[50],
        borderRadius: radius.md,
        paddingVertical: spacing.md,
        alignItems: 'center',
    },
    statValue: { ...typography.headline, color: colors.neutral[900] },
    statLabel: { fontSize: 11, color: colors.neutral[500], marginTop: 2 },

    cardTitle: { ...typography.bodyBold, color: colors.neutral[900] },
    cardHint: { fontSize: 12, color: colors.neutral[500], marginTop: 4 },
    bigTempInput: {
        borderWidth: 1,
        borderColor: colors.neutral[200],
        borderRadius: radius.md,
        padding: spacing.lg,
        fontSize: 32,
        textAlign: 'center',
        backgroundColor: colors.neutral[50],
        fontWeight: '700',
        color: colors.neutral[900],
        marginTop: spacing.md,
        marginBottom: spacing.md,
    },

    autoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },

    sectionTitle: {
        ...typography.captionBold,
        color: colors.neutral[500],
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginTop: spacing.xl,
        marginBottom: spacing.sm,
    },

    readingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.white,
        borderRadius: radius.md,
        padding: spacing.md,
        borderWidth: 1,
        borderColor: colors.neutral[200],
        marginBottom: spacing.sm,
    },
    readingRowBreach: { borderColor: '#fecaca', backgroundColor: colors.danger[50] },
    readingLeft: { flex: 1 },
    readingTime: { ...typography.bodyBold, color: colors.neutral[900] },
    readingSource: { fontSize: 11, color: colors.neutral[500], marginTop: 2 },
    readingTemp: {
        fontSize: 20,
        fontWeight: '700',
        color: colors.neutral[900],
    },
    readingTempBreach: { color: colors.danger[700] },

    emptyText: { textAlign: 'center', color: colors.neutral[500], padding: spacing.lg },
});
