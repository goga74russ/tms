import React from 'react';
import { StyleSheet, View, Text, SectionList, ImageBackground, Dimensions } from 'react-native';
import { GlassCard } from '../../src/components/GlassCard';

const { width, height } = Dimensions.get('window');

const TASKS = [
    {
        title: 'Today',
        data: [
            { id: '1', title: 'Pickup at Port', time: '10:00 AM', status: 'Pending' },
            { id: '2', title: 'Delivery to Depot C', time: '02:30 PM', status: 'Pending' },
        ],
    },
    {
        title: 'Tomorrow',
        data: [
            { id: '3', title: 'Vehicle Inspection', time: '08:00 AM', status: 'Scheduled' },
            { id: '4', title: 'Route #5920', time: '09:30 AM', status: 'Scheduled' },
        ],
    },
];

export default function TasksScreen() {
    return (
        <ImageBackground
            source={{ uri: 'https://images.unsplash.com/photo-1542281286-9e0a16bb7366?auto=format&fit=crop&w=1600&q=80' }}
            style={styles.background}
            blurRadius={10}
        >
            <SectionList
                contentContainerStyle={styles.container}
                sections={TASKS}
                keyExtractor={(item) => item.id}
                renderSectionHeader={({ section: { title } }) => (
                    <Text style={styles.sectionHeader}>{title}</Text>
                )}
                renderItem={({ item }) => (
                    <GlassCard style={styles.taskCard} intensity={30}>
                        <View style={styles.taskInfo}>
                            <Text style={styles.taskTitle}>{item.title}</Text>
                            <Text style={styles.taskTime}>{item.time}</Text>
                        </View>
                        <View style={styles.statusBadge}>
                            <Text style={styles.statusText}>{item.status}</Text>
                        </View>
                    </GlassCard>
                )}
            />
        </ImageBackground>
    );
}

const styles = StyleSheet.create({
    background: {
        flex: 1,
        width,
        height,
    },
    container: {
        paddingTop: 120, // Account for header
        paddingBottom: 100, // Account for tab bar
        paddingHorizontal: 16,
    },
    sectionHeader: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#fff',
        marginTop: 20,
        marginBottom: 12,
        textShadowColor: 'rgba(0,0,0,0.3)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 2,
        paddingHorizontal: 4,
    },
    taskCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 20,
        marginBottom: 12,
    },
    taskInfo: {
        flex: 1,
    },
    taskTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#fff',
        marginBottom: 4,
    },
    taskTime: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.7)',
    },
    statusBadge: {
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.3)',
    },
    statusText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '500',
    },
});
