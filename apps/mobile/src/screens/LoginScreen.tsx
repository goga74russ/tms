import React from 'react';
import {
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../context/AuthContext';
import { Button, Card } from '../components/ui';
import { colors, radius, shadow, spacing, typography } from '../theme/tokens';

export default function LoginScreen() {
    const [email, setEmail] = React.useState('');
    const [password, setPassword] = React.useState('');
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState('');
    const { login } = useAuth();

    const handleLogin = async () => {
        // B6.3: pre-submit validation. Без проверки опечатки давали 400
        // round-trip; на тонком интернете в полях это лишние 2-3 секунды
        // и трафик. Email regex — намеренно простой (HTML5-стиль),
        // пароль — длина ≥ 6 (минимум сервера).
        const trimmedEmail = email.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
            setError('Введите корректный email');
            return;
        }
        if (password.length < 6) {
            setError('Пароль должен быть не короче 6 символов');
            return;
        }
        try {
            setLoading(true);
            setError('');
            await login(trimmedEmail, password);
        } catch (err: any) {
            setError(err?.message || 'Не удалось войти');
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.root}>
            <StatusBar style="light" />
            {/* Brand "gradient" — stacked overlay layers create depth without a deps lib */}
            <View style={styles.bgPrimary} />
            <View style={styles.bgOverlay} />
            <View style={styles.bgGlow} />

            <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    style={styles.flex}
                >
                    <View style={styles.hero}>
                        <View style={styles.logoCircle}>
                            <Text style={styles.logoIcon}>🚛</Text>
                        </View>
                        <Text style={styles.brand}>ТрансПульт</Text>
                        <Text style={styles.tagline}>Управление транспортом</Text>
                    </View>

                    <Card style={styles.formCard} elevation="md">
                        <Text style={styles.formTitle}>Вход в систему</Text>

                        {error ? (
                            <View style={styles.errorBox}>
                                <Text style={styles.errorText}>{error}</Text>
                            </View>
                        ) : null}

                        <Text style={styles.label}>Эл. почта</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="your@company.ru"
                            placeholderTextColor={colors.neutral[400]}
                            value={email}
                            onChangeText={setEmail}
                            autoCapitalize="none"
                            keyboardType="email-address"
                            editable={!loading}
                        />

                        <Text style={styles.label}>Пароль</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="••••••••"
                            placeholderTextColor={colors.neutral[400]}
                            value={password}
                            onChangeText={setPassword}
                            secureTextEntry
                            editable={!loading}
                        />

                        <Button
                            title="Войти в систему"
                            variant="primary"
                            size="lg"
                            fullWidth
                            onPress={handleLogin}
                            isLoading={loading}
                            style={{ marginTop: spacing.lg }}
                        />
                    </Card>

                    <View style={styles.footer}>
                        <Text style={styles.footerText}>
                            Войдите данными, которые выдал диспетчер
                        </Text>
                    </View>
                </KeyboardAvoidingView>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.brand[700] },
    flex: { flex: 1 },
    bgPrimary: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: colors.brand[700],
    },
    bgOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '55%',
        backgroundColor: colors.brand[600],
        opacity: 0.85,
    },
    bgGlow: {
        position: 'absolute',
        top: -120,
        right: -80,
        width: 320,
        height: 320,
        borderRadius: 160,
        backgroundColor: colors.brand[500],
        opacity: 0.35,
    },
    safe: { flex: 1, paddingHorizontal: spacing.xl },
    hero: {
        alignItems: 'center',
        paddingTop: spacing.xxxl,
        paddingBottom: spacing.xxl,
    },
    logoCircle: {
        width: 84,
        height: 84,
        borderRadius: 42,
        backgroundColor: 'rgba(255,255,255,0.18)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.35)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: spacing.lg,
    },
    logoIcon: { fontSize: 40 },
    brand: {
        ...typography.display,
        color: colors.white,
        fontSize: 36,
        letterSpacing: 4,
    },
    tagline: {
        ...typography.body,
        color: 'rgba(255,255,255,0.85)',
        marginTop: spacing.sm,
    },
    formCard: {
        marginTop: spacing.lg,
        ...shadow.lg,
    },
    formTitle: {
        ...typography.headline,
        color: colors.neutral[900],
        marginBottom: spacing.lg,
    },
    label: {
        ...typography.captionBold,
        color: colors.neutral[700],
        marginBottom: 6,
        marginTop: spacing.sm,
    },
    input: {
        borderWidth: 1,
        borderColor: colors.neutral[200],
        borderRadius: radius.md,
        paddingHorizontal: spacing.lg,
        paddingVertical: 14,
        fontSize: 16,
        color: colors.neutral[900],
        backgroundColor: colors.neutral[50],
        minHeight: 52,
    },
    errorBox: {
        backgroundColor: colors.danger[50],
        borderWidth: 1,
        borderColor: '#fecaca',
        borderRadius: radius.md,
        padding: spacing.md,
        marginBottom: spacing.md,
    },
    errorText: {
        color: colors.danger[700],
        fontSize: 15,
        fontWeight: '600',
        lineHeight: 20,
    },
    footer: {
        marginTop: spacing.lg,
        alignItems: 'center',
    },
    footerText: {
        color: 'rgba(255,255,255,0.75)',
        fontSize: 13,
    },
});
