import React, { useState, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    TextInput,
    ScrollView,
    Alert,
    ActivityIndicator,
    Image,
} from 'react-native';
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

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000/api';

type Props = NativeStackScreenProps<RootStackParamList, 'DeliveryConfirmation'>;
type CargoCondition = 'intact' | 'damaged' | 'partial';
type Step = 'form' | 'camera' | 'photoReview' | 'signature';
type SubmissionStatus = 'idle' | 'sending' | 'queued';

const CONDITION_MAP: Record<CargoCondition, DeliveryCondition> = {
    intact: 'ok',
    partial: 'short',
    damaged: 'damaged',
};

interface EvidenceMeta {
    capturedAt: string;
    gpsLat?: number;
    gpsLng?: number;
}

export default function DeliveryConfirmationScreen({ route, navigation }: Props) {
    const { tripId } = route.params;
    const { token } = useAuth();
    const [permission, requestPermission] = useCameraPermissions();
    const [step, setStep] = useState<Step>('form');
    const [loading, setLoading] = useState(false);
    const [recipientName, setRecipientName] = useState('');
    const [recipientPosition, setRecipientPosition] = useState('');
    const [recipientDocument, setRecipientDocument] = useState('');
    const [cargoCondition, setCargoCondition] = useState<CargoCondition>('intact');
    const [notes, setNotes] = useState('');
    const [photoUri, setPhotoUri] = useState<string | null>(null);
    const [evidenceMeta, setEvidenceMeta] = useState<EvidenceMeta | null>(null);
    const [submissionStatus, setSubmissionStatus] = useState<SubmissionStatus>('idle');

    const cameraRef = useRef<CameraView>(null);
    const signatureRef = useRef<SignatureViewRef>(null);

    const submissionStatusText =
        submissionStatus === 'queued'
            ? '\u0421\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u0435 \u0432 \u043e\u0447\u0435\u0440\u0435\u0434\u0438...'
            : '\u041e\u0442\u043f\u0440\u0430\u0432\u043a\u0430...';

    const captureEvidenceMeta = async (): Promise<EvidenceMeta> => {
        const capturedAt = new Date().toISOString();

        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                return { capturedAt };
            }

            const position = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Balanced,
            });

            return {
                capturedAt,
                gpsLat: position.coords.latitude,
                gpsLng: position.coords.longitude,
            };
        } catch {
            return { capturedAt };
        }
    };

    const takePicture = async () => {
        if (!cameraRef.current) {
            return;
        }

        const photo = await cameraRef.current.takePictureAsync();
        setPhotoUri(photo?.uri || null);
        setEvidenceMeta(await captureEvidenceMeta());
        setStep('photoReview');
    };

    const skipPhoto = async () => {
        setPhotoUri(null);
        setEvidenceMeta(await captureEvidenceMeta());
        setStep('signature');
    };

    const handleSignature = (sig: string) => {
        void submitConfirmation(photoUri, sig);
    };

    const submitConfirmation = async (photo: string | null, sig: string | null) => {
        setLoading(true);
        setSubmissionStatus('sending');

        try {
            const netState = await NetInfo.fetch();
            const isOnline = Boolean(netState.isConnected && netState.isInternetReachable);
            setSubmissionStatus(isOnline ? 'sending' : 'queued');

            let photoUrl: string | null = null;
            let shouldQueue = !isOnline;
            if (photo && isOnline) {
                try {
                    photoUrl = await uploadPhoto(photo);
                } catch {
                    photoUrl = photo;
                    shouldQueue = true;
                    setSubmissionStatus('queued');
                }
            } else if (photo) {
                photoUrl = photo;
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
                signatureDataUrl: sig || '',
                photoUrls: photoUrl ? [photoUrl] : [],
                condition: CONDITION_MAP[cargoCondition],
                notes: recipientNotes || undefined,
            };

            if (shouldQueue) {
                // For replay, keep raw local photo URI(s) under `photos` so the
                // offline queue can re-upload them on its way out, then convert
                // to `photoUrls` before POSTing.
                const queuedBody = {
                    ...body,
                    photos: photo ? [photo] : [],
                };
                await enqueueAction({
                    type: 'delivery_confirmation',
                    endpoint: `/trips/${tripId}/delivery-confirmation/v2`,
                    method: 'POST',
                    body: queuedBody,
                });
                Alert.alert(
                    '\u0421\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u043e \u0432 \u043e\u0447\u0435\u0440\u0435\u0434\u0438',
                    '\u0424\u043e\u0442\u043e \u0438 \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u0438\u0435 \u043e\u0441\u0442\u0430\u043d\u0443\u0442\u0441\u044f \u043d\u0430 \u044d\u0442\u043e\u043c \u0443\u0441\u0442\u0440\u043e\u0439\u0441\u0442\u0432\u0435 \u0438 \u043e\u0442\u043f\u0440\u0430\u0432\u044f\u0442\u0441\u044f \u0430\u0432\u0442\u043e\u043c\u0430\u0442\u0438\u0447\u0435\u0441\u043a\u0438, \u043a\u043e\u0433\u0434\u0430 \u0441\u0432\u044f\u0437\u044c \u0438 \u0437\u0430\u0433\u0440\u0443\u0437\u043a\u0430 \u0431\u0443\u0434\u0443\u0442 \u0434\u043e\u0441\u0442\u0443\u043f\u043d\u044b.',
                    [{ text: 'OK', onPress: () => navigation.navigate('TripList') }]
                );
                return;
            }

            const res = await fetch(`${API_URL}/trips/${tripId}/delivery-confirmation/v2`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(body),
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || '\u041e\u0448\u0438\u0431\u043a\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0430');
            }

            Alert.alert(
                '\u0414\u043e\u0441\u0442\u0430\u0432\u043a\u0430 \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u0430',
                '\u0420\u0435\u0439\u0441 \u0443\u0441\u043f\u0435\u0448\u043d\u043e \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043d.',
                [{ text: 'OK', onPress: () => navigation.navigate('TripList') }]
            );
        } catch (error: any) {
            setSubmissionStatus('idle');
            Alert.alert(
                '\u041e\u0448\u0438\u0431\u043a\u0430',
                error?.message || '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u0438\u0435 \u0434\u043e\u0441\u0442\u0430\u0432\u043a\u0438.'
            );
            setStep('form');
        } finally {
            setLoading(false);
        }
    };

    const validateAndProceed = async () => {
        if (!recipientName.trim()) {
            Alert.alert('\u041e\u0448\u0438\u0431\u043a\u0430', '\u0423\u043a\u0430\u0436\u0438\u0442\u0435 \u0424\u0418\u041e \u043f\u043e\u043b\u0443\u0447\u0430\u0442\u0435\u043b\u044f.');
            return;
        }

        if (cargoCondition !== 'intact' && !notes.trim()) {
            Alert.alert(
                '\u041e\u0448\u0438\u0431\u043a\u0430',
                '\u041e\u043f\u0438\u0448\u0438\u0442\u0435 \u0441\u043e\u0441\u0442\u043e\u044f\u043d\u0438\u0435 \u0433\u0440\u0443\u0437\u0430, \u0435\u0441\u043b\u0438 \u043e\u043d \u043f\u043e\u0432\u0440\u0435\u0436\u0434\u0435\u043d \u0438\u043b\u0438 \u043d\u0435\u043f\u043e\u043b\u043e\u043d.'
            );
            return;
        }

        if (!permission?.granted) {
            const nextPermission = await requestPermission();
            if (!nextPermission.granted) {
                Alert.alert(
                    '\u041d\u0443\u0436\u0435\u043d \u0434\u043e\u0441\u0442\u0443\u043f \u043a \u043a\u0430\u043c\u0435\u0440\u0435',
                    '\u0411\u0435\u0437 \u0434\u043e\u0441\u0442\u0443\u043f\u0430 \u043a \u043a\u0430\u043c\u0435\u0440\u0435 \u043d\u0435\u043b\u044c\u0437\u044f \u0441\u0434\u0435\u043b\u0430\u0442\u044c \u0444\u043e\u0442\u043e \u0434\u043b\u044f \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u0438\u044f.'
                );
                return;
            }
        }

        setStep('camera');
    };

    if (step === 'camera') {
        return (
            <View style={styles.cameraContainer}>
                <CameraView style={styles.camera} facing="back" ref={cameraRef}>
                    <View style={styles.cameraOverlay}>
                        <Text style={styles.cameraHint}>{'\u0421\u0444\u043e\u0442\u043e\u0433\u0440\u0430\u0444\u0438\u0440\u0443\u0439\u0442\u0435 \u0432\u044b\u0433\u0440\u0443\u0436\u0435\u043d\u043d\u044b\u0439 \u0433\u0440\u0443\u0437'}</Text>
                        <TouchableOpacity style={styles.captureButton} onPress={takePicture}>
                            <View style={styles.captureInner} />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.skipButton} onPress={() => void skipPhoto()}>
                            <Text style={styles.skipText}>{'\u041f\u0440\u043e\u043f\u0443\u0441\u0442\u0438\u0442\u044c \u0444\u043e\u0442\u043e'}</Text>
                        </TouchableOpacity>
                    </View>
                </CameraView>
            </View>
        );
    }

    if (step === 'photoReview') {
        const capturedTime = evidenceMeta?.capturedAt
            ? new Date(evidenceMeta.capturedAt).toLocaleString('ru-RU')
            : null;
        const hasGps = evidenceMeta?.gpsLat !== undefined && evidenceMeta?.gpsLng !== undefined;

        return (
            <ScrollView style={styles.container} contentContainerStyle={styles.reviewContent}>
                <Text style={styles.title}>{'\u0424\u043e\u0442\u043e \u0434\u043b\u044f \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u0438\u044f'}</Text>
                {photoUri && <Image source={{ uri: photoUri }} style={styles.photoPreview} />}
                <View style={styles.noticeBox}>
                    <Text style={styles.noticeTitle}>{'\u041b\u043e\u043a\u0430\u043b\u044c\u043d\u043e\u0435 \u0444\u043e\u0442\u043e'}</Text>
                    <Text style={styles.noticeText}>
                        {'\u0424\u043e\u0442\u043e \u0432\u0440\u0435\u043c\u0435\u043d\u043d\u043e \u0445\u0440\u0430\u043d\u0438\u0442\u0441\u044f \u043d\u0430 \u044d\u0442\u043e\u043c \u0443\u0441\u0442\u0440\u043e\u0439\u0441\u0442\u0432\u0435. \u0415\u0441\u043b\u0438 \u0441\u0432\u044f\u0437\u0438 \u043d\u0435 \u0431\u0443\u0434\u0435\u0442, \u043e\u043d\u043e \u0443\u0439\u0434\u0435\u0442 \u0432 \u043e\u0447\u0435\u0440\u0435\u0434\u044c \u0438 \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u0441\u044f \u043f\u0440\u0438 \u043f\u043e\u0432\u0442\u043e\u0440\u043d\u043e\u0439 \u043e\u0442\u043f\u0440\u0430\u0432\u043a\u0435.'}
                    </Text>
                </View>
                <View style={styles.metaBox}>
                    <Text style={styles.metaText}>
                        {capturedTime
                            ? `\u0412\u0440\u0435\u043c\u044f: ${capturedTime}`
                            : '\u0412\u0440\u0435\u043c\u044f: \u043d\u0435 \u0437\u0430\u0444\u0438\u043a\u0441\u0438\u0440\u043e\u0432\u0430\u043d\u043e'}
                    </Text>
                    <Text style={styles.metaText}>
                        {hasGps
                            ? `GPS: ${evidenceMeta?.gpsLat?.toFixed(5)}, ${evidenceMeta?.gpsLng?.toFixed(5)}`
                            : 'GPS: \u043d\u0435\u0442 \u0434\u043e\u0441\u0442\u0443\u043f\u0430 \u0438\u043b\u0438 \u0441\u0438\u0433\u043d\u0430\u043b\u0430'}
                    </Text>
                </View>
                <TouchableOpacity style={styles.primaryButton} onPress={() => setStep('signature')}>
                    <Text style={styles.buttonText}>{'\u0414\u0430\u043b\u0435\u0435: \u043f\u043e\u0434\u043f\u0438\u0441\u044c'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondaryButton} onPress={() => setStep('camera')}>
                    <Text style={styles.secondaryButtonText}>{'\u041f\u0435\u0440\u0435\u0441\u043d\u044f\u0442\u044c'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.textButton} onPress={() => void skipPhoto()}>
                    <Text style={styles.textButtonText}>{'\u041f\u0440\u043e\u043f\u0443\u0441\u0442\u0438\u0442\u044c \u0444\u043e\u0442\u043e'}</Text>
                </TouchableOpacity>
            </ScrollView>
        );
    }

    if (step === 'signature') {
        return (
            <View style={styles.signatureContainer}>
                <Text style={styles.signatureTitle}>{'\u041f\u043e\u0434\u043f\u0438\u0441\u044c \u043f\u043e\u043b\u0443\u0447\u0430\u0442\u0435\u043b\u044f'}</Text>
                <Text style={styles.signatureHint}>{recipientName}</Text>
                <SignatureScreen
                    ref={signatureRef}
                    onOK={handleSignature}
                    onEmpty={() => Alert.alert('\u041f\u043e\u0436\u0430\u043b\u0443\u0439\u0441\u0442\u0430, \u0440\u0430\u0441\u043f\u0438\u0448\u0438\u0442\u0435\u0441\u044c')}
                    descriptionText={'\u041f\u043e\u0434\u043f\u0438\u0441\u044c'}
                    clearText={'\u041e\u0447\u0438\u0441\u0442\u0438\u0442\u044c'}
                    confirmText={'\u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044c \u0434\u043e\u0441\u0442\u0430\u0432\u043a\u0443'}
                    webStyle=".m-signature-pad { box-shadow: none; border: none; margin: 0px; }"
                />
                {loading && (
                    <View style={styles.loadingOverlay}>
                        <ActivityIndicator size="large" color="#2563eb" />
                        <Text style={styles.loadingText}>{submissionStatusText}</Text>
                    </View>
                )}
            </View>
        );
    }

    const conditions: { value: CargoCondition; label: string; color: string }[] = [
        { value: 'intact', label: '\u0426\u0435\u043b\u044b\u0439', color: '#16a34a' },
        { value: 'partial', label: '\u0427\u0430\u0441\u0442\u0438\u0447\u043d\u0430\u044f \u043d\u0435\u0434\u043e\u0441\u0442\u0430\u0447\u0430', color: '#d97706' },
        { value: 'damaged', label: '\u041f\u043e\u0432\u0440\u0435\u0436\u0434\u0435\u043d', color: '#dc2626' },
    ];

    return (
        <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>{'\u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u0438\u0435 \u0434\u043e\u0441\u0442\u0430\u0432\u043a\u0438'}</Text>

            <Text style={styles.label}>{'\u0424\u0418\u041e \u043f\u043e\u043b\u0443\u0447\u0430\u0442\u0435\u043b\u044f *'}</Text>
            <TextInput
                style={styles.input}
                placeholder={'\u0418\u0432\u0430\u043d\u043e\u0432 \u0418\u0432\u0430\u043d \u0418\u0432\u0430\u043d\u043e\u0432\u0438\u0447'}
                value={recipientName}
                onChangeText={setRecipientName}
            />

            <Text style={styles.label}>{'\u0414\u043e\u043b\u0436\u043d\u043e\u0441\u0442\u044c'}</Text>
            <TextInput
                style={styles.input}
                placeholder={'\u041a\u043b\u0430\u0434\u043e\u0432\u0449\u0438\u043a, \u043d\u0430\u0447\u0430\u043b\u044c\u043d\u0438\u043a \u0441\u043a\u043b\u0430\u0434\u0430'}
                value={recipientPosition}
                onChangeText={setRecipientPosition}
            />

            <Text style={styles.label}>{'\u0414\u043e\u043a\u0443\u043c\u0435\u043d\u0442'}</Text>
            <TextInput
                style={styles.input}
                placeholder={'\u0414\u043e\u0432\u0435\u0440\u0435\u043d\u043d\u043e\u0441\u0442\u044c \u2116123 \u043e\u0442 01.03.2026'}
                value={recipientDocument}
                onChangeText={setRecipientDocument}
            />

            <Text style={styles.label}>{'\u0421\u043e\u0441\u0442\u043e\u044f\u043d\u0438\u0435 \u0433\u0440\u0443\u0437\u0430 *'}</Text>
            <View style={styles.conditionRow}>
                {conditions.map((condition) => (
                    <TouchableOpacity
                        key={condition.value}
                        style={[
                            styles.conditionBtn,
                            cargoCondition === condition.value && {
                                backgroundColor: condition.color,
                                borderColor: condition.color,
                            },
                        ]}
                        onPress={() => setCargoCondition(condition.value)}
                    >
                        <Text
                            style={[
                                styles.conditionText,
                                cargoCondition === condition.value && { color: '#fff' },
                            ]}
                        >
                            {condition.label}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            <Text style={styles.label}>
                {cargoCondition === 'intact'
                    ? '\u0417\u0430\u043c\u0435\u0442\u043a\u0438'
                    : '\u0417\u0430\u043c\u0435\u0442\u043a\u0438 * (\u043e\u0431\u044f\u0437\u0430\u0442\u0435\u043b\u044c\u043d\u043e \u043f\u0440\u0438 \u0440\u0430\u0441\u0445\u043e\u0436\u0434\u0435\u043d\u0438\u044f\u0445)'}
            </Text>
            <TextInput
                style={[styles.input, styles.textarea]}
                multiline
                numberOfLines={cargoCondition === 'intact' ? 3 : 4}
                placeholder={
                    cargoCondition === 'intact'
                        ? '\u0414\u043e\u043f\u043e\u043b\u043d\u0438\u0442\u0435\u043b\u044c\u043d\u044b\u0435 \u043a\u043e\u043c\u043c\u0435\u043d\u0442\u0430\u0440\u0438\u0438...'
                        : '\u041e\u043f\u0438\u0448\u0438\u0442\u0435 \u043f\u043e\u0432\u0440\u0435\u0436\u0434\u0435\u043d\u0438\u044f \u0438\u043b\u0438 \u043d\u0435\u0434\u043e\u0441\u0442\u0430\u0447\u0443...'
                }
                value={notes}
                onChangeText={setNotes}
            />

            <TouchableOpacity style={styles.primaryButton} onPress={() => void validateAndProceed()}>
                <Text style={styles.buttonText}>{'\u0414\u0430\u043b\u0435\u0435: \u0444\u043e\u0442\u043e \u0438 \u043f\u043e\u0434\u043f\u0438\u0441\u044c'}</Text>
            </TouchableOpacity>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 16, backgroundColor: '#fff' },
    title: { fontSize: 22, fontWeight: 'bold', marginBottom: 20, color: '#0f172a' },
    label: { fontSize: 15, fontWeight: '600', marginBottom: 6, color: '#334155' },
    input: {
        borderWidth: 1,
        borderColor: '#cbd5e1',
        borderRadius: 8,
        padding: 12,
        fontSize: 16,
        marginBottom: 16,
        backgroundColor: '#f8fafc',
    },
    textarea: { minHeight: 100, textAlignVertical: 'top' },
    conditionRow: { flexDirection: 'row', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
    conditionBtn: {
        borderWidth: 2,
        borderColor: '#cbd5e1',
        borderRadius: 8,
        paddingVertical: 10,
        paddingHorizontal: 14,
    },
    conditionText: { fontSize: 14, fontWeight: '600', color: '#374151' },
    reviewContent: { paddingBottom: 32 },
    photoPreview: {
        width: '100%',
        aspectRatio: 4 / 3,
        borderRadius: 8,
        backgroundColor: '#e2e8f0',
        marginBottom: 16,
    },
    noticeBox: {
        borderWidth: 1,
        borderColor: '#fde68a',
        borderRadius: 8,
        backgroundColor: '#fffbeb',
        padding: 12,
        marginBottom: 12,
    },
    noticeTitle: { fontSize: 15, fontWeight: '700', color: '#92400e', marginBottom: 4 },
    noticeText: { fontSize: 14, lineHeight: 20, color: '#78350f' },
    metaBox: {
        borderWidth: 1,
        borderColor: '#cbd5e1',
        borderRadius: 8,
        backgroundColor: '#f8fafc',
        padding: 12,
        marginBottom: 8,
    },
    metaText: { fontSize: 14, color: '#475569', marginBottom: 4 },
    primaryButton: {
        backgroundColor: '#2563eb',
        padding: 16,
        borderRadius: 8,
        alignItems: 'center',
        marginTop: 8,
        marginBottom: 32,
    },
    buttonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
    secondaryButton: {
        borderWidth: 1,
        borderColor: '#2563eb',
        padding: 14,
        borderRadius: 8,
        alignItems: 'center',
        marginTop: 8,
    },
    secondaryButtonText: { color: '#2563eb', fontSize: 16, fontWeight: '700' },
    textButton: { padding: 14, alignItems: 'center', marginTop: 4 },
    textButtonText: { color: '#475569', fontSize: 15, fontWeight: '600' },
    cameraContainer: { flex: 1 },
    camera: { flex: 1 },
    cameraOverlay: {
        flex: 1,
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingBottom: 40,
        backgroundColor: 'transparent',
    },
    cameraHint: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 24,
        textAlign: 'center',
        backgroundColor: 'rgba(0,0,0,0.5)',
        padding: 8,
        borderRadius: 6,
    },
    captureButton: {
        width: 72,
        height: 72,
        borderRadius: 36,
        backgroundColor: 'rgba(255,255,255,0.3)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    captureInner: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#fff' },
    skipButton: { paddingVertical: 8, paddingHorizontal: 20 },
    skipText: { color: '#fff', fontSize: 15, textDecorationLine: 'underline' },
    signatureContainer: { flex: 1, backgroundColor: '#f8fafc', padding: 16 },
    signatureTitle: { fontSize: 20, fontWeight: 'bold', textAlign: 'center', marginBottom: 4 },
    signatureHint: { fontSize: 15, color: '#64748b', textAlign: 'center', marginBottom: 16 },
    loadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(255,255,255,0.85)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: { marginTop: 12, fontSize: 16, color: '#334155' },
});
