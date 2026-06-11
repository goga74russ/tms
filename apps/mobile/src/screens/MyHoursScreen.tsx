import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BREACH_TYPE_LABELS, label } from '@tms/shared';
import { RootStackParamList } from '../navigation/AppNavigator';
import { HosStatus, HoursSummary, getMyHosStatus, getMyHoursSummary } from '../api/rto';
import { Card, Pill } from '../components/ui';
import { colors, radius, spacing, typography } from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'MyHours'>;

const DAY_LIMIT_FALLBACK = 9;
const WEEK_LIMIT_FALLBACK = 56;

function formatHours(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(value)) return '0';
    const rounded = Math.round(value * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function formatDate(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}.${mm}`;
}

export default function MyHoursScreen(_props: Props) {
    const [status, setStatus] = useState<HosStatus | null>(null);
    const [summary, setSummary] = useState<HoursSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = async () => {
        try {
            setError(null);
            const now = new Date();
            const from = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
            from.setHours(0, 0, 0, 0);
            const [hos, hours] = await Promise.all([
                getMyHosStatus(),
                getMyHoursSummary(from.toISOString(), now.toISOString()),
            ]);
            setStatus(hos);
            setSummary(hours);
        } catch (e: any) {
            setError(e?.message || 'Не удалось загрузить данные');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        void load();
    }, []);

    const onRefresh = () => {
        setRefreshing(true);
        void load();
    };

    if (loading) {
        return <ActivityIndicator style={{ flex: 1 }} size="large" color={colors.brand[600]} />;
    }

    const dayLimit = status?.dayLimit ?? DAY_LIMIT_FALLBACK;
    const weekLimit = status?.weekLimit ?? WEEK_LIMIT_FALLBACK;
    const dayHours = status?.dayHours ?? 0;
    const weekHours = status?.weekHours ?? 0;
    const breach = Boolean(status?.breach);

    const daily = summary?.dailyHours ?? [];
    const maxBar = daily.reduce((m, d) => (d.hours > m ? d.hours : m), dayLimit || 1);

    const dayPct = Math.min(100, Math.round((dayHours / dayLimit) * 100));
    const weekPct = Math.min(100, Math.round((weekHours / weekLimit) * 100));

    return (
        <ScrollView
            style={styles.container}
            contentContainerStyle={styles.content}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
            {error && (
                <Card style={{ backgroundColor: colors.danger[50], borderColor: '#fecaca', marginBottom: spacing.md }} elevation="none">
                    <Text style={styles.errorText}>{error}</Text>
                </Card>
            )}

            {/* Today stat card */}
            <Card style={breach ? { borderColor: '#fecaca', backgroundColor: colors.danger[50] } : null}>
                <View style={styles.statHeader}>
                    <Text style={styles.cardLabel}>Сегодня</Text>
                    <Pill
                        label={`лимит ${dayLimit} ч`}
                        tone={breach ? 'danger' : 'neutral'}
                    />
                </View>
                <Text style={[styles.bigValue, breach && { color: colors.danger[700] }]}>
                    {formatHours(dayHours)} <Text style={styles.bigUnit}>ч</Text>
                </Text>
                <View style={styles.miniBar}>
                    <View
                        style={[
                            styles.miniFill,
                            {
                                width: `${dayPct}%`,
                                backgroundColor: breach ? colors.danger[500] : colors.brand[600],
                            },
                        ]}
                    />
                </View>
            </Card>

            <Card style={[{ marginTop: spacing.md }, breach ? { borderColor: '#fecaca', backgroundColor: colors.danger[50] } : null]}>
                <View style={styles.statHeader}>
                    <Text style={styles.cardLabel}>Неделя</Text>
                    <Pill label={`лимит ${weekLimit} ч`} tone={breach ? 'danger' : 'neutral'} />
                </View>
                <Text style={[styles.bigValue, breach && { color: colors.danger[700] }]}>
                    {formatHours(weekHours)} <Text style={styles.bigUnit}>ч</Text>
                </Text>
                <View style={styles.miniBar}>
                    <View
                        style={[
                            styles.miniFill,
                            {
                                width: `${weekPct}%`,
                                backgroundColor: breach ? colors.danger[500] : colors.brand[600],
                            },
                        ]}
                    />
                </View>
            </Card>

            {breach && (
                <Card style={{ marginTop: spacing.md, backgroundColor: colors.danger[600], borderColor: colors.danger[700] }} elevation="md">
                    <Text style={styles.breachText}>Превышены лимиты РТО</Text>
                </Card>
            )}

            <Text style={styles.sectionTitle}>Последние 7 дней</Text>
            {daily.length === 0 ? (
                <Text style={styles.emptyText}>Нет данных за последние 7 дней</Text>
            ) : (
                <Card>
                    {daily.map((d, idx) => {
                        const widthPct = Math.min(100, Math.round((d.hours / maxBar) * 100));
                        const over = dayLimit > 0 && d.hours > dayLimit;
                        const isLast = idx === daily.length - 1;
                        return (
                            <View
                                key={d.date}
                                style={[styles.barRow, !isLast && styles.barRowBordered]}
                            >
                                <Text style={styles.barDate}>{formatDate(d.date)}</Text>
                                <View style={styles.barTrack}>
                                    <View
                                        style={[
                                            styles.barFill,
                                            { width: `${widthPct}%` },
                                            over && { backgroundColor: colors.danger[500] },
                                        ]}
                                    />
                                </View>
                                <Text style={[styles.barHours, over && { color: colors.danger[700], fontWeight: '700' }]}>
                                    {formatHours(d.hours)} ч
                                </Text>
                            </View>
                        );
                    })}
                </Card>
            )}

            {summary?.breaches && summary.breaches.length > 0 && (
                <>
                    <Text style={styles.sectionTitle}>Нарушения</Text>
                    {summary.breaches.map((b, i) => (
                        <View key={`${b.date}-${i}`} style={styles.breachItem}>
                            <Text style={styles.breachItemDate}>{formatDate(b.date)}</Text>
                            <Text style={styles.breachItemText}>{b.message || label(BREACH_TYPE_LABELS, b.type)}</Text>
                        </View>
                    ))}
                </>
            )}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.neutral[50] },
    content: { padding: spacing.lg, paddingBottom: spacing.xxxl },
    errorText: { color: colors.danger[700], fontSize: 13, fontWeight: '600' },
    statHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: spacing.sm,
    },
    cardLabel: {
        ...typography.captionBold,
        color: colors.neutral[500],
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    bigValue: {
        fontSize: 48,
        fontWeight: '700',
        color: colors.neutral[900],
        letterSpacing: -1,
    },
    bigUnit: {
        fontSize: 22,
        fontWeight: '500',
        color: colors.neutral[500],
    },
    miniBar: {
        height: 8,
        backgroundColor: colors.neutral[200],
        borderRadius: radius.pill,
        marginTop: spacing.md,
        overflow: 'hidden',
    },
    miniFill: {
        height: '100%',
        borderRadius: radius.pill,
    },
    breachText: {
        color: colors.white,
        fontSize: 15,
        fontWeight: '700',
        textAlign: 'center',
    },
    sectionTitle: {
        ...typography.captionBold,
        color: colors.neutral[500],
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginTop: spacing.xl,
        marginBottom: spacing.sm,
    },
    emptyText: { color: colors.neutral[500], fontSize: 13 },
    barRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: spacing.sm,
    },
    barRowBordered: {
        borderBottomWidth: 1,
        borderBottomColor: colors.neutral[100],
    },
    barDate: { width: 56, fontSize: 12, color: colors.neutral[600], fontWeight: '600' },
    barTrack: {
        flex: 1,
        height: 14,
        backgroundColor: colors.neutral[200],
        borderRadius: radius.pill,
        overflow: 'hidden',
        marginHorizontal: spacing.sm,
    },
    barFill: {
        height: '100%',
        backgroundColor: colors.brand[600],
        borderRadius: radius.pill,
    },
    barHours: { width: 64, fontSize: 12, color: colors.neutral[900], textAlign: 'right', fontWeight: '600' },
    breachItem: {
        backgroundColor: colors.white,
        borderLeftWidth: 4,
        borderLeftColor: colors.danger[500],
        padding: spacing.md,
        marginBottom: spacing.sm,
        borderRadius: radius.md,
    },
    breachItemDate: { fontSize: 12, color: colors.danger[700], fontWeight: '700' },
    breachItemText: { fontSize: 13, color: colors.neutral[900], marginTop: 2 },
});
