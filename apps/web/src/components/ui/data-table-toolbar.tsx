'use client';

import * as React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: (string | undefined | false | null)[]) {
    return twMerge(clsx(inputs));
}

/**
 * Convenience wrapper for laying out a DataTable toolbar trailing-side
 * (action buttons + a divider). Usually pased to `<DataTable toolbar={...}>`.
 */
export function DataTableToolbar({
    children,
    className,
}: {
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <div className={cn('flex items-center gap-2 flex-wrap', className)}>
            {children}
        </div>
    );
}

/**
 * Optional vertical divider for spacing groups inside a toolbar.
 */
export function DataTableToolbarDivider() {
    return <div aria-hidden="true" className="h-5 w-px bg-slate-200" />;
}
