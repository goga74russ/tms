import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { getWaybillByTripId, getWaybillPdfRequest, WaybillSummary, WaybillPdfRequest } from '../api/waybills';
import { Button, Card, KeyValueRow, Pill, PillTone } from '../components/ui';
import { colors, spacing, typography } from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'MyWaybill'>;

const STATUS_PILL: Record<string, { tone: PillTone; label: string }> = {
    draft: { tone: 'neutral', label: 'Черновик' },
    issued: { tone: 'brand', label: 'Выдан' },
    in_transit: { tone: 'warning', label: 'В рейсе' },
    completed: { tone: 'success', label: 'Завершён' },
    cancelled: { tone: 'danger', label: 'Отменён' },
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
    // B6.1: PDF открывается inline в WebView с Authorization header,
    // без token-в-URL (раньше Linking.openURL утекал JWT через Referer / share-sheet / logs).
    const [pdfRequest, setPdfRequest] = useState<WaybillPdfRequest | null>(null);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const data = await getWaybillByTripId(tripId);
                if (!cancelled) {
                    setWaybill(data);
                    if (!data) setError('Путевой лист по этому рейсу не найден');
                }
            } catch (e: any) {
                if (!cancelled) setError(e?.message || 'Не удалось загрузить путевой лист');
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
            const req = await getWaybillPdfRequest(waybill.id);
            setPdfRequest(req);
        } catch (e: any) {
            Alert.alert('Ошибка', e?.message || 'Не удалось получить PDF.');
        } finally {
            setPdfLoading(false);
        }
    };

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color={colors.brand[600]} />
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
    const statusInfo = STATUS_PILL[statusKey] ?? { tone: 'neutral' as PillTone, label: statusKey };

    const vehicleLine = waybill.vehicle
        ? [waybill.vehicle.brand, waybill.vehicle.model, waybill.vehicle.plateNumber].filter(Boolean).join(' ')
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
                    <Text style={styles.title}>Путевой лист</Text>
                    <Text style={styles.subtitle}>№ {waybill.number}</Text>
                </View>
                <Pill label={statusInfo.label} tone={statusInfo.tone} />
            </View>

            <Card style={{ marginTop: spacing.lg }}>
                <Text style={styles.sectionTitle}>Даты</Text>
                <KeyValueRow label="Выдан" value={formatDate(waybill.issuedAt)} bordered />
                <KeyValueRow label="План отправление" value={formatDate(waybill.plannedDepartureAt)} bordered />
                <KeyValueRow label="Факт отправление" value={formatDate(waybill.actualDepartureAt)} bordered />
                <KeyValueRow label="План возврат" value={formatDate(waybill.plannedReturnAt)} bordered />
                <KeyValueRow label="Факт возврат" value={formatDate(waybill.actualReturnAt)} />
            </Card>

            <Card style={{ marginTop: spacing.md }}>
                <Text style={styles.sectionTitle}>Транспорт и водитель</Text>
                <KeyValueRow label="ТС" value={vehicleLine} bordered />
                <KeyValueRow label="Водитель" value={waybill.driver?.fullName || '—'} bordered />
                <KeyValueRow
                    label="Одометр"
                    value={`${waybill.odometerStart ?? '—'} → ${waybill.odometerEnd ?? '—'}`}
                />
            </Card>

            <Card style={{ marginTop: spacing.md }}>
                <Text style={styles.sectionTitle}>Маршрут</Text>
                <Text style={styles.bodyText}>{routeLine}</Text>
            </Card>

            <Card style={{ marginTop: spacing.md }}>
                <Text style={styles.sectionTitle}>Допуски</Text>
                <KeyValueRow
                    label="Техосмотр"
                    value={
                        <Pill
                            label={techApproved == null ? '—' : techApproved ? 'Пройден' : 'Не пройден'}
                            tone={techApproved == null ? 'neutral' : techApproved ? 'success' : 'danger'}
                        />
                    }
                    bordered
                />
                <KeyValueRow
                    label="Медосмотр"
                    value={
                        <Pill
                            label={medApproved == null ? '—' : medApproved ? 'Пройден' : 'Не пройден'}
                            tone={medApproved == null ? 'neutral' : medApproved ? 'success' : 'danger'}
                        />
                    }
                />
            </Card>

            <Button
                title="Скачать PDF"
                variant="primary"
                size="lg"
                fullWidth
                onPress={downloadPdf}
                isLoading={pdfLoading}
                style={{ marginTop: spacing.lg }}
            />

            {/* B6.1: PDF inline в WebView. Authorization header вместо ?token=. */}
            <Modal
                visible={pdfRequest !== null}
                animationType="slide"
                onRequestClose={() => setPdfRequest(null)}
            >
                <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Путевой лист (PDF)</Text>
                    <TouchableOpacity onPress={() => setPdfRequest(null)} accessibilityLabel="Закрыть">
                        <Text style={styles.modalClose}>Закрыть</Text>
                    </TouchableOpacity>
                </View>
                {pdfRequest && (
                    <WebView
                        source={{ uri: pdfRequest.url, headers: pdfRequest.headers }}
                        style={{ flex: 1 }}
                        startInLoadingState
                        renderLoading={() => (
                            <View style={styles.center}>
                                <ActivityIndicator size="large" color={colors.brand[600]} />
                            </View>
                        )}
                    />
                )}
            </Modal>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.neutral[50] },
    content: { padding: spacing.lg, paddingBottom: spacing.xxxl },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, backgroundColor: colors.neutral[50] },
    errorText: { fontSize: 16, color: colors.danger[700], textAlign: 'center' },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    title: { ...typography.title, color: colors.neutral[900] },
    subtitle: { ...typography.body, color: colors.neutral[500], marginTop: 2 },
    sectionTitle: {
        ...typography.captionBold,
        color: colors.neutral[500],
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: spacing.sm,
    },
    bodyText: { fontSize: 15, color: colors.neutral[900], fontWeight: '600' },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        backgroundColor: colors.neutral[100],
        borderBottomWidth: 1,
        borderBottomColor: colors.neutral[200],
    },
    modalTitle: { ...typography.captionBold, color: colors.neutral[900] },
    modalClose: { ...typography.captionBold, color: colors.brand[700] },
});
