import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors, spacing } from '../../theme/tokens';

export interface KeyValueRowProps {
    label: string;
    value: string | React.ReactNode;
    valueColor?: string;
    style?: StyleProp<ViewStyle>;
    bordered?: boolean;
}

export function KeyValueRow({
    label,
    value,
    valueColor,
    style,
    bordered = false,
}: KeyValueRowProps) {
    return (
        <View style={[styles.row, bordered ? styles.bordered : null, style ?? null]}>
            <Text style={styles.label} numberOfLines={1}>
                {label}
            </Text>
            {typeof value === 'string' ? (
                <Text style={[styles.value, valueColor ? { color: valueColor } : null]} numberOfLines={2}>
                    {value}
                </Text>
            ) : (
                <View style={styles.valueRight}>{value}</View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: spacing.sm,
        gap: spacing.md,
    },
    bordered: {
        borderBottomWidth: 1,
        borderBottomColor: colors.neutral[100],
    },
    label: {
        fontSize: 13,
        color: colors.neutral[500],
        flexShrink: 0,
    },
    value: {
        fontSize: 14,
        color: colors.neutral[900],
        fontWeight: '600',
        flexShrink: 1,
        textAlign: 'right',
    },
    valueRight: {
        flexShrink: 1,
        alignItems: 'flex-end',
    },
});

export default KeyValueRow;
