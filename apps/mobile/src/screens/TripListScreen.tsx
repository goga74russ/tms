import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { Q } from '@nozbe/watermelondb';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { database } from '../database';
import Trip from '../database/models/Trip';
import RoutePoint from '../database/models/RoutePoint';
import { RootStackParamList } from '../navigation/AppNavigator';
import { Card, EmptyState, Pill, ProgressSteps } from '../components/ui';
import { colors, radius, spacing, typography } from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'TripList'>;
type FilterKey = 'active' | 'completed' | 'all';

const ACTIVE_STATUSES = new Set([
    'assigned',
    'waybill_draft',
    'inspection',
    'waybill_issued',
    'loading',
    'in_transit',
]);
const COMPLETED_STATUSES = new Set(['completed', 'billed']);

const FILTERS: { key: FilterKey; label: string }[] = [
    { key: 'active', label: 'Активные' },
    { key: 'completed', label: 'Завершённые' },
    { key: 'all', label: 'Все' },
];

// Trip status → progress steps mapping (0-indexed)
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

const STATUS_PILL: Record<string, { tone: 'success' | 'warning' | 'brand' | 'neutral'; label: string }> = {
    assigned: { tone: 'brand', label: 'Назначен' },
    waybill_draft: { tone: 'warning', label: 'Подготовка' },
    inspection: { tone: 'warning', label: 'Техосмотр' },
    waybill_issued: { tone: 'brand', label: 'Готов' },
    loading: { tone: 'warning', label: 'Загрузка' },
    in_transit: { tone: 'brand', label: 'В пути' },
    completed: { tone: 'success', label: 'Завершён' },
    billed: { tone: 'success', label: 'Закрыт' },
};

function parseRoute(route: string): { from?: string; to?: string; count: number } {
    try {
        const parsed = JSON.parse(route);
        if (!Array.isArray(parsed) || parsed.length === 0) return { count: 0 };
        const first = parsed[0];
        const last = parsed[parsed.length - 1];
        const firstAddr =
            (typeof first === 'object' && (first.city || first.shortAddress || first.address)) || undefined;
        const lastAddr =
            (typeof last === 'object' && (last.city || last.shortAddress || last.address)) || undefined;
        return { from: firstAddr, to: lastAddr, count: parsed.length };
    } catch {
        return { count: 0 };
    }
}

