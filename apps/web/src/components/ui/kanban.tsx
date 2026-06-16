'use client';

import * as React from 'react';
import { Plus, GripVertical } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: (string | undefined | false | null)[]) {
    return twMerge(clsx(inputs));
}

// ===================== Types =====================

export type KanbanTone = 'neutral' | 'brand' | 'info' | 'success' | 'warning' | 'danger';

interface KanbanContextValue {
    onMove?: (itemId: string, fromCol: string, toCol: string) => void;
    /** Returns true if the drop is allowed. Optional — when omitted, all drops are allowed. */
    canMove?: (itemId: string, fromCol: string, toCol: string) => boolean;
    /** Called when a drop is rejected by canMove. */
    onMoveReject?: (itemId: string, fromCol: string, toCol: string) => void;
    draggedItem: { id: string; fromCol: string } | null;
    setDraggedItem: (next: { id: string; fromCol: string } | null) => void;
}

const KanbanContext = React.createContext<KanbanContextValue | null>(null);

function useKanban(): KanbanContextValue {
    const ctx = React.useContext(KanbanContext);
    if (!ctx) {
        throw new Error('Kanban primitives must be rendered inside <KanbanBoard>.');
    }
    return ctx;
}

// ===================== Tone tables =====================

// Top strip (4px) — solid accent
const toneStrip: Record<KanbanTone, string> = {
    neutral: 'bg-neutral-400',
    brand: 'bg-brand-500',
    info: 'bg-sky-500',
    success: 'bg-success-500',
    warning: 'bg-warning-500',
    danger: 'bg-danger-500',
};

// Tinted column background (very subtle)
const toneColumnBg: Record<KanbanTone, string> = {
    neutral: 'bg-neutral-50',
    brand: 'bg-brand-50/60',
    info: 'bg-sky-50/60',
    success: 'bg-success-50/60',
    warning: 'bg-warning-50/60',
    danger: 'bg-danger-50/60',
};

// Count badge tints
const toneBadge: Record<KanbanTone, string> = {
    neutral: 'bg-neutral-100 text-neutral-700',
    brand: 'bg-brand-100 text-brand-700',
    info: 'bg-sky-100 text-sky-700',
    success: 'bg-success-100 text-success-700',
    warning: 'bg-warning-100 text-warning-700',
    danger: 'bg-danger-100 text-danger-700',
};

// Header text (slightly tone-tinted for hierarchy)
const toneHeaderText: Record<KanbanTone, string> = {
    neutral: 'text-neutral-800',
    brand: 'text-brand-800',
    info: 'text-sky-800',
    success: 'text-success-800',
    warning: 'text-warning-800',
    danger: 'text-danger-800',
};

// ===================== KanbanBoard =====================

export interface KanbanBoardProps {
    /** Called when an item is dropped on a different column. */
    onMove: (itemId: string, fromCol: string, toCol: string) => void;
    /** Optional gate — return false to reject the drop. */
    canMove?: (itemId: string, fromCol: string, toCol: string) => boolean;
    /** Called when a drop is rejected. */
    onMoveReject?: (itemId: string, fromCol: string, toCol: string) => void;
    children: React.ReactNode;
    className?: string;
}

export function KanbanBoard({ onMove, canMove, onMoveReject, children, className }: KanbanBoardProps) {
    const [draggedItem, setDraggedItem] = React.useState<{ id: string; fromCol: string } | null>(null);

    const ctxValue = React.useMemo<KanbanContextValue>(() => ({
        onMove,
        canMove,
        onMoveReject,
        draggedItem,
        setDraggedItem,
    }), [onMove, canMove, onMoveReject, draggedItem]);

    return (
        <KanbanContext.Provider value={ctxValue}>
            <div className={cn('overflow-x-auto pb-2 -mx-2 px-2', className)}>
                <div className="flex gap-4 min-w-max items-start">{children}</div>
            </div>
        </KanbanContext.Provider>
    );
}

// ===================== KanbanColumn =====================

export interface KanbanColumnProps {
    id: string;
    title: string;
    tone?: KanbanTone;
    count: number;
    onQuickAdd?: () => void;
    /** Optional override for empty content. Defaults to a hint. */
    emptyState?: React.ReactNode;
    children?: React.ReactNode;
    className?: string;
}

