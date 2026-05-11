'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/lib/user-context';
import { api } from '@/lib/api';
import { Wrench, Plus, X } from 'lucide-react';
import { RepairKanban } from './components/RepairKanban';
import { RepairCatalogManager } from './components/RepairCatalogManager';
import { Button } from '@/components/ui/button';
import { Stat } from '@/components/ui/stat';
import { useToast } from '@/components/ui/toast';

type RepairDraft = {
    vehicleId?: string;
    description?: string;
    priority?: string;
    source?: string;
    tripId?: string;
};

function CreateRepairModal({
    initialDraft,
    onClose,
    onCreated,
}: {
    initialDraft?: RepairDraft;
    onClose: () => void;
    onCreated: () => void;
}) {
    const { toast } = useToast();
    const [vehicles, setVehicles] = useState<any[]>([]);
    const [vehicleId, setVehicleId] = useState(initialDraft?.vehicleId || '');
    const [description, setDescription] = useState(initialDraft?.description || '');
    const [priority, setPriority] = useState(initialDraft?.priority || 'medium');
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
            const result = await api.post<any>('/repairs', {
                vehicleId,
                description,
                priority,
                source: initialDraft?.source || 'mechanic',
            });
            if (result.success) {
                toast({ variant: 'success', title: 'Заявка на ремонт создана' });
                onCreated();
            } else {
                throw new Error(result.error || 'Ошибка');
            }
        } catch (err: any) {
            const msg = err.message || 'Ошибка сервера';
            setError(msg);
            toast({ variant: 'error', title: 'Ошибка', description: msg });
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
                            <option value="medium">Обычный</option>
                            <option value="high">Высокий</option>
                            <option value="critical">Критический</option>
                        </select>
                    </div>
                    {error && <p className="text-sm text-red-600">{error}</p>}
                </div>
                <div className="px-6 py-4 border-t border-slate-100 flex gap-3 justify-end">
                    <Button variant="outline" onClick={onClose} disabled={submitting}>Отмена</Button>
                    <Button variant="brand" isLoading={submitting} onClick={handleSubmit}>
                        Создать
                    </Button>
                </div>
            </div>
        </div>
    );
}

const ALLOWED_ROLES = ['repair_service', 'mechanic', 'admin'];

export default function RepairPage() {
    const { user, loading: userLoading } = useUser();
    const router = useRouter();

    useEffect(() => {
        if (!userLoading && (!user || !user.roles.some(r => ALLOWED_ROLES.includes(r)))) {
            router.push('/');
        }
    }, [user, userLoading, router]);

    const [stats, setStats] = useState<Array<{ status: string; count: number }>>([]);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showCatalogModal, setShowCatalogModal] = useState(false);
    const [catalogRefreshKey, setCatalogRefreshKey] = useState(0);
    const [initialDraft, setInitialDraft] = useState<RepairDraft | undefined>();

    useEffect(() => {
        loadStats();
    }, []);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.get('action') !== 'create') return;

        const tripId = params.get('tripId') || undefined;
        const source = params.get('source') || 'mechanic';
        setInitialDraft({
            vehicleId: params.get('vehicleId') || undefined,
            priority: 'high',
            source: ['auto_inspection', 'driver', 'mechanic', 'scheduled'].includes(source) ? source : 'mechanic',
            tripId,
            description: tripId
                ? `Breakdown from trip dossier. Trip: ${tripId}`
                : 'Breakdown from trip dossier.',
        });
        setShowCreateModal(true);
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
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                    <div className="shrink-0 w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center">
                        <Wrench className="w-5 h-5" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-semibold text-slate-900">Ремонтная служба</h1>
                        <p className="text-sm text-slate-500 mt-0.5">
                            Заявки на ремонт и техническое обслуживание
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <Button variant="outline" leftIcon={<Wrench className="w-4 h-4" />} onClick={() => setShowCatalogModal(true)}>
                        Каталог з/ч
                    </Button>
                    <Button variant="brand" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setShowCreateModal(true)}>
                        Новая заявка
                    </Button>
                </div>
            </div>

            {initialDraft?.tripId && (
                <div className="rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-700">
                    Repair request opened from trip close-flow. Trip context is prefilled in the description; create the request, then continue replacement or close actions in the trip dossier.
                </div>
            )}

            {/* Stats bar */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {(['created', 'waiting_parts', 'in_progress', 'done'] as const).map(status => {
                    const st = statusLabels[status];
                    const count = stats.find(s => s.status === status)?.count || 0;
                    const tone: 'warning' | 'info' | 'brand' | 'success' =
                        status === 'created' ? 'warning'
                            : status === 'waiting_parts' ? 'info'
                                : status === 'in_progress' ? 'brand'
                                    : 'success';
                    return <Stat key={status} label={st.label} value={count} tone={tone} />;
                })}
            </div>

            {/* Kanban board */}
            <RepairKanban onStatusChange={loadStats} catalogRefreshKey={catalogRefreshKey} />

            {/* Create Modal */}
            {showCreateModal && (
                <CreateRepairModal
                    initialDraft={initialDraft}
                    onClose={() => setShowCreateModal(false)}
                    onCreated={() => {
                        setShowCreateModal(false);
                        setInitialDraft(undefined);
                        loadStats();
                    }}
                />
            )}
            <RepairCatalogManager
                open={showCatalogModal}
                onClose={() => setShowCatalogModal(false)}
                onChanged={() => setCatalogRefreshKey((value) => value + 1)}
            />
        </div>
    );
}

