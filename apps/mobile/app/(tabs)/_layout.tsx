import { Tabs } from 'expo-router';
// Optional: import { Ionicons } from '@expo/vector-icons'; if using icons
import { BlurView } from 'expo-blur';
import { StyleSheet, Platform } from 'react-native';

export default function TabLayout() {
    return (
        <Tabs
            screenOptions={{
                headerShown: true,
                headerTransparent: true,
                headerBackground: () => (
                    <BlurView tint="light" intensity={80} style={StyleSheet.absoluteFill} />
                ),
                tabBarStyle: {
                    position: 'absolute',
                    elevation: 0,
                    backgroundColor: 'transparent',
                    borderTopWidth: 0,
                    height: Platform.OS === 'ios' ? 88 : 60,
                },
                tabBarBackground: () => (
                    <BlurView tint="light" intensity={80} style={StyleSheet.absoluteFill} />
                ),
            }}
        >
            <Tabs.Screen
                name="index"
                options={{
                    title: 'Home',
                    headerTitle: 'Dashboard',
                }}
            />
            <Tabs.Screen
                name="tasks"
                options={{
                    title: 'Tasks',
                    headerTitle: 'Active Trips',
                }}
            />
            <Tabs.Screen
                name="profile"
                options={{
                    title: 'Profile',
                    headerTitle: 'My Profile',
                }}
            />
        </Tabs>
    );
}
