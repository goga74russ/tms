import React from 'react';
import { StyleSheet, TextInput, TextInputProps, ViewStyle, TextStyle } from 'react-native';
import { BlurView } from 'expo-blur';

export interface GlassInputProps extends TextInputProps {
    containerStyle?: ViewStyle;
    inputStyle?: TextStyle;
}

export function GlassInput({
    containerStyle,
    inputStyle,
    ...props
}: GlassInputProps) {
    return (
        <BlurView intensity={20} tint="light" style={[styles.container, containerStyle]}>
            <TextInput
                style={[styles.input, inputStyle]}
                placeholderTextColor="rgba(0, 0, 0, 0.5)"
                {...props}
            />
        </BlurView>
    );
}

const styles = StyleSheet.create({
    container: {
        borderRadius: 16,
        overflow: 'hidden',
        borderColor: 'rgba(255, 255, 255, 0.3)',
        borderWidth: 1,
        backgroundColor: 'rgba(255, 255, 255, 0.3)',
        marginBottom: 16,
    },
    input: {
        paddingHorizontal: 16,
        paddingVertical: 14,
        fontSize: 16,
        color: '#000', // Or a darker color for contrast
    },
});
