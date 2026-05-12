import * as React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: (string | undefined | false | null)[]) {
    return twMerge(clsx(inputs));
}

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {}

/**
 * Animated shimmer placeholder. Pass width/height via Tailwind classes:
 *   <Skeleton className="h-4 w-32" />
 *   <Skeleton className="h-10 w-10 rounded-full" />
 */
export function Skeleton({ className, ...props }: SkeletonProps) {
    return (
        <div
            aria-hidden="true"
            className={cn(
                'animate-pulse rounded-md bg-gradient-to-r from-neutral-200 via-neutral-100 to-neutral-200 bg-[length:200%_100%]',
                className,
            )}
            {...props}
        />
    );
}

/**
 * Helper for skeleton table rows. Renders `rows` rows × `columns` cells.
 */
export function SkeletonRow({
    columns = 4,
    cellClassName,
}: {
    columns?: number;
    cellClassName?: string;
}) {
    return (
        <tr className="border-b border-neutral-100">
            {Array.from({ length: columns }).map((_, i) => (
                <td key={i} className="px-4 py-3">
                    <Skeleton className={cn('h-4 w-full max-w-[160px]', cellClassName)} />
                </td>
            ))}
        </tr>
    );
}

export function SkeletonTable({
    rows = 5,
    columns = 4,
}: {
    rows?: number;
    columns?: number;
}) {
    return (
        <table className="w-full" aria-busy="true" aria-label="Загрузка...">
            <tbody>
                {Array.from({ length: rows }).map((_, i) => (
                    <SkeletonRow key={i} columns={columns} />
                ))}
            </tbody>
        </table>
    );
}
