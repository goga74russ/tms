import React from 'react';
import { StyleSheet, View, Text, ScrollView, ImageBackground, Dimensions } from 'react-native';
import { GlassCard } from '../../src/components/GlassCard';

const { width, height } = Dimensions.get('window');

export default function HomeScreen() {
    return (
        <ImageBackground
            source={{ uri: 'https://images.unsplash.com/photo-1542281286-9e0a16bb7366?auto=format&fit=crop&w=1600&q=80' }}
            style={styles.background}
            blurRadius={10}
        >
            <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
                <Text style={styles.headerTitle}>Welcome, Driver</Text>

                <View style={styles.statsContainer}>
                    <GlassCard style={styles.statCard} intensity={40}>
                        <Text style={styles.statNumber}>12</Text>
                        <Text style={styles.statLabel}>Trips</Text>
                    </GlassCard>
                    <GlassCard style={styles.statCard} intensity={40}>
                        <Text style={styles.statNumber}>4.9</Text>
                        <Text style={styles.statLabel}>Rating</Text>
                    </GlassCard>
                </View>

                <Text style={styles.sectionTitle}>Upcoming Shift</Text>
                <GlassCard style={styles.shiftCard} intensity={25}>
                    <Text style={styles.shiftTitle}>Route #4829</Text>
                    <Text style={styles.shiftDetail}>From: Main Warehouse, NY</Text>
                    <Text style={styles.shiftDetail}>To: Distribution Center, NJ</Text>
                    <View style={styles.badge}>
                        <Text style={styles.badgeText}>Starts in 2h</Text>
                    </View>
                </GlassCard>
            </ScrollView>
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
        flexGrow: 1,
        paddingTop: 120, // Make room for header
        paddingHorizontal: 20,
        paddingBottom: 100, // Make room for tab bar
    },
    headerTitle: {
        fontSize: 32,
        fontWeight: '700',
        color: '#fff',
        marginBottom: 24,
        textShadowColor: 'rgba(0,0,0,0.2)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 2,
    },
    statsContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 32,
    },
    statCard: {
        width: '47%',
        alignItems: 'center',
        paddingVertical: 24,
    },
    statNumber: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 4,
    },
    statLabel: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.8)',
        fontWeight: '500',
    },
    sectionTitle: {
        fontSize: 20,
        fontWeight: '600',
        color: '#fff',
        marginBottom: 16,
    },
    shiftCard: {
        padding: 24,
    },
    shiftTitle: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 12,
    },
    shiftDetail: {
        fontSize: 16,
        color: 'rgba(255,255,255,0.9)',
        marginBottom: 6,
    },
    badge: {
        backgroundColor: 'rgba(0,0,0,0.3)',
        alignSelf: 'flex-start',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
        marginTop: 12,
    },
    badgeText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: 'bold',
    },
});