export function KanbanColumn({
    id,
    title,
    tone = 'neutral',
    count,
    onQuickAdd,
    emptyState,
    children,
    className,
}: KanbanColumnProps) {
    const { draggedItem, onMove, canMove, onMoveReject } = useKanban();
    const [isOver, setIsOver] = React.useState(false);
    const [rejecting, setRejecting] = React.useState(false);

    const isSelf = draggedItem?.fromCol === id;
    const isValidTarget = React.useMemo(
        () =>
            draggedItem && !isSelf
                ? (canMove ? canMove(draggedItem.id, draggedItem.fromCol, id) : true)
                : null,
        [draggedItem, isSelf, canMove, id],
    );

    function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
        e.preventDefault();
        if (!draggedItem || isSelf) {
            e.dataTransfer.dropEffect = 'none';
            return;
        }
        if (isValidTarget) {
            e.dataTransfer.dropEffect = 'move';
            setIsOver(true);
        } else {
            e.dataTransfer.dropEffect = 'none';
        }
    }

    function handleDragLeave() {
        setIsOver(false);
    }

    function handleDrop(e: React.DragEvent<HTMLDivElement>) {
        e.preventDefault();
        setIsOver(false);
        const itemId = e.dataTransfer.getData('kanban/item-id');
        const fromCol = e.dataTransfer.getData('kanban/from-col');
        if (!itemId || !fromCol || fromCol === id) return;

        if (canMove && !canMove(itemId, fromCol, id)) {
            setRejecting(true);
            window.setTimeout(() => setRejecting(false), 500);
            onMoveReject?.(itemId, fromCol, id);
            return;
        }

        onMove?.(itemId, fromCol, id);
    }

    const empty = count === 0;

    return (
        <div
            data-kanban-column={id}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
                'flex-shrink-0 w-[280px] xl:w-[320px] rounded-xl overflow-hidden border border-neutral-200/70 transition-all duration-200',
                toneColumnBg[tone],
                isOver && 'ring-2 ring-offset-1 ring-brand-300',
                rejecting && 'ring-2 ring-offset-1 ring-danger-400 animate-pulse',
                draggedItem && !isSelf && isValidTarget === false && 'opacity-60',
                className,
            )}
        >
            {/* Tinted strip */}
            <div className={cn('h-1', toneStrip[tone])} />

            {/* Header */}
            <div className="px-3 py-2.5 flex items-center justify-between bg-white/70 backdrop-blur-sm border-b border-neutral-200/60">
                <div className="flex items-center gap-2 min-w-0">
                    <span className={cn('text-sm font-semibold truncate', toneHeaderText[tone])}>{title}</span>
                    <span className={cn(
                        'inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold',
                        toneBadge[tone],
                    )}>
                        {count}
                    </span>
                </div>
                {onQuickAdd && (
                    <button
                        type="button"
                        onClick={onQuickAdd}
                        aria-label={`Добавить в «${title}»`}
                        className="shrink-0 p-1 rounded-md text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* Body */}
            <div className="px-2 py-2 flex flex-col gap-2 min-h-[180px] max-h-[calc(100vh-340px)] overflow-y-auto">
                {empty
                    ? (emptyState ?? (
                        <div className="flex-1 flex items-center justify-center text-center text-xs text-neutral-400 py-8 px-2 rounded-lg border border-dashed border-neutral-200 bg-white/40">
                            Перетащите карточку сюда
                        </div>
                    ))
                    : children}
            </div>

            {/* Footer quick-add (always visible when handler provided and column has items) */}
            {onQuickAdd && !empty && (
                <div className="px-2 pb-2">
                    <button
                        type="button"
                        onClick={onQuickAdd}
                        className="w-full inline-flex items-center justify-center gap-1.5 h-8 rounded-lg text-xs font-medium text-neutral-500 hover:text-neutral-800 hover:bg-white/80 transition-colors"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        Добавить
                    </button>
                </div>
            )}
        </div>
    );
}

// ===================== KanbanCard =====================

export interface KanbanCardProps {
    id: string;
    /** The column id the card currently lives in (required so onMove knows source). */
    fromCol: string;
    onClick?: () => void;
    children: React.ReactNode;
    className?: string;
    /** Disable drag. */
    disabled?: boolean;
}

export function KanbanCard({ id, fromCol, onClick, children, className, disabled }: KanbanCardProps) {
    const { setDraggedItem, draggedItem } = useKanban();
    const isDragging = draggedItem?.id === id;

    function handleDragStart(e: React.DragEvent<HTMLDivElement>) {
        if (disabled) {
            e.preventDefault();
            return;
        }
        e.dataTransfer.setData('kanban/item-id', id);
        e.dataTransfer.setData('kanban/from-col', fromCol);
        e.dataTransfer.effectAllowed = 'move';
        setDraggedItem({ id, fromCol });
    }

    function handleDragEnd() {
        setDraggedItem(null);
    }

    return (
        <div
            draggable={!disabled}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onClick={onClick}
            className={cn(
                'group relative bg-white rounded-lg border border-neutral-200 shadow-sm hover:shadow-md hover:border-neutral-300 transition-all duration-150',
                'cursor-grab active:cursor-grabbing',
                onClick && 'cursor-pointer',
                isDragging && 'opacity-60 rotate-1 scale-[0.98]',
                disabled && 'cursor-default opacity-70',
                className,
            )}
            style={isDragging ? { transform: 'rotate(2deg) scale(0.98)' } : undefined}
        >
            {!disabled && (
                <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity text-neutral-300 pointer-events-none">
                    <GripVertical className="w-3.5 h-3.5" />
                </div>
            )}
            {children}
        </div>
    );
}

// ===================== ViewTabs =====================

export interface ViewTabsOption<T extends string> {
    value: T;
    label: string;
    icon?: React.ComponentType<{ className?: string }>;
}

export interface ViewTabsProps<T extends string> {
    value: T;
    onChange: (v: T) => void;
    options: ViewTabsOption<T>[];
    className?: string;
    'aria-label'?: string;
}

export function ViewTabs<T extends string>({ value, onChange, options, className, ...rest }: ViewTabsProps<T>) {
    return (
        <div
            role="tablist"
            aria-label={rest['aria-label'] || 'Режим отображения'}
            className={cn('inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-white p-1', className)}
        >
            {options.map((opt) => {
                const Icon = opt.icon;
                const active = opt.value === value;
                return (
                    <button
                        key={opt.value}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => onChange(opt.value)}
                        className={cn(
                            'inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-xs font-medium transition-colors',
                            active
                                ? 'bg-brand-50 text-brand-700 border border-brand-200 shadow-sm'
                                : 'text-neutral-500 hover:text-neutral-800 hover:bg-neutral-50 border border-transparent',
                        )}
                    >
                        {Icon && <Icon className="w-3.5 h-3.5" />}
                        <span>{opt.label}</span>
                    </button>
                );
            })}
        </div>
    );
}
