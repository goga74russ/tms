import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Linking, ActivityIndicator, Alert } from 'react-native';
import { Q } from '@nozbe/watermelondb';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { database } from '../database';
import Trip from '../database/models/Trip';
import RoutePoint from '../database/models/RoutePoint';

type Props = NativeStackScreenProps<RootStackParamList, 'TripDetails'>;

const routePointStatusLabels: Record<string, string> = {
    pending: '\u041e\u0436\u0438\u0434\u0430\u0435\u0442',
    arrived: '\u041f\u0440\u0438\u0431\u044b\u043b',
    completed: '\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043d\u0430',
    skipped: '\u041f\u0440\u043e\u043f\u0443\u0449\u0435\u043d\u0430',
};

export default function TripDetailsScreen({ route, navigation }: Props) {
    const { tripId } = route.params;
    const [trip, setTrip] = useState<Trip | null>(null);
    const [points, setPoints] = useState<RoutePoint[]>([]);
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

    const markCompleted = () => {
        navigation.navigate('TripCompletion', { tripId });
    };

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

            <TouchableOpacity style={styles.completeTripButton} onPress={markCompleted}>
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
    completeTripText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
    },
});
