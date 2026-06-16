// TODO(deprecate): replaced by ui/kanban-board.tsx — the page now uses the
// generic <KanbanBoard> primitive from @/components/ui/kanban. This module
// is kept temporarily for reference and will be removed next round.
'use client';

import { useState, DragEvent, useCallback } from 'react';
import { OrderCard } from './OrderCard';
import { ORDER_STATE_TRANSITIONS, ORDER_STATUS, label } from '@tms/shared';
import type { Order } from '../page';

interface KanbanColumn {
    key: string;
    label: string;
    color: string;
}

interface KanbanBoardProps {
    orders: Order[];
    columns: KanbanColumn[];
    onStatusChange: (orderId: string, newStatus: string) => void;
    onTransitionReject?: (message: string) => void;
}

export function KanbanBoard({ orders, columns, onStatusChange, onTransitionReject }: KanbanBoardProps) {
    const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
    const [draggedOrderId, setDraggedOrderId] = useState<string | null>(null);
    const [rejectAnimation, setRejectAnimation] = useState<string | null>(null);

    // Check if transition is allowed
    const isTransitionAllowed = useCallback((fromStatus: string, toStatus: string): boolean => {
        if (fromStatus === toStatus) return false;
        const allowed = ORDER_STATE_TRANSITIONS[fromStatus];
        return allowed ? allowed.includes(toStatus) : false;
    }, []);

    const handleDragStart = (e: DragEvent, orderId: string) => {
        e.dataTransfer.setData('orderId', orderId);
        e.dataTransfer.effectAllowed = 'move';
        setDraggedOrderId(orderId);
    };

    const handleDragEnd = () => {
        setDraggedOrderId(null);
        setDragOverColumn(null);
    };

    const handleDragOver = (e: DragEvent, columnKey: string) => {
        e.preventDefault();

        // Check if this is a valid drop target
        if (draggedOrderId) {
            const order = orders.find(o => o.id === draggedOrderId);
            if (order && isTransitionAllowed(order.status, columnKey)) {
                e.dataTransfer.dropEffect = 'move';
                setDragOverColumn(columnKey);
            } else {
                e.dataTransfer.dropEffect = 'none';
                setDragOverColumn(null);
            }
        }
    };

    const handleDragLeave = () => {
        setDragOverColumn(null);
    };

    const handleDrop = (e: DragEvent, columnKey: string) => {
        e.preventDefault();
        setDragOverColumn(null);
        setDraggedOrderId(null);

        const orderId = e.dataTransfer.getData('orderId');
        if (!orderId) return;

        const order = orders.find(o => o.id === orderId);
        if (!order) return;

        if (!isTransitionAllowed(order.status, columnKey)) {
            // Show rejection animation
            setRejectAnimation(columnKey);
            setTimeout(() => setRejectAnimation(null), 600);

            const from = label(ORDER_STATUS, order.status);
            const to = label(ORDER_STATUS, columnKey);
            onTransitionReject?.(`Нельзя: «${from}» → «${to}»`);
            return;
        }

        onStatusChange(orderId, columnKey);
    };

    // Determine which columns are valid targets for the currently dragged item
    const getColumnHighlight = (columnKey: string): 'valid' | 'invalid' | 'none' => {
        if (!draggedOrderId) return 'none';
        const order = orders.find(o => o.id === draggedOrderId);
        if (!order || order.status === columnKey) return 'none';
        return isTransitionAllowed(order.status, columnKey) ? 'valid' : 'invalid';
    };

    return (
        // B-8: explicit overflow-x scroll + min-w-max on inner row so wider screens
        // still hard-wrap to a scrolling track instead of clipping the last column.
        <div className="overflow-x-auto pb-4 -mx-2 px-2">
            <div className="flex gap-4 min-w-max">
            {columns.map((col) => {
                const columnOrders = orders.filter(o => o.status === col.key);
                const isDragOver = dragOverColumn === col.key;
                const highlight = getColumnHighlight(col.key);
                const isRejecting = rejectAnimation === col.key;

                return (
                    <div
                        key={col.key}
                        className={`flex-shrink-0 min-w-[280px] w-72 rounded-xl transition-all duration-200 ${isRejecting
                            ? 'bg-danger-50 ring-2 ring-danger-300 ring-offset-2 animate-shake'
                            : isDragOver
                                ? 'bg-brand-50 ring-2 ring-brand-300 ring-offset-2'
                                : highlight === 'valid'
                                    ? 'bg-success-50/50 border border-dashed border-success-300'
                                    : highlight === 'invalid'
                                        ? 'bg-neutral-100/50 opacity-50'
                                        : 'bg-neutral-100/70'
                            }`}
                        onDragOver={(e: any) => handleDragOver(e, col.key)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e: any) => handleDrop(e, col.key)}
                    >
                        {/* Column header */}
                        <div className="px-4 py-3 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div
                                    className="w-3 h-3 rounded-full shadow-sm"
                                    style={{ backgroundColor: col.color }}
                                />
                                <span className="text-sm font-semibold text-neutral-700">
                                    {col.label}
                                </span>
                            </div>
                            <span className="text-xs font-bold text-neutral-400 bg-white rounded-full w-6 h-6 flex items-center justify-center">
                                {columnOrders.length}
                            </span>
                        </div>

                        {/* Cards */}
                        <div className="px-3 pb-3 space-y-2.5 min-h-[200px]">
                            {columnOrders.map((order) => (
                                <OrderCard
                                    key={order.id}
                                    order={order}
                                    onDragStart={(e: any) => handleDragStart(e, order.id)}
                                    onDragEnd={handleDragEnd}
                                />
                            ))}
                            {columnOrders.length === 0 && (
                                <div className="text-center py-8 text-xs text-neutral-400">
                                    Перетащите заявку сюда
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
            </div>
        </div>
    );
}
