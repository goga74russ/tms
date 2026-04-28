import React from 'react';
import { StyleSheet, ViewStyle, ViewProps } from 'react-native';
import { BlurView } from 'expo-blur';

export interface GlassCardProps extends ViewProps {
    style?: ViewStyle;
    intensity?: number;
    tint?: 'light' | 'dark' | 'default';
    children: React.ReactNode;
}

export function GlassCard({
    style,
    intensity = 30,
    tint = 'light',
    children,
    ...props
}: GlassCardProps) {
    return (
        <BlurView intensity={intensity} tint={tint} style={[styles.container, style]} {...props}>
            {children}
        </BlurView>
    );
}

const styles = StyleSheet.create({
    container: {
        borderRadius: 20,
        padding: 24,
        overflow: 'hidden',
        borderColor: 'rgba(255, 255, 255, 0.4)',
        borderWidth: 1,
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
    },
});
