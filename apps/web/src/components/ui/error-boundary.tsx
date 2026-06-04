'use client';

import * as React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
    children: React.ReactNode;
    fallback?: (err: Error, reset: () => void) => React.ReactNode;
    /** Where to scope: a child failure inside one widget should not nuke whole page. */
    scope?: string;
}

interface ErrorBoundaryState {
    error: Error | null;
}

/**
 * React error boundary with a friendly default fallback (Russian).
 * Use to wrap individual widgets so one broken card doesn't crash the whole page.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    state: ErrorBoundaryState = { error: null };

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        if (process.env.NODE_ENV !== 'production') {
            // eslint-disable-next-line no-console
            console.error(`[ErrorBoundary${this.props.scope ? `:${this.props.scope}` : ''}]`, error, info.componentStack);
        }
    }

    reset = () => this.setState({ error: null });

    render() {
        const { error } = this.state;
        if (!error) return this.props.children;

        if (this.props.fallback) {
            return this.props.fallback(error, this.reset);
        }

        return (
            <div className="flex flex-col items-center justify-center text-center p-8 rounded-xl border border-red-200 bg-red-50/40 min-h-[280px]">
                <div className="w-14 h-14 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center mb-3">
                    <AlertTriangle className="w-7 h-7" />
                </div>
                <h3 className="text-base font-semibold text-neutral-800">Что-то пошло не так</h3>
                <p className="mt-1.5 text-sm text-neutral-500 max-w-md">
                    {/* C9: raw error.message мог раскрыть внутренние детали (путь/SQL)
                        в проде. Показываем его только в dev. */}
                    {(process.env.NODE_ENV === 'development' && error.message)
                        ? error.message
                        : 'Произошла непредвиденная ошибка. Попробуйте перезагрузить страницу.'}
                </p>
                <div className="mt-4 flex gap-2">
                    <button
                        type="button"
                        onClick={this.reset}
                        className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                    >
                        <RotateCcw className="w-4 h-4" />
                        Повторить
                    </button>
                    <button
                        type="button"
                        onClick={() => typeof window !== 'undefined' && window.location.reload()}
                        className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800"
                    >
                        Перезагрузить страницу
                    </button>
                </div>
            </div>
        );
    }
}
