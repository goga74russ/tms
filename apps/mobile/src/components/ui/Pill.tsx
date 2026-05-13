import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors, radius, spacing } from '../../theme/tokens';

export type PillTone = 'success' | 'warning' | 'danger' | 'brand' | 'neutral' | 'info';

const tones: Record<PillTone, { bg: string; fg: string; border?: string }> = {
    success: { bg: colors.success[50], fg: colors.success[700], border: '#bbf7d0' },
    warning: { bg: colors.warning[50], fg: colors.warning[700], border: '#fde68a' },
    danger: { bg: colors.danger[50], fg: colors.danger[700], border: '#fecaca' },
    brand: { bg: colors.brand[50], fg: colors.brand[700], border: colors.brand[100] },
    neutral: { bg: colors.neutral[100], fg: colors.neutral[700], border: colors.neutral[200] },
    info: { bg: '#dbeafe', fg: '#1d4ed8', border: '#bfdbfe' },
};

export interface PillProps {
    label: string;
    tone?: PillTone;
    style?: StyleProp<ViewStyle>;
    leftIcon?: React.ReactNode;
}

export function Pill({ label, tone = 'neutral', style, leftIcon }: PillProps) {
    const t = tones[tone];
    return (
        <View
            style={[
                styles.pill,
                { backgroundColor: t.bg, borderColor: t.border ?? t.bg },
                style ?? null,
            ]}
        >
            {leftIcon ? <View style={styles.icon}>{leftIcon}</View> : null}
            <Text style={[styles.text, { color: t.fg }]} numberOfLines={1}>
                {label}
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    pill: {
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing.md,
        paddingVertical: 4,
        borderRadius: radius.pill,
        borderWidth: 1,
    },
    text: {
        fontSize: 12,
        fontWeight: '700',
        letterSpacing: 0.2,
    },
    icon: { marginRight: 4 },
});

export default Pill;
