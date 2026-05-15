import React, { useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import SignatureScreen, { SignatureViewRef } from 'react-native-signature-canvas';
import NetInfo from '@react-native-community/netinfo';
import { RootStackParamList } from '../navigation/AppNavigator';
import { uploadPhoto } from '../api/upload';
import { enqueueAction } from '../api/offlineQueue';
import { useAuth } from '../context/AuthContext';
import { DeliveryCondition, DeliveryConfirmationV2Body } from '../api/trips';
import { Button, Card, Pill, ProgressSteps } from '../components/ui';
import { colors, radius, spacing, typography } from '../theme/tokens';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000/api';

type Props = NativeStackScreenProps<RootStackParamList, 'DeliveryConfirmation'>;
type CargoCondition = 'intact' | 'damaged' | 'partial';
type WizardStep = 'photo' | 'signature' | 'details';

const CONDITION_MAP: Record<CargoCondition, DeliveryCondition> = {
    intact: 'ok',
    partial: 'short',
    damaged: 'damaged',
};

const CONDITIONS: { value: CargoCondition; label: string; tone: 'success' | 'warning' | 'danger' }[] = [
    { value: 'intact', label: 'Принят полностью', tone: 'success' },
    { value: 'partial', label: 'Частичная недостача', tone: 'warning' },
    { value: 'damaged', label: 'Повреждение / отказ', tone: 'danger' },
];

interface EvidenceMeta {
    capturedAt: string;
    gpsLat?: number;
    gpsLng?: number;
}

const STEP_LABELS = ['Фото', 'Подпись', 'Детали'];

export default function DeliveryConfirmationScreen({ route, navigation }: Props) {
    const { tripId } = route.params;
    const { token } = useAuth();
    const [permission, requestPermission] = useCameraPermissions();
    const [step, setStep] = useState<WizardStep>('photo');
    const [cameraOpen, setCameraOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [recipientName, setRecipientName] = useState('');
    const [recipientPosition, setRecipientPosition] = useState('');
    const [recipientDocument, setRecipientDocument] = useState('');
    const [cargoCondition, setCargoCondition] = useState<CargoCondition>('intact');
    const [notes, setNotes] = useState('');
    const [photoUri, setPhotoUri] = useState<string | null>(null);
    const [evidenceMeta, setEvidenceMeta] = useState<EvidenceMeta | null>(null);
    const [signature, setSignature] = useState<string | null>(null);

    const cameraRef = useRef<CameraView>(null);
    const signatureRef = useRef<SignatureViewRef>(null);

    const stepIndex = step === 'photo' ? 0 : step === 'signature' ? 1 : 2;

    const captureEvidenceMeta = async (): Promise<EvidenceMeta> => {
        const capturedAt = new Date().toISOString();
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') return { capturedAt };
            const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            return { capturedAt, gpsLat: position.coords.latitude, gpsLng: position.coords.longitude };
        } catch {
            return { capturedAt };
        }
    };

    const openCamera = async () => {
        if (!permission?.granted) {
            const next = await requestPermission();
            if (!next.granted) {
                Alert.alert('Нужен доступ к камере', 'Без камеры нельзя приложить фото подтверждения.');
                return;
            }
        }
        setCameraOpen(true);
    };

    const takePicture = async () => {
        if (!cameraRef.current) return;
        // quality: 0.6 — снижает размер JPEG в ~2-3 раза без видимой потери для документов/фото подтверждений.
        // Критично на EDGE/3G: 5MB фото грузится ~30-60 сек, 1-1.5MB — 6-10 сек.
        const photo = await cameraRef.current.takePictureAsync({ quality: 0.6 });
        setPhotoUri(photo?.uri || null);
        setEvidenceMeta(await captureEvidenceMeta());
        setCameraOpen(false);
    };

    const submitConfirmation = async () => {
        if (!recipientName.trim()) {
            Alert.alert('Ошибка', 'Укажите ФИО получателя.');
            return;
        }
        if (cargoCondition !== 'intact' && !notes.trim()) {
            Alert.alert('Ошибка', 'Опишите состояние груза при расхождениях.');
            return;
        }

        setLoading(true);
        try {
            const netState = await NetInfo.fetch();
            const isOnline = Boolean(netState.isConnected && netState.isInternetReachable);
            let photoUrl: string | null = null;
            let shouldQueue = !isOnline;
            if (photoUri && isOnline) {
                try {
                    photoUrl = await uploadPhoto(photoUri);
                } catch {
                    photoUrl = photoUri;
                    shouldQueue = true;
                }
            } else if (photoUri) {
                photoUrl = photoUri;
            }

            const recipientNotes = [
                recipientPosition ? `Должность: ${recipientPosition}` : null,
                recipientDocument ? `Документ: ${recipientDocument}` : null,
                notes || null,
                evidenceMeta?.gpsLat != null && evidenceMeta?.gpsLng != null
                    ? `GPS: ${evidenceMeta.gpsLat.toFixed(5)}, ${evidenceMeta.gpsLng.toFixed(5)}`
                    : null,
            ]
                .filter(Boolean)
                .join('\n');

            const body: DeliveryConfirmationV2Body & { photos?: string[] } = {
                signedByName: recipientName,
                signatureDataUrl: signature || '',
                photoUrls: photoUrl ? [photoUrl] : [],
                condition: CONDITION_MAP[cargoCondition],
                notes: recipientNotes || undefined,
            };

            if (shouldQueue) {
                const queuedBody = { ...body, photos: photoUri ? [photoUri] : [] };
                await enqueueAction({
                    type: 'delivery_confirmation',
                    endpoint: `/trips/${tripId}/delivery-confirmation/v2`,
                    method: 'POST',
                    body: queuedBody,
                });
                Alert.alert(
                    'Сохранено в очередь',
                    'Подтверждение уйдёт автоматически, когда связь и загрузка будут доступны.',
                    [{ text: 'OK', onPress: () => navigation.navigate('TripList') }]
                );
                return;
            }

            const res = await fetch(`${API_URL}/trips/${tripId}/delivery-confirmation/v2`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Ошибка сервера');

            Alert.alert('Доставка подтверждена', 'Рейс успешно завершён.', [
                { text: 'OK', onPress: () => navigation.navigate('TripList') },
            ]);
        } catch (error: any) {
            Alert.alert('Ошибка', error?.message || 'Не удалось отправить подтверждение.');
        } finally {
            setLoading(false);
        }
    };

    // Camera overlay
    if (cameraOpen) {
        return (
            <View style={styles.cameraContainer}>
                <CameraView style={styles.camera} facing="back" ref={cameraRef}>
                    <SafeAreaView style={styles.cameraOverlay} edges={['top', 'bottom']}>
                        <View style={styles.cameraHintBox}>
                            <Text style={styles.cameraHint}>Сфотографируйте выгруженный груз</Text>
                        </View>
                        <View style={styles.cameraBottom}>
                            <TouchableOpacity onPress={() => setCameraOpen(false)}>
                                <Text style={styles.cameraCancel}>Отмена</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.captureButton} onPress={takePicture}>
                                <View style={styles.captureInner} />
                            </TouchableOpacity>
                            <View style={{ width: 60 }} />
                        </View>
                    </SafeAreaView>
                </CameraView>
            </View>
        );
    }

    const renderHeader = () => (
        <View style={styles.headerWrap}>
            <Text style={styles.title}>Подтверждение доставки</Text>
            <ProgressSteps total={3} activeIndex={stepIndex} labels={STEP_LABELS} style={{ marginTop: spacing.md }} />
        </View>
    );

    const renderFooter = () => (
        <View style={styles.footer}>
            <Button
                title="← Назад"
                variant="ghost"
                size="md"
                onPress={() => {
                    if (step === 'photo') navigation.goBack();
                    else if (step === 'signature') setStep('photo');
                    else setStep('signature');
                }}
                disabled={loading}
            />
            {step === 'details' ? (
                <Button
                    title="Подтвердить доставку"
                    variant="success"
                    size="lg"
                    onPress={submitConfirmation}
                    isLoading={loading}
                />
            ) : (
                <Button
                    title="Дальше →"
                    variant="primary"
                    size="lg"
                    onPress={() => {
                        if (step === 'photo') {
                            setStep('signature');
                        } else if (step === 'signature') {
                            if (!signature) {
                                Alert.alert('Подпись', 'Нажмите "Сохранить" в области подписи.');
                                return;
                            }
                            setStep('details');
                        }
                    }}
                    disabled={step === 'signature' && !signature}
                />
            )}
        </View>
    );

    // Step 1: PHOTO
    if (step === 'photo') {
        return (
            <View style={styles.root}>
                <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
                    {renderHeader()}
                    <Text style={styles.stepDesc}>
                        Сделайте фото выгруженного груза. Можно пропустить, но фото поможет в случае спора.
                    </Text>

                    {photoUri ? (
                        <View>
                            <Image source={{ uri: photoUri }} style={styles.photoLarge} />
                            <View style={styles.metaRow}>
                                {evidenceMeta?.capturedAt && (
                                    <Pill
                                        label={`${new Date(evidenceMeta.capturedAt).toLocaleTimeString('ru-RU', {
                                            hour: '2-digit',
                                            minute: '2-digit',
                                        })}`}
                                        tone="neutral"
                                    />
                                )}
                                {evidenceMeta?.gpsLat != null && (
                                    <Pill label="GPS захвачен" tone="success" />
                                )}
                            </View>
                            <Button
                                title="Переснять"
                                variant="secondary"
                                size="md"
                                fullWidth
                                onPress={() => void openCamera()}
                                style={{ marginTop: spacing.md }}
                            />
                        </View>
                    ) : (
                        <TouchableOpacity activeOpacity={0.85} onPress={() => void openCamera()}>
                            <View style={styles.photoEmpty}>
                                <Text style={styles.photoEmptyText}>Нажмите, чтобы сделать фото</Text>
                                <Text style={styles.photoEmptyHint}>до 5 фотографий</Text>
                            </View>
                        </TouchableOpacity>
                    )}
                </ScrollView>
                {renderFooter()}
            </View>
        );
    }

    // Step 2: SIGNATURE
    if (step === 'signature') {
        return (
            <View style={styles.root}>
                <View style={styles.headerWrap}>
                    <Text style={styles.title}>Подтверждение доставки</Text>
                    <ProgressSteps total={3} activeIndex={1} labels={STEP_LABELS} style={{ marginTop: spacing.md }} />
                </View>
                <Text style={[styles.stepDesc, { paddingHorizontal: spacing.lg }]}>
                    Подпись получателя — нажмите "Сохранить" под областью подписи.
                </Text>
                <View style={styles.signCanvas}>
                    <SignatureScreen
                        ref={signatureRef}
                        onOK={(sig) => setSignature(sig)}
                        onEmpty={() => Alert.alert('Пожалуйста, распишитесь')}
                        descriptionText="Подпись"
                        clearText="Очистить"
                        confirmText="Сохранить"
                        webStyle=".m-signature-pad { box-shadow: none; border: none; margin: 0px; }"
                    />
                </View>
                {signature && (
                    <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.sm }}>
                        <Pill label="Подпись сохранена" tone="success" />
                    </View>
                )}
                {renderFooter()}
            </View>
        );
    }

    // Step 3: DETAILS
    return (
        <View style={styles.root}>
            <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
                {renderHeader()}

                <Text style={styles.label}>ФИО получателя *</Text>
                <TextInput
                    style={styles.input}
                    placeholder="Иванов Иван Иванович"
                    placeholderTextColor={colors.neutral[400]}
                    value={recipientName}
                    onChangeText={setRecipientName}
                />

                <Text style={styles.label}>Должность</Text>
                <TextInput
                    style={styles.input}
                    placeholder="Кладовщик, начальник склада"
                    placeholderTextColor={colors.neutral[400]}
                    value={recipientPosition}
                    onChangeText={setRecipientPosition}
                />

                <Text style={styles.label}>Документ</Text>
                <TextInput
                    style={styles.input}
                    placeholder="Доверенность №123 от 01.03.2026"
                    placeholderTextColor={colors.neutral[400]}
                    value={recipientDocument}
                    onChangeText={setRecipientDocument}
                />

                <Text style={styles.label}>Состояние груза *</Text>
                <View style={{ gap: spacing.sm }}>
                    {CONDITIONS.map((c) => {
                        const active = cargoCondition === c.value;
                        const borderColor =
                            c.tone === 'success'
                                ? colors.success[500]
                                : c.tone === 'warning'
                                ? colors.warning[500]
                                : colors.danger[500];
                        const bg =
                            c.tone === 'success'
                                ? colors.success[50]
                                : c.tone === 'warning'
                                ? colors.warning[50]
                                : colors.danger[50];
                        return (
                            <TouchableOpacity
                                key={c.value}
                                activeOpacity={0.85}
                                onPress={() => setCargoCondition(c.value)}
                            >
                                <Card
                                    elevation="none"
                                    style={{
                                        borderColor: active ? borderColor : colors.neutral[200],
                                        backgroundColor: active ? bg : colors.white,
                                        borderWidth: active ? 2 : 1,
                                    }}
                                >
                                    <View style={styles.condRow}>
                                        <View style={[styles.condDot, { backgroundColor: borderColor, opacity: active ? 1 : 0.3 }]} />
                                        <Text style={[styles.condText, active && { color: colors.neutral[900], fontWeight: '700' }]}>
                                            {c.label}
                                        </Text>
                                    </View>
                                </Card>
                            </TouchableOpacity>
                        );
                    })}
                </View>

                <Text style={styles.label}>
                    {cargoCondition === 'intact' ? 'Заметки' : 'Заметки * (обязательно)'}
                </Text>
                <TextInput
                    style={[styles.input, { minHeight: 100, textAlignVertical: 'top' }]}
                    multiline
                    placeholder={
                        cargoCondition === 'intact'
                            ? 'Дополнительные комментарии...'
                            : 'Опишите повреждения или недостачу...'
                    }
                    placeholderTextColor={colors.neutral[400]}
                    value={notes}
                    onChangeText={setNotes}
                />

                {loading && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md }}>
                        <ActivityIndicator size="small" color={colors.brand[600]} />
                        <Text style={styles.helper}>Отправка...</Text>
                    </View>
                )}
            </ScrollView>
            {renderFooter()}
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.neutral[50] },
    scroll: { padding: spacing.lg, paddingBottom: spacing.xxxl },
    headerWrap: { marginBottom: spacing.lg },
    title: { ...typography.title, color: colors.neutral[900] },
    stepDesc: { ...typography.body, color: colors.neutral[600], lineHeight: 22, marginBottom: spacing.lg },
    label: {
        ...typography.captionBold,
        color: colors.neutral[700],
        marginTop: spacing.md,
        marginBottom: 6,
    },
    helper: { fontSize: 13, color: colors.neutral[500] },
    input: {
        borderWidth: 1,
        borderColor: colors.neutral[200],
        borderRadius: radius.md,
        padding: spacing.md,
        fontSize: 15,
        backgroundColor: colors.white,
        color: colors.neutral[900],
    },

    photoEmpty: {
        backgroundColor: colors.white,
        borderRadius: radius.lg,
        borderWidth: 2,
        borderColor: colors.neutral[200],
        borderStyle: 'dashed',
        paddingVertical: spacing.xxxl,
        alignItems: 'center',
    },
    photoEmptyIcon: { fontSize: 48, marginBottom: spacing.md },
    photoEmptyText: { ...typography.bodyBold, color: colors.neutral[900] },
    photoEmptyHint: { fontSize: 12, color: colors.neutral[500], marginTop: 4 },
    photoLarge: {
        width: '100%',
        aspectRatio: 4 / 3,
        borderRadius: radius.lg,
        backgroundColor: colors.neutral[200],
    },
    metaRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, flexWrap: 'wrap' },

    signCanvas: {
        flex: 1,
        marginHorizontal: spacing.lg,
        marginTop: spacing.sm,
        backgroundColor: colors.white,
        borderRadius: radius.lg,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: colors.neutral[200],
    },

    condRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    condDot: { width: 16, height: 16, borderRadius: 8 },
    condText: { ...typography.bodyBold, color: colors.neutral[700], flex: 1 },

    footer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: spacing.lg,
        paddingBottom: spacing.xl,
        backgroundColor: colors.white,
        borderTopWidth: 1,
        borderTopColor: colors.neutral[100],
        gap: spacing.md,
    },

    cameraContainer: { flex: 1, backgroundColor: colors.black },
    camera: { flex: 1 },
    cameraOverlay: {
        flex: 1,
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: spacing.lg,
        paddingBottom: spacing.xxl,
    },
    cameraHintBox: {
        backgroundColor: colors.overlay.scrimDark,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.sm,
        borderRadius: radius.pill,
    },
    cameraHint: { color: colors.white, fontSize: 14, fontWeight: '600' },
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
