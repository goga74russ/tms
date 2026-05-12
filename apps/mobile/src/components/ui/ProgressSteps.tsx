import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors, radius, spacing } from '../../theme/tokens';

export interface ProgressStepsProps {
    /** Number of segments to render */
    total: number;
    /** Active 0-indexed segment. Segments before are filled. */
    activeIndex: number;
    labels?: string[];
    style?: StyleProp<ViewStyle>;
    tone?: 'brand' | 'success';
}

export function ProgressSteps({
    total,
    activeIndex,
    labels,
    style,
    tone = 'brand',
}: ProgressStepsProps) {
    const fill = tone === 'success' ? colors.success[500] : colors.brand[600];
    const active = tone === 'success' ? colors.success[600] : colors.brand[700];

    return (
        <View style={[styles.wrap, style ?? null]}>
            <View style={styles.row}>
                {Array.from({ length: total }).map((_, idx) => {
                    const filled = idx < activeIndex;
                    const isActive = idx === activeIndex;
                    return (
                        <View
                            key={idx}
                            style={[
                                styles.seg,
                                {
                                    backgroundColor: filled
                                        ? fill
                                        : isActive
                                        ? active
                                        : colors.neutral[200],
                                },
                                isActive ? styles.activeSeg : null,
                            ]}
                        />
                    );
                })}
            </View>
            {labels && labels.length > 0 && (
                <View style={styles.labelRow}>
                    {labels.map((label, idx) => (
                        <Text
                            key={idx}
                            style={[
                                styles.label,
                                idx <= activeIndex
                                    ? { color: colors.neutral[900], fontWeight: '600' }
                                    : { color: colors.neutral[400] },
                            ]}
                            numberOfLines={1}
                        >
                            {label}
                        </Text>
                    ))}
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: {
        width: '100%',
    },
    row: {
        flexDirection: 'row',
        gap: 4,
    },
    seg: {
        flex: 1,
        height: 6,
        borderRadius: radius.pill,
    },
    activeSeg: {
        height: 8,
    },
    labelRow: {
        flexDirection: 'row',
        marginTop: spacing.sm,
        gap: 4,
    },
    label: {
        flex: 1,
        fontSize: 10,
        textAlign: 'center',
    },
});

export default ProgressSteps;
