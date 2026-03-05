'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { RepairCard } from './RepairCard';

interface Repair {
    id: string;
    vehicleId: string;
    status: string;
    description: string;
    priority: string;
    source: string;
    assignedTo?: string;
    totalCost: number;
    createdAt: string;
    photoUrls: string[];
}

const COLUMNS = [
    { status: 'created', label: 'Создана', color: 'border-amber-400', bg: 'bg-amber-50' },
    { status: 'waiting_parts', label: 'Ждёт з/ч', color: 'border-blue-400', bg: 'bg-blue-50' },
    { status: 'in_progress', label: 'В работе', color: 'border-indigo-400', bg: 'bg-indigo-50' },
    { status: 'done', label: 'Готово', color: 'border-emerald-400', bg: 'bg-emerald-50' },
];

const REPAIR_STATE_TRANSITIONS: Record<string, string[]> = {
    created: ['waiting_parts', 'in_progress'],
    waiting_parts: ['in_progress'],
    in_progress: ['done', 'waiting_parts'],
    done: [],
};

export function RepairKanban({ onStatusChange }: { onStatusChange: () => void }) {
    const [repairs, setRepairs] = useState<Repair[]>([]);
    const [loading, setLoading] = useState(true);
    const [dragging, setDragging] = useState<string | null>(null);
    const [dragOver, setDragOver] = useState<string | null>(null);

    useEffect(() => { loadRepairs(); }, []);

    async function loadRepairs() {
        setLoading(true);
        try {
            const result = await api.get<any>('/repairs?limit=100');
            setRepairs(result.data || []);
        } catch (err) {
            console.error('Failed to load repairs:', err);
        } finally {
            setLoading(false);
        }
    }

    async function changeStatus(repairId: string, newStatus: string) {
        try {
            await api.put<any>(`/repairs/${repairId}/status`, { status: newStatus });
            // Optimistic update
            setRepairs(prev => prev.map(r =>
                r.id === repairId ? { ...r, status: newStatus } : r
            ));
            onStatusChange();
        } catch (err: any) {
            alert(`Ошибка: ${err.message}`);
            loadRepairs();
        }
    }

    function handleDragStart(repairId: string) {
        setDragging(repairId);
    }

    function handleDragOver(e: React.DragEvent, status: string) {
        e.preventDefault();
        setDragOver(status);
    }

    function handleDragLeave() {
        setDragOver(null);
    }

    function handleDrop(e: React.DragEvent, newStatus: string) {
        e.preventDefault();
        setDragOver(null);
        if (dragging) {
            const repair = repairs.find(r => r.id === dragging);
            if (repair && repair.status !== newStatus) {
                const allowed = REPAIR_STATE_TRANSITIONS[repair.status] || [];
                if (!allowed.includes(newStatus)) {
                    alert(`Нельзя перевести заявку из статуса '${repair.status}' в '${newStatus}'`);
                    setDragging(null);
                    return;
                }
                changeStatus(dragging, newStatus);
            }
        }
        setDragging(null);
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="grid grid-cols-4 gap-4 min-h-[500px]">
            {COLUMNS.map(col => {
                const columnRepairs = repairs.filter(r => r.status === col.status);
                const isOver = dragOver === col.status;
                return (
                    <div
                        key={col.status}
                        className={`rounded-xl border-2 border-dashed transition-colors duration-200
                            ${isOver ? `${col.color} ${col.bg}` : 'border-slate-200 bg-slate-50/50'}`}
                        onDragOver={e => handleDragOver(e, col.status)}
                        onDragLeave={handleDragLeave}
                        onDrop={e => handleDrop(e, col.status)}
                    >
                        {/* Column header */}
                        <div className={`px-4 py-3 border-b-2 ${col.color} bg-white rounded-t-xl`}>
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-semibold text-slate-800">{col.label}</h3>
                                <span className="px-2 py-0.5 bg-slate-100 rounded-full text-xs font-medium text-slate-600">
                                    {columnRepairs.length}
                                </span>
                            </div>
                        </div>

                        {/* Cards */}
                        <div className="p-3 space-y-3 max-h-[600px] overflow-y-auto">
                            {columnRepairs.length === 0 ? (
                                <p className="text-xs text-slate-400 text-center py-8">
                                    Нет заявок
                                </p>
                            ) : columnRepairs.map(repair => (
                                <div
                                    key={repair.id}
                                    draggable
                                    onDragStart={() => handleDragStart(repair.id)}
                                    className={`cursor-grab active:cursor-grabbing transition-opacity
                                        ${dragging === repair.id ? 'opacity-50' : 'opacity-100'}`}
                                >
                                    <RepairCard repair={repair} />
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
