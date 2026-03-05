'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Wrench, Plus, X, Loader2 } from 'lucide-react';
import { RepairKanban } from './components/RepairKanban';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

function CreateRepairModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
    const [vehicles, setVehicles] = useState<any[]>([]);
    const [vehicleId, setVehicleId] = useState('');
    const [description, setDescription] = useState('');
    const [priority, setPriority] = useState('normal');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        api.get<any>('/fleet/vehicles?limit=100').then(r => setVehicles(r.data || [])).catch(() => { });
    }, []);

    async function handleSubmit() {
        if (!vehicleId || !description) {
            setError('Выберите ТС и опишите неисправность');
            return;
        }
        setSubmitting(true);
        setError('');
        try {
            const result = await api.post<any>('/repairs', { vehicleId, description, priority });
            if (result.success) {
                onCreated();
            } else {
                throw new Error(result.error || 'Ошибка');
            }
        } catch (err: any) {
            setError(err.message || 'Ошибка сервера');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                    <h2 className="text-lg font-bold text-slate-900">Новая заявка на ремонт</h2>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <div className="px-6 py-5 space-y-4">
                    <div>
                        <label className="text-sm font-medium text-slate-700 mb-1.5 block">Транспорт *</label>
                        <select
                            value={vehicleId}
                            onChange={e => setVehicleId(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="">Выберите ТС</option>
                            {vehicles.map(v => (
                                <option key={v.id} value={v.id}>{v.plateNumber} — {v.make} {v.model}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="text-sm font-medium text-slate-700 mb-1.5 block">Описание неисправности *</label>
                        <textarea
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                            rows={3}
                            placeholder="Опишите проблему..."
                        />
                    </div>
                    <div>
                        <label className="text-sm font-medium text-slate-700 mb-1.5 block">Приоритет</label>
                        <select
                            value={priority}
                            onChange={e => setPriority(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="low">Низкий</option>
                            <option value="normal">Обычный</option>
                            <option value="high">Высокий</option>
                            <option value="critical">Критический</option>
                        </select>
                    </div>
                    {error && <p className="text-sm text-red-600">{error}</p>}
                </div>
                <div className="px-6 py-4 border-t border-slate-100 flex gap-3 justify-end">
                    <button onClick={onClose} disabled={submitting} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100">
                        Отмена
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={submitting}
                        className="px-5 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                        {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                        {submitting ? 'Создание...' : 'Создать'}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function RepairPage() {
    const [stats, setStats] = useState<Array<{ status: string; count: number }>>([]);
    const [showCreateModal, setShowCreateModal] = useState(false);

    useEffect(() => {
        loadStats();
    }, []);

    async function loadStats() {
        try {
            const result = await api.get<any>('/repairs/analytics/by-status');
            setStats(result.data || []);
        } catch (err) {
            console.error('Failed to load stats:', err);
        }
    }

    const statusLabels: Record<string, { label: string; color: string }> = {
        created: { label: 'Создана', color: 'bg-amber-500' },
        waiting_parts: { label: 'Ждёт з/ч', color: 'bg-blue-500' },
        in_progress: { label: 'В работе', color: 'bg-indigo-500' },
        done: { label: 'Готово', color: 'bg-emerald-500' },
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Ремонтная служба</h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Заявки на ремонт и техническое обслуживание
                    </p>
                </div>
                <Button
                    className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white"
                    onClick={() => setShowCreateModal(true)}
                >
                    <Plus className="w-4 h-4" />
                    Новая заявка
                </Button>
            </div>

            {/* Stats bar */}
            <div className="grid grid-cols-4 gap-4">
                {['created', 'waiting_parts', 'in_progress', 'done'].map(status => {
                    const st = statusLabels[status];
                    const count = stats.find(s => s.status === status)?.count || 0;
                    return (
                        <Card key={status}>
                            <CardContent className="p-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <div className={`w-2 h-2 rounded-full ${st.color}`} />
                                    <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                                        {st.label}
                                    </span>
                                </div>
                                <p className="text-2xl font-bold text-slate-900">{count}</p>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            {/* Kanban board */}
            <RepairKanban onStatusChange={loadStats} />

            {/* Create Modal */}
            {showCreateModal && (
                <CreateRepairModal
                    onClose={() => setShowCreateModal(false)}
                    onCreated={() => {
                        setShowCreateModal(false);
                        loadStats();
                    }}
                />
            )}
        </div>
    );
}

