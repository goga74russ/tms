import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors, spacing } from '../../theme/tokens';

export interface TimelineStep {
    icon: string; // emoji or unicode glyph
    label: string;
    state: 'done' | 'active' | 'pending';
}

export interface IconTimelineProps {
    steps: TimelineStep[];
    style?: StyleProp<ViewStyle>;
}

export function IconTimeline({ steps, style }: IconTimelineProps) {
    return (
        <View style={[styles.wrap, style ?? null]}>
            {steps.map((step, idx) => {
                const isLast = idx === steps.length - 1;
                const isDone = step.state === 'done';
                const isActive = step.state === 'active';
                const bg = isDone
                    ? colors.success[500]
                    : isActive
                    ? colors.brand[600]
                    : colors.neutral[200];
                const fg = isDone || isActive ? colors.white : colors.neutral[500];

                return (
                    <View key={idx} style={styles.stepCol}>
                        <View style={styles.row}>
                            <View style={[styles.circle, { backgroundColor: bg }]}>
                                <Text style={[styles.icon, { color: fg }]}>{step.icon}</Text>
                            </View>
                            {!isLast && (
                                <View
                                    style={[
                                        styles.line,
                                        {
                                            backgroundColor:
                                                steps[idx + 1].state === 'pending'
                                                    ? colors.neutral[200]
                                                    : colors.success[500],
                                        },
                                    ]}
                                />
                            )}
                        </View>
                        <Text
                            style={[
                                styles.label,
                                {
                                    color:
                                        step.state === 'pending'
                                            ? colors.neutral[400]
                                            : colors.neutral[900],
                                    fontWeight: isActive ? '700' : '500',
                                },
                            ]}
                            numberOfLines={1}
                        >
                            {step.label}
                        </Text>
                    </View>
                );
            })}
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: {
        flexDirection: 'row',
        width: '100%',
        paddingHorizontal: spacing.sm,
    },
    stepCol: {
        flex: 1,
        alignItems: 'center',
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'stretch',
        justifyContent: 'center',
    },
    circle: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    icon: {
        fontSize: 18,
    },
    line: {
        height: 3,
        flex: 1,
        marginHorizontal: 4,
    },
    label: {
        marginTop: 6,
        fontSize: 11,
        textAlign: 'center',
        paddingHorizontal: 2,
    },
});

export default IconTimeline;
