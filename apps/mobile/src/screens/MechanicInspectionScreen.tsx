// ============================================================
// MechanicInspectionScreen — Tech inspection flow for mechanics
// Steps: Queue → Checklist → Sign → Submit
// ============================================================
import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView,
    TextInput, Alert, ActivityIndicator, FlatList,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import SignatureScreen, { SignatureViewRef } from 'react-native-signature-canvas';
import { uploadPhoto } from '../api/upload';
import {
    getTechQueue, getTechChecklist,
    submitTechInspection,
    QueueItem, ChecklistTemplate, TechInspectionItem,
} from '../api/inspections';

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
            const [queueData, templateData] = await Promise.all([
                getTechQueue(),
                getTechChecklist(),
            ]);
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
        setStep('checklist');
    }

    function setItemResult(index: number, result: 'ok' | 'fault') {
        setChecklist(prev => prev.map((item, i) => i === index ? { ...item, result } : item));
    }

    function setItemComment(index: number, comment: string) {
        setChecklist(prev => prev.map((item, i) => i === index ? { ...item, comment } : item));
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
        const photo = await cameraRef.current.takePictureAsync();
        if (photo?.uri) {
            setChecklist(prev => prev.map((item, i) =>
                i === currentPhotoIndex ? { ...item, photoUri: photo.uri } : item
            ));
        }
        setStep('checklist');
        setCurrentPhotoIndex(null);
    }

    function allItemsAnswered() {
        return checklist.every(item => item.result !== null);
    }

    function proceedToDecision() {
        if (!allItemsAnswered()) {
            Alert.alert('Внимание', 'Оцените все пункты чек-листа');
            return;
        }
        const hasFaults = checklist.some(item => item.result === 'fault');
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
            // Upload any fault photos
            const resolvedItems: TechInspectionItem[] = await Promise.all(
                checklist.map(async (item) => {
                    let photoUrl = item.photoUrl;
                    if (item.photoUri && !photoUrl) {
                        try {
                            photoUrl = await uploadPhoto(item.photoUri);
                        } catch {
                            photoUrl = item.photoUri; // fallback
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
                inspectionType: 'pre_trip',
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
                [{ text: 'OK', onPress: () => { setStep('queue'); loadQueue(); } }]
            );
        } catch (e: any) {
            Alert.alert('Ошибка', e.message || 'Не удалось отправить результаты');
            setStep('decision');
        } finally {
            setSubmitting(false);
        }
    }

    // ── Queue screen ────────────────────────────────────────────
    if (step === 'queue') {
        return (
            <View style={styles.container}>
                <Text style={styles.title}>Очередь техосмотра</Text>
                {loading ? (
                    <ActivityIndicator size="large" color="#2563eb" style={{ marginTop: 40 }} />
                ) : queue.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyText}>Нет ТС, ожидающих осмотра</Text>
                        <TouchableOpacity style={styles.refreshButton} onPress={loadQueue}>
                            <Text style={styles.refreshText}>Обновить</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <>
                        <FlatList
                            data={queue}
                            keyExtractor={item => item.trip.id}
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    style={styles.queueCard}
                                    onPress={() => startInspection(item)}
                                    disabled={!template}
                                >
                                    <View style={styles.queueCardRow}>
                                        <Text style={styles.licensePlate}>{item.vehicle.plateNumber}</Text>
                                        <Text style={styles.tripNumber}>Рейс {item.trip.number}</Text>
                                    </View>
                                    <Text style={styles.vehicleName}>
                                        {item.vehicle.make} {item.vehicle.model}
                                    </Text>
                                    {item.trip.plannedDepartureAt && (
                                        <Text style={styles.departureTime}>
                                            Отправление: {new Date(item.trip.plannedDepartureAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                                        </Text>
                                    )}
                                    <Text style={styles.startInspection}>Начать осмотр →</Text>
                                </TouchableOpacity>
                            )}
                            contentContainerStyle={{ paddingBottom: 24 }}
                        />
                        <TouchableOpacity style={styles.refreshButton} onPress={loadQueue}>
                            <Text style={styles.refreshText}>Обновить список</Text>
                        </TouchableOpacity>
                    </>
                )}
            </View>
        );
    }

    // ── Camera screen ───────────────────────────────────────────
    if (step === 'camera') {
        return (
            <View style={styles.cameraContainer}>
                <CameraView style={styles.camera} facing="back" ref={cameraRef}>
                    <View style={styles.cameraButtons}>
                        <TouchableOpacity style={styles.captureButton} onPress={takePicture}>
                            <View style={styles.captureInner} />
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.cancelCameraButton}
                            onPress={() => { setStep('checklist'); setCurrentPhotoIndex(null); }}
                        >
                            <Text style={styles.cancelCameraText}>Отмена</Text>
                        </TouchableOpacity>
                    </View>
                </CameraView>
            </View>
        );
    }

    // ── Signature screen ────────────────────────────────────────
    if (step === 'signature') {
        return (
            <View style={styles.signatureContainer}>
                {submitting ? (
                    <View style={styles.loadingOverlay}>
                        <ActivityIndicator size="large" color="#2563eb" />
                        <Text style={styles.loadingText}>Отправка результатов...</Text>
                    </View>
                ) : (
                    <>
                        <Text style={styles.instructions}>Подпись механика (ПЭП)</Text>
                        <SignatureScreen
                            ref={signatureRef}
                            onOK={handleSignature}
                            onEmpty={() => Alert.alert('Пожалуйста, распишитесь')}
                            descriptionText="Подпись механика"
                            clearText="Очистить"
                            confirmText="Подписать и сохранить"
                            webStyle={`.m-signature-pad {box-shadow: none; border: none; margin: 0px;}`}
                        />
                        <TouchableOpacity
                            style={styles.backButton}
                            onPress={() => setStep('decision')}
                        >
                            <Text style={styles.backButtonText}>← Назад</Text>
                        </TouchableOpacity>
                    </>
                )}
            </View>
        );
    }

    // ── Decision screen ─────────────────────────────────────────
    if (step === 'decision') {
        return (
            <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
                <Text style={styles.title}>Решение</Text>
                <Text style={styles.subtitle}>
                    {selectedItem?.vehicle.plateNumber} — {selectedItem?.vehicle.make} {selectedItem?.vehicle.model}
                </Text>

                {checklist.filter(i => i.result === 'fault').length > 0 && (
                    <View style={styles.faultsBox}>
                        <Text style={styles.faultsTitle}>Выявленные неисправности:</Text>
                        {checklist.filter(i => i.result === 'fault').map((item, idx) => (
                            <Text key={idx} style={styles.faultItem}>• {item.name}{item.comment ? `: ${item.comment}` : ''}</Text>
                        ))}
                    </View>
                )}

                <Text style={styles.label}>Решение</Text>
                <View style={styles.decisionRow}>
                    <TouchableOpacity
                        style={[styles.decisionButton, decision === 'approved' && styles.decisionApproved]}
                        onPress={() => setDecision('approved')}
                    >
                        <Text style={[styles.decisionText, decision === 'approved' && styles.decisionTextActive]}>
                            ✓ Допустить
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.decisionButton, decision === 'rejected' && styles.decisionRejected]}
                        onPress={() => setDecision('rejected')}
                    >
                        <Text style={[styles.decisionText, decision === 'rejected' && styles.decisionTextActive]}>
                            ✕ Отказать
                        </Text>
                    </TouchableOpacity>
                </View>

                <Text style={styles.label}>Комментарий (необязательно)</Text>
                <TextInput
                    style={styles.input}
                    multiline
                    numberOfLines={3}
                    placeholder="Дополнительные замечания..."
                    value={decisionComment}
                    onChangeText={setDecisionComment}
                />

                <TouchableOpacity
                    style={[styles.primaryButton, !decision && styles.primaryButtonDisabled]}
                    onPress={proceedToSignature}
                    disabled={!decision}
                >
                    <Text style={styles.buttonText}>Перейти к подписи →</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.backButton} onPress={() => setStep('checklist')}>
                    <Text style={styles.backButtonText}>← Назад к чек-листу</Text>
                </TouchableOpacity>
            </ScrollView>
        );
    }

    // ── Checklist screen ────────────────────────────────────────
    return (
        <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>Техосмотр</Text>
            <Text style={styles.subtitle}>
                {selectedItem?.vehicle.plateNumber} — {selectedItem?.vehicle.make} {selectedItem?.vehicle.model}
            </Text>
            <Text style={styles.tripLabel}>Рейс {selectedItem?.trip.number}</Text>

            {checklist.map((item, index) => (
                <View key={index} style={styles.checklistItem}>
                    <Text style={styles.checklistName}>{index + 1}. {item.name}</Text>
                    <View style={styles.resultRow}>
                        <TouchableOpacity
                            style={[styles.resultButton, item.result === 'ok' && styles.resultOk]}
                            onPress={() => setItemResult(index, 'ok')}
                        >
                            <Text style={[styles.resultText, item.result === 'ok' && styles.resultTextActive]}>
                                ✓ OK
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.resultButton, item.result === 'fault' && styles.resultFault]}
                            onPress={() => setItemResult(index, 'fault')}
                        >
                            <Text style={[styles.resultText, item.result === 'fault' && styles.resultTextActive]}>
                                ✕ Неисправность
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.photoButton, item.photoUri && styles.photoButtonDone]}
                            onPress={() => openCamera(index)}
                        >
                            <Text style={styles.photoButtonText}>{item.photoUri ? '📷✓' : '📷'}</Text>
                        </TouchableOpacity>
                    </View>
                    {item.result === 'fault' && (
                        <TextInput
                            style={styles.commentInput}
                            placeholder="Описание неисправности..."
                            value={item.comment}
                            onChangeText={text => setItemComment(index, text)}
                        />
                    )}
                </View>
            ))}

            <View style={styles.progressBar}>
                <View style={[
                    styles.progressFill,
                    { width: `${(checklist.filter(i => i.result !== null).length / checklist.length) * 100}%` }
                ]} />
            </View>
            <Text style={styles.progressText}>
                {checklist.filter(i => i.result !== null).length} / {checklist.length} пунктов
            </Text>

            <TouchableOpacity
                style={[styles.primaryButton, !allItemsAnswered() && styles.primaryButtonDisabled]}
                onPress={proceedToDecision}
                disabled={!allItemsAnswered()}
            >
                <Text style={styles.buttonText}>Перейти к решению →</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.backButton} onPress={() => setStep('queue')}>
                <Text style={styles.backButtonText}>← Отмена</Text>
            </TouchableOpacity>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 16,
        backgroundColor: '#fff',
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 4,
        color: '#0f172a',
    },
    subtitle: {
        fontSize: 16,
        color: '#475569',
        marginBottom: 4,
    },
    tripLabel: {
        fontSize: 14,
        color: '#94a3b8',
        marginBottom: 24,
    },
    label: {
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 8,
        marginTop: 16,
        color: '#334155',
    },
    emptyState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 60,
    },
    emptyText: {
        fontSize: 16,
        color: '#64748b',
        marginBottom: 24,
    },
    queueCard: {
        backgroundColor: '#f8fafc',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#e2e8f0',
    },
    queueCardRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 4,
    },
    licensePlate: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#0f172a',
    },
    tripNumber: {
        fontSize: 14,
        color: '#64748b',
        alignSelf: 'center',
    },
    vehicleName: {
        fontSize: 14,
        color: '#475569',
        marginBottom: 4,
    },
    departureTime: {
        fontSize: 13,
        color: '#94a3b8',
        marginBottom: 8,
    },
    startInspection: {
        fontSize: 14,
        color: '#2563eb',
        fontWeight: '600',
    },
    refreshButton: {
        alignItems: 'center',
        padding: 12,
        marginVertical: 8,
    },
    refreshText: {
        color: '#2563eb',
        fontSize: 15,
    },
    checklistItem: {
        backgroundColor: '#f8fafc',
        borderRadius: 8,
        padding: 12,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: '#e2e8f0',
    },
    checklistName: {
        fontSize: 15,
        color: '#0f172a',
        marginBottom: 10,
        fontWeight: '500',
    },
    resultRow: {
        flexDirection: 'row',
        gap: 8,
    },
    resultButton: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 6,
        borderWidth: 1.5,
        borderColor: '#cbd5e1',
        alignItems: 'center',
    },
    resultOk: {
        backgroundColor: '#dcfce7',
        borderColor: '#16a34a',
    },
    resultFault: {
        backgroundColor: '#fee2e2',
        borderColor: '#dc2626',
    },
    resultText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#64748b',
    },
    resultTextActive: {
        color: '#0f172a',
    },
    photoButton: {
        width: 44,
        height: 44,
        borderRadius: 6,
        borderWidth: 1.5,
        borderColor: '#cbd5e1',
        alignItems: 'center',
        justifyContent: 'center',
    },
    photoButtonDone: {
        borderColor: '#2563eb',
        backgroundColor: '#eff6ff',
    },
    photoButtonText: {
        fontSize: 18,
    },
    commentInput: {
        marginTop: 8,
        borderWidth: 1,
        borderColor: '#fca5a5',
        borderRadius: 6,
        padding: 8,
        fontSize: 14,
        backgroundColor: '#fff',
        color: '#0f172a',
    },
    progressBar: {
        height: 6,
        backgroundColor: '#e2e8f0',
        borderRadius: 3,
        marginTop: 16,
        marginBottom: 4,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        backgroundColor: '#2563eb',
        borderRadius: 3,
    },
    progressText: {
        fontSize: 13,
        color: '#94a3b8',
        textAlign: 'center',
        marginBottom: 24,
    },
    primaryButton: {
        backgroundColor: '#2563eb',
        padding: 16,
        borderRadius: 8,
        alignItems: 'center',
        minHeight: 56,
        justifyContent: 'center',
        marginBottom: 12,
    },
    primaryButtonDisabled: {
        backgroundColor: '#93c5fd',
    },
    buttonText: {
        color: '#fff',
        fontSize: 17,
        fontWeight: '600',
    },
    backButton: {
        alignItems: 'center',
        padding: 12,
        marginBottom: 24,
    },
    backButtonText: {
        color: '#64748b',
        fontSize: 15,
    },
    faultsBox: {
        backgroundColor: '#fef2f2',
        borderRadius: 8,
        padding: 12,
        borderWidth: 1,
        borderColor: '#fecaca',
        marginBottom: 8,
    },
    faultsTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#991b1b',
        marginBottom: 6,
    },
    faultItem: {
        fontSize: 13,
        color: '#7f1d1d',
        marginBottom: 2,
    },
    decisionRow: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 8,
    },
    decisionButton: {
        flex: 1,
        paddingVertical: 16,
        borderRadius: 8,
        borderWidth: 2,
        borderColor: '#cbd5e1',
        alignItems: 'center',
    },
    decisionApproved: {
        backgroundColor: '#dcfce7',
        borderColor: '#16a34a',
    },
    decisionRejected: {
        backgroundColor: '#fee2e2',
        borderColor: '#dc2626',
    },
    decisionText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#64748b',
    },
    decisionTextActive: {
        color: '#0f172a',
    },
    input: {
        borderWidth: 1,
        borderColor: '#cbd5e1',
        borderRadius: 8,
        padding: 12,
        fontSize: 15,
        textAlignVertical: 'top',
        marginBottom: 8,
        minHeight: 80,
        backgroundColor: '#f8fafc',
    },
    cameraContainer: {
        flex: 1,
    },
    camera: {
        flex: 1,
    },
    cameraButtons: {
        flex: 1,
        flexDirection: 'column',
        backgroundColor: 'transparent',
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingBottom: 40,
        gap: 16,
    },
    captureButton: {
        width: 70,
        height: 70,
        borderRadius: 35,
        backgroundColor: 'rgba(255, 255, 255, 0.3)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    captureInner: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: '#fff',
    },
    cancelCameraButton: {
        backgroundColor: 'rgba(0,0,0,0.5)',
        paddingHorizontal: 24,
        paddingVertical: 10,
        borderRadius: 20,
    },
    cancelCameraText: {
        color: '#fff',
        fontSize: 15,
    },
    signatureContainer: {
        flex: 1,
        backgroundColor: '#f8fafc',
        padding: 16,
    },
    instructions: {
        fontSize: 18,
        fontWeight: '600',
        marginBottom: 16,
        textAlign: 'center',
        color: '#0f172a',
    },
    loadingOverlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 16,
    },
    loadingText: {
        fontSize: 16,
        color: '#475569',
    },
});


