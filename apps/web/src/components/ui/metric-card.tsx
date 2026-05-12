'use client';

import * as React from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Sparkline, type SparklineTone } from './sparkline';

function cn(...inputs: (string | undefined | false | null)[]) {
    return twMerge(clsx(inputs));
}

export interface MetricChange {
    value: number;
    direction: 'up' | 'down' | 'flat';
}

export type MetricTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

export interface MetricCardProps {
    label: string;
    value: React.ReactNode;
    change?: MetricChange;
    /** When true (default), "up" is good (green). When false, "up" is bad (red) — for metrics like overdue debt. */
    changeGood?: boolean;
    hint?: string;
    sparkline?: number[];
    sparklineTone?: SparklineTone;
    icon?: LucideIcon;
    tone?: MetricTone;
    href?: string;
    onClick?: () => void;
    className?: string;
}

const toneClasses: Record<MetricTone, { iconBg: string; iconFg: string }> = {
    neutral: { iconBg: 'bg-neutral-100', iconFg: 'text-neutral-600' },
    brand: { iconBg: 'bg-brand-50', iconFg: 'text-brand-600' },
    success: { iconBg: 'bg-emerald-50', iconFg: 'text-emerald-600' },
    warning: { iconBg: 'bg-amber-50', iconFg: 'text-amber-600' },
    danger: { iconBg: 'bg-red-50', iconFg: 'text-red-600' },
    info: { iconBg: 'bg-blue-50', iconFg: 'text-blue-600' },
};

export function MetricCard({
    label,
    value,
    change,
    changeGood = true,
    hint,
    sparkline,
    sparklineTone,
    icon: Icon,
    tone = 'neutral',
    href,
    onClick,
    className,
}: MetricCardProps) {
    const t = toneClasses[tone];

    let changeColor = 'text-neutral-500';
    let ChangeIcon: typeof ArrowUp = Minus;
    if (change) {
        if (change.direction === 'up') {
            ChangeIcon = ArrowUp;
            changeColor = changeGood ? 'text-emerald-600' : 'text-red-600';
        } else if (change.direction === 'down') {
            ChangeIcon = ArrowDown;
            changeColor = changeGood ? 'text-red-600' : 'text-emerald-600';
        }
    }

    const inferredTone: SparklineTone =
        sparklineTone ??
        (tone === 'danger' ? 'danger'
            : tone === 'success' ? 'success'
            : tone === 'warning' ? 'warning'
            : tone === 'neutral' ? 'neutral'
            : 'brand');

    const inner = (
        <div className="flex h-full flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
                <p className="text-xs font-medium uppercase tracking-wide text-neutral-500 truncate">{label}</p>
                {Icon && (
                    <div
                        className={cn(
                            'shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
                            t.iconBg,
                            t.iconFg,
                        )}
                    >
                        <Icon className="w-4 h-4" />
                    </div>
                )}
            </div>
            <div className="text-3xl font-bold tabular-nums text-neutral-900 leading-none">{value}</div>
            <div className="mt-auto flex items-end justify-between gap-3">
                <div className="flex flex-col gap-0.5 min-w-0">
                    {change && (
                        <span className={cn('inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums', changeColor)}>
                            <ChangeIcon className="h-3 w-3" />
                            {Math.abs(change.value)}%
                        </span>
                    )}
                    {hint && <span className="text-xs text-neutral-400 truncate">{hint}</span>}
                </div>
                {sparkline && sparkline.length > 0 && (
                    <div className="w-24 shrink-0">
                        <Sparkline data={sparkline} tone={inferredTone} height={28} showArea />
                    </div>
                )}
            </div>
        </div>
    );

    const baseCls = cn(
        'rounded-xl border border-neutral-200 bg-white p-4 shadow-soft transition-all',
        (href || onClick) && 'hover:border-neutral-300 hover:shadow-md cursor-pointer',
        className,
    );

    if (href) {
        return (
            <Link href={href} className={baseCls}>
                {inner}
            </Link>
        );
    }
    if (onClick) {
        return (
            <button type="button" onClick={onClick} className={cn(baseCls, 'text-left w-full')}>
                {inner}
            </button>
        );
    }
    return <div className={baseCls}>{inner}</div>;
}
