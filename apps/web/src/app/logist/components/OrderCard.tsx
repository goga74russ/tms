'use client';

import { DragEvent } from 'react';
import { Package, MapPin, Clock, AlertTriangle } from 'lucide-react';
import type { Order } from '../page';

interface OrderCardProps {
    key?: string;
    order: Order;
    onDragStart: (e: DragEvent) => void;
    onDragEnd?: () => void;
}

function getSlaIndicator(order: Order): { color: string; label: string } {
    if (!order.unloadingWindowEnd) return { color: '#94a3b8', label: 'Без SLA' };

    const deadline = new Date(order.unloadingWindowEnd);
    const now = new Date();
    const hoursLeft = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (hoursLeft < 0) return { color: '#ef4444', label: 'Просрочено' };
    if (hoursLeft < 4) return { color: '#f59e0b', label: `${Math.round(hoursLeft)}ч` };
    if (hoursLeft < 24) return { color: '#22c55e', label: `${Math.round(hoursLeft)}ч` };
    return { color: '#22c55e', label: `${Math.round(hoursLeft / 24)}д` };
}

function formatWeight(kg: number): string {
    if (kg >= 1000) return `${(kg / 1000).toFixed(1)}т`;
    return `${kg}кг`;
}

export function OrderCard({ order, onDragStart, onDragEnd }: OrderCardProps) {
    const sla = getSlaIndicator(order);

    return (
        <div
            draggable
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            className="bg-white rounded-lg p-3.5 shadow-sm border border-slate-200 cursor-grab active:cursor-grabbing hover:shadow-md hover:border-slate-300 transition-all duration-150 group"
        >
            {/* Header: Number + SLA */}
            <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-indigo-600 font-mono">
                    {order.number}
                </span>
                <div className="flex items-center gap-1">
                    <div
                        className="w-2 h-2 rounded-full animate-pulse"
                        style={{ backgroundColor: sla.color }}
                    />
                    <span className="text-[10px] font-medium" style={{ color: sla.color }}>
                        {sla.label}
                    </span>
                </div>
            </div>

            {/* Client */}
            <p className="text-sm font-medium text-slate-800 mb-2 truncate">
                {order.contractorName}
            </p>

            {/* Cargo */}
            <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1.5">
                <Package className="w-3.5 h-3.5 text-slate-400" />
                <span className="truncate">{order.cargoDescription}</span>
                <span className="ml-auto font-semibold text-slate-600 whitespace-nowrap">
                    {formatWeight(order.cargoWeightKg)}
                </span>
            </div>

            {/* Route */}
            <div className="space-y-1">
                <div className="flex items-start gap-1.5 text-xs text-slate-500">
                    <MapPin className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" />
                    <span className="truncate">{order.loadingAddress}</span>
                </div>
                <div className="flex items-start gap-1.5 text-xs text-slate-500">
                    <MapPin className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                    <span className="truncate">{order.unloadingAddress}</span>
                </div>
            </div>

            {/* Time */}
            {order.loadingWindowStart && (
                <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-2 pt-2 border-t border-slate-100">
                    <Clock className="w-3 h-3" />
                    <span>
                        {new Date(order.loadingWindowStart).toLocaleDateString('ru-RU', {
                            day: 'numeric', month: 'short',
                        })}
                        {' '}
                        {new Date(order.loadingWindowStart).toLocaleTimeString('ru-RU', {
                            hour: '2-digit', minute: '2-digit',
                        })}
                    </span>
                </div>
            )}
        </div>
    );
}
