import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, RefreshControl } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { getMyHosStatus, getMyHoursSummary, HosStatus, HoursSummary } from '../api/rto';

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
        return <ActivityIndicator style={{ flex: 1 }} size="large" color="#2563eb" />;
    }

    const dayLimit = status?.dayLimit ?? DAY_LIMIT_FALLBACK;
    const weekLimit = status?.weekLimit ?? WEEK_LIMIT_FALLBACK;
    const dayHours = status?.dayHours ?? 0;
    const weekHours = status?.weekHours ?? 0;
    const breach = Boolean(status?.breach);

    const daily = summary?.dailyHours ?? [];
    const maxBar = daily.reduce((m, d) => (d.hours > m ? d.hours : m), dayLimit || 1);

    return (
        <ScrollView
            style={styles.container}
            contentContainerStyle={styles.content}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
            {error && (
                <View style={styles.errorBox}>
                    <Text style={styles.errorText}>{error}</Text>
                </View>
            )}

            <View style={[styles.card, breach && styles.cardBreach]}>
                <Text style={styles.cardLabel}>Сегодня</Text>
                <Text style={[styles.bigValue, breach && styles.bigValueBreach]}>
                    {`${formatHours(dayHours)}/${dayLimit} ч`}
                </Text>
            </View>

            <View style={[styles.card, breach && styles.cardBreach]}>
                <Text style={styles.cardLabel}>Неделя</Text>
                <Text style={[styles.bigValue, breach && styles.bigValueBreach]}>
                    {`${formatHours(weekHours)}/${weekLimit} ч`}
                </Text>
            </View>

            {breach && (
                <View style={styles.breachBanner}>
                    <Text style={styles.breachText}>⚠ Превышены лимиты РТО</Text>
                </View>
            )}

            <Text style={styles.sectionTitle}>Последние 7 дней</Text>
            {daily.length === 0 ? (
                <Text style={styles.emptyText}>Нет данных за последние 7 дней</Text>
            ) : (
                daily.map((d) => {
                    const widthPct = Math.min(100, Math.round((d.hours / maxBar) * 100));
                    const over = dayLimit > 0 && d.hours > dayLimit;
                    return (
                        <View key={d.date} style={styles.row}>
                            <Text style={styles.rowDate}>{formatDate(d.date)}</Text>
                            <View style={styles.barTrack}>
                                <View
                                    style={[
                                        styles.barFill,
                                        { width: `${widthPct}%` },
                                        over && styles.barFillOver,
                                    ]}
                                />
                            </View>
                            <Text style={[styles.rowHours, over && styles.rowHoursOver]}>
                                {`${formatHours(d.hours)} ч`}
                            </Text>
                        </View>
                    );
                })
            )}

            {summary?.breaches && summary.breaches.length > 0 && (
                <>
                    <Text style={styles.sectionTitle}>Нарушения</Text>
                    {summary.breaches.map((b, i) => (
                        <View key={`${b.date}-${i}`} style={styles.breachItem}>
                            <Text style={styles.breachItemDate}>{formatDate(b.date)}</Text>
                            <Text style={styles.breachItemText}>
                                {b.message || b.type}
                            </Text>
                        </View>
                    ))}
                </>
            )}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8fafc' },
    content: { padding: 16, paddingBottom: 32 },
    errorBox: {
        backgroundColor: '#fee2e2',
        borderColor: '#fecaca',
        borderWidth: 1,
        borderRadius: 8,
        padding: 12,
        marginBottom: 12,
    },
    errorText: { color: '#b91c1c', fontSize: 13 },
    card: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 20,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#e2e8f0',
    },
    cardBreach: {
        borderColor: '#fecaca',
        backgroundColor: '#fef2f2',
    },
    cardLabel: {
        fontSize: 14,
        color: '#64748b',
        fontWeight: '600',
        marginBottom: 4,
    },
    bigValue: {
        fontSize: 40,
        fontWeight: '700',
        color: '#0f172a',
    },
    bigValueBreach: { color: '#dc2626' },
    breachBanner: {
        backgroundColor: '#dc2626',
        padding: 12,
        borderRadius: 8,
        marginBottom: 12,
    },
    breachText: { color: '#fff', fontSize: 14, fontWeight: '700', textAlign: 'center' },
    sectionTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: '#0f172a',
        marginTop: 12,
        marginBottom: 8,
    },
    emptyText: { color: '#64748b', fontSize: 13 },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 6,
    },
    rowDate: { width: 56, fontSize: 12, color: '#475569' },
    barTrack: {
        flex: 1,
        height: 16,
        backgroundColor: '#e2e8f0',
        borderRadius: 8,
        overflow: 'hidden',
        marginHorizontal: 8,
    },
    barFill: {
        height: '100%',
        backgroundColor: '#2563eb',
    },
    barFillOver: { backgroundColor: '#dc2626' },
    rowHours: { width: 56, fontSize: 12, color: '#0f172a', textAlign: 'right' },
    rowHoursOver: { color: '#dc2626', fontWeight: '700' },
    breachItem: {
        backgroundColor: '#fff',
        borderLeftWidth: 4,
        borderLeftColor: '#dc2626',
        padding: 10,
        marginBottom: 6,
        borderRadius: 4,
    },
    breachItemDate: { fontSize: 12, color: '#dc2626', fontWeight: '700' },
    breachItemText: { fontSize: 13, color: '#0f172a', marginTop: 2 },
});
