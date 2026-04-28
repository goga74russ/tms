import React from 'react';
import { StyleSheet, View, Text, ImageBackground, Dimensions, Image } from 'react-native';
import { GlassCard } from '../../src/components/GlassCard';
import { GlassButton } from '../../src/components/GlassButton';
import { useRouter } from 'expo-router';

const { width, height } = Dimensions.get('window');

export default function ProfileScreen() {
    const router = useRouter();

    const handleLogout = () => {
        router.replace('/');
    };

    return (
        <ImageBackground
            source={{ uri: 'https://images.unsplash.com/photo-1542281286-9e0a16bb7366?auto=format&fit=crop&w=1600&q=80' }}
            style={styles.background}
            blurRadius={10}
        >
            <View style={styles.container}>
                <GlassCard style={styles.profileCard} intensity={40}>
                    <Image
                        source={{ uri: 'https://randomuser.me/api/portraits/men/32.jpg' }}
                        style={styles.avatar}
                    />
                    <Text style={styles.name}>John Doe</Text>
                    <Text style={styles.role}>Senior Driver</Text>

                    <View style={styles.divider} />

                    <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>License</Text>
                        <Text style={styles.detailValue}>CDL Class A</Text>
                    </View>
                    <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Vehicle</Text>
                        <Text style={styles.detailValue}>Truck #920</Text>
                    </View>
                    <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Experience</Text>
                        <Text style={styles.detailValue}>5 Years</Text>
                    </View>
                </GlassCard>

                <GlassButton
                    title="Sign Out"
                    onPress={handleLogout}
                    containerStyle={styles.logoutBtn}
                    blurIntensity={60}
                />
            </View>
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
        flex: 1,
        paddingTop: 120,
        paddingHorizontal: 20,
    },
    profileCard: {
        alignItems: 'center',
        paddingVertical: 32,
        marginBottom: 24,
    },
    avatar: {
        width: 100,
        height: 100,
        borderRadius: 50,
        borderWidth: 3,
        borderColor: 'rgba(255,255,255,0.5)',
        marginBottom: 16,
    },
    name: {
        fontSize: 26,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 4,
    },
    role: {
        fontSize: 16,
        color: 'rgba(255,255,255,0.8)',
        marginBottom: 24,
    },
    divider: {
        height: 1,
        width: '100%',
        backgroundColor: 'rgba(255,255,255,0.2)',
        marginBottom: 20,
    },
    detailRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        width: '100%',
        paddingHorizontal: 16,
        marginBottom: 16,
    },
    detailLabel: {
        fontSize: 16,
        color: 'rgba(255,255,255,0.7)',
    },
    detailValue: {
        fontSize: 16,
        fontWeight: '600',
        color: '#fff',
    },
    logoutBtn: {
        marginTop: 'auto',
        marginBottom: 100,
    },
});
