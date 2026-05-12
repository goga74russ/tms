import React, { useRef } from 'react';
import {
    Animated,
    Dimensions,
    PanResponder,
    StyleProp,
    StyleSheet,
    View,
    ViewStyle,
} from 'react-native';
import { colors, radius, shadow, spacing } from '../../theme/tokens';

export interface BottomSheetProps {
    /** Distance from bottom for "collapsed" snap — height of the visible sheet. */
    snapMid?: number; // default 0.55 of screen height
    snapMax?: number; // default 0.92 of screen height
    initialSnap?: 'mid' | 'max';
    children: React.ReactNode;
    style?: StyleProp<ViewStyle>;
}

const { height: SCREEN_H } = Dimensions.get('window');

export function BottomSheet({
    snapMid,
    snapMax,
    initialSnap = 'mid',
    children,
    style,
}: BottomSheetProps) {
    const midH = snapMid ?? Math.round(SCREEN_H * 0.55);
    const maxH = snapMax ?? Math.round(SCREEN_H * 0.92);
    const heightAnim = useRef(new Animated.Value(initialSnap === 'max' ? maxH : midH)).current;
    const startHeightRef = useRef(initialSnap === 'max' ? maxH : midH);

    const panResponder = useRef(
        PanResponder.create({
            onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4,
            onPanResponderGrant: () => {
                heightAnim.stopAnimation((val) => {
                    startHeightRef.current = val;
                });
            },
            onPanResponderMove: (_, g) => {
                const next = startHeightRef.current - g.dy;
                const clamped = Math.max(midH * 0.6, Math.min(maxH, next));
                heightAnim.setValue(clamped);
            },
            onPanResponderRelease: (_, g) => {
                const ended = startHeightRef.current - g.dy;
                const toMax = Math.abs(ended - maxH) < Math.abs(ended - midH);
                Animated.spring(heightAnim, {
                    toValue: toMax ? maxH : midH,
                    useNativeDriver: false,
                    bounciness: 4,
                }).start();
            },
        })
    ).current;

    return (
        <Animated.View
            style={[
                styles.sheet,
                { height: heightAnim },
                style ?? null,
            ]}
        >
            <View style={styles.handleZone} {...panResponder.panHandlers}>
                <View style={styles.handle} />
            </View>
            <View style={styles.content}>{children}</View>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    sheet: {
        backgroundColor: colors.white,
        borderTopLeftRadius: radius.xl,
        borderTopRightRadius: radius.xl,
        ...shadow.lg,
        overflow: 'hidden',
    },
    handleZone: {
        paddingVertical: spacing.sm,
        alignItems: 'center',
        justifyContent: 'center',
    },
    handle: {
        width: 44,
        height: 5,
        borderRadius: 3,
        backgroundColor: colors.neutral[300],
    },
    content: {
        flex: 1,
        paddingHorizontal: spacing.lg,
        paddingBottom: spacing.xl,
    },
});

export default BottomSheet;
