import React from 'react';
import {
    ActivityIndicator,
    StyleProp,
    StyleSheet,
    Text,
    TextStyle,
    TouchableOpacity,
    TouchableOpacityProps,
    View,
    ViewStyle,
} from 'react-native';
import { colors, radius, shadow, spacing, touchTarget } from '../../theme/tokens';

export type ButtonVariant = 'primary' | 'secondary' | 'success' | 'danger' | 'warning' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<TouchableOpacityProps, 'style'> {
    title: string;
    variant?: ButtonVariant;
    size?: ButtonSize;
    isLoading?: boolean;
    leftIcon?: React.ReactNode;
    rightIcon?: React.ReactNode;
    fullWidth?: boolean;
    style?: StyleProp<ViewStyle>;
    textStyle?: StyleProp<TextStyle>;
}

interface PaletteEntry {
    bg: string;
    text: string;
    border?: string;
}

const palette: Record<ButtonVariant, PaletteEntry> = {
    primary: { bg: colors.brand[600], text: colors.white },
    secondary: { bg: colors.neutral[100], text: colors.neutral[900], border: colors.neutral[200] },
    success: { bg: colors.success[600], text: colors.white },
    danger: { bg: colors.danger[600], text: colors.white },
    warning: { bg: colors.warning[500], text: colors.white },
    ghost: { bg: 'transparent', text: colors.brand[600] },
};

const sizeStyle: Record<ButtonSize, { minHeight: number; paddingV: number; paddingH: number; fontSize: number }> = {
    sm: { minHeight: 36, paddingV: 8, paddingH: 12, fontSize: 14 },
    md: { minHeight: touchTarget.min, paddingV: 12, paddingH: 16, fontSize: 15 },
    lg: { minHeight: touchTarget.primary, paddingV: 16, paddingH: 20, fontSize: 17 },
};

export function Button({
    title,
    variant = 'primary',
    size = 'md',
    isLoading = false,
    leftIcon,
    rightIcon,
    fullWidth = false,
    disabled,
    style,
    textStyle,
    ...rest
}: ButtonProps) {
    const tone = palette[variant];
    const sz = sizeStyle[size];
    const isDisabled = disabled || isLoading;

    const containerStyle: ViewStyle[] = [
        styles.base,
        {
            backgroundColor: tone.bg,
            minHeight: sz.minHeight,
            paddingVertical: sz.paddingV,
            paddingHorizontal: sz.paddingH,
            borderRadius: radius.md,
            borderWidth: tone.border ? 1 : 0,
            borderColor: tone.border ?? 'transparent',
            opacity: isDisabled ? 0.55 : 1,
        },
        variant !== 'ghost' && variant !== 'secondary' ? shadow.sm : null,
        fullWidth ? { alignSelf: 'stretch' } : { alignSelf: 'flex-start' },
        style ?? null,
    ].filter(Boolean) as ViewStyle[];

    return (
        <TouchableOpacity
            activeOpacity={0.82}
            disabled={isDisabled}
            style={containerStyle}
            {...rest}
        >
            {isLoading ? (
                <ActivityIndicator color={tone.text} />
            ) : (
                <View style={styles.contentRow}>
                    {leftIcon ? <View style={styles.iconLeft}>{leftIcon}</View> : null}
                    <Text
                        numberOfLines={1}
                        style={[
                            styles.label,
                            { color: tone.text, fontSize: sz.fontSize },
                            textStyle ?? null,
                        ]}
                    >
                        {title}
                    </Text>
                    {rightIcon ? <View style={styles.iconRight}>{rightIcon}</View> : null}
                </View>
            )}
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    base: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    contentRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    label: {
        fontWeight: '700',
        letterSpacing: 0.1,
    },
    iconLeft: { marginRight: spacing.sm },
    iconRight: { marginLeft: spacing.sm },
});

export default Button;
