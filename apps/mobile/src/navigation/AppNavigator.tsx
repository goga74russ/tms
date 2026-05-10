import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, ActivityIndicator } from 'react-native';

import { useAuth } from '../context/AuthContext';
import LoginScreen from '../screens/LoginScreen';
import TripListScreen from '../screens/TripListScreen';
import TripDetailsScreen from '../screens/TripDetailsScreen';
import CheckpointScreen from '../screens/CheckpointScreen';
import TripCompletionScreen from '../screens/TripCompletionScreen';
import DeliveryConfirmationScreen from '../screens/DeliveryConfirmationScreen';
import MechanicInspectionScreen from '../screens/MechanicInspectionScreen';
import MyWaybillScreen from '../screens/MyWaybillScreen';
import TemperatureLogScreen from '../screens/TemperatureLogScreen';

export type RootStackParamList = {
    Login: undefined;
    TripList: undefined;
    TripDetails: { tripId: string };
    Checkpoint: { routePointId: string; tripId: string };
    TripCompletion: { tripId: string; correctionReason?: string };
    DeliveryConfirmation: { tripId: string };
    MechanicInspection: undefined;
    MyWaybill: { tripId: string };
    TemperatureLog: { tripId: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
    const { user, isLoading } = useAuth();

    if (isLoading) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#2563eb" />
            </View>
        );
    }

    const isMechanic = user?.role === 'mechanic';

    return (
        <Stack.Navigator>
            {user ? (
                // User is signed in
                <>
                    {isMechanic ? (
                        // Mechanic: inspection queue as home screen
                        <Stack.Screen
                            name="MechanicInspection"
                            component={MechanicInspectionScreen}
                            options={{ title: 'Техосмотр' }}
                        />
                    ) : (
                        // Driver: trips as home screen
                        <Stack.Screen
                            name="TripList"
                            component={TripListScreen}
                            options={{ title: 'Мои рейсы' }}
                        />
                    )}
                    <Stack.Screen
                        name="TripDetails"
                        component={TripDetailsScreen}
                        options={{ title: 'Детали рейса' }}
                    />
                    <Stack.Screen
                        name="Checkpoint"
                        component={CheckpointScreen}
                        options={{ title: 'Подтверждение точки' }}
                    />
                    <Stack.Screen
                        name="TripCompletion"
                        component={TripCompletionScreen}
                        options={{ title: 'Завершение рейса' }}
                    />
                    <Stack.Screen
                        name="DeliveryConfirmation"
                        component={DeliveryConfirmationScreen}
                        options={{ title: 'Подтверждение доставки' }}
                    />
                    <Stack.Screen
                        name="MyWaybill"
                        component={MyWaybillScreen}
                        options={{ title: 'Путевой лист' }}
                    />
                    <Stack.Screen
                        name="TemperatureLog"
                        component={TemperatureLogScreen}
                        options={{ title: 'Температура (холодовая цепь)' }}
                    />
                </>
            ) : (
                // No token found, user isn't signed in
                <Stack.Screen
                    name="Login"
                    component={LoginScreen}
                    options={{ headerShown: false }}
                />
            )}
        </Stack.Navigator>
    );
}
