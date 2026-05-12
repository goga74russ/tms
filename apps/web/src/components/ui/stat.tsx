import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: (string | undefined | false | null)[]) {
    return twMerge(clsx(inputs));
}

export interface StatProps {
    label: string;
    value: React.ReactNode;
    trend?: string;
    trendType?: 'up' | 'down' | 'flat';
    /** When true, "up" is good and shows green. When false, "up" is bad (red). */
    trendIsGood?: boolean;
    icon?: LucideIcon;
    tone?: 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';
    hint?: string;
    className?: string;
}

const toneClasses: Record<NonNullable<StatProps['tone']>, { iconBg: string; iconFg: string; ring: string }> = {
    neutral: { iconBg: 'bg-neutral-100', iconFg: 'text-neutral-500', ring: '' },
    brand: { iconBg: 'bg-brand-50', iconFg: 'text-brand-600', ring: '' },
    success: { iconBg: 'bg-emerald-50', iconFg: 'text-emerald-600', ring: '' },
    warning: { iconBg: 'bg-amber-50', iconFg: 'text-amber-600', ring: '' },
    danger: { iconBg: 'bg-red-50', iconFg: 'text-red-600', ring: '' },
    info: { iconBg: 'bg-blue-50', iconFg: 'text-blue-600', ring: '' },
};

export function Stat({
    label,
    value,
    trend,
    trendType,
    trendIsGood = true,
    icon: Icon,
    tone = 'neutral',
    hint,
    className,
}: StatProps) {
    const t = toneClasses[tone];
    let trendColor = 'text-neutral-500';
    let TrendIcon: typeof ArrowUpRight = Minus;
    if (trendType === 'up') {
        TrendIcon = ArrowUpRight;
        trendColor = trendIsGood ? 'text-emerald-600' : 'text-red-600';
    } else if (trendType === 'down') {
        TrendIcon = ArrowDownRight;
        trendColor = trendIsGood ? 'text-red-600' : 'text-emerald-600';
    }

    return (
        <div
            className={cn(
                'rounded-xl border border-neutral-200 bg-white p-4 shadow-soft hover:border-neutral-300 transition-colors',
                className,
            )}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide truncate">{label}</p>
                    <p className="mt-2 text-2xl font-bold text-neutral-900 leading-none">{value}</p>
                    {(trend || hint) && (
                        <div className="mt-2 flex items-center gap-2 text-xs">
                            {trend && (
                                <span className={cn('inline-flex items-center gap-0.5 font-semibold', trendColor)}>
                                    <TrendIcon className="w-3.5 h-3.5" />
                                    {trend}
                                </span>
                            )}
                            {hint && <span className="text-neutral-400">{hint}</span>}
                        </div>
                    )}
                </div>
                {Icon && (
                    <div className={cn('shrink-0 w-10 h-10 rounded-xl flex items-center justify-center', t.iconBg, t.iconFg)}>
                        <Icon className="w-5 h-5" />
                    </div>
                )}
            </div>
        </div>
    );
}
