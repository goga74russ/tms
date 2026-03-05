'use client';

import { useState, DragEvent, useCallback } from 'react';
import { OrderCard } from './OrderCard';
import { ORDER_STATE_TRANSITIONS } from '@tms/shared';
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

const STATUS_LABELS: Record<string, string> = {
    draft: 'Черновик',
    confirmed: 'Подтверждена',
    assigned: 'Назначена',
    in_transit: 'В пути',
    delivered: 'Доставлена',
    returned: 'Возвращена',
    cancelled: 'Отменена',
};

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

            const from = STATUS_LABELS[order.status] || order.status;
            const to = STATUS_LABELS[columnKey] || columnKey;
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
        <div className="flex gap-4 overflow-x-auto pb-4">
            {columns.map((col) => {
                const columnOrders = orders.filter(o => o.status === col.key);
                const isDragOver = dragOverColumn === col.key;
                const highlight = getColumnHighlight(col.key);
                const isRejecting = rejectAnimation === col.key;

                return (
                    <div
                        key={col.key}
                        className={`flex-shrink-0 w-72 rounded-xl transition-all duration-200 ${isRejecting
                            ? 'bg-red-50 ring-2 ring-red-300 ring-offset-2 animate-shake'
                            : isDragOver
                                ? 'bg-indigo-50 ring-2 ring-indigo-300 ring-offset-2'
                                : highlight === 'valid'
                                    ? 'bg-emerald-50/50 border border-dashed border-emerald-300'
                                    : highlight === 'invalid'
                                        ? 'bg-slate-100/50 opacity-50'
                                        : 'bg-slate-100/70'
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
                                <span className="text-sm font-semibold text-slate-700">
                                    {col.label}
                                </span>
                            </div>
                            <span className="text-xs font-bold text-slate-400 bg-white rounded-full w-6 h-6 flex items-center justify-center">
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
                                <div className="text-center py-8 text-xs text-slate-400">
                                    Перетащите заявку сюда
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
