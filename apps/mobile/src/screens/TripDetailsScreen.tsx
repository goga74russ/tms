import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    AppState,
    AppStateStatus,
    FlatList,
    Linking,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { Q } from '@nozbe/watermelondb';
import NetInfo from '@react-native-community/netinfo';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { database } from '../database';
import Trip from '../database/models/Trip';
import RoutePoint from '../database/models/RoutePoint';
import { getQueueSummary } from '../api/offlineQueue';
import {
    completeTrip,
    getTripById,
    getTripEta,
    getTripOperationExceptions,
    OperationExceptionItem,
    OperationExceptionSummary,
    startTrip,
    TripEtaData,
    TripSummary,
} from '../api/trips';
import { getTemperatureSummary, TemperatureSummary } from '../api/temperature';
import { startWialonMock, stopWialonMock } from '../api/wialonMock';
import { Button, Card, Pill, ProgressSteps } from '../components/ui';
import { colors, radius, spacing, typography, shadow } from '../theme/tokens';

const WAYBILL_VISIBLE_STATUSES = new Set([
    'waybill_issued',
    'loading',
    'in_transit',
    'completed',
    'billed',
]);

type Props = NativeStackScreenProps<RootStackParamList, 'TripDetails'>;

const ROUTE_POINT_STATUS: Record<string, { label: string; tone: 'success' | 'brand' | 'warning' | 'neutral' }> = {
    pending: { label: 'Ожидает', tone: 'neutral' },
    arrived: { label: 'Прибыл', tone: 'warning' },
    completed: { label: 'Завершена', tone: 'success' },
    skipped: { label: 'Пропущена', tone: 'neutral' },
};

const STAGE_BY_STATUS: Record<string, number> = {
    assigned: 0,
    waybill_draft: 1,
    inspection: 1,
    waybill_issued: 2,
    loading: 2,
    in_transit: 3,
    completed: 4,
    billed: 4,
};

const STAGE_LABELS = ['План', 'Назначен', 'Готов', 'В пути', 'Завершён'];

function formatWindow(fromIso?: string | null, toIso?: string | null): string | null {
    if (!fromIso && !toIso) return null;
    const fromD = fromIso ? new Date(fromIso) : null;
    const toD = toIso ? new Date(toIso) : null;
    const fmtTime = (d: Date) =>
        `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const fmtDate = (d: Date) =>
        `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
    const refDate =
        fromD && !Number.isNaN(fromD.getTime())
            ? fromD
            : toD && !Number.isNaN(toD.getTime())
            ? toD
            : null;
    const fromTime = fromD && !Number.isNaN(fromD.getTime()) ? fmtTime(fromD) : '—';
    const toTime = toD && !Number.isNaN(toD.getTime()) ? fmtTime(toD) : '—';
    const datePart = refDate ? ` · ${fmtDate(refDate)}` : '';
    return `${fromTime} – ${toTime}${datePart}`;
}

