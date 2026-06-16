'use client';

import { DragEvent } from 'react';
import { Package, MapPin, Clock, AlertTriangle, FileText } from 'lucide-react';
import type { Order } from '../page';
import { downloadFromApi } from '@/lib/download';


async function downloadTtn(orderId: string, orderNumber: string) {
    await downloadFromApi(`/api/orders/${orderId}/ttn`, `ttn_${orderNumber}.pdf`);
}

// P1-4 — договор-заявка (PDF).
async function downloadContract(orderId: string, orderNumber: string) {
    await downloadFromApi(`/api/orders/${orderId}/contract`, `contract_${orderNumber}.pdf`);
}

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
            className="bg-white rounded-lg p-3.5 shadow-sm border border-neutral-200 cursor-grab active:cursor-grabbing hover:shadow-md hover:border-neutral-300 transition-all duration-150 group"
        >
            {/* Header: Number + SLA */}
            <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-brand-600 font-mono">
                    {order.number}
                </span>
                <div className="flex items-center gap-1.5">
                    {order.adrClass && (
                        <span
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-[10px] font-bold border border-red-200"
                            title={`ADR класс ${order.adrClass}${order.adrUnNumber ? ` · ${order.adrUnNumber}` : ''}`}
                        >
                            <AlertTriangle className="w-2.5 h-2.5" />
                            ADR-{order.adrClass}
                        </span>
                    )}
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
            <p className="text-sm font-medium text-neutral-800 mb-2 truncate">
                {order.contractorName}
            </p>

            {/* Cargo */}
            <div className="flex items-center gap-1.5 text-xs text-neutral-500 mb-1.5">
                <Package className="w-3.5 h-3.5 text-neutral-400" />
                <span className="truncate">{order.cargoDescription}</span>
                <span className="ml-auto font-semibold text-neutral-600 whitespace-nowrap">
                    {formatWeight(order.cargoWeightKg)}
                </span>
            </div>

            {/* Route */}
            <div className="space-y-1">
                <div className="flex items-start gap-1.5 text-xs text-neutral-500">
                    <MapPin className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" />
                    <span className="truncate">{order.loadingAddress}</span>
                </div>
                <div className="flex items-start gap-1.5 text-xs text-neutral-500">
                    <MapPin className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                    <span className="truncate">{order.unloadingAddress}</span>
                </div>
            </div>

            {/* Time */}
            {order.loadingWindowStart && (
                <div className="flex items-center gap-1.5 text-[10px] text-neutral-400 mt-2 pt-2 border-t border-neutral-100">
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
            {/* ТТН */}
            <div className="flex items-center justify-end mt-2 pt-1 border-t border-neutral-100 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                    onMouseDown={e => e.stopPropagation()}
                    onClick={e => { e.stopPropagation(); downloadContract(order.id, order.number); }}
                    className="flex items-center gap-1 text-[10px] text-neutral-400 hover:text-blue-600 px-1.5 py-0.5 rounded hover:bg-blue-50 transition-colors mr-1"
                    title="Скачать договор-заявку (PDF)"
                >
                    <FileText className="w-3 h-3" />
                    Договор
                </button>
                <button
                    onMouseDown={e => e.stopPropagation()}
                    onClick={e => { e.stopPropagation(); downloadTtn(order.id, order.number); }}
                    className="flex items-center gap-1 text-[10px] text-neutral-400 hover:text-red-600 px-1.5 py-0.5 rounded hover:bg-red-50 transition-colors"
                    title="Скачать ТТН (PDF)"
                >
                    <FileText className="w-3 h-3" />
                    ТТН
                </button>
                <button
                    onMouseDown={e => e.stopPropagation()}
                    onClick={e => { e.stopPropagation(); window.open(`/print/ttn/${order.id}`, '_blank'); }}
                    className="flex items-center gap-1 text-[10px] text-neutral-400 hover:text-purple-600 px-1.5 py-0.5 rounded hover:bg-purple-50 transition-colors ml-1"
                    title="Печать ТТН"
                >
                    🖨
                </button>
            </div>
        </div>
    );
}
