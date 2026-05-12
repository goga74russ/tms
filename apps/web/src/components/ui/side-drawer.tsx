'use client';

import * as React from 'react';
import { X } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: (string | undefined | false | null)[]) {
    return twMerge(clsx(inputs));
}

export interface SideDrawerProps {
    open: boolean;
    onClose: () => void;
    title?: React.ReactNode;
    subtitle?: React.ReactNode;
    /** Slide-in width preset. */
    width?: 'sm' | 'md' | 'lg' | 'xl';
    /** Header right-side controls (e.g. action buttons). */
    headerActions?: React.ReactNode;
    /** Sticky footer; usually save/cancel. */
    footer?: React.ReactNode;
    /** Close when backdrop is clicked. Default: true. */
    closeOnBackdrop?: boolean;
    children?: React.ReactNode;
    className?: string;
}

const widthClass: Record<NonNullable<SideDrawerProps['width']>, string> = {
    sm: 'w-full sm:max-w-[400px]',
    md: 'w-full sm:max-w-[520px]',
    lg: 'w-full sm:max-w-[720px]',
    xl: 'w-full sm:max-w-[920px]',
};

/**
 * Right-side slide-in drawer with backdrop, focus trap basics, Esc-to-close.
 * Render at any point; visibility controlled via `open` prop.
 */
export function SideDrawer({
    open,
    onClose,
    title,
    subtitle,
    width = 'md',
    headerActions,
    footer,
    closeOnBackdrop = true,
    children,
    className,
}: SideDrawerProps) {
    const panelRef = React.useRef<HTMLDivElement>(null);
    const lastFocused = React.useRef<HTMLElement | null>(null);

    // Body scroll lock + esc-to-close + focus restore
    React.useEffect(() => {
        if (!open) return;
        lastFocused.current = (document.activeElement as HTMLElement) || null;
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        function onKey(e: KeyboardEvent) {
            if (e.key === 'Escape') {
                e.stopPropagation();
                onClose();
            }
        }
        document.addEventListener('keydown', onKey);

        // Focus first focusable element
        const t = setTimeout(() => {
            const first = panelRef.current?.querySelector<HTMLElement>(
                'input, button, select, textarea, [tabindex]:not([tabindex="-1"])',
            );
            (first ?? panelRef.current)?.focus();
        }, 30);

        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = prevOverflow;
            clearTimeout(t);
            lastFocused.current?.focus?.();
        };
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-50"
            role="dialog"
            aria-modal="true"
            aria-label={typeof title === 'string' ? title : undefined}
        >
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-neutral-900/40 backdrop-blur-[2px] animate-fade-in"
                onClick={closeOnBackdrop ? onClose : undefined}
            />
            {/* Panel */}
            <div
                ref={panelRef}
                tabIndex={-1}
                className={cn(
                    'absolute right-0 top-0 h-full bg-white shadow-2xl flex flex-col outline-none',
                    'animate-slide-in-right',
                    widthClass[width],
                    className,
                )}
            >
                {(title || subtitle || headerActions) && (
                    <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-neutral-200 shrink-0">
                        <div className="min-w-0 flex-1">
                            {title && (
                                <h2 className="text-base font-semibold text-neutral-900 truncate">{title}</h2>
                            )}
                            {subtitle && (
                                <p className="text-xs text-neutral-500 truncate mt-0.5">{subtitle}</p>
                            )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                            {headerActions}
                            <button
                                type="button"
                                onClick={onClose}
                                aria-label="Закрыть"
                                className="p-1.5 rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                )}
                <div className="flex-1 overflow-auto px-5 py-4">
                    {children}
                </div>
                {footer && (
                    <div className="px-5 py-3 border-t border-neutral-200 bg-neutral-50/50 shrink-0">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
}