export default function TripListScreen({ navigation }: Props) {
    const { user } = useAuth();
    const [trips, setTrips] = useState<Trip[]>([]);
    const [overdueTripIds, setOverdueTripIds] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<FilterKey>('active');

    useLayoutEffect(() => {
        navigation.setOptions({
            title: 'Мои рейсы',
            headerStyle: { backgroundColor: colors.white },
            headerTitleStyle: { color: colors.neutral[900], fontWeight: '700' },
            headerRight: () => (
                <TouchableOpacity
                    onPress={() => navigation.navigate('MyHours')}
                    style={styles.headerBtn}
                    accessibilityLabel="Мои часы"
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                    <Text style={styles.headerBtnText}>Часы</Text>
                </TouchableOpacity>
            ),
        });
    }, [navigation]);

    useEffect(() => {
        const fetchTrips = async () => {
            if (!user) return;
            try {
                const fetched = await database.collections
                    .get<Trip>('trips')
                    .query(Q.where('driver_id', user.driverId ?? user.id))
                    .fetch();
                setTrips(fetched);

                const now = Date.now();
                const overdue = new Set<string>();
                const tripIds = fetched.map((t) => t.tripId);
                if (tripIds.length > 0) {
                    const allPoints = await database.collections
                        .get<RoutePoint>('route_points')
                        .query(Q.where('trip_id', Q.oneOf(tripIds)))
                        .fetch();
                    for (const p of allPoints) {
                        if (p.status === 'completed' || p.status === 'skipped') continue;
                        const winEnd = p.windowEnd ? p.windowEnd.getTime() : null;
                        if (winEnd !== null && winEnd < now) overdue.add(p.tripId);
                    }
                }
                setOverdueTripIds(overdue);
            } catch {
                Alert.alert('Ошибка', 'Не удалось загрузить список рейсов.');
            } finally {
                setLoading(false);
            }
        };
        fetchTrips();
        const sub = database.collections.get<Trip>('trips').query().observe().subscribe(fetchTrips);
        return () => sub.unsubscribe();
    }, [user]);

    const visibleTrips = useMemo(() => {
        if (filter === 'all') return trips;
        if (filter === 'active') return trips.filter((t) => ACTIVE_STATUSES.has(t.status));
        return trips.filter((t) => COMPLETED_STATUSES.has(t.status));
    }, [trips, filter]);

    const renderTrip = ({ item }: { item: Trip }) => {
        const route = parseRoute(item.route);
        const isOverdue = overdueTripIds.has(item.tripId) && !COMPLETED_STATUSES.has(item.status);
        const stage = STAGE_BY_STATUS[item.status] ?? 0;
        const statusInfo = STATUS_PILL[item.status] ?? { tone: 'neutral' as const, label: item.status };
        const tripNo = item.tripId.slice(0, 8);

        return (
            <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => navigation.navigate('TripDetails', { tripId: item.tripId })}
            >
                <Card style={styles.tripCard}>
                    <View style={styles.cardHeader}>
                        <Pill label={statusInfo.label} tone={statusInfo.tone} />
                        <Text style={styles.tripNumber}>№ {tripNo}</Text>
                    </View>

                    <Text style={styles.route} numberOfLines={2}>
                        {route.from && route.to
                            ? `${route.from} → ${route.to}`
                            : `Рейс с ${route.count} точками`}
                    </Text>

                    <Text style={styles.cargo} numberOfLines={1}>
                        {`Точек на маршруте: ${route.count}`}
                    </Text>

                    <ProgressSteps total={5} activeIndex={stage} style={{ marginTop: spacing.md }} />

                    {isOverdue && (
                        <View style={{ marginTop: spacing.md }}>
                            <Pill label="Просрочено" tone="danger" />
                        </View>
                    )}
                </Card>
            </TouchableOpacity>
        );
    };

    return (
        <View style={styles.container}>
            <View style={styles.filterRow}>
                {FILTERS.map((f) => {
                    const active = filter === f.key;
                    return (
                        <TouchableOpacity
                            key={f.key}
                            style={[styles.chip, active && styles.chipActive]}
                            onPress={() => setFilter(f.key)}
                            activeOpacity={0.85}
                        >
                            <Text style={[styles.chipText, active && styles.chipTextActive]}>
                                {f.label}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>

            {loading ? (
                <ActivityIndicator size="large" color={colors.brand[600]} style={{ marginTop: 40 }} />
            ) : visibleTrips.length === 0 ? (
                <EmptyState
                    title={
                        filter === 'active'
                            ? 'Нет активных рейсов'
                            : filter === 'completed'
                            ? 'Завершённых рейсов пока нет'
                            : 'Рейсов не найдено'
                    }
                    description="Новые рейсы появятся здесь, как только их назначит диспетчер."
                />
            ) : (
                <FlatList
                    data={visibleTrips}
                    keyExtractor={(item) => item.id}
                    renderItem={renderTrip}
                    contentContainerStyle={{ paddingBottom: spacing.xl, paddingTop: spacing.xs }}
                    showsVerticalScrollIndicator={false}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.neutral[50], padding: spacing.lg },
    headerBtn: { paddingHorizontal: spacing.sm, paddingVertical: 4 },
    headerBtnText: { fontSize: 22 },
    filterRow: {
        flexDirection: 'row',
        gap: spacing.sm,
        marginBottom: spacing.md,
    },
    chip: {
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.sm,
        borderRadius: radius.pill,
        backgroundColor: colors.white,
        borderWidth: 1,
        borderColor: colors.neutral[200],
    },
    chipActive: {
        backgroundColor: colors.brand[600],
        borderColor: colors.brand[600],
    },
    chipText: {
        fontSize: 13,
        fontWeight: '700',
        color: colors.neutral[600],
    },
    chipTextActive: { color: colors.white },
    tripCard: { marginBottom: spacing.md },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: spacing.md,
    },
    tripNumber: {
        ...typography.caption,
        color: colors.neutral[400],
        fontWeight: '600',
    },
    route: {
        ...typography.title,
        color: colors.neutral[900],
        marginBottom: 4,
    },
    cargo: {
        ...typography.caption,
        color: colors.neutral[500],
    },
});
