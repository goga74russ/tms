import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { Q } from '@nozbe/watermelondb';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { database } from '../database';
import Trip from '../database/models/Trip';
import { RootStackParamList } from '../navigation/AppNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'TripList'>;

export default function TripListScreen({ navigation }: Props) {
    const { user } = useAuth();
    const [trips, setTrips] = useState<Trip[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchTrips = async () => {
            if (!user) {
                return;
            }

            try {
                const fetchedTrips = await database.collections
                    .get<Trip>('trips')
                    .query(
                        Q.where('driver_id', user.driverId ?? user.id),
                        Q.where('status', Q.notEq('completed'))
                    )
                    .fetch();
                setTrips(fetchedTrips);
            } catch {
                Alert.alert('\u041e\u0448\u0438\u0431\u043a\u0430', '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c \u0441\u043f\u0438\u0441\u043e\u043a \u0440\u0435\u0439\u0441\u043e\u0432.');
            } finally {
                setLoading(false);
            }
        };

        fetchTrips();

        const subscription = database.collections.get<Trip>('trips').query().observe().subscribe(fetchTrips);
        return () => subscription.unsubscribe();
    }, [user]);

    const renderTrip = ({ item }: { item: Trip }) => {
        let stopsCount = 0;
        try {
            const parsedRoute = JSON.parse(item.route);
            stopsCount = Array.isArray(parsedRoute) ? parsedRoute.length : 0;
        } catch {}

        return (
            <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('TripDetails', { tripId: item.tripId })}>
                <Text style={styles.title}>{`\u0420\u0435\u0439\u0441 #${item.tripId.slice(0, 8)}`}</Text>
                <Text style={styles.text}>{`\u0421\u0442\u0430\u0442\u0443\u0441: ${item.status}`}</Text>
                <Text style={styles.text}>{`\u0422\u043e\u0447\u0435\u043a: ${stopsCount}`}</Text>
            </TouchableOpacity>
        );
    };

    return (
        <View style={styles.container}>
            {loading ? (
                <ActivityIndicator size="large" color="#2563eb" />
            ) : trips.length === 0 ? (
                <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>{'\u041d\u0430 \u0441\u0435\u0433\u043e\u0434\u043d\u044f \u0430\u043a\u0442\u0438\u0432\u043d\u044b\u0445 \u0440\u0435\u0439\u0441\u043e\u0432 \u043d\u0435\u0442'}</Text>
                </View>
            ) : (
                <FlatList
                    data={trips}
                    keyExtractor={(item) => item.id}
                    renderItem={renderTrip}
                    contentContainerStyle={{ paddingBottom: 20 }}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f8fafc',
        padding: 16,
    },
    card: {
        backgroundColor: '#fff',
        borderRadius: 8,
        padding: 16,
        marginBottom: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
        minHeight: 80,
    },
    title: {
        fontSize: 18,
        fontWeight: '700',
        color: '#0f172a',
        marginBottom: 8,
    },
    text: {
        fontSize: 14,
        color: '#475569',
        marginBottom: 4,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyText: {
        fontSize: 16,
        color: '#64748b',
    },
});
