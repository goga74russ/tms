import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme/tokens';

interface Props {
    children: React.ReactNode;
    /** Подпись над сообщением. По умолчанию — общая. */
    title?: string;
}

interface State {
    error: Error | null;
}

/**
 * Ловит исключения при рендере дочернего дерева и показывает сообщение
 * вместо краша всего приложения. Без него любая ошибка в render одного
 * экрана (например NaN в стилях → нативный крэш Yoga) роняет процесс целиком.
 *
 * Оборачивать НУЖНО внутри экрана (не весь навигатор), чтобы при ошибке
 * сохранялись хедер и навигация — пользователь может уйти назад.
 */
export default class ErrorBoundary extends React.Component<Props, State> {
    state: State = { error: null };

    static getDerivedStateFromError(error: Error): State {
        return { error };
    }

    componentDidCatch(error: Error) {
        // Логируем в консоль — попадёт в logcat / EAS-логи для диагностики.
        console.error('[ErrorBoundary]', error);
    }

    private reset = () => this.setState({ error: null });

    render() {
        if (this.state.error) {
            return (
                <View style={styles.container}>
                    <Text style={styles.title}>{this.props.title ?? 'Что-то пошло не так'}</Text>
                    <Text style={styles.message}>
                        Не удалось отобразить экран. Потяните назад и попробуйте снова.
                    </Text>
                    <TouchableOpacity style={styles.button} onPress={this.reset} activeOpacity={0.8}>
                        <Text style={styles.buttonText}>Повторить</Text>
                    </TouchableOpacity>
                </View>
            );
        }
        return this.props.children;
    }
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: spacing.xl,
        backgroundColor: colors.neutral[50],
    },
    title: {
        ...typography.title,
        color: colors.neutral[900],
        marginBottom: spacing.sm,
        textAlign: 'center',
    },
    message: {
        fontSize: 14,
        color: colors.neutral[600],
        textAlign: 'center',
        marginBottom: spacing.lg,
    },
    button: {
        backgroundColor: colors.brand[600],
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.xl,
        borderRadius: radius.md,
    },
    buttonText: {
        color: colors.white,
        fontSize: 15,
        fontWeight: '700',
    },
});
