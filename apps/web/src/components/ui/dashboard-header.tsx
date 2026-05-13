'use client';

import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { RefreshCw } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { PeriodSelector, type PeriodRange } from './period-selector';

function cn(...inputs: (string | undefined | false | null)[]) {
    return twMerge(clsx(inputs));
}

export type DashboardIconTone = 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const iconToneClasses: Record<DashboardIconTone, string> = {
    brand: 'bg-brand-50 text-brand-600',
    success: 'bg-emerald-50 text-emerald-600',
    warning: 'bg-amber-50 text-amber-600',
    danger: 'bg-red-50 text-red-600',
    info: 'bg-blue-50 text-blue-600',
    neutral: 'bg-neutral-100 text-neutral-600',
};

export interface DashboardHeaderProps {
    title: string;
    subtitle?: string;
    icon?: LucideIcon;
    iconTone?: DashboardIconTone;
    period?: PeriodRange;
    onPeriodChange?: (r: PeriodRange) => void;
    showPeriodSelector?: boolean;
    onRefresh?: () => void;
    refreshing?: boolean;
    actions?: React.ReactNode;
    className?: string;
}

export function DashboardHeader({
    title,
    subtitle,
    icon: Icon,
    iconTone = 'brand',
    period,
    onPeriodChange,
    showPeriodSelector = true,
    onRefresh,
    refreshing,
    actions,
    className,
}: DashboardHeaderProps) {
    const showPeriod = showPeriodSelector && period && onPeriodChange;
    return (
        <header className={cn('flex flex-col gap-3', className)}>
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                    {Icon && (
                        <div className={cn('shrink-0 w-10 h-10 rounded-xl flex items-center justify-center', iconToneClasses[iconTone])}>
                            <Icon className="w-5 h-5" />
                        </div>
                    )}
                    <div className="min-w-0">
                        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 truncate">{title}</h1>
                        {subtitle && <p className="text-sm text-neutral-500 mt-0.5">{subtitle}</p>}
                    </div>
                </div>
                {showPeriod && (
                    <div className="hidden md:flex items-center">
                        <PeriodSelector value={period!} onChange={onPeriodChange!} />
                    </div>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                    {onRefresh && (
                        <button
                            type="button"
                            onClick={onRefresh}
                            disabled={refreshing}
                            aria-busy={refreshing || undefined}
                            aria-label="Обновить"
                            title="Обновить"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 disabled:opacity-50 transition-colors"
                        >
                            <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
                        </button>
                    )}
                    {actions}
                </div>
            </div>
            {showPeriod && (
                <div className="flex md:hidden">
                    <PeriodSelector value={period!} onChange={onPeriodChange!} />
                </div>
            )}
        </header>
    );
}
