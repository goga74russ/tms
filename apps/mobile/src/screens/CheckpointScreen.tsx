import React, { useEffect, useRef, useState } from 'react';
import {
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
import SignatureScreen, { SignatureViewRef } from 'react-native-signature-canvas';
import NetInfo from '@react-native-community/netinfo';
import { RootStackParamList } from '../navigation/AppNavigator';
import { uploadPhoto } from '../api/upload';
import { enqueueAction } from '../api/offlineQueue';
import { useAuth } from '../context/AuthContext';
import { Button, Pill } from '../components/ui';
import { colors, radius, spacing, typography } from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'Checkpoint'>;
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000/api';

export default function CheckpointScreen({ route, navigation }: Props) {
    const { tripId, routePointId } = route.params;
    const { token } = useAuth();
    const [permission, requestPermission] = useCameraPermissions();
    const [step, setStep] = useState<'details' | 'camera' | 'photoReview' | 'signature'>('details');
    const [notes, setNotes] = useState('');
    const [photoUri, setPhotoUri] = useState<string | null>(null);
    const [online, setOnline] = useState<boolean | null>(null);

    const cameraRef = useRef<CameraView>(null);
    const signatureRef = useRef<SignatureViewRef>(null);

    useEffect(() => {
        const unsub = NetInfo.addEventListener((s) => {
            setOnline(Boolean(s.isConnected && s.isInternetReachable));
        });
        return () => unsub();
    }, []);

    if (!permission) return <View />;

    if (!permission.granted) {
        return (
            <View style={styles.permissionWrap}>
                <Text style={styles.permTitle}>Доступ к камере</Text>
                <Text style={styles.permDesc}>
                    Для подтверждения точки маршрута нужно сфотографировать груз или место разгрузки.
                </Text>
                <Button title="Разрешить доступ" variant="primary" size="lg" fullWidth onPress={requestPermission} />
            </View>
        );
    }

    const takePicture = async () => {
        if (!cameraRef.current) return;
        const photo = await cameraRef.current.takePictureAsync();
        setPhotoUri(photo?.uri || null);
        setStep('photoReview');
    };

    const handleSignature = (sig: string) => {
        void saveCheckpoint(photoUri, sig);
    };

    const enqueueCheckpoint = async (body: any) => {
        await enqueueAction({
            type: 'checkpoint_confirm',
            endpoint: '/sync/events',
            method: 'POST',
            body,
        });
    };

    const saveCheckpoint = async (photo: string | null, sig: string | null) => {
        try {
            const netState = await NetInfo.fetch();
            const isOnline = Boolean(netState.isConnected && netState.isInternetReachable && token);
            let photoUrl: string | null = null;
            let requiresReplay = !isOnline;

            if (photo && isOnline) {
                try {
                    photoUrl = await uploadPhoto(photo);
                } catch {
                    photoUrl = photo;
                    requiresReplay = true;
                }
            } else if (photo) {
                photoUrl = photo;
            }

            const body = {
                events: [
                    {
                        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                        type: 'route_point_completed',
                        timestamp: new Date().toISOString(),
                        payload: {
                            tripId,
                            pointId: routePointId,
                            photoUrls: photoUrl ? [photoUrl] : [],
                            signatureUrl: sig,
                            notes,
                        },
                    },
                ],
            };

            if (requiresReplay) {
                await enqueueCheckpoint(body);
                Alert.alert('Точка подтверждена', 'Данные попали в очередь и уйдут при восстановлении связи.');
                navigation.goBack();
                return;
            }

            const res = await fetch(`${API_URL}/sync/events`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(body),
            });

            if (!res.ok) {
                await enqueueCheckpoint(body);
                Alert.alert('Точка сохранена', 'Сервер не принял событие, повторим при восстановлении связи.');
                navigation.goBack();
                return;
            }

            Alert.alert('Успешно', 'Точка подтверждена');
            navigation.goBack();
        } catch {
            Alert.alert('Ошибка', 'Не удалось сохранить точку.');
        }
    };

    if (step === 'camera') {
        return (
            <View style={styles.cameraContainer}>
                <CameraView style={styles.camera} facing="back" ref={cameraRef}>
                    <SafeAreaView style={styles.cameraOverlay} edges={['top', 'bottom']}>
                        <TouchableOpacity style={styles.cameraClose} onPress={() => setStep('details')}>
                            <Text style={styles.cameraCloseText}>×</Text>
                        </TouchableOpacity>
                        <View style={styles.cameraHintBox}>
                            <Text style={styles.cameraHint}>Сфотографируйте груз / точку выгрузки</Text>
                        </View>
                        <TouchableOpacity style={styles.captureButton} onPress={takePicture}>
                            <View style={styles.captureInner} />
                        </TouchableOpacity>
                    </SafeAreaView>
                </CameraView>
            </View>
        );
    }

    if (step === 'photoReview') {
        return (
            <ScrollView style={styles.scroll} contentContainerStyle={{ padding: spacing.lg }}>
                <Text style={styles.h1}>Проверьте фото</Text>
                <Text style={styles.helper}>
                    Если номер, груз или повреждение плохо видны, сделайте фото заново до подписи.
                </Text>
                {photoUri ? (
                    <Image source={{ uri: photoUri }} style={styles.photoPreview} />
                ) : (
                    <View style={styles.noPhotoBox}>
                        <Text style={styles.noPhotoText}>Фото не прикреплено</Text>
                    </View>
                )}
                <Button
                    title="Фото подходит, подписать"
                    variant="primary"
                    size="lg"
                    fullWidth
                    onPress={() => setStep('signature')}
                />
                <Button
                    title="Переснять фото"
                    variant="secondary"
                    size="lg"
                    fullWidth
                    style={{ marginTop: spacing.sm }}
                    onPress={() => {
                        setPhotoUri(null);
                        setStep('camera');
                    }}
                />
                <Button
                    title="Продолжить без фото"
                    variant="ghost"
                    size="md"
                    fullWidth
                    style={{ marginTop: spacing.sm }}
                    onPress={() => {
                        setPhotoUri(null);
                        setStep('signature');
                    }}
                />
            </ScrollView>
        );
    }

    if (step === 'signature') {
        return (
            <View style={styles.signatureContainer}>
                <Text style={styles.signatureTitle}>Распишитесь ниже</Text>
                <View style={styles.signatureCanvas}>
                    <SignatureScreen
                        ref={signatureRef}
                        onOK={handleSignature}
                        onEmpty={() => Alert.alert('Пожалуйста, распишитесь')}
                        descriptionText="Подпись получателя"
                        clearText="Очистить"
                        confirmText="Сохранить"
                        webStyle=".m-signature-pad { box-shadow: none; border: none; margin: 0px; }"
                    />
                </View>
            </View>
        );
    }

    // Main "details" focused screen
    return (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            <Text style={styles.h1}>Подтверждение точки</Text>

            {/*
              GPS accuracy claim removed: the screen never actually requested a
              location fix, so showing "GPS-сигнал захвачен · ±5 м" was a lie to
              the driver and a liability if a checkpoint is later disputed.
              When real GPS integration lands (expo-location + accuracy
              telemetry), re-introduce a Card here driven by the live reading.
            */}

            <Text style={styles.label}>Заметки / расхождения</Text>
            <TextInput
                style={styles.input}
                multiline
                numberOfLines={4}
                placeholder="Опишите состояние груза или расхождения, если они есть"
                placeholderTextColor={colors.neutral[400]}
                value={notes}
                onChangeText={setNotes}
            />

            <Text style={styles.sectionLabel}>Действия</Text>

            <Button
                title="Сфотографировать"
                variant="secondary"
                size="lg"
                fullWidth
                style={{ marginTop: spacing.sm }}
                onPress={() => setStep('camera')}
            />
            <Button
                title="Я прибыл и подписать"
                variant="success"
                size="lg"
                fullWidth
                style={{ marginTop: spacing.sm }}
                onPress={() => setStep('camera')}
            />
            {/* "Простой / задержка" и "Пропустить точку" — заглушки без бэкенда.
                Показываем только в dev-сборках, пока не появится реальный
                диспетчерский endpoint и workflow обоснования пропуска. */}
            {__DEV__ && (
                <>
                    <Button
                        title="Простой / задержка"
                        variant="warning"
                        size="lg"
                        fullWidth
                        style={{ marginTop: spacing.sm }}
                        onPress={() =>
                            Alert.alert(
                                'Простой',
                                'Сообщение о задержке отправлено диспетчеру (заглушка).',
                                [{ text: 'OK' }]
                            )
                        }
                    />
                    <Button
                        title="Пропустить точку"
                        variant="ghost"
                        size="md"
                        fullWidth
                        style={{ marginTop: spacing.sm }}
                        textStyle={{ color: colors.danger[600] }}
                        onPress={() =>
                            Alert.alert('Пропустить точку?', 'Это действие потребует обоснования.', [
                                { text: 'Отмена', style: 'cancel' },
                                { text: 'Пропустить', style: 'destructive', onPress: () => navigation.goBack() },
                            ])
                        }
                    />
                </>
            )}

            <View style={styles.footer}>
                <Pill
                    label={online === false ? 'Офлайн — данные уйдут позже' : 'Все данные синхронизируются'}
                    tone={online === false ? 'warning' : 'success'}
                />
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    scroll: { flex: 1, backgroundColor: colors.neutral[50] },
    scrollContent: { padding: spacing.lg, paddingBottom: spacing.xxxl },
    h1: { ...typography.title, color: colors.neutral[900] },
    helper: { ...typography.body, color: colors.neutral[600], marginTop: spacing.sm, lineHeight: 22 },
    label: {
        ...typography.captionBold,
        color: colors.neutral[700],
        marginTop: spacing.lg,
        marginBottom: spacing.sm,
    },
    sectionLabel: {
        ...typography.captionBold,
        color: colors.neutral[500],
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginTop: spacing.xl,
    },
    input: {
        borderWidth: 1,
        borderColor: colors.neutral[200],
        borderRadius: radius.md,
        padding: spacing.md,
        fontSize: 15,
        textAlignVertical: 'top',
        minHeight: 100,
        backgroundColor: colors.white,
        color: colors.neutral[900],
    },
    footer: { alignItems: 'center', marginTop: spacing.xxl },

    permissionWrap: {
        flex: 1,
        padding: spacing.xl,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.neutral[50],
    },
    permIcon: { fontSize: 64, marginBottom: spacing.lg },
    permTitle: { ...typography.title, color: colors.neutral[900], marginBottom: spacing.sm },
    permDesc: {
        ...typography.body,
        color: colors.neutral[600],
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: spacing.xl,
    },

    cameraContainer: { flex: 1, backgroundColor: colors.black },
    camera: { flex: 1 },
    cameraOverlay: {
        flex: 1,
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingBottom: spacing.xxl,
        paddingTop: spacing.md,
    },
    cameraClose: {
        alignSelf: 'flex-end',
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: colors.overlay.scrimDark,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: spacing.lg,
    },
    cameraCloseText: { color: colors.white, fontSize: 20, fontWeight: '700' },
    cameraHintBox: {
        backgroundColor: colors.overlay.scrimDark,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.sm,
        borderRadius: radius.pill,
    },
    cameraHint: { color: colors.white, fontSize: 14, fontWeight: '600' },
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

    photoPreview: {
        width: '100%',
        aspectRatio: 4 / 3,
        borderRadius: radius.lg,
        backgroundColor: colors.neutral[200],
        marginTop: spacing.md,
        marginBottom: spacing.lg,
    },
    noPhotoBox: {
        backgroundColor: colors.neutral[100],
        borderRadius: radius.lg,
        padding: spacing.xl,
        marginTop: spacing.md,
        marginBottom: spacing.lg,
        alignItems: 'center',
    },
    noPhotoText: { color: colors.neutral[600] },

    signatureContainer: { flex: 1, backgroundColor: colors.neutral[50], padding: spacing.lg },
    signatureTitle: {
        ...typography.headline,
        color: colors.neutral[900],
        textAlign: 'center',
        marginBottom: spacing.md,
    },
    signatureCanvas: {
        flex: 1,
        backgroundColor: colors.white,
        borderRadius: radius.lg,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: colors.neutral[200],
    },
});
