'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';

// ============================================================================
// Toast primitive — custom implementation (no extra package).
// Mount <ToastProvider> at root, then call useToast().toast(opts) anywhere.
// ============================================================================

export type ToastVariant = 'default' | 'success' | 'error' | 'warning' | 'info';

export interface ToastOptions {
    id?: string;
    title?: string;
    description?: string;
    variant?: ToastVariant;
    duration?: number; // ms; 0 = sticky
    action?: { label: string; onClick: () => void };
}

interface ToastItem extends Required<Pick<ToastOptions, 'id' | 'variant' | 'duration'>> {
    title?: string;
    description?: string;
    action?: ToastOptions['action'];
    createdAt: number;
}

interface ToastContextValue {
    toast: (opts: ToastOptions) => string;
    dismiss: (id: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
    const ctx = React.useContext(ToastContext);
    if (!ctx) {
        // Allow safe no-op outside provider to avoid SSR crashes; warn in dev.
        if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
            console.warn('useToast() called outside <ToastProvider>. Calls will be no-ops.');
        }
        return {
            toast: () => '',
            dismiss: () => undefined,
        };
    }
    return ctx;
}

const variantStyles: Record<ToastVariant, { container: string; icon: React.ReactNode }> = {
    default: {
        container: 'bg-white border-neutral-200 text-neutral-900',
        icon: <Info className="w-5 h-5 text-neutral-500" />,
    },
    success: {
        container: 'bg-white border-emerald-200 text-neutral-900',
        icon: <CheckCircle2 className="w-5 h-5 text-emerald-600" />,
    },
    error: {
        container: 'bg-white border-red-200 text-neutral-900',
        icon: <XCircle className="w-5 h-5 text-red-600" />,
    },
    warning: {
        container: 'bg-white border-amber-200 text-neutral-900',
        icon: <AlertTriangle className="w-5 h-5 text-amber-600" />,
    },
    info: {
        container: 'bg-white border-blue-200 text-neutral-900',
        icon: <Info className="w-5 h-5 text-blue-600" />,
    },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [items, setItems] = React.useState<ToastItem[]>([]);
    const [mounted, setMounted] = React.useState(false);
    const timers = React.useRef<Record<string, ReturnType<typeof setTimeout>>>({});

    React.useEffect(() => {
        setMounted(true);
        return () => {
            Object.values(timers.current).forEach(clearTimeout);
            timers.current = {};
        };
    }, []);

    const dismiss = React.useCallback((id: string) => {
        setItems(prev => prev.filter(i => i.id !== id));
        const t = timers.current[id];
        if (t) {
            clearTimeout(t);
            delete timers.current[id];
        }
    }, []);

    const toast = React.useCallback((opts: ToastOptions): string => {
        const id = opts.id ?? `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const item: ToastItem = {
            id,
            title: opts.title,
            description: opts.description,
            variant: opts.variant ?? 'default',
            duration: opts.duration ?? 5000,
            action: opts.action,
            createdAt: Date.now(),
        };
        setItems(prev => [...prev.filter(i => i.id !== id), item]);
        if (item.duration > 0) {
            timers.current[id] = setTimeout(() => dismiss(id), item.duration);
        }
        return id;
    }, [dismiss]);

    const value = React.useMemo<ToastContextValue>(() => ({ toast, dismiss }), [toast, dismiss]);

    return (
        <ToastContext.Provider value={value}>
            {children}
            {mounted && typeof document !== 'undefined' &&
                createPortal(
                    <div
                        aria-live="polite"
                        aria-atomic="true"
                        className="pointer-events-none fixed top-4 right-4 z-toast flex flex-col gap-2 w-full max-w-sm"
                    >
                        {items.map(item => {
                            const v = variantStyles[item.variant];
                            return (
                                <div
                                    key={item.id}
                                    role="status"
                                    className={`pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 shadow-soft animate-in slide-in-from-right-4 fade-in duration-200 ${v.container}`}
                                >
                                    <div className="mt-0.5 shrink-0">{v.icon}</div>
                                    <div className="min-w-0 flex-1">
                                        {item.title && (
                                            <div className="text-sm font-semibold leading-tight">{item.title}</div>
                                        )}
                                        {item.description && (
                                            <div className="mt-0.5 text-sm text-neutral-600 leading-snug">{item.description}</div>
                                        )}
                                        {item.action && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    item.action!.onClick();
                                                    dismiss(item.id);
                                                }}
                                                className="mt-2 text-xs font-semibold text-brand-600 hover:text-brand-700"
                                            >
                                                {item.action.label}
                                            </button>
                                        )}
                                    </div>
                                    <button
                                        type="button"
                                        aria-label="Закрыть"
                                        onClick={() => dismiss(item.id)}
                                        className="shrink-0 rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            );
                        })}
                    </div>,
                    document.body,
                )}
        </ToastContext.Provider>
    );
}
