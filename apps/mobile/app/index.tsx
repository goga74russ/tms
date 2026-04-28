import React, { useState } from 'react';
import { StyleSheet, View, Text, ImageBackground, KeyboardAvoidingView, Platform, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { GlassCard } from '../src/components/GlassCard';
import { GlassInput } from '../src/components/GlassInput';
import { GlassButton } from '../src/components/GlassButton';

const { width, height } = Dimensions.get('window');

export default function LoginScreen() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    const handleLogin = () => {
        // Basic fake login navigation
        router.replace('/(tabs)');
    };

    return (
        <ImageBackground
            source={{ uri: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564&auto=format&fit=crop' }}
            style={styles.background}
            blurRadius={3}
        >
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
                <View style={styles.content}>
                    <Text style={styles.title}>TMS Driver</Text>
                    <Text style={styles.subtitle}>Welcome back</Text>

                    <GlassCard style={styles.card}>
                        <GlassInput
                            placeholder="Email or Phone"
                            value={email}
                            onChangeText={setEmail}
                            keyboardType="email-address"
                            autoCapitalize="none"
                        />
                        <GlassInput
                            placeholder="Password"
                            value={password}
                            onChangeText={setPassword}
                            secureTextEntry
                        />
                        <GlassButton title="Sign In" onPress={handleLogin} containerStyle={styles.buttonContainer} />
                    </GlassCard>
                </View>
            </KeyboardAvoidingView>
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
    },
    content: {
        flex: 1,
        padding: 24,
        justifyContent: 'center',
    },
    title: {
        fontSize: 42,
        fontWeight: '800',
        color: '#fff',
        marginBottom: 8,
        textAlign: 'center',
        textShadowColor: 'rgba(0,0,0,0.3)',
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 4,
    },
    subtitle: {
        fontSize: 18,
        color: 'rgba(255,255,255,0.9)',
        marginBottom: 40,
        textAlign: 'center',
        fontWeight: '500',
    },
    card: {
        paddingTop: 32,
    },
    buttonContainer: {
        marginTop: 16,
    },
});
