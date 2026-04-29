import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CameraView, useCameraPermissions } from 'expo-camera';
import SignatureScreen, { SignatureViewRef } from 'react-native-signature-canvas';
import NetInfo from '@react-native-community/netinfo';
import { RootStackParamList } from '../navigation/AppNavigator';
import { uploadPhoto } from '../api/upload';
import { enqueueAction } from '../api/offlineQueue';
import { useAuth } from '../context/AuthContext';

type Props = NativeStackScreenProps<RootStackParamList, 'Checkpoint'>;
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000/api';

export default function CheckpointScreen({ route, navigation }: Props) {
    const { tripId, routePointId } = route.params;
    const { token } = useAuth();
    const [permission, requestPermission] = useCameraPermissions();
    const [step, setStep] = useState<'details' | 'camera' | 'signature'>('details');
    const [notes, setNotes] = useState('');
    const [photoUri, setPhotoUri] = useState<string | null>(null);

    const cameraRef = React.useRef<CameraView>(null);
    const signatureRef = React.useRef<SignatureViewRef>(null);

    if (!permission) {
        return <View />;
    }

    if (!permission.granted) {
        return (
            <View style={styles.container}>
                <Text style={styles.centerText}>Нам нужен доступ к камере</Text>
                <TouchableOpacity style={styles.primaryButton} onPress={requestPermission}>
                    <Text style={styles.buttonText}>Разрешить</Text>
                </TouchableOpacity>
            </View>
        );
    }

    const takePicture = async () => {
        if (!cameraRef.current) {
            return;
        }

        const photo = await cameraRef.current.takePictureAsync();
        setPhotoUri(photo?.uri || null);
        setStep('signature');
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
                events: [{
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
                }],
            };

            if (requiresReplay) {
                await enqueueCheckpoint(body);
                Alert.alert('Точка подтверждена', 'Данные попали в очередь и уйдут при восстановлении связи.');
                navigation.goBack();
                return;
            }

            const res = await fetch(`${API_URL}/sync/events`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
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
                    <View style={styles.buttonContainer}>
                        <TouchableOpacity style={styles.captureButton} onPress={takePicture}>
                            <View style={styles.captureInner} />
                        </TouchableOpacity>
                    </View>
                </CameraView>
            </View>
        );
    }

    if (step === 'signature') {
        return (
            <View style={styles.signatureContainer}>
                <Text style={styles.instructions}>Распишитесь ниже</Text>
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
        );
    }

    return (
        <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>Детали выгрузки</Text>

            <Text style={styles.label}>Заметки / расхождения</Text>
            <TextInput
                style={styles.input}
                multiline
                numberOfLines={4}
                placeholder="Опишите состояние груза или расхождения, если они есть"
                value={notes}
                onChangeText={setNotes}
            />

            <TouchableOpacity style={styles.primaryButton} onPress={() => setStep('camera')}>
                <Text style={styles.buttonText}>Сделать фото и подписать</Text>
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
    centerText: {
        textAlign: 'center',
        marginBottom: 16,
        fontSize: 16,
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 24,
        color: '#0f172a',
    },
    label: {
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 8,
        color: '#334155',
    },
    input: {
        borderWidth: 1,
        borderColor: '#cbd5e1',
        borderRadius: 8,
        padding: 12,
        fontSize: 16,
        textAlignVertical: 'top',
        marginBottom: 24,
        minHeight: 120,
    },
    primaryButton: {
        backgroundColor: '#2563eb',
        padding: 16,
        borderRadius: 8,
        alignItems: 'center',
        minHeight: 56,
        justifyContent: 'center',
    },
    buttonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '600',
    },
    cameraContainer: {
        flex: 1,
        justifyContent: 'center',
    },
    camera: {
        flex: 1,
    },
    buttonContainer: {
        flex: 1,
        flexDirection: 'row',
        backgroundColor: 'transparent',
        justifyContent: 'center',
        alignItems: 'flex-end',
        marginBottom: 40,
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
    },
});
