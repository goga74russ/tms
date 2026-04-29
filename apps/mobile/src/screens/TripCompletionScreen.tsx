import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import NetInfo from '@react-native-community/netinfo';
import { RootStackParamList } from '../navigation/AppNavigator';
import { enqueueAction } from '../api/offlineQueue';
import { useAuth } from '../context/AuthContext';

type Props = NativeStackScreenProps<RootStackParamList, 'TripCompletion'>;
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000/api';

export default function TripCompletionScreen({ route, navigation }: Props) {
    const { tripId, correctionReason } = route.params;
    const { token } = useAuth();
    const [odometer, setOdometer] = useState('');
    const [fuel, setFuel] = useState('');
    const [loading, setLoading] = useState(false);

    const finishTrip = async () => {
        if (!odometer || !fuel) {
            Alert.alert('Ошибка', 'Пожалуйста, заполните все поля.');
            return;
        }

        const odometerEnd = Number.parseInt(odometer, 10);
        const fuelEnd = Number.parseInt(fuel, 10);
        if (!Number.isFinite(odometerEnd) || odometerEnd < 0 || !Number.isFinite(fuelEnd) || fuelEnd < 0) {
            Alert.alert('Ошибка', 'Укажите корректные числа.');
            return;
        }

        const body = {
            events: [{
                id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                type: 'trip_status_changed',
                timestamp: new Date().toISOString(),
                payload: {
                    tripId,
                    status: 'completed',
                    odometer: odometerEnd,
                    fuel: fuelEnd,
                    correctionReason,
                },
            }],
        };

        setLoading(true);
        try {
            const netState = await NetInfo.fetch();
            const isOnline = Boolean(netState.isConnected && netState.isInternetReachable && token);

            if (!isOnline) {
                await enqueueAction({
                    type: 'trip_status',
                    endpoint: '/sync/events',
                    method: 'POST',
                    body,
                });
                Alert.alert('Сохранено офлайн', 'Завершение рейса будет отправлено при восстановлении связи.');
                navigation.navigate('TripList');
                return;
            }

            const res = await fetch(`${API_URL}/sync/events`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(body),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data.error || 'Не удалось завершить рейс');
            }

            Alert.alert('Успешно', 'Рейс завершен.');
            navigation.navigate('TripList');
        } catch (error: any) {
            await enqueueAction({
                type: 'trip_status',
                endpoint: '/sync/events',
                method: 'POST',
                body,
            });
            Alert.alert(
                'Сохранено в очередь',
                error?.message ? `${error.message}. Повторим при восстановлении связи.` : 'Повторим при восстановлении связи.'
            );
            navigation.navigate('TripList');
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Завершение рейса</Text>

            {!!correctionReason && (
                <View style={styles.correctionBox}>
                    <Text style={styles.correctionTitle}>Причина коррекции</Text>
                    <Text style={styles.correctionText}>{correctionReason}</Text>
                </View>
            )}

            <Text style={styles.label}>Показания одометра (км)</Text>
            <TextInput
                style={styles.input}
                placeholder="Например: 145000"
                keyboardType="numeric"
                value={odometer}
                onChangeText={setOdometer}
            />

            <Text style={styles.label}>Остаток топлива (литров)</Text>
            <TextInput
                style={styles.input}
                placeholder="Например: 45"
                keyboardType="numeric"
                value={fuel}
                onChangeText={setFuel}
            />

            <TouchableOpacity style={[styles.primaryButton, loading && styles.disabledButton]} onPress={finishTrip} disabled={loading}>
                {loading ? (
                    <ActivityIndicator color="#fff" />
                ) : (
                    <Text style={styles.buttonText}>Завершить рейс</Text>
                )}
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 24,
        backgroundColor: '#fff',
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 32,
        color: '#0f172a',
        textAlign: 'center',
    },
    label: {
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 8,
        color: '#334155',
    },
    correctionBox: {
        backgroundColor: '#fffbeb',
        borderColor: '#fde68a',
        borderWidth: 1,
        borderRadius: 8,
        padding: 12,
        marginBottom: 24,
    },
    correctionTitle: {
        color: '#92400e',
        fontSize: 13,
        fontWeight: '700',
        marginBottom: 4,
    },
    correctionText: {
        color: '#78350f',
        fontSize: 14,
        lineHeight: 19,
    },
    input: {
        borderWidth: 1,
        borderColor: '#cbd5e1',
        borderRadius: 8,
        padding: 16,
        fontSize: 18,
        marginBottom: 24,
        minHeight: 56,
    },
    primaryButton: {
        backgroundColor: '#10b981',
        padding: 16,
        borderRadius: 8,
        alignItems: 'center',
        minHeight: 56,
        justifyContent: 'center',
        marginTop: 16,
    },
    disabledButton: {
        backgroundColor: '#94a3b8',
    },
    buttonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '600',
    },
});
