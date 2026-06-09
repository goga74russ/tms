// ============================================================
// MechanicInspectionScreen — Tech inspection flow for mechanics
// Steps: Queue → Checklist → Sign → Submit
// Visual refresh: card-based queue, toggle buttons, signature canvas
// ============================================================
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import SignatureScreen, { SignatureViewRef } from 'react-native-signature-canvas';
import { uploadPhoto } from '../api/upload';
import {
    ChecklistTemplate,
    QueueItem,
    TechInspectionItem,
    getTechChecklist,
    getTechQueue,
    submitTechInspection,
} from '../api/inspections';
import { Button, Card, EmptyState, Pill, ProgressSteps } from '../components/ui';
import { colors, radius, spacing, typography } from '../theme/tokens';

type Step = 'queue' | 'checklist' | 'camera' | 'decision' | 'signature';

interface ChecklistState {
    name: string;
    result: 'ok' | 'fault' | null;
    comment: string;
    photoUri: string | null;
    photoUrl: string | null;
}

export default function MechanicInspectionScreen() {
    const [step, setStep] = useState<Step>('queue');
    const [queue, setQueue] = useState<QueueItem[]>([]);
    const [template, setTemplate] = useState<ChecklistTemplate | null>(null);
    const [selectedItem, setSelectedItem] = useState<QueueItem | null>(null);
    const [checklist, setChecklist] = useState<ChecklistState[]>([]);
    const [currentPhotoIndex, setCurrentPhotoIndex] = useState<number | null>(null);
    const [decision, setDecision] = useState<'approved' | 'rejected' | null>(null);
    const [decisionComment, setDecisionComment] = useState('');
    const [inspectionType, setInspectionType] = useState<'pre_trip' | 'periodic'>('pre_trip');
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const cameraRef = useRef<CameraView>(null);
    const signatureRef = useRef<SignatureViewRef>(null);
    const [permission, requestPermission] = useCameraPermissions();

    useEffect(() => {
        loadQueue();
    }, []);

    async function loadQueue() {
        setLoading(true);
        try {
            const [queueData, templateData] = await Promise.all([getTechQueue(), getTechChecklist()]);
            setQueue(queueData);
            setTemplate(templateData);
        } catch (e: any) {
            Alert.alert('Ошибка', e.message || 'Не удалось загрузить очередь');
        } finally {
            setLoading(false);
        }
    }

    function startInspection(item: QueueItem) {
        if (!template) {
            Alert.alert('Ошибка', 'Чек-лист не загружен');
            return;
        }
        setSelectedItem(item);
        setChecklist(
            template.items.map((t: ChecklistTemplate['items'][number]) => ({
                name: t.name,
                result: null,
                comment: '',
                photoUri: null,
                photoUrl: null,
            }))
        );
        setDecision(null);
        setDecisionComment('');
        setInspectionType('pre_trip');
        setStep('checklist');
    }

    function setItemResult(index: number, result: 'ok' | 'fault') {
        setChecklist((prev) => prev.map((item, i) => (i === index ? { ...item, result } : item)));
    }

    function setItemComment(index: number, comment: string) {
        setChecklist((prev) => prev.map((item, i) => (i === index ? { ...item, comment } : item)));
    }

    function openCamera(index: number) {
        if (!permission?.granted) {
            requestPermission();
            return;
        }
        setCurrentPhotoIndex(index);
        setStep('camera');
    }

    async function takePicture() {
        if (!cameraRef.current || currentPhotoIndex === null) return;
        // quality: 0.6 — снижает размер JPEG в ~2-3 раза без видимой потери для фото повреждений/неисправностей.
        // Критично на EDGE/3G: 5MB фото грузится ~30-60 сек, 1-1.5MB — 6-10 сек.
        const photo = await cameraRef.current.takePictureAsync({ quality: 0.6 });
        if (photo?.uri) {
            setChecklist((prev) =>
                prev.map((item, i) => (i === currentPhotoIndex ? { ...item, photoUri: photo.uri } : item))
            );
        }
        setStep('checklist');
        setCurrentPhotoIndex(null);
    }

    function allItemsAnswered() {
        return checklist.every((item) => item.result !== null);
    }

    function proceedToDecision() {
        if (!allItemsAnswered()) {
            Alert.alert('Внимание', 'Оцените все пункты чек-листа');
            return;
        }
        const hasFaults = checklist.some((item) => item.result === 'fault');
        setDecision(hasFaults ? 'rejected' : 'approved');
        setStep('decision');
    }

    function proceedToSignature() {
        if (!decision) {
            Alert.alert('Внимание', 'Выберите решение');
            return;
        }
        setStep('signature');
    }

    async function handleSignature(sig: string) {
        if (!selectedItem || !template) return;
        setSubmitting(true);
        try {
            const resolvedItems: TechInspectionItem[] = await Promise.all(
                checklist.map(async (item) => {
                    let photoUrl = item.photoUrl;
                    if (item.photoUri && !photoUrl) {
                        try {
                            photoUrl = await uploadPhoto(item.photoUri);
                        } catch {
                            photoUrl = item.photoUri;
                        }
                    }
                    return {
                        name: item.name,
                        result: item.result as 'ok' | 'fault',
                        comment: item.comment || undefined,
                        photoUrl: photoUrl || undefined,
                    };
                })
            );

            await submitTechInspection({
                vehicleId: selectedItem.vehicle.id,
                tripId: selectedItem.trip.id,
                inspectionType,
                checklistVersion: template.version,
                items: resolvedItems,
                decision: decision!,
                comment: decisionComment || undefined,
                signature: sig,
            });

            Alert.alert(
                decision === 'approved' ? 'ТС допущено' : 'ТС не допущено',
                decision === 'approved'
                    ? `${selectedItem.vehicle.plateNumber} — осмотр пройден`
                    : `${selectedItem.vehicle.plateNumber} — выявлены неисправности`,
                [
                    {
                        text: 'OK',
                        onPress: () => {
                            setStep('queue');
                            loadQueue();
                        },
                    },
                ]
            );
        } catch (e: any) {
            Alert.alert('Ошибка', e.message || 'Не удалось отправить результаты');
            setStep('decision');
        } finally {
            setSubmitting(false);
        }
    }

    // ── Queue ────────────────────────────────────────────
    if (step === 'queue') {
        return (
            <View style={styles.root}>
                <View style={styles.headerWrap}>
                    <Text style={styles.title}>Очередь техосмотра</Text>
                    <Pill
                        label={template ? `Чек-лист v${template.version}` : 'Загрузка...'}
                        tone="brand"
                        style={{ marginTop: spacing.sm }}
                    />
                </View>
                {loading ? (
                    <ActivityIndicator size="large" color={colors.brand[600]} style={{ marginTop: spacing.xxxl }} />
                ) : queue.length === 0 ? (
                    <EmptyState
                        title="Нет ТС, ожидающих осмотра"
                        description="Когда диспетчер назначит рейс с предрейсовым техосмотром, он появится здесь."
                        actionLabel="Обновить"
                        onAction={loadQueue}
                    />
                ) : (
                    <FlatList
                        data={queue}
                        keyExtractor={(item) => item.trip.id}
                        contentContainerStyle={{ padding: spacing.lg, paddingTop: 0 }}
                        renderItem={({ item }) => (
                            <TouchableOpacity
                                activeOpacity={0.85}
                                onPress={() => startInspection(item)}
                                disabled={!template}
                            >
                                <Card style={{ marginBottom: spacing.md }}>
                                    <View style={styles.queueCardHeader}>
                                        <Text style={styles.licensePlate}>{item.vehicle.plateNumber}</Text>
                                        <Pill label={`Рейс ${item.trip.number}`} tone="neutral" />
                                    </View>
                                    <Text style={styles.vehicleName}>
                                        {item.vehicle.make} {item.vehicle.model}
                                    </Text>
                                    {item.trip.plannedDepartureAt && (
                                        <Text style={styles.departureTime}>
                                            Отправление:{' '}
                                            {new Date(item.trip.plannedDepartureAt).toLocaleTimeString('ru-RU', {
                                                hour: '2-digit',
                                                minute: '2-digit',
                                            })}
                                        </Text>
                                    )}
                                    <Text style={styles.startInspection}>Начать осмотр →</Text>
                                </Card>
                            </TouchableOpacity>
                        )}
                        ListFooterComponent={
                            <Button
                                title="Обновить список"
                                variant="ghost"
                                size="md"
                                fullWidth
                                onPress={loadQueue}
                                style={{ marginTop: spacing.md }}
                            />
                        }
                    />
                )}
            </View>
        );
    }

    // ── Camera ───────────────────────────────────────────
    if (step === 'camera') {
        return (
            <View style={styles.cameraContainer}>
                <CameraView style={styles.camera} facing="back" ref={cameraRef}>
                    <SafeAreaView style={styles.cameraOverlay} edges={['top', 'bottom']}>
                        <View style={styles.cameraBottom}>
                            <TouchableOpacity
                                onPress={() => {
                                    setStep('checklist');
                                    setCurrentPhotoIndex(null);
                                }}
                            >
                                <Text style={styles.cameraCancel}>Отмена</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.captureButton} onPress={takePicture}>
                                <View style={styles.captureInner} />
                            </TouchableOpacity>
                            <View style={{ width: 70 }} />
                        </View>
                    </SafeAreaView>
                </CameraView>
            </View>
        );
    }

    // ── Signature ────────────────────────────────────────
    if (step === 'signature') {
        return (
            <View style={styles.root}>
                <View style={styles.headerWrap}>
                    <Text style={styles.title}>Подпись механика</Text>
                    <Text style={styles.subtitle}>ПЭП — простая электронная подпись</Text>
                    <ProgressSteps total={3} activeIndex={2} labels={['Чек-лист', 'Решение', 'Подпись']} style={{ marginTop: spacing.md }} />
                </View>
                {submitting ? (
                    <View style={styles.loadingOverlay}>
                        <ActivityIndicator size="large" color={colors.brand[600]} />
                        <Text style={styles.loadingText}>Отправка результатов...</Text>
                    </View>
                ) : (
                    <>
                        <View style={styles.signCanvas}>
                            <SignatureScreen
                                ref={signatureRef}
                                onOK={handleSignature}
                                onEmpty={() => Alert.alert('Пожалуйста, распишитесь')}
                                descriptionText="Подпись механика"
                                clearText="Очистить"
                                confirmText="Подписать и сохранить"
                                webStyle={`.m-signature-pad {box-shadow: none; border: none; margin: 0px;}`}
                            />
                        </View>
                        <View style={{ padding: spacing.lg }}>
                            <Button title="← Назад" variant="ghost" size="md" onPress={() => setStep('decision')} />
                        </View>
                    </>
                )}
            </View>
        );
    }

    // ── Decision ─────────────────────────────────────────
    if (step === 'decision') {
        const faults = checklist.filter((i) => i.result === 'fault');
        return (
            <ScrollView style={styles.root} contentContainerStyle={{ padding: spacing.lg }} keyboardShouldPersistTaps="handled">
                <Text style={styles.title}>Решение</Text>
                <Text style={styles.subtitle}>
                    {selectedItem?.vehicle.plateNumber} — {selectedItem?.vehicle.make} {selectedItem?.vehicle.model}
                </Text>
                <ProgressSteps total={3} activeIndex={1} labels={['Чек-лист', 'Решение', 'Подпись']} style={{ marginTop: spacing.md }} />

                {faults.length > 0 && (
                    <Card style={{ marginTop: spacing.lg, backgroundColor: colors.danger[50], borderColor: '#fecaca' }} elevation="none">
                        <Text style={styles.faultsTitle}>Выявленные неисправности:</Text>
                        {faults.map((item, idx) => (
                            <Text key={idx} style={styles.faultItem}>
                                • {item.name}
                                {item.comment ? `: ${item.comment}` : ''}
                            </Text>
                        ))}
                    </Card>
                )}

                <Text style={styles.label}>Решение</Text>
                <View style={styles.decisionRow}>
                    <TouchableOpacity
                        style={[
                            styles.decisionButton,
                            decision === 'approved' && {
                                backgroundColor: colors.success[50],
                                borderColor: colors.success[500],
                            },
                        ]}
                        onPress={() => setDecision('approved')}
                        activeOpacity={0.85}
                    >
                        <Text style={[styles.decisionText, decision === 'approved' && { color: colors.success[700] }]}>
                            Допустить
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[
                            styles.decisionButton,
                            decision === 'rejected' && {
                                backgroundColor: colors.danger[50],
                                borderColor: colors.danger[500],
                            },
                        ]}
                        onPress={() => setDecision('rejected')}
                        activeOpacity={0.85}
                    >
                        <Text style={[styles.decisionText, decision === 'rejected' && { color: colors.danger[700] }]}>
                            Не допускать
                        </Text>
                    </TouchableOpacity>
                </View>

                <Text style={styles.label}>Комментарий (необязательно)</Text>
                <TextInput
                    style={styles.input}
                    multiline
                    numberOfLines={3}
                    placeholder="Дополнительные замечания..."
                    placeholderTextColor={colors.neutral[400]}
                    value={decisionComment}
                    onChangeText={setDecisionComment}
                />

                <Button
                    title="Перейти к подписи →"
                    variant="primary"
                    size="lg"
                    fullWidth
                    onPress={proceedToSignature}
                    disabled={!decision}
                    style={{ marginTop: spacing.lg }}
                />
                <Button
                    title="← Назад к чек-листу"
                    variant="ghost"
                    size="md"
                    fullWidth
                    onPress={() => setStep('checklist')}
                    style={{ marginTop: spacing.sm }}
                />
            </ScrollView>
        );
    }

    // ── Checklist ────────────────────────────────────────
    const progress = checklist.filter((i) => i.result !== null).length;
    return (
        <ScrollView style={styles.root} contentContainerStyle={{ padding: spacing.lg }} keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>Техосмотр</Text>
            <Text style={styles.subtitle}>
                {selectedItem?.vehicle.plateNumber} — {selectedItem?.vehicle.make} {selectedItem?.vehicle.model}
            </Text>
            <Text style={styles.tripLabel}>Рейс {selectedItem?.trip.number}</Text>
            <ProgressSteps total={3} activeIndex={0} labels={['Чек-лист', 'Решение', 'Подпись']} style={{ marginTop: spacing.md }} />

            <Text style={styles.label}>Тип осмотра</Text>
            <View style={styles.resultRow}>
                <TouchableOpacity
                    style={[styles.resultButton, inspectionType === 'pre_trip' && styles.resultOk]}
                    onPress={() => setInspectionType('pre_trip')}
                    activeOpacity={0.85}
                >
                    <Text
                        style={[
                            styles.resultText,
                            inspectionType === 'pre_trip' && { color: colors.success[700], fontWeight: '700' },
                        ]}
                    >
                        Предрейсовый
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.resultButton, inspectionType === 'periodic' && styles.resultOk]}
                    onPress={() => setInspectionType('periodic')}
                    activeOpacity={0.85}
                >
                    <Text
                        style={[
                            styles.resultText,
                            inspectionType === 'periodic' && { color: colors.success[700], fontWeight: '700' },
                        ]}
                    >
                        Периодический
                    </Text>
                </TouchableOpacity>
            </View>

            {checklist.map((item, index) => {
                const isFault = item.result === 'fault';
                const isOk = item.result === 'ok';
                return (
                    <Card key={index} style={{ marginTop: spacing.md }} elevation="none">
                        <Text style={styles.checklistName}>
                            {index + 1}. {item.name}
                        </Text>
                        <View style={styles.resultRow}>
                            <TouchableOpacity
                                style={[styles.resultButton, isOk && styles.resultOk]}
                                onPress={() => setItemResult(index, 'ok')}
                                activeOpacity={0.85}
                            >
                                <Text style={[styles.resultText, isOk && { color: colors.success[700], fontWeight: '700' }]}>
                                    OK
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.resultButton, isFault && styles.resultFault]}
                                onPress={() => setItemResult(index, 'fault')}
                                activeOpacity={0.85}
                            >
                                <Text style={[styles.resultText, isFault && { color: colors.danger[700], fontWeight: '700' }]}>
                                    Не ОК
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.photoButton, item.photoUri && styles.photoButtonDone]}
                                onPress={() => openCamera(index)}
                                activeOpacity={0.85}
                            >
                                <Text style={styles.photoButtonText}>{item.photoUri ? 'Фото готово' : 'Фото'}</Text>
                            </TouchableOpacity>
                        </View>
                        {isFault && (
                            <TextInput
                                style={styles.commentInput}
                                placeholder="Описание неисправности..."
                                placeholderTextColor={colors.neutral[400]}
                                value={item.comment}
                                onChangeText={(text) => setItemComment(index, text)}
                            />
                        )}
                    </Card>
                );
            })}

            <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${(progress / checklist.length) * 100}%` }]} />
            </View>
            <Text style={styles.progressText}>
                {progress} / {checklist.length} пунктов
            </Text>

            <Button
                title="Перейти к решению →"
                variant="primary"
                size="lg"
                fullWidth
                onPress={proceedToDecision}
                disabled={!allItemsAnswered()}
                style={{ marginTop: spacing.md }}
            />
            <Button
                title="← Отмена"
                variant="ghost"
                size="md"
                fullWidth
                onPress={() => setStep('queue')}
                style={{ marginTop: spacing.sm }}
            />
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.neutral[50] },
    headerWrap: { padding: spacing.lg },
    title: { ...typography.title, color: colors.neutral[900] },
    subtitle: { ...typography.body, color: colors.neutral[600], marginTop: 4 },
    tripLabel: { fontSize: 13, color: colors.neutral[400], marginTop: 2 },
    label: {
        ...typography.captionBold,
        color: colors.neutral[700],
        marginTop: spacing.lg,
        marginBottom: spacing.sm,
    },

    queueCardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 4,
    },
    licensePlate: { fontSize: 20, fontWeight: '700', color: colors.neutral[900], letterSpacing: 1 },
    vehicleName: { fontSize: 14, color: colors.neutral[600], marginTop: 4 },
    departureTime: { fontSize: 13, color: colors.neutral[500], marginTop: 6 },
    startInspection: { fontSize: 14, color: colors.brand[600], fontWeight: '700', marginTop: spacing.sm },

    checklistName: { ...typography.bodyBold, color: colors.neutral[900], marginBottom: spacing.sm },
    resultRow: { flexDirection: 'row', gap: spacing.sm },
    resultButton: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: radius.md,
        borderWidth: 1.5,
        borderColor: colors.neutral[200],
        alignItems: 'center',
        backgroundColor: colors.white,
    },
    resultOk: { backgroundColor: colors.success[50], borderColor: colors.success[500] },
    resultFault: { backgroundColor: colors.danger[50], borderColor: colors.danger[500] },
    resultText: { fontSize: 14, fontWeight: '600', color: colors.neutral[600] },

    photoButton: {
        width: 48,
        height: 48,
        borderRadius: radius.md,
        borderWidth: 1.5,
        borderColor: colors.neutral[200],
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.white,
    },
    photoButtonDone: { borderColor: colors.brand[500], backgroundColor: colors.brand[50] },
    photoButtonText: { fontSize: 18 },

    commentInput: {
        marginTop: spacing.sm,
        borderWidth: 1,
        borderColor: '#fca5a5',
        borderRadius: radius.md,
        padding: spacing.sm,
        fontSize: 14,
        backgroundColor: colors.white,
        color: colors.neutral[900],
    },

    progressBar: {
        height: 8,
        backgroundColor: colors.neutral[200],
        borderRadius: radius.pill,
        marginTop: spacing.lg,
        marginBottom: spacing.xs,
        overflow: 'hidden',
    },
    progressFill: { height: '100%', backgroundColor: colors.brand[600], borderRadius: radius.pill },
    progressText: {
        fontSize: 12,
        color: colors.neutral[500],
        textAlign: 'center',
        marginBottom: spacing.md,
    },

    faultsTitle: { fontSize: 14, fontWeight: '700', color: colors.danger[700], marginBottom: 6 },
    faultItem: { fontSize: 13, color: colors.danger[700], marginBottom: 2 },

    decisionRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.sm },
    decisionButton: {
        flex: 1,
        paddingVertical: 18,
        borderRadius: radius.lg,
        borderWidth: 2,
        borderColor: colors.neutral[200],
        backgroundColor: colors.white,
        alignItems: 'center',
    },
    decisionText: { fontSize: 16, fontWeight: '700', color: colors.neutral[600] },

    input: {
        borderWidth: 1,
        borderColor: colors.neutral[200],
        borderRadius: radius.md,
        padding: spacing.md,
        fontSize: 15,
        textAlignVertical: 'top',
        minHeight: 80,
        backgroundColor: colors.white,
        color: colors.neutral[900],
    },

    signCanvas: {
        flex: 1,
        marginHorizontal: spacing.lg,
        backgroundColor: colors.white,
        borderRadius: radius.lg,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: colors.neutral[200],
    },

    loadingOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.md },
    loadingText: { fontSize: 16, color: colors.neutral[600] },

    cameraContainer: { flex: 1, backgroundColor: colors.black },
    camera: { flex: 1 },
    cameraOverlay: {
        flex: 1,
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingBottom: spacing.xxl,
    },
    cameraBottom: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        paddingHorizontal: spacing.xxl,
    },
    cameraCancel: { color: colors.white, fontSize: 15, fontWeight: '600' },
    captureButton: {
        width: 78,
        height: 78,
        borderRadius: 39,
        backgroundColor: 'rgba(255,255,255,0.25)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 4,
        borderColor: colors.white,
    },
    captureInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: colors.white },
});
