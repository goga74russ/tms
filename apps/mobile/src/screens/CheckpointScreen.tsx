import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CameraView, useCameraPermissions } from 'expo-camera';
import SignatureScreen, { SignatureViewRef } from 'react-native-signature-canvas';
import { v4 as uuidv4 } from 'uuid';
import { RootStackParamList } from '../navigation/AppNavigator';
import { database } from '../database';
import AppEvent from '../database/models/AppEvent';
import { uploadPhoto } from '../api/upload';

type Props = NativeStackScreenProps<RootStackParamList, 'Checkpoint'>;

export default function CheckpointScreen({ route, navigation }: Props) {
    const { tripId, routePointId } = route.params;
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
                <Text style={styles.centerText}>{'\u041d\u0430\u043c \u043d\u0443\u0436\u0435\u043d \u0434\u043e\u0441\u0442\u0443\u043f \u043a \u043a\u0430\u043c\u0435\u0440\u0435'}</Text>
                <TouchableOpacity style={styles.primaryButton} onPress={requestPermission}>
                    <Text style={styles.buttonText}>{'\u0420\u0430\u0437\u0440\u0435\u0448\u0438\u0442\u044c'}</Text>
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

    const saveCheckpoint = async (photo: string | null, sig: string | null) => {
        try {
            let photoUrl: string | null = null;
            let photoSavedLocally = false;

            if (photo) {
                try {
                    photoUrl = await uploadPhoto(photo);
                } catch {
                    photoUrl = photo;
                    photoSavedLocally = true;
                }
            }

            await database.write(async () => {
                await database.collections.get<AppEvent>('events').create((event) => {
                    event.eventId = uuidv4();
                    event.type = 'route_point_completed';
                    event.entityId = tripId;
                    event.entityType = 'trip';
                    event.timestamp = new Date();
                    event.synced = false;
                    event.payload = JSON.stringify({
                        pointId: routePointId,
                        photoUrls: photoUrl ? [photoUrl] : [],
                        signatureUrl: sig,
                        notes,
                    });
                });
            });

            if (photoSavedLocally) {
                Alert.alert(
                    '\u0422\u043e\u0447\u043a\u0430 \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u0430',
                    '\u0424\u043e\u0442\u043e \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u043e \u043b\u043e\u043a\u0430\u043b\u044c\u043d\u043e \u0438 \u0431\u0443\u0434\u0435\u0442 \u043e\u0442\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u043e \u043f\u0440\u0438 \u0441\u043b\u0435\u0434\u0443\u044e\u0449\u0435\u0439 \u0441\u0438\u043d\u0445\u0440\u043e\u043d\u0438\u0437\u0430\u0446\u0438\u0438.'
                );
            } else {
                Alert.alert('\u0423\u0441\u043f\u0435\u0448\u043d\u043e', '\u0422\u043e\u0447\u043a\u0430 \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u0430');
            }

            navigation.goBack();
        } catch {
            Alert.alert('\u041e\u0448\u0438\u0431\u043a\u0430', '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0441\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u0442\u043e\u0447\u043a\u0443.');
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
                <Text style={styles.instructions}>{'\u0420\u0430\u0441\u043f\u0438\u0448\u0438\u0442\u0435\u0441\u044c \u043d\u0438\u0436\u0435'}</Text>
                <SignatureScreen
                    ref={signatureRef}
                    onOK={handleSignature}
                    onEmpty={() => Alert.alert('\u041f\u043e\u0436\u0430\u043b\u0443\u0439\u0441\u0442\u0430, \u0440\u0430\u0441\u043f\u0438\u0448\u0438\u0442\u0435\u0441\u044c')}
                    descriptionText={'\u041f\u043e\u0434\u043f\u0438\u0441\u044c \u043f\u043e\u043b\u0443\u0447\u0430\u0442\u0435\u043b\u044f'}
                    clearText={'\u041e\u0447\u0438\u0441\u0442\u0438\u0442\u044c'}
                    confirmText={'\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c'}
                    webStyle=".m-signature-pad { box-shadow: none; border: none; margin: 0px; }"
                />
            </View>
        );
    }

    return (
        <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>{'\u0414\u0435\u0442\u0430\u043b\u0438 \u0432\u044b\u0433\u0440\u0443\u0437\u043a\u0438'}</Text>

            <Text style={styles.label}>{'\u0417\u0430\u043c\u0435\u0442\u043a\u0438 / \u0440\u0430\u0441\u0445\u043e\u0436\u0434\u0435\u043d\u0438\u044f'}</Text>
            <TextInput
                style={styles.input}
                multiline
                numberOfLines={4}
                placeholder={'\u041e\u043f\u0438\u0448\u0438\u0442\u0435 \u0441\u043e\u0441\u0442\u043e\u044f\u043d\u0438\u0435 \u0433\u0440\u0443\u0437\u0430 \u0438\u043b\u0438 \u0440\u0430\u0441\u0445\u043e\u0436\u0434\u0435\u043d\u0438\u044f, \u0435\u0441\u043b\u0438 \u043e\u043d\u0438 \u0435\u0441\u0442\u044c'}
                value={notes}
                onChangeText={setNotes}
            />

            <TouchableOpacity style={styles.primaryButton} onPress={() => setStep('camera')}>
                <Text style={styles.buttonText}>{'\u0421\u0434\u0435\u043b\u0430\u0442\u044c \u0444\u043e\u0442\u043e \u0438 \u043f\u043e\u0434\u043f\u0438\u0441\u0430\u0442\u044c'}</Text>
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
