import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Linking, ActivityIndicator, Alert, TextInput } from 'react-native';
import { Q } from '@nozbe/watermelondb';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { database } from '../database';
import Trip from '../database/models/Trip';
import RoutePoint from '../database/models/RoutePoint';
import { getQueueSummary } from '../api/offlineQueue';
import { getTripOperationExceptions, OperationExceptionItem, OperationExceptionSummary } from '../api/trips';

type Props = NativeStackScreenProps<RootStackParamList, 'TripDetails'>;

const routePointStatusLabels: Record<string, string> = {
    pending: '\u041e\u0436\u0438\u0434\u0430\u0435\u0442',
    arrived: '\u041f\u0440\u0438\u0431\u044b\u043b',
    completed: '\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043d\u0430',
    skipped: '\u041f\u0440\u043e\u043f\u0443\u0449\u0435\u043d\u0430',
};

const exceptionSeverityLabels: Record<string, string> = {
    blocking: '\u0411\u043b\u043e\u043a\u0435\u0440',
    warning: '\u0420\u0438\u0441\u043a',
    info: '\u0418\u043d\u0444\u043e',
};

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
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const fetchedTrips = await database.collections.get<Trip>('trips').query(Q.where('trip_id', tripId)).fetch();
                if (fetchedTrips.length > 0) {
                    setTrip(fetchedTrips[0]);
                }

                const fetchedPoints = await database.collections.get<RoutePoint>('route_points').query(Q.where('trip_id', tripId)).fetch();
                setPoints(fetchedPoints);

                const [exceptionData, queueSize] = await Promise.all([
                    getTripOperationExceptions(tripId),
                    getQueueSummary(),
                ]);
                setExceptionSummary(exceptionData?.summary || null);
                setExceptions(exceptionData?.exceptions || []);
                setOfflineQueueSummary(queueSize);
            } catch {
                Alert.alert('\u041e\u0448\u0438\u0431\u043a\u0430', '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c \u0434\u0430\u043d\u043d\u044b\u0435 \u0440\u0435\u0439\u0441\u0430.');
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [tripId]);

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
            Alert.alert(
                'Нужна причина',
                'Укажите, почему водитель продолжает или исправляет статус при блокерах.'
            );
            return;
        }

        Alert.alert(
            'Есть блокеры',
            'По рейсу есть незакрытые замечания. Продолжить завершение?',
            [
                { text: 'Отмена', style: 'cancel' },
                { text: 'Продолжить', onPress: () => navigation.navigate('TripCompletion', { tripId, correctionReason: reason }) },
            ]
        );
    };

    const queueHintParts = [
        offlineQueueSummary.hasCheckpoint ? 'checkpoint' : null,
        offlineQueueSummary.hasCompletion ? 'completion' : null,
        offlineQueueSummary.hasDelivery ? 'delivery' : null,
        offlineQueueSummary.hasInspection ? 'inspection' : null,
    ].filter(Boolean);

    const renderException = ({ item }: { item: OperationExceptionItem }) => (
        <View style={styles.exceptionItem}>
            <View style={styles.exceptionHeader}>
                <Text style={[styles.exceptionBadge, item.severity === 'blocking' ? styles.blockingBadge : item.severity === 'warning' ? styles.warningBadge : styles.infoBadge]}>
                    {exceptionSeverityLabels[item.severity] || item.severity}
                </Text>
                <Text style={styles.exceptionType}>{item.type}</Text>
            </View>
            <Text style={styles.exceptionTitle}>{item.title}</Text>
            {!!item.message && <Text style={styles.exceptionMessage}>{item.message}</Text>}
        </View>
    );

    if (loading) {
        return <ActivityIndicator style={{ flex: 1 }} size="large" color="#2563eb" />;
    }

    if (!trip) {
        return (
            <View style={styles.container}>
                <Text style={styles.error}>{'\u0420\u0435\u0439\u0441 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d'}</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <Text style={styles.title}>{`\u041c\u0430\u0440\u0448\u0440\u0443\u0442 #${trip.tripId.slice(0, 8)}`}</Text>

            <FlatList
                data={points}
                keyExtractor={(item) => item.id}
                ListHeaderComponent={(
                    <View style={styles.cockpitCard}>
                        <View style={styles.cockpitHeader}>
                            <View>
                                <Text style={styles.cockpitTitle}>Контроль рейса</Text>
                                <Text style={styles.cockpitSubtitle}>
                                    {canCompleteTrip ? 'Блокеров нет' : 'Есть блокеры перед закрытием'}
                                </Text>
                            </View>
                            {offlineQueueSummary.size > 0 && (
                                <Text style={styles.queueBadge}>{`Офлайн: ${offlineQueueSummary.size}`}</Text>
                            )}
                        </View>
                        <View style={styles.summaryRow}>
                            <View style={styles.summaryCell}>
                                <Text style={styles.summaryValue}>{exceptionSummary?.blocking || 0}</Text>
                                <Text style={styles.summaryLabel}>Блокеры</Text>
                            </View>
                            <View style={styles.summaryCell}>
                                <Text style={styles.summaryValue}>{exceptionSummary?.warning || 0}</Text>
                                <Text style={styles.summaryLabel}>Риски</Text>
                            </View>
                            <View style={styles.summaryCell}>
                                <Text style={styles.summaryValue}>{exceptionSummary?.info || 0}</Text>
                                <Text style={styles.summaryLabel}>Инфо</Text>
                            </View>
                        </View>
                        {exceptions.length > 0 ? (
                            <FlatList
                                data={exceptions.slice(0, 3)}
                                keyExtractor={(item) => item.id}
                                renderItem={renderException}
                                scrollEnabled={false}
                            />
                        ) : (
                            <Text style={styles.emptyExceptions}>Нет открытых замечаний по рейсу</Text>
                        )}
                        {offlineQueueSummary.size > 0 && (
                            <View style={styles.queueHint}>
                                <Text style={styles.queueHintTitle}>Очередь офлайн-отправки</Text>
                                <Text style={styles.queueHintText}>
                                    {`В очереди ${offlineQueueSummary.size}. ${queueHintParts.length ? `Типы: ${queueHintParts.join(', ')}. ` : ''}Дубли и конфликты при replay считаются безопасной повторной отправкой; не удаляйте локальные данные до синхронизации.`}
                                </Text>
                                {offlineQueueSummary.hasRetries && (
                                    <Text style={styles.queueRetryText}>Есть повторные попытки: проверьте связь и LAN API.</Text>
                                )}
                            </View>
                        )}
                        {requiresCompletionReason && (
                            <View style={styles.reasonBox}>
                                <Text style={styles.reasonLabel}>Причина продолжения / коррекции</Text>
                                <TextInput
                                    style={styles.reasonInput}
                                    value={completionReason}
                                    onChangeText={setCompletionReason}
                                    placeholder="Например: документы у диспетчера, нужно закрыть рейс"
                                    multiline
                                    numberOfLines={3}
                                />
                                <Text style={styles.reasonHint}>Причина пойдет в event payload для audit/replay.</Text>
                            </View>
                        )}
                    </View>
                )}
                renderItem={({ item, index }) => (
                    <View style={styles.pointCard}>
                        <View style={styles.pointHeader}>
                            <Text style={styles.pointTitle}>
                                {`${index + 1}. ${item.type === 'loading' ? '\u041f\u043e\u0433\u0440\u0443\u0437\u043a\u0430' : '\u0412\u044b\u0433\u0440\u0443\u0437\u043a\u0430'}`}
                            </Text>
                            <Text style={styles.statusBadge}>{routePointStatusLabels[item.status] ?? item.status}</Text>
                        </View>
                        <Text style={styles.address}>{item.address}</Text>

                        <View style={styles.actionsRow}>
                            <TouchableOpacity style={styles.navButton} onPress={() => openNavigation(item.address)}>
                                <Text style={styles.navButtonText}>{'\u041d\u0430\u0432\u0438\u0433\u0430\u0442\u043e\u0440'}</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.actionButton, item.status === 'completed' && styles.disabledButton]}
                                onPress={() => navigation.navigate('Checkpoint', { tripId: trip.tripId, routePointId: item.routePointId })}
                                disabled={item.status === 'completed'}
                            >
                                <Text style={styles.actionButtonText}>
                                    {item.status === 'completed' ? '\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043d\u043e' : '\u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044c'}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}
            />

            <TouchableOpacity
                style={[styles.completeTripButton, !canCompleteTrip && styles.completeTripButtonWarning, !canSubmitCompletion && styles.disabledButton]}
                onPress={markCompleted}
                disabled={!canSubmitCompletion}
            >
                <Text style={styles.completeTripText}>{'\u0417\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u044c \u0440\u0435\u0439\u0441'}</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 16,
        backgroundColor: '#f8fafc',
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 16,
        color: '#0f172a',
    },
    error: {
        fontSize: 16,
        color: '#ef4444',
        textAlign: 'center',
        marginTop: 20,
    },
    cockpitCard: {
        backgroundColor: '#fff',
        borderRadius: 8,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#e2e8f0',
    },
    cockpitHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 12,
    },
    cockpitTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#0f172a',
    },
    cockpitSubtitle: {
        fontSize: 13,
        color: '#64748b',
        marginTop: 2,
    },
    queueBadge: {
        fontSize: 12,
        color: '#92400e',
        backgroundColor: '#fef3c7',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
        overflow: 'hidden',
    },
    summaryRow: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 12,
    },
    summaryCell: {
        flex: 1,
        backgroundColor: '#f8fafc',
        borderRadius: 8,
        paddingVertical: 10,
        alignItems: 'center',
    },
    summaryValue: {
        fontSize: 18,
        fontWeight: '700',
        color: '#0f172a',
    },
    summaryLabel: {
        fontSize: 11,
        color: '#64748b',
        marginTop: 2,
    },
    exceptionItem: {
        borderTopWidth: 1,
        borderTopColor: '#e2e8f0',
        paddingTop: 10,
        marginTop: 10,
    },
    exceptionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 4,
    },
    exceptionBadge: {
        fontSize: 11,
        fontWeight: '700',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 10,
        overflow: 'hidden',
    },
    blockingBadge: {
        color: '#b91c1c',
        backgroundColor: '#fee2e2',
    },
    warningBadge: {
        color: '#92400e',
        backgroundColor: '#fef3c7',
    },
    infoBadge: {
        color: '#1d4ed8',
        backgroundColor: '#dbeafe',
    },
    exceptionType: {
        fontSize: 11,
        color: '#94a3b8',
    },
    exceptionTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#0f172a',
    },
    exceptionMessage: {
        fontSize: 12,
        color: '#475569',
        marginTop: 2,
    },
    emptyExceptions: {
        fontSize: 13,
        color: '#16a34a',
        backgroundColor: '#dcfce7',
        padding: 10,
        borderRadius: 8,
        overflow: 'hidden',
    },
    queueHint: {
        backgroundColor: '#fffbeb',
        borderColor: '#fde68a',
        borderWidth: 1,
        borderRadius: 8,
        padding: 12,
        marginTop: 12,
    },
    queueHintTitle: {
        color: '#92400e',
        fontSize: 13,
        fontWeight: '700',
        marginBottom: 4,
    },
    queueHintText: {
        color: '#78350f',
        fontSize: 12,
        lineHeight: 17,
    },
    queueRetryText: {
        color: '#b45309',
        fontSize: 12,
        fontWeight: '700',
        marginTop: 6,
    },
    reasonBox: {
        marginTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#e2e8f0',
        paddingTop: 12,
    },
    reasonLabel: {
        color: '#0f172a',
        fontSize: 13,
        fontWeight: '700',
        marginBottom: 6,
    },
    reasonInput: {
        borderWidth: 1,
        borderColor: '#cbd5e1',
        borderRadius: 8,
        padding: 10,
        minHeight: 76,
        fontSize: 14,
        color: '#0f172a',
        textAlignVertical: 'top',
        backgroundColor: '#fff',
    },
    reasonHint: {
        color: '#64748b',
        fontSize: 12,
        marginTop: 6,
    },
    pointCard: {
        backgroundColor: '#fff',
        borderRadius: 8,
        padding: 16,
        marginBottom: 16,
        elevation: 2,
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 2,
        shadowOffset: { width: 0, height: 1 },
    },
    pointHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    pointTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#0f172a',
    },
    statusBadge: {
        fontSize: 12,
        color: '#059669',
        backgroundColor: '#d1fae5',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 12,
        overflow: 'hidden',
    },
    address: {
        fontSize: 14,
        color: '#475569',
        marginBottom: 16,
    },
    actionsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    navButton: {
        backgroundColor: '#cbd5e1',
        padding: 12,
        borderRadius: 8,
        flex: 1,
        marginRight: 8,
        alignItems: 'center',
    },
    navButtonText: {
        color: '#0f172a',
        fontWeight: '600',
    },
    actionButton: {
        backgroundColor: '#2563eb',
        padding: 12,
        borderRadius: 8,
        flex: 1,
        marginLeft: 8,
        alignItems: 'center',
    },
    disabledButton: {
        backgroundColor: '#94a3b8',
    },
    actionButtonText: {
        color: '#fff',
        fontWeight: '600',
    },
    completeTripButton: {
        backgroundColor: '#10b981',
        padding: 16,
        borderRadius: 8,
        alignItems: 'center',
        marginTop: 16,
    },
    completeTripButtonWarning: {
        backgroundColor: '#f59e0b',
    },
    completeTripText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
    },
});
