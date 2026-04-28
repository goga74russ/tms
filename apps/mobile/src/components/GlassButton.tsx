import React from 'react';
import { StyleSheet, TouchableOpacity, Text, ViewStyle, TextStyle, TouchableOpacityProps } from 'react-native';
import { BlurView } from 'expo-blur';

export interface GlassButtonProps extends TouchableOpacityProps {
    title: string;
    containerStyle?: ViewStyle;
    textStyle?: TextStyle;
    blurIntensity?: number;
}

export function GlassButton({
    title,
    containerStyle,
    textStyle,
    blurIntensity = 40,
    ...props
}: GlassButtonProps) {
    return (
        <TouchableOpacity activeOpacity={0.8} style={containerStyle} {...props}>
            <BlurView intensity={blurIntensity} tint="light" style={styles.blurContainer}>
                <Text style={[styles.text, textStyle]}>{title}</Text>
            </BlurView>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    blurContainer: {
        borderRadius: 16,
        paddingVertical: 16,
        paddingHorizontal: 24,
        overflow: 'hidden',
        borderColor: 'rgba(255, 255, 255, 0.5)',
        borderWidth: 1,
        backgroundColor: 'rgba(255, 255, 255, 0.4)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    text: {
        fontSize: 18,
        fontWeight: '600',
        color: '#333',
    },
});
