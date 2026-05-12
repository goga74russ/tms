import React, { useState } from 'react';
import {
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import NetInfo from '@react-native-community/netinfo';
import { RootStackParamList } from '../navigation/AppNavigator';
import { enqueueAction } from '../api/offlineQueue';
import { useAuth } from '../context/AuthContext';
import { Button, Card, IconTimeline, KeyValueRow, Pill } from '../components/ui';
import { colors, radius, shadow, spacing, typography } from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'TripCompletion'>;
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000/api';

export default function TripCompletionScreen({ route, navigation }: Props) {
    const { tripId, correctionReason } = route.params;
    const { token } = useAuth();
    const [odometer, setOdometer] = useState('');
    const [fuel, setFuel] = useState('');
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);

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
            events: [
                {
                    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                    type: 'trip_status_changed',
                    timestamp: new Date().toISOString(),
                    payload: { tripId, status: 'completed', odometer: odometerEnd, fuel: fuelEnd, correctionReason },
                },
            ],
        };

        setLoading(true);
        try {
            const netState = await NetInfo.fetch();
            const isOnline = Boolean(netState.isConnected && netState.isInternetReachable && token);

            if (!isOnline) {
                await enqueueAction({ type: 'trip_status', endpoint: '/sync/events', method: 'POST', body });
                setSubmitted(true);
                return;
            }

            const res = await fetch(`${API_URL}/sync/events`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(body),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Не удалось завершить рейс');
            setSubmitted(true);
        } catch (error: any) {
            await enqueueAction({ type: 'trip_status', endpoint: '/sync/events', method: 'POST', body });
            Alert.alert(
                'Сохранено в очередь',
                error?.message ? `${error.message}. Повторим при восстановлении связи.` : 'Повторим при восстановлении связи.'
            );
            setSubmitted(true);
        } finally {
            setLoading(false);
        }
    };

    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    // Success view
    if (submitted) {
        return (
            <View style={styles.root}>
                {/* Top "map" hero with completion mark */}
                <View style={styles.mapHero}>
                    <View style={styles.mapGrid} pointerEvents="none">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <View key={`h-${i}`} style={[styles.gridLine, { top: `${(i + 1) * 14}%` }]} />
                        ))}
                    </View>
                    <View style={styles.completedRoute}>
                        <View style={styles.routeDotStart} />
                        <View style={styles.routeLineDone} />
                        <View style={styles.routeCheckmark}>
                            <Text style={styles.routeCheckmarkText}>✓</Text>
                        </View>
                    </View>
                </View>

                <ScrollView style={styles.sheet} contentContainerStyle={styles.sheetContent}>
                    <View style={styles.handle} />

                    <View style={styles.successIconWrap}>
                        <View style={styles.successCircle}>
                            <Text style={styles.successIcon}>✓</Text>
                        </View>
                    </View>

                    <Text style={styles.successTitle}>Рейс завершён</Text>
                    <Text style={styles.successSubtitle}>Завершён в {timeStr}</Text>

                    <View style={{ marginTop: spacing.xl }}>
                        <IconTimeline
                            steps={[
                                { icon: '📋', label: 'Назначен', state: 'done' },
                                { icon: '📦', label: 'Загрузка', state: 'done' },
                                { icon: '🚛', label: 'В пути', state: 'done' },
                                { icon: '✓', label: 'Завершён', state: 'active' },
                            ]}
                        />
                    </View>

                    <Card style={{ marginTop: spacing.xl }}>
                        <Text style={styles.sectionLabel}>Итоги рейса</Text>
                        <KeyValueRow label="Одометр на финише" value={`${odometer} км`} bordered />
                        <KeyValueRow label="Остаток топлива" value={`${fuel} л`} bordered />
                        <KeyValueRow label="Время завершения" value={timeStr} />
                    </Card>

                    {correctionReason && (
                        <Card
                            style={{ marginTop: spacing.md, backgroundColor: colors.warning[50], borderColor: '#fde68a' }}
                            elevation="none"
                        >
                            <Pill label="Коррекция" tone="warning" />
                            <Text style={styles.correctionText}>{correctionReason}</Text>
                        </Card>
                    )}

                    {/* Декоративные пилюли без обработчиков — показываем только в dev,
                        пока не появятся реальные экраны документов/претензий/помощи. */}
                    {__DEV__ && (
                        <View style={styles.pillRow}>
                            <Pill label="📄 Документы" tone="neutral" />
                            <Pill label="⚠ Претензия" tone="neutral" />
                            <Pill label="❓ Помощь" tone="neutral" />
                        </View>
                    )}

                    <Button
                        title="Готово"
                        variant="primary"
                        size="lg"
                        fullWidth
                        onPress={() => navigation.navigate('TripList')}
                        style={{ marginTop: spacing.xl }}
                    />
                </ScrollView>
            </View>
        );
    }

    // Input view
    return (
        <ScrollView style={styles.inputRoot} contentContainerStyle={styles.inputContent}>
            <Text style={styles.h1}>Завершение рейса</Text>
            <Text style={styles.helper}>Введите финальные показания, чтобы закрыть рейс.</Text>

            {!!correctionReason && (
                <Card
                    style={{ marginTop: spacing.lg, backgroundColor: colors.warning[50], borderColor: '#fde68a' }}
                    elevation="none"
                >
                    <Pill label="Причина коррекции" tone="warning" />
                    <Text style={styles.correctionText}>{correctionReason}</Text>
                </Card>
            )}

            <Text style={styles.label}>Показания одометра (км)</Text>
            <TextInput
                style={styles.bigInput}
                placeholder="145000"
                placeholderTextColor={colors.neutral[300]}
                keyboardType="numeric"
                value={odometer}
                onChangeText={setOdometer}
            />

            <Text style={styles.label}>Остаток топлива (л)</Text>
            <TextInput
                style={styles.bigInput}
                placeholder="45"
                placeholderTextColor={colors.neutral[300]}
                keyboardType="numeric"
                value={fuel}
                onChangeText={setFuel}
            />

            <Button
                title="Завершить рейс"
                variant="success"
                size="lg"
                fullWidth
                isLoading={loading}
                onPress={finishTrip}
                style={{ marginTop: spacing.xl }}
            />
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.neutral[50] },
    inputRoot: { flex: 1, backgroundColor: colors.neutral[50] },
    inputContent: { padding: spacing.lg, paddingBottom: spacing.xxxl },
    h1: { ...typography.title, color: colors.neutral[900] },
    helper: { ...typography.body, color: colors.neutral[600], marginTop: spacing.sm },
    label: {
        ...typography.captionBold,
        color: colors.neutral[700],
        marginTop: spacing.lg,
        marginBottom: spacing.sm,
    },
    bigInput: {
        borderWidth: 1,
        borderColor: colors.neutral[200],
        borderRadius: radius.md,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.lg,
        fontSize: 28,
        fontWeight: '700',
        textAlign: 'center',
        backgroundColor: colors.white,
        color: colors.neutral[900],
    },

    mapHero: { height: '40%', backgroundColor: '#dbe5f1', overflow: 'hidden' },
    mapGrid: { ...StyleSheet.absoluteFillObject, backgroundColor: '#e8eef7' },
    gridLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: '#cfd8e8' },
    completedRoute: {
        ...StyleSheet.absoluteFillObject,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 50,
    },
    routeDotStart: {
        width: 14,
        height: 14,
        borderRadius: 7,
        backgroundColor: colors.neutral[400],
        borderWidth: 3,
        borderColor: colors.white,
    },
    routeLineDone: { flex: 1, height: 3, backgroundColor: colors.neutral[400] },
    routeCheckmark: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: colors.success[500],
        alignItems: 'center',
        justifyContent: 'center',
        ...shadow.md,
    },
    routeCheckmarkText: { color: colors.white, fontSize: 24, fontWeight: '700' },

    sheet: {
        flex: 1,
        marginTop: -spacing.xl,
        backgroundColor: colors.white,
        borderTopLeftRadius: radius.xl,
        borderTopRightRadius: radius.xl,
    },
    sheetContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl },
    handle: {
        alignSelf: 'center',
        width: 44,
        height: 5,
        borderRadius: 3,
        backgroundColor: colors.neutral[300],
        marginTop: spacing.sm,
        marginBottom: spacing.md,
    },
    successIconWrap: { alignItems: 'center', marginTop: spacing.lg },
    successCircle: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: colors.success[50],
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 3,
        borderColor: colors.success[500],
    },
    successIcon: { fontSize: 44, color: colors.success[600], fontWeight: '700' },
    successTitle: {
        ...typography.title,
        color: colors.neutral[900],
        textAlign: 'center',
        marginTop: spacing.lg,
        fontSize: 24,
    },
    successSubtitle: {
        ...typography.body,
        color: colors.neutral[500],
        textAlign: 'center',
        marginTop: 4,
    },

    sectionLabel: {
        ...typography.captionBold,
        color: colors.neutral[500],
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: spacing.sm,
    },
    correctionText: {
        color: colors.warning[700],
        fontSize: 14,
        lineHeight: 20,
        marginTop: spacing.sm,
    },
    pillRow: {
        flexDirection: 'row',
        gap: spacing.sm,
        marginTop: spacing.lg,
        flexWrap: 'wrap',
        justifyContent: 'center',
    },
});
