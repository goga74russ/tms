import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: (string | undefined | false | null)[]) {
    return twMerge(clsx(inputs));
}

export interface EmptyStateProps {
    icon?: LucideIcon;
    title: string;
    description?: string;
    action?: React.ReactNode;
    className?: string;
    /** Tone changes the icon halo color. */
    tone?: 'neutral' | 'brand' | 'success' | 'warning' | 'danger';
}

const toneClasses: Record<NonNullable<EmptyStateProps['tone']>, string> = {
    neutral: 'bg-neutral-100 text-neutral-400',
    brand: 'bg-brand-50 text-brand-600',
    success: 'bg-success-50 text-success-600',
    warning: 'bg-warning-50 text-warning-600',
    danger: 'bg-danger-50 text-danger-600',
};

export function EmptyState({
    icon: Icon,
    title,
    description,
    action,
    className,
    tone = 'neutral',
}: EmptyStateProps) {
    return (
        <div
            className={cn(
                'flex flex-col items-center justify-center text-center px-6 py-12 min-h-[280px] rounded-xl bg-neutral-50/50 border border-dashed border-neutral-200',
                className,
            )}
        >
            {Icon && (
                <div className={cn('w-14 h-14 rounded-2xl flex items-center justify-center mb-4', toneClasses[tone])}>
                    <Icon className="w-7 h-7" />
                </div>
            )}
            <h3 className="text-base font-semibold text-neutral-800">{title}</h3>
            {description && (
                <p className="mt-1.5 text-sm text-neutral-500 max-w-md">{description}</p>
            )}
            {action && <div className="mt-5">{action}</div>}
        </div>
    );
}
