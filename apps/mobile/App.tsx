import 'react-native-gesture-handler'; // Needed if we add drawer later, optional for stack but good practice to have at top
import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { AuthProvider } from './src/context/AuthContext';
import AppNavigator from './src/navigation/AppNavigator';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { setupAutoReplay } from './src/api/offlineQueue';

export default function App() {
  // Setup offline queue auto-replay when connectivity returns
  useEffect(() => {
    const unsubscribe = setupAutoReplay();
    return () => unsubscribe();
  }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NavigationContainer>
          <AppNavigator />
          <StatusBar style="auto" />
        </NavigationContainer>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
