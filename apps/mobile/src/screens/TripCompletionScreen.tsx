import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { v4 as uuidv4 } from 'uuid';
import { RootStackParamList } from '../navigation/AppNavigator';
import { database } from '../database';
import AppEvent from '../database/models/AppEvent';

type Props = NativeStackScreenProps<RootStackParamList, 'TripCompletion'>;

export default function TripCompletionScreen({ route, navigation }: Props) {
    const { tripId } = route.params;
    const [odometer, setOdometer] = useState('');
    const [fuel, setFuel] = useState('');

    const finishTrip = async () => {
        if (!odometer || !fuel) {
            Alert.alert('\u041e\u0448\u0438\u0431\u043a\u0430', '\u041f\u043e\u0436\u0430\u043b\u0443\u0439\u0441\u0442\u0430, \u0437\u0430\u043f\u043e\u043b\u043d\u0438\u0442\u0435 \u0432\u0441\u0435 \u043f\u043e\u043b\u044f.');
            return;
        }

        try {
            await database.write(async () => {
                await database.collections.get<AppEvent>('events').create((event) => {
                    event.eventId = uuidv4();
                    event.type = 'trip_status_changed';
                    event.entityId = tripId;
                    event.entityType = 'trip';
                    event.timestamp = new Date();
                    event.synced = false;
                    event.payload = JSON.stringify({
                        tripId,
                        status: 'completed',
                        odometer: parseInt(odometer, 10),
                        fuel: parseInt(fuel, 10),
                    });
                });
            });

            Alert.alert('\u0423\u0441\u043f\u0435\u0448\u043d\u043e', '\u0420\u0435\u0439\u0441 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043d. \u0414\u0430\u043d\u043d\u044b\u0435 \u043e\u0442\u043f\u0440\u0430\u0432\u044f\u0442\u0441\u044f \u043f\u0440\u0438 \u0441\u0438\u043d\u0445\u0440\u043e\u043d\u0438\u0437\u0430\u0446\u0438\u0438.');
            navigation.navigate('TripList');
        } catch {
            Alert.alert('\u041e\u0448\u0438\u0431\u043a\u0430', '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0441\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043d\u0438\u0435 \u0440\u0435\u0439\u0441\u0430.');
        }
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>{'\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043d\u0438\u0435 \u0440\u0435\u0439\u0441\u0430'}</Text>

            <Text style={styles.label}>{'\u041f\u043e\u043a\u0430\u0437\u0430\u043d\u0438\u044f \u043e\u0434\u043e\u043c\u0435\u0442\u0440\u0430 (\u043a\u043c)'}</Text>
            <TextInput
                style={styles.input}
                placeholder={'\u041d\u0430\u043f\u0440\u0438\u043c\u0435\u0440: 145000'}
                keyboardType="numeric"
                value={odometer}
                onChangeText={setOdometer}
            />

            <Text style={styles.label}>{'\u041e\u0441\u0442\u0430\u0442\u043e\u043a \u0442\u043e\u043f\u043b\u0438\u0432\u0430 (\u043b\u0438\u0442\u0440\u043e\u0432)'}</Text>
            <TextInput
                style={styles.input}
                placeholder={'\u041d\u0430\u043f\u0440\u0438\u043c\u0435\u0440: 45'}
                keyboardType="numeric"
                value={fuel}
                onChangeText={setFuel}
            />

            <TouchableOpacity style={styles.primaryButton} onPress={finishTrip}>
                <Text style={styles.buttonText}>{'\u0417\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u044c \u0440\u0435\u0439\u0441'}</Text>
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
    buttonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '600',
    },
});
