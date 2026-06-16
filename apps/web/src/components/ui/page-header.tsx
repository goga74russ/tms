// ============================================================
// PageHeader — unified header for admin / detail pages.
//
// Replaces the repeated `<icon-tile> + <h1+sub>` pattern that
// every admin page redeclares manually. Supports an optional
// right-aligned actions slot and an optional metadata strip
// underneath the description (e.g. breadcrumbs, counters).
// ============================================================
'use client';

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface PageHeaderProps {
    icon?: LucideIcon;
    iconTone?: 'brand' | 'indigo' | 'emerald' | 'amber' | 'red' | 'sky';
    title: string;
    description?: ReactNode;
    actions?: ReactNode;
    /** Extra row below the description — counters, breadcrumbs, badges, etc. */
    meta?: ReactNode;
    /** Border separator below the header (default: false). */
    bordered?: boolean;
}

const TONE_CLASS: Record<NonNullable<PageHeaderProps['iconTone']>, string> = {
    brand: 'bg-brand-50 text-brand-600',
    indigo: 'bg-brand-50 text-brand-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600',
    sky: 'bg-sky-50 text-sky-600',
};

export function PageHeader({
    icon: Icon,
    iconTone = 'brand',
    title,
    description,
    actions,
    meta,
    bordered = false,
}: PageHeaderProps) {
    return (
        <div className={bordered ? 'pb-4 border-b border-neutral-200' : ''}>
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-start gap-3 min-w-0">
                    {Icon && (
                        <div
                            className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${TONE_CLASS[iconTone]}`}
                        >
                            <Icon className="w-5 h-5" />
                        </div>
                    )}
                    <div className="min-w-0">
                        <h1 className="text-2xl font-semibold text-neutral-900 leading-tight">{title}</h1>
                        {description && (
                            <p className="mt-1 text-sm text-neutral-500 leading-relaxed max-w-3xl">
                                {description}
                            </p>
                        )}
                    </div>
                </div>
                {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
            </div>
            {meta && <div className="mt-4">{meta}</div>}
        </div>
    );
}
