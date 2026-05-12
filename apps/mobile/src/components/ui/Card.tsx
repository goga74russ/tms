import React from 'react';
import { StyleProp, StyleSheet, View, ViewProps, ViewStyle } from 'react-native';
import { colors, radius, shadow, spacing } from '../../theme/tokens';

export interface CardProps extends Omit<ViewProps, 'style'> {
    padded?: boolean;
    tone?: 'default' | 'muted' | 'accent';
    elevation?: 'none' | 'sm' | 'md';
    style?: StyleProp<ViewStyle>;
    children: React.ReactNode;
}

export function Card({
    padded = true,
    tone = 'default',
    elevation = 'sm',
    style,
    children,
    ...rest
}: CardProps) {
    const bg =
        tone === 'muted' ? colors.neutral[50] : tone === 'accent' ? colors.brand[50] : colors.white;
    const border = tone === 'accent' ? colors.brand[100] : colors.neutral[200];

    return (
        <View
            style={[
                styles.card,
                {
                    backgroundColor: bg,
                    borderColor: border,
                    padding: padded ? spacing.lg : 0,
                },
                elevation === 'sm' ? shadow.sm : elevation === 'md' ? shadow.md : null,
                style ?? null,
            ]}
            {...rest}
        >
            {children}
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        borderRadius: radius.lg,
        borderWidth: 1,
    },
});

export default Card;
