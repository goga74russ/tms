"use client";

import * as React from "react";
import { X, type LucideIcon } from "lucide-react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { ConfirmDialog } from "./dialog";

function cn(...inputs: (string | undefined | false | null)[]) {
    return twMerge(clsx(inputs));
}

export interface BulkAction {
    /** Visible label on the button. */
    label: string;
    /** Click handler. May return a Promise; bar shows loading state while it resolves. */
    onClick: () => void | Promise<void>;
    /** Optional lucide-react icon component. */
    icon?: LucideIcon;
    /** Visual variant. */
    variant?: "primary" | "default" | "danger";
    /** When true, opens a ConfirmDialog before calling onClick. */
    confirm?: boolean;
    /** Custom confirm dialog title. Defaults to "{label}?". */
    confirmTitle?: string;
    /** Custom confirm description. Defaults to "Действительно {label} {N} элементов?". */
    confirmDescription?: React.ReactNode;
    /** Disable this individual action. */
    disabled?: boolean;
}

export interface BulkActionsBarProps {
    /** Number of currently selected items. Bar hides when 0. */
    selectedCount: number;
    /** Called when the user clicks the × clear button. */
    onClear: () => void;
    /** Action buttons. */
    actions: BulkAction[];
    /** Optional override of the "Выбрано: N" label. */
    label?: (count: number) => React.ReactNode;
    /** Extra classes for the bar container. */
    className?: string;
}

const variantClass: Record<NonNullable<BulkAction["variant"]>, string> = {
    primary: "bg-brand-600 hover:bg-brand-500 text-white",
    default: "bg-white/10 hover:bg-white/20 text-white",
    danger: "bg-red-600 hover:bg-red-500 text-white",
};

/**
 * Floating bulk-actions bar. Renders at the bottom-center of the viewport
 * when `selectedCount > 0`, slides up on entry, and exposes action buttons.
 *
 * Each action may set `confirm: true` to prompt the user via ConfirmDialog
 * before executing.
 */
function BulkActionsBar({
    selectedCount,
    onClear,
    actions,
    label,
    className,
}: BulkActionsBarProps) {
    const [pendingAction, setPendingAction] = React.useState<BulkAction | null>(null);
    const [runningIndex, setRunningIndex] = React.useState<number | null>(null);

    if (selectedCount <= 0) return null;

    const runAction = async (action: BulkAction, index: number) => {
        setRunningIndex(index);
        try {
            await action.onClick();
        } finally {
            setRunningIndex(null);
        }
    };

    const handleClick = (action: BulkAction, index: number) => {
        if (action.confirm) {
            setPendingAction(action);
            return;
        }
        void runAction(action, index);
    };

    const confirmIndex = pendingAction ? actions.indexOf(pendingAction) : -1;

    return (
        <>
            <div
                role="region"
                aria-label="Действия с выбранными элементами"
                className={cn(
                    // Position
                    "fixed bottom-6 left-1/2 -translate-x-1/2 z-40",
                    // Animation (slide-up + fade-in)
                    "animate-in slide-in-from-bottom-4 fade-in duration-200",
                    // Sizing — never wider than viewport
                    "max-w-[calc(100vw-2rem)]",
                    className,
                )}
            >
                <div className="flex items-center gap-2 sm:gap-3 rounded-full bg-neutral-900 text-white shadow-2xl ring-1 ring-white/10 px-3 sm:px-4 py-2">
                    <span className="text-sm font-medium whitespace-nowrap pl-1 pr-1 sm:pr-2 border-r border-white/10">
                        {label ? label(selectedCount) : <>Выбрано: <span className="tabular-nums">{selectedCount}</span></>}
                    </span>

                    <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                        {actions.map((action, i) => {
                            const Icon = action.icon;
                            const variant = action.variant ?? "default";
                            const isRunning = runningIndex === i;
                            return (
                                <button
                                    key={action.label}
                                    type="button"
                                    disabled={action.disabled || runningIndex !== null}
                                    onClick={() => handleClick(action, i)}
                                    className={cn(
                                        "inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs sm:text-sm font-medium transition-colors",
                                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900",
                                        "disabled:opacity-50 disabled:pointer-events-none",
                                        variantClass[variant],
                                    )}
                                >
                                    {Icon && !isRunning && <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
                                    {isRunning && (
                                        <span
                                            className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin shrink-0"
                                            aria-hidden="true"
                                        />
                                    )}
                                    <span className="whitespace-nowrap">{action.label}</span>
                                </button>
                            );
                        })}
                    </div>

                    <button
                        type="button"
                        onClick={onClear}
                        aria-label="Снять выбор"
                        className="ml-1 sm:ml-2 inline-flex items-center justify-center w-7 h-7 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            <ConfirmDialog
                open={!!pendingAction}
                onClose={() => setPendingAction(null)}
                onConfirm={async () => {
                    const action = pendingAction;
                    const index = confirmIndex;
                    setPendingAction(null);
                    if (action && index >= 0) await runAction(action, index);
                }}
                title={pendingAction?.confirmTitle ?? (pendingAction ? `${pendingAction.label}?` : "")}
                description={
                    pendingAction?.confirmDescription ??
                    (pendingAction ? `Действительно ${pendingAction.label.toLowerCase()} ${selectedCount} элементов?` : null)
                }
                destructive={pendingAction?.variant === "danger"}
                confirmLabel={pendingAction?.label ?? "Подтвердить"}
            />
        </>
    );
}

export { BulkActionsBar };