export default function TripDetailsScreen({ route, navigation }: Props) {
    const { tripId } = route.params;
    const [trip, setTrip] = useState<Trip | null>(null);
    const [points, setPoints] = useState<RoutePoint[]>([]);
    const [exceptionSummary, setExceptionSummary] = useState<OperationExceptionSummary | null>(null);
    const [exceptions, setExceptions] = useState<OperationExceptionItem[]>([]);
    const [offlineQueueSummary, setOfflineQueueSummary] = useState({
        size: 0,
        hasCheckpoint: false,
        hasCompletion: false,
        hasDelivery: false,
        hasInspection: false,
        hasRetries: false,
    });
    const [completionReason, setCompletionReason] = useState('');
    const [tripDetail, setTripDetail] = useState<TripSummary | null>(null);
    const [tempSummary, setTempSummary] = useState<TemperatureSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [odometerModal, setOdometerModal] = useState<null | 'start' | 'complete'>(null);
    const [odometerValue, setOdometerValue] = useState('');
    const [completionNotes, setCompletionNotes] = useState('');
    const [actionInFlight, setActionInFlight] = useState(false);
    const [eta, setEta] = useState<TripEtaData | null>(null);
    const [etaLoaded, setEtaLoaded] = useState(false);
    const [online, setOnline] = useState<boolean | null>(null);

    useEffect(() => {
        const unsub = NetInfo.addEventListener((s) => {
            setOnline(Boolean(s.isConnected && s.isInternetReachable));
        });
        return () => unsub();
    }, []);

    const fetchData = useCallback(async () => {
        try {
            const fetchedTrips = await database.collections
                .get<Trip>('trips')
                .query(Q.where('trip_id', tripId))
                .fetch();
            if (fetchedTrips.length > 0) setTrip(fetchedTrips[0]);

            const fetchedPoints = await database.collections
                .get<RoutePoint>('route_points')
                .query(Q.where('trip_id', tripId))
                .fetch();
            setPoints(fetchedPoints);

            const [exceptionData, queueSize, fetchedTripDetail] = await Promise.all([
                getTripOperationExceptions(tripId),
                getQueueSummary(),
                getTripById(tripId).catch(() => null),
            ]);
            setExceptionSummary(exceptionData?.summary || null);
            setExceptions(exceptionData?.exceptions || []);
            setOfflineQueueSummary(queueSize);
            setTripDetail(fetchedTripDetail);

            const needsColdChain = Boolean(
                fetchedTripDetail?.coldChainRequired ||
                    fetchedTripDetail?.orders?.some((o) => o.coldChainRequired)
            );
            if (needsColdChain) {
                const ts = await getTemperatureSummary(tripId).catch(() => null);
                setTempSummary(ts);
            } else {
                setTempSummary(null);
            }
        } catch {
            Alert.alert('Ошибка', 'Не удалось загрузить данные рейса.');
        } finally {
            setLoading(false);
        }
    }, [tripId]);

    useEffect(() => {
        void fetchData();
    }, [fetchData]);

    const tripStatusForEta = trip?.status;
    useEffect(() => {
        if (tripStatusForEta !== 'in_transit') {
            setEta(null);
            setEtaLoaded(false);
            return;
        }
        // Pause ETA polling when app is backgrounded to save battery
        // (and avoid pointless network usage on EDGE). Resume + refetch
        // immediately on return to foreground.
        let cancelled = false;
        let handle: ReturnType<typeof setInterval> | null = null;

        const poll = async () => {
            const res = await getTripEta(tripId);
            if (cancelled) return;
            setEta(res.data);
            setEtaLoaded(true);
        };

        const startPolling = () => {
            if (handle !== null) return;
            void poll();
            handle = setInterval(() => void poll(), 60_000);
        };

        const stopPolling = () => {
            if (handle !== null) {
                clearInterval(handle);
                handle = null;
            }
        };

        const handleAppStateChange = (next: AppStateStatus) => {
            if (next === 'active') {
                startPolling();
            } else {
                stopPolling();
            }
        };

        if (AppState.currentState === 'active') {
            startPolling();
        }
        const sub = AppState.addEventListener('change', handleAppStateChange);

        return () => {
            cancelled = true;
            stopPolling();
            sub.remove();
        };
    }, [tripId, tripStatusForEta]);

    const windowsByPointId = useMemo(() => {
        const map = new Map<string, { from?: string | null; to?: string | null }>();
        (tripDetail?.routePoints || []).forEach((rp) => {
            map.set(rp.id, { from: rp.windowFrom ?? null, to: rp.windowTo ?? null });
        });
        return map;
    }, [tripDetail]);

    const tripStatus = trip?.status;
    const showWaybillButton = !!tripStatus && WAYBILL_VISIBLE_STATUSES.has(tripStatus);
    const showColdChainButton = Boolean(
        tripDetail?.coldChainRequired || tripDetail?.orders?.some((o) => o.coldChainRequired)
    );
    const tempBreachCount = tempSummary?.breachCount || 0;
    const canStart = tripStatus === 'waybill_issued';
    const allPointsClosed = points.length > 0 && points.every((p) => p.status === 'completed' || p.status === 'skipped');
    const canComplete = tripStatus === 'in_transit' && allPointsClosed;

    const stage = STAGE_BY_STATUS[trip?.status ?? ''] ?? 0;

    const openOdometerModal = (mode: 'start' | 'complete') => {
        setOdometerValue('');
        setCompletionNotes('');
        setOdometerModal(mode);
    };

    const submitOdometer = async () => {
        const parsed = Number(odometerValue.replace(',', '.'));
        if (!Number.isFinite(parsed) || parsed < 0) {
            Alert.alert('Ошибка', 'Введите корректный пробег (км).');
            return;
        }
        const mode = odometerModal;
        if (!mode) return;
        setActionInFlight(true);
        try {
            if (mode === 'start') {
                await startTrip(tripId, { odometerStart: parsed });
                const vehicleId = trip?.vehicleId;
                if (vehicleId) {
                    try {
                        await startWialonMock(vehicleId, tripId);
                    } catch (err) {
                        console.warn('[wialon-mock] start failed', err);
                    }
                }
            } else {
                await completeTrip(tripId, {
                    odometerEnd: parsed,
                    notes: completionNotes.trim() || undefined,
                });
                const vehicleId = trip?.vehicleId;
                if (vehicleId) {
                    try {
                        await stopWialonMock(vehicleId);
                    } catch (err) {
                        console.warn('[wialon-mock] stop failed', err);
                    }
                }
            }
            setOdometerModal(null);
            await fetchData();
            Alert.alert('Готово', mode === 'start' ? 'Рейс начат' : 'Рейс завершён');
        } catch (e: any) {
            Alert.alert('Ошибка', e?.message || 'Не удалось выполнить действие');
        } finally {
            setActionInFlight(false);
        }
    };

    const openNavigation = (address: string) => {
        const query = encodeURIComponent(address);
        Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`);
    };

    const canCompleteTrip = (exceptionSummary?.blocking || 0) === 0;
    const requiresCompletionReason = !canCompleteTrip;
    const canSubmitCompletion = canCompleteTrip || completionReason.trim().length >= 6;

    const markCompleted = () => {
        if (canCompleteTrip) {
            navigation.navigate('TripCompletion', { tripId });
            return;
        }
        const reason = completionReason.trim();
        if (reason.length < 6) {
            Alert.alert('Нужна причина', 'Укажите, почему водитель продолжает или исправляет статус при блокерах.');
            return;
        }
        Alert.alert('Есть блокеры', 'По рейсу есть незакрытые замечания. Продолжить завершение?', [
            { text: 'Отмена', style: 'cancel' },
            {
                text: 'Продолжить',
                onPress: () => navigation.navigate('TripCompletion', { tripId, correctionReason: reason }),
            },
        ]);
    };

    const nextPoint = useMemo(() => points.find((p) => p.status !== 'completed' && p.status !== 'skipped'), [points]);

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color={colors.brand[600]} />
            </View>
        );
    }

    if (!trip) {
        return (
            <View style={styles.center}>
                <Text style={styles.error}>Рейс не найден</Text>
            </View>
        );
    }

    return (
        <View style={styles.root}>
            {online === false && (
                <View style={styles.offlineBar} accessibilityRole="alert">
                    <Text style={styles.offlineBarText}>
                        Нет соединения. Действия сохраняются локально.
                    </Text>
                </View>
            )}
            {/* Hero "map" placeholder — solid surface w/ markers; replace w/ react-native-maps when available */}
            <View style={styles.mapHero}>
                <View style={styles.mapGrid} pointerEvents="none">
                    {/* Decorative grid lines to mimic a map */}
                    {Array.from({ length: 8 }).map((_, i) => (
                        <View key={`h-${i}`} style={[styles.gridLine, { top: `${(i + 1) * 12}%` }]} />
                    ))}
                    {Array.from({ length: 6 }).map((_, i) => (
                        <View key={`v-${i}`} style={[styles.gridLineV, { left: `${(i + 1) * 16}%` }]} />
                    ))}
                </View>
                <View style={styles.mapRoute} pointerEvents="none">
                    <View style={styles.routeDotStart} />
                    <View style={styles.routeLine} />
                    <View style={styles.routeDotEnd} />
                </View>
                <View style={styles.mapBadge}>
                    <Text style={styles.mapBadgeText}>
                        {nextPoint ? `Точка ${points.indexOf(nextPoint) + 1} из ${points.length}` : `${points.length} точек`}
                    </Text>
                </View>
            </View>

            <ScrollView
                style={styles.sheetScroll}
                contentContainerStyle={styles.sheetContent}
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.handle} />

                <View style={styles.headerRow}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.tripTitle}>Маршрут № {trip.tripId.slice(0, 8)}</Text>
                        <Text style={styles.tripSub}>
                            {points.length > 0
                                ? `${points.length} ${points.length === 1 ? 'точка' : 'точек'} · ${trip.status}`
                                : trip.status}
                        </Text>
                    </View>
                    {offlineQueueSummary.size > 0 && (
                        <Pill label={`Офлайн ${offlineQueueSummary.size}`} tone="warning" />
                    )}
                </View>

                <ProgressSteps total={5} activeIndex={stage} labels={STAGE_LABELS} style={{ marginTop: spacing.md }} />

                {tripStatus === 'in_transit' && etaLoaded && (
                    <Card style={{ marginTop: spacing.lg }} tone="accent" elevation="none">
                        {eta ? (
                            <>
                                <Text style={styles.etaTitle}>
                                    До следующей точки ~ {Math.max(0, Math.round((new Date(eta.etaIso).getTime() - Date.now()) / 60000))} мин
                                </Text>
                                <Text style={styles.etaLine}>
                                    Прибытие: {(() => {
                                        const d = new Date(eta.etaIso);
                                        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                                    })()} · {eta.distanceKm.toFixed(1)} км
                                </Text>
                            </>
                        ) : (
                            <Text style={styles.etaMuted}>ETA: нет GPS-данных</Text>
                        )}
                    </Card>
                )}

                {nextPoint && (
                    <Card style={{ marginTop: spacing.md }}>
                        <Text style={styles.sectionLabel}>Следующая точка</Text>
                        <Text style={styles.nextPointName}>
                            {nextPoint.type === 'loading' ? 'Подъехать к точке погрузки' : 'Доставка'}
                        </Text>
                        <Text style={styles.nextPointAddr}>{nextPoint.address}</Text>
                        <Button
                            title="Открыть в навигаторе"
                            variant="secondary"
                            size="md"
                            onPress={() => openNavigation(nextPoint.address)}
                            style={{ marginTop: spacing.md }}
                            fullWidth
                        />
                    </Card>
                )}

                {/* Cockpit summary */}
                <Card style={{ marginTop: spacing.md }}>
                    <View style={styles.cockpitHeader}>
                        <Text style={styles.cockpitTitle}>Контроль рейса</Text>
                        <Text style={styles.cockpitSub}>
                            {canCompleteTrip ? 'Блокеров нет' : 'Есть блокеры перед закрытием'}
                        </Text>
                    </View>
                    <View style={styles.summaryRow}>
                        <View style={styles.summaryCell}>
                            <Text style={[styles.summaryValue, (exceptionSummary?.blocking || 0) > 0 && { color: colors.danger[600] }]}>
                                {exceptionSummary?.blocking || 0}
                            </Text>
                            <Text style={styles.summaryLabel}>Блокеры</Text>
                        </View>
                        <View style={styles.summaryCell}>
                            <Text style={[styles.summaryValue, (exceptionSummary?.warning || 0) > 0 && { color: colors.warning[600] }]}>
                                {exceptionSummary?.warning || 0}
                            </Text>
                            <Text style={styles.summaryLabel}>Риски</Text>
                        </View>
                        <View style={styles.summaryCell}>
                            <Text style={styles.summaryValue}>{exceptionSummary?.info || 0}</Text>
                            <Text style={styles.summaryLabel}>Инфо</Text>
                        </View>
                    </View>

                    {exceptions.length > 0 ? (
                        exceptions.slice(0, 3).map((item) => (
                            <View key={item.id} style={styles.exceptionItem}>
                                <View style={styles.exceptionHeader}>
                                    <Pill
                                        label={
                                            item.severity === 'blocking'
                                                ? 'Блокер'
                                                : item.severity === 'warning'
                                                ? 'Риск'
                                                : 'Инфо'
                                        }
                                        tone={
                                            item.severity === 'blocking'
                                                ? 'danger'
                                                : item.severity === 'warning'
                                                ? 'warning'
                                                : 'info'
                                        }
                                    />
                                    <Text style={styles.exceptionType}>{item.type}</Text>
                                </View>
                                <Text style={styles.exceptionTitle}>{item.title}</Text>
                                {!!item.message && <Text style={styles.exceptionMessage}>{item.message}</Text>}
                            </View>
                        ))
                    ) : (
                        <View style={styles.cleanBox}>
                            <Text style={styles.cleanText}>Нет открытых замечаний</Text>
                        </View>
                    )}

                    {requiresCompletionReason && (
                        <View style={styles.reasonBox}>
                            <Text style={styles.reasonLabel}>Причина продолжения / коррекции</Text>
                            <TextInput
                                style={styles.reasonInput}
                                value={completionReason}
                                onChangeText={setCompletionReason}
                                placeholder="Например: документы у диспетчера"
                                placeholderTextColor={colors.neutral[400]}
                                multiline
                                numberOfLines={3}
                            />
                            <Text style={styles.reasonHint}>Причина пойдёт в audit/replay payload.</Text>
                        </View>
                    )}
                </Card>

                {/* Cold-chain mini-card */}
                {showColdChainButton && (
                    <TouchableOpacity activeOpacity={0.85} onPress={() => navigation.navigate('TemperatureLog', { tripId })}>
                        <Card style={{ marginTop: spacing.md, backgroundColor: '#ecfeff', borderColor: '#a5f3fc' }}>
                            <View style={styles.coldRow}>
                                <Text style={styles.coldIcon}>🌡</Text>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.coldTitle}>Холодовая цепь</Text>
                                    <Text style={styles.coldSub}>
                                        {tempBreachCount > 0
                                            ? `Нарушений: ${tempBreachCount}`
                                            : 'Замеры в норме'}
                                    </Text>
                                </View>
                                <Text style={styles.chevron}>{'>'}</Text>
                            </View>
                        </Card>
                    </TouchableOpacity>
                )}

                {/* Route points list */}
                <Text style={[styles.sectionLabel, { marginTop: spacing.xl }]}>Точки маршрута</Text>
                <FlatList
                    data={points}
                    keyExtractor={(item) => item.id}
                    scrollEnabled={false}
                    renderItem={({ item, index }) => {
                        const apiWin = windowsByPointId.get(item.routePointId);
                        const fromIso = apiWin?.from ?? (item.windowStart ? item.windowStart.toISOString() : null);
                        const toIso = apiWin?.to ?? (item.windowEnd ? item.windowEnd.toISOString() : null);
                        const windowLabel = formatWindow(fromIso, toIso);
                        const toMs = toIso ? new Date(toIso).getTime() : null;
                        const isOverdue =
                            toMs !== null &&
                            !Number.isNaN(toMs) &&
                            toMs < Date.now() &&
                            item.status !== 'completed' &&
                            item.status !== 'skipped';

                        const ps = ROUTE_POINT_STATUS[item.status] ?? { label: item.status, tone: 'neutral' as const };

                        return (
                            <Card
                                style={[
                                    { marginTop: spacing.sm },
                                    isOverdue ? styles.overdueCard : null,
                                ]}
                            >
                                <View style={styles.pointHeader}>
                                    <Text style={styles.pointTitle}>
                                        {`${index + 1}. ${item.type === 'loading' ? 'Погрузка' : 'Выгрузка'}`}
                                    </Text>
                                    <Pill label={ps.label} tone={ps.tone} />
                                </View>
                                <Text style={styles.address}>{item.address}</Text>
                                {windowLabel && (
                                    <View style={{ marginTop: 4 }}>
                                        <Pill
                                            label={isOverdue ? `Просрочено: ${windowLabel}` : windowLabel}
                                            tone={isOverdue ? 'danger' : 'neutral'}
                                        />
                                    </View>
                                )}
                                <View style={styles.pointActions}>
                                    <Button
                                        title="Навигатор"
                                        variant="secondary"
                                        size="md"
                                        onPress={() => openNavigation(item.address)}
                                        style={{ flex: 1 }}
                                    />
                                    <Button
                                        title={item.status === 'completed' ? 'Готово' : 'Подтвердить'}
                                        variant="primary"
                                        size="md"
                                        disabled={item.status === 'completed'}
                                        onPress={() =>
                                            navigation.navigate('Checkpoint', {
                                                tripId: trip.tripId,
                                                routePointId: item.routePointId,
                                            })
                                        }
                                        style={{ flex: 1 }}
                                    />
                                </View>
                            </Card>
                        );
                    }}
                />

                {showWaybillButton && (
                    <Button
                        title="Путевой лист"
                        variant="secondary"
                        size="lg"
                        fullWidth
                        onPress={() => navigation.navigate('MyWaybill', { tripId })}
                        style={{ marginTop: spacing.lg }}
                    />
                )}

                <View style={{ height: spacing.xxxl }} />
            </ScrollView>

            {/* Sticky bottom action bar */}
            <View style={styles.stickyBar}>
                {canStart && (
                    <Button
                        title="Начать рейс"
                        variant="primary"
                        size="lg"
                        fullWidth
                        onPress={() => openOdometerModal('start')}
                    />
                )}
                {canComplete && (
                    <Button
                        title="Завершить рейс"
                        variant="success"
                        size="lg"
                        fullWidth
                        onPress={() => openOdometerModal('complete')}
                    />
                )}
                {!canStart && !canComplete && (
                    <Button
                        title="Завершить рейс (легаси)"
                        variant={canCompleteTrip ? 'success' : 'warning'}
                        size="lg"
                        fullWidth
                        disabled={!canSubmitCompletion}
                        onPress={markCompleted}
                    />
                )}
            </View>

            <Modal
                visible={odometerModal !== null}
                transparent
                animationType="fade"
                onRequestClose={() => !actionInFlight && setOdometerModal(null)}
            >
                <View style={styles.modalBackdrop}>
                    <View style={styles.modalCard}>
                        <Text style={styles.modalTitle}>
                            {odometerModal === 'start' ? 'Начало рейса' : 'Завершение рейса'}
                        </Text>
                        <Text style={styles.modalLabel}>
                            {odometerModal === 'start' ? 'Стартовый одометр (км)' : 'Финальный одометр (км)'}
                        </Text>
                        <TextInput
                            style={styles.modalInput}
                            value={odometerValue}
                            onChangeText={setOdometerValue}
                            placeholder="123456"
                            placeholderTextColor={colors.neutral[400]}
                            keyboardType={Platform.OS === 'ios' ? 'decimal-pad' : 'numeric'}
                            editable={!actionInFlight}
                        />
                        {odometerModal === 'complete' && (
                            <>
                                <Text style={styles.modalLabel}>Заметки</Text>
                                <TextInput
                                    style={[styles.modalInput, styles.modalNotes]}
                                    value={completionNotes}
                                    onChangeText={setCompletionNotes}
                                    placeholder="Необязательно"
                                    placeholderTextColor={colors.neutral[400]}
                                    multiline
                                    editable={!actionInFlight}
                                />
                            </>
                        )}
                        <View style={styles.modalActions}>
                            <Button
                                title="Отмена"
                                variant="ghost"
                                onPress={() => setOdometerModal(null)}
                                disabled={actionInFlight}
                            />
                            <Button
                                title={odometerModal === 'start' ? 'Начать' : 'Завершить'}
                                variant={odometerModal === 'start' ? 'primary' : 'success'}
                                size="md"
                                onPress={submitOdometer}
                                isLoading={actionInFlight}
                            />
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.neutral[50] },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.neutral[50] },
    error: { fontSize: 16, color: colors.danger[600] },
    offlineBar: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.sm,
        backgroundColor: colors.danger[600],
        minHeight: 28,
        justifyContent: 'center',
    },
    offlineBarText: {
        color: colors.white,
        fontSize: 14,
        fontWeight: '700',
        textAlign: 'center',
    },

    // Map hero
    mapHero: {
        height: '36%',
        backgroundColor: '#dbe5f1',
        overflow: 'hidden',
    },
    mapGrid: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#e8eef7',
    },
    gridLine: {
        position: 'absolute',
        left: 0,
        right: 0,
        height: 1,
        backgroundColor: '#cfd8e8',
    },
    gridLineV: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        width: 1,
        backgroundColor: '#cfd8e8',
    },
    mapRoute: {
        ...StyleSheet.absoluteFillObject,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 60,
    },
    routeDotStart: {
        width: 14,
        height: 14,
        borderRadius: 7,
        backgroundColor: colors.brand[600],
        borderWidth: 3,
        borderColor: colors.white,
    },
    routeDotEnd: {
        width: 14,
        height: 14,
        borderRadius: 7,
        backgroundColor: colors.success[600],
        borderWidth: 3,
        borderColor: colors.white,
    },
    routeLine: {
        flex: 1,
        height: 3,
        backgroundColor: colors.brand[600],
        opacity: 0.7,
    },
    mapBadge: {
        position: 'absolute',
        top: spacing.md,
        right: spacing.md,
        backgroundColor: colors.white,
        paddingHorizontal: spacing.md,
        paddingVertical: 6,
        borderRadius: radius.pill,
        ...shadow.sm,
    },
    mapBadgeText: { fontSize: 13, fontWeight: '700', color: colors.neutral[900] },

    // Sheet
    sheetScroll: {
        flex: 1,
        marginTop: -spacing.xl,
        backgroundColor: colors.white,
        borderTopLeftRadius: radius.xl,
        borderTopRightRadius: radius.xl,
        ...shadow.lg,
    },
    sheetContent: { padding: spacing.lg, paddingTop: 0, paddingBottom: 100 },
    handle: {
        alignSelf: 'center',
        width: 44,
        height: 5,
        borderRadius: 3,
        backgroundColor: colors.neutral[300],
        marginTop: spacing.sm,
        marginBottom: spacing.md,
    },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    tripTitle: { ...typography.title, color: colors.neutral[900] },
    tripSub: { ...typography.caption, color: colors.neutral[500], marginTop: 2 },

    etaTitle: { fontSize: 15, fontWeight: '700', color: colors.brand[700] },
    etaLine: { fontSize: 13, color: colors.brand[700], marginTop: 2 },
    etaMuted: { fontSize: 13, color: colors.neutral[500], fontStyle: 'italic' },

    sectionLabel: {
        ...typography.captionBold,
        color: colors.neutral[500],
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: spacing.sm,
    },
    nextPointName: { ...typography.headline, color: colors.neutral[900], marginTop: 4 },
    nextPointAddr: { ...typography.body, color: colors.neutral[600], marginTop: 4, lineHeight: 22 },

    cockpitHeader: { marginBottom: spacing.md },
    cockpitTitle: { ...typography.bodyBold, color: colors.neutral[900] },
    cockpitSub: { ...typography.caption, color: colors.neutral[500], marginTop: 2 },
    summaryRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
    summaryCell: {
        flex: 1,
        backgroundColor: colors.neutral[50],
        borderRadius: radius.md,
        paddingVertical: spacing.md,
        alignItems: 'center',
    },
    summaryValue: { fontSize: 22, fontWeight: '700', color: colors.neutral[900] },
    summaryLabel: { fontSize: 11, color: colors.neutral[500], marginTop: 2 },
    exceptionItem: {
        borderTopWidth: 1,
        borderTopColor: colors.neutral[100],
        paddingTop: spacing.sm,
        marginTop: spacing.sm,
    },
    exceptionHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
    exceptionType: { fontSize: 11, color: colors.neutral[400] },
    exceptionTitle: { fontSize: 14, fontWeight: '700', color: colors.neutral[900] },
    exceptionMessage: { fontSize: 14, color: colors.neutral[600], marginTop: 2, lineHeight: 19 },
    cleanBox: {
        backgroundColor: colors.success[50],
        borderRadius: radius.md,
        padding: spacing.md,
    },
    cleanText: { color: colors.success[700], fontSize: 13, fontWeight: '600' },

    reasonBox: {
        marginTop: spacing.md,
        borderTopWidth: 1,
        borderTopColor: colors.neutral[100],
        paddingTop: spacing.md,
    },
    reasonLabel: {
        color: colors.neutral[900],
        fontSize: 13,
        fontWeight: '700',
        marginBottom: 6,
    },
    reasonInput: {
        borderWidth: 1,
        borderColor: colors.neutral[200],
        borderRadius: radius.md,
        padding: spacing.md,
        minHeight: 80,
        fontSize: 14,
        color: colors.neutral[900],
        textAlignVertical: 'top',
        backgroundColor: colors.neutral[50],
    },
    reasonHint: { color: colors.neutral[500], fontSize: 12, marginTop: 6 },

    coldRow: { flexDirection: 'row', alignItems: 'center' },
    coldIcon: { fontSize: 28, marginRight: spacing.md },
    coldTitle: { ...typography.bodyBold, color: colors.neutral[900] },
    coldSub: { fontSize: 13, color: colors.neutral[600], marginTop: 2 },
    chevron: { fontSize: 24, color: colors.neutral[400] },

    overdueCard: { borderColor: colors.danger[500], borderWidth: 1.5 },
    pointHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 4,
    },
    pointTitle: { ...typography.bodyBold, color: colors.neutral[900] },
    address: { fontSize: 14, color: colors.neutral[600], marginTop: 4, lineHeight: 20 },
    pointActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },

    stickyBar: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        padding: spacing.lg,
        paddingBottom: spacing.xl,
        backgroundColor: colors.white,
        borderTopWidth: 1,
        borderTopColor: colors.neutral[100],
    },

    modalBackdrop: {
        flex: 1,
        backgroundColor: colors.overlay.scrim,
        justifyContent: 'center',
        padding: spacing.lg,
    },
    modalCard: {
        backgroundColor: colors.white,
        borderRadius: radius.lg,
        padding: spacing.lg,
    },
    modalTitle: { ...typography.headline, color: colors.neutral[900], marginBottom: spacing.md },
    modalLabel: {
        fontSize: 13,
        fontWeight: '600',
        color: colors.neutral[700],
        marginBottom: 4,
    },
    modalInput: {
        borderWidth: 1,
        borderColor: colors.neutral[200],
        borderRadius: radius.md,
        padding: spacing.md,
        fontSize: 16,
        marginBottom: spacing.md,
        backgroundColor: colors.neutral[50],
        color: colors.neutral[900],
    },
    modalNotes: { minHeight: 80, textAlignVertical: 'top' },
    modalActions: {
        flexDirection: 'row',
        gap: spacing.sm,
        justifyContent: 'flex-end',
        alignItems: 'center',
    },
});
