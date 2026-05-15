import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors, spacing, typography } from '../../theme/tokens';
import Button from './Button';

export interface EmptyStateProps {
    icon?: string; // emoji
    title: string;
    description?: string;
    actionLabel?: string;
    onAction?: () => void;
    style?: StyleProp<ViewStyle>;
}

export function EmptyState({
    icon,
    title,
    description,
    actionLabel,
    onAction,
    style,
}: EmptyStateProps) {
    return (
        <View style={[styles.wrap, style ?? null]}>
            {icon ? <Text style={styles.icon}>{icon}</Text> : null}
            <Text style={styles.title}>{title}</Text>
            {description ? <Text style={styles.desc}>{description}</Text> : null}
            {actionLabel && onAction ? (
                <Button
                    title={actionLabel}
                    onPress={onAction}
                    variant="primary"
                    size="md"
                    style={{ marginTop: spacing.lg }}
                />
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: {
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.xxl,
    },
    icon: {
        fontSize: 56,
        marginBottom: spacing.lg,
    },
    title: {
        ...typography.headline,
        color: colors.neutral[900],
        textAlign: 'center',
    },
    desc: {
        ...typography.body,
        color: colors.neutral[500],
        textAlign: 'center',
        marginTop: spacing.sm,
        lineHeight: 22,
    },
});

export default EmptyState;
