import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    ActivityIndicator,
    Alert,
    Linking,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import {
    getWaybillByTripId,
    getWaybillPdfUrl,
    WaybillSummary,
} from '../api/waybills';

type Props = NativeStackScreenProps<RootStackParamList, 'MyWaybill'>;

const STATUS_LABELS: Record<string, string> = {
    draft: 'Черновик',
    issued: 'Выдан',
    in_transit: 'В рейсе',
    completed: 'Завершён',
    cancelled: 'Отменён',
};

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
    draft: { bg: '#e2e8f0', fg: '#475569' },
    issued: { bg: '#dbeafe', fg: '#1d4ed8' },
    in_transit: { bg: '#fef3c7', fg: '#92400e' },
    completed: { bg: '#dcfce7', fg: '#166534' },
    cancelled: { bg: '#fee2e2', fg: '#b91c1c' },
};

function formatDate(value?: string | null): string {
    if (!value) return '—';
    try {
        return new Date(value).toLocaleString('ru-RU');
    } catch {
        return value;
    }
}

export default function MyWaybillScreen({ route }: Props) {
    const { tripId } = route.params;
    const [waybill, setWaybill] = useState<WaybillSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [pdfLoading, setPdfLoading] = useState(false);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const data = await getWaybillByTripId(tripId);
                if (!cancelled) {
                    setWaybill(data);
                    if (!data) {
                        setError('Путевой лист по этому рейсу не найден');
                    }
                }
            } catch (e: any) {
                if (!cancelled) {
                    setError(e?.message || 'Не удалось загрузить путевой лист');
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        void load();
        return () => {
            cancelled = true;
        };
    }, [tripId]);

    const downloadPdf = async () => {
        if (!waybill) return;
        setPdfLoading(true);
        try {
            const url = await getWaybillPdfUrl(waybill.id);
            const supported = await Linking.canOpenURL(url);
            if (!supported) {
                Alert.alert('Ошибка', 'Не удалось открыть PDF в системе.');
                return;
            }
            await Linking.openURL(url);
        } catch (e: any) {
            Alert.alert('Ошибка', e?.message || 'Не удалось открыть PDF.');
        } finally {
            setPdfLoading(false);
        }
    };

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color="#2563eb" />
            </View>
        );
    }

    if (error || !waybill) {
        return (
            <View style={styles.center}>
                <Text style={styles.errorText}>{error || 'Путевой лист не найден'}</Text>
            </View>
        );
    }

    const statusKey = waybill.status || 'draft';
    const statusColor = STATUS_COLORS[statusKey] || STATUS_COLORS.draft;
    const statusLabel = STATUS_LABELS[statusKey] || statusKey;

    const vehicleLine = waybill.vehicle
        ? [waybill.vehicle.brand, waybill.vehicle.model, waybill.vehicle.plateNumber]
              .filter(Boolean)
              .join(' ')
        : '—';

    const routeLine = waybill.route
        ? `${waybill.route.from || '—'} → ${waybill.route.to || '—'}` +
          (waybill.route.stopsCount ? ` · точек: ${waybill.route.stopsCount}` : '')
        : '—';

    const techApproved = waybill.inspections?.techApproved;
    const medApproved = waybill.inspections?.medicalApproved;

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            <View style={styles.headerRow}>
                <View style={{ flex: 1 }}>
                    <Text style={styles.title}>{`Путевой лист №${waybill.number}`}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: statusColor.bg }]}>
                    <Text style={[styles.statusText, { color: statusColor.fg }]}>{statusLabel}</Text>
                </View>
            </View>

            <View style={styles.card}>
                <Text style={styles.sectionTitle}>Даты</Text>
                <Row label="Выдан" value={formatDate(waybill.issuedAt)} />
                <Row label="План отправление" value={formatDate(waybill.plannedDepartureAt)} />
                <Row label="Факт отправление" value={formatDate(waybill.actualDepartureAt)} />
                <Row label="План возврат" value={formatDate(waybill.plannedReturnAt)} />
                <Row label="Факт возврат" value={formatDate(waybill.actualReturnAt)} />
            </View>

            <View style={styles.card}>
                <Text style={styles.sectionTitle}>Транспорт и водитель</Text>
                <Row label="ТС" value={vehicleLine} />
                <Row label="Водитель" value={waybill.driver?.fullName || '—'} />
                <Row
                    label="Одометр"
                    value={`${waybill.odometerStart ?? '—'} → ${waybill.odometerEnd ?? '—'}`}
                />
            </View>

            <View style={styles.card}>
                <Text style={styles.sectionTitle}>Маршрут</Text>
                <Text style={styles.bodyText}>{routeLine}</Text>
            </View>

            <View style={styles.card}>
                <Text style={styles.sectionTitle}>Допуски</Text>
                <Row
                    label="Техосмотр"
                    value={techApproved == null ? '—' : techApproved ? 'Пройден' : 'Не пройден'}
                />
                <Row
                    label="Медосмотр"
                    value={medApproved == null ? '—' : medApproved ? 'Пройден' : 'Не пройден'}
                />
            </View>

            <TouchableOpacity
                style={[styles.pdfButton, pdfLoading && styles.disabledButton]}
                onPress={downloadPdf}
                disabled={pdfLoading}
            >
                {pdfLoading ? (
                    <ActivityIndicator color="#fff" />
                ) : (
                    <Text style={styles.pdfButtonText}>Скачать PDF</Text>
                )}
            </TouchableOpacity>
        </ScrollView>
    );
}

function Row({ label, value }: { label: string; value: string }) {
    return (
        <View style={styles.row}>
            <Text style={styles.rowLabel}>{label}</Text>
            <Text style={styles.rowValue}>{value}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8fafc' },
    content: { padding: 16, paddingBottom: 40 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
    errorText: { fontSize: 16, color: '#b91c1c', textAlign: 'center' },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    title: { fontSize: 20, fontWeight: '700', color: '#0f172a' },
    statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
    statusText: { fontSize: 12, fontWeight: '700' },
    card: {
        backgroundColor: '#fff',
        borderRadius: 8,
        padding: 14,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#e2e8f0',
    },
    sectionTitle: { fontSize: 14, fontWeight: '700', color: '#0f172a', marginBottom: 8 },
    row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
    rowLabel: { fontSize: 13, color: '#64748b', flex: 1 },
    rowValue: { fontSize: 13, color: '#0f172a', fontWeight: '600', flex: 1, textAlign: 'right' },
    bodyText: { fontSize: 14, color: '#0f172a' },
    pdfButton: {
        backgroundColor: '#2563eb',
        padding: 16,
        borderRadius: 8,
        alignItems: 'center',
        marginTop: 8,
    },
    pdfButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    disabledButton: { backgroundColor: '#94a3b8' },
});
