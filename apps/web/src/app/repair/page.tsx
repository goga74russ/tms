'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/lib/user-context';
import { api } from '@/lib/api';
import { Wrench, Plus, X, LayoutGrid, Rows3, List } from 'lucide-react';
import { RepairKanban } from './components/RepairKanban';
import { RepairCatalogManager } from './components/RepairCatalogManager';
import { Button } from '@/components/ui/button';
import { Stat } from '@/components/ui/stat';
import { useToast } from '@/components/ui/toast';
import { ViewTabs } from '@/components/ui/kanban';
import { DataTable, type Column, Pill } from '@/components/ui/data-table';

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
                <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between">
                    <h2 className="text-lg font-bold text-neutral-900">Новая заявка на ремонт</h2>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-400">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <div className="px-6 py-5 space-y-4">
                    <div>
                        <label className="text-sm font-medium text-neutral-700 mb-1.5 block">Транспорт *</label>
                        <select
                            value={vehicleId}
                            onChange={e => setVehicleId(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="">Выберите ТС</option>
                            {vehicles.map(v => (
                                <option key={v.id} value={v.id}>{v.plateNumber} — {v.make} {v.model}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="text-sm font-medium text-neutral-700 mb-1.5 block">Описание неисправности *</label>
                        <textarea
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                            rows={3}
                            placeholder="Опишите проблему..."
                        />
                    </div>
                    <div>
                        <label className="text-sm font-medium text-neutral-700 mb-1.5 block">Приоритет</label>
                        <select
                            value={priority}
                            onChange={e => setPriority(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="low">Низкий</option>
                            <option value="medium">Обычный</option>
                            <option value="high">Высокий</option>
                            <option value="critical">Критический</option>
                        </select>
                    </div>
                    {error && <p className="text-sm text-red-600">{error}</p>}
                </div>
                <div className="px-6 py-4 border-t border-neutral-100 flex gap-3 justify-end">
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
    const [view, setView] = useState<'board' | 'table' | 'list'>('board');
    const [repairsForTable, setRepairsForTable] = useState<Array<{ id: string; status: string; description: string; priority: string; source: string; vehicleId: string; assignedTo?: string; totalCost: number | string; createdAt: string }>>([]);
    const [tableLoading, setTableLoading] = useState(false);

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
                ? `Поломка из карточки рейса. Рейс: ${tripId}`
                : 'Поломка из карточки рейса.',
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

    useEffect(() => {
        if (view === 'board') return;
        let cancelled = false;
        setTableLoading(true);
        api.get<any>('/repairs?limit=200')
            .then(r => {
                if (!cancelled) setRepairsForTable(r.data || []);
            })
            .catch(() => { })
            .finally(() => { if (!cancelled) setTableLoading(false); });
        return () => { cancelled = true; };
    }, [view, catalogRefreshKey]);

    const tableColumns: Column<typeof repairsForTable[number]>[] = useMemo(() => [
        {
            id: 'status',
            header: 'Статус',
            accessor: r => statusLabels[r.status]?.label || r.status,
            cell: r => {
                const tone = r.status === 'done' ? 'success'
                    : r.status === 'in_progress' ? 'info'
                    : r.status === 'waiting_parts' ? 'warning'
                    : 'neutral';
                return <Pill tone={tone}>{statusLabels[r.status]?.label || r.status}</Pill>;
            },
            sortable: true,
            width: '140px',
        },
        {
            id: 'description',
            header: 'Описание',
            accessor: r => r.description,
            cell: r => <span className="text-sm text-neutral-700">{r.description}</span>,
        },
        {
            id: 'priority',
            header: 'Приоритет',
            accessor: r => r.priority,
            cell: r => {
                const tone = r.priority === 'critical' ? 'danger'
                    : r.priority === 'high' ? 'warning'
                    : r.priority === 'low' ? 'neutral'
                    : 'info';
                const labels: Record<string, string> = { low: 'Низкий', medium: 'Средний', high: 'Высокий', critical: 'Критический' };
                return <Pill tone={tone}>{labels[r.priority] || r.priority}</Pill>;
            },
            width: '130px',
            sortable: true,
        },
        {
            id: 'assignedTo',
            header: 'Механик',
            accessor: r => r.assignedTo || '',
            cell: r => r.assignedTo ? <span className="text-xs text-neutral-600">{r.assignedTo}</span> : <span className="text-xs text-neutral-400">—</span>,
            width: '160px',
        },
        {
            id: 'totalCost',
            header: 'Стоимость',
            accessor: r => Number(r.totalCost) || 0,
            cell: r => Number(r.totalCost) > 0
                ? <span className="text-xs font-semibold tabular-nums">{Number(r.totalCost).toLocaleString('ru-RU')} ₽</span>
                : <span className="text-xs text-neutral-400">—</span>,
            align: 'right',
            sortable: true,
            width: '120px',
        },
        {
            id: 'createdAt',
            header: 'Создана',
            accessor: r => r.createdAt,
            cell: r => <span className="text-xs text-neutral-500">{new Date(r.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}</span>,
            sortable: true,
            width: '110px',
        },
    ], [statusLabels]);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                    <div className="shrink-0 w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center">
                        <Wrench className="w-5 h-5" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-semibold text-neutral-900">Ремонтная служба</h1>
                        <p className="text-sm text-neutral-500 mt-0.5">
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
                    Заявка на ремонт открыта из закрытия рейса. Контекст рейса уже заполнен в описании — создайте заявку и продолжайте замену или закрытие в карточке рейса.
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

            {/* View tabs */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <ViewTabs<'board' | 'table' | 'list'>
                    value={view}
                    onChange={setView}
                    options={[
                        { value: 'board', label: 'Канбан', icon: LayoutGrid },
                        { value: 'table', label: 'Таблица', icon: Rows3 },
                        { value: 'list', label: 'Список', icon: List },
                    ]}
                />
            </div>

            {/* Kanban board */}
            {view === 'board' && (
                <RepairKanban
                    onStatusChange={loadStats}
                    catalogRefreshKey={catalogRefreshKey}
                    onCreateRequest={() => setShowCreateModal(true)}
                />
            )}

            {/* Table view */}
            {(view === 'table' || view === 'list') && (
                <DataTable
                    tableId="repair-list"
                    data={repairsForTable}
                    columns={tableColumns}
                    keyField="id"
                    loading={tableLoading}
                    searchPlaceholder="Поиск по описанию..."
                    searchKeys={['description', 'assignedTo']}
                    pageSize={view === 'list' ? 100 : 50}
                    density={view === 'list' ? 'compact' : 'comfortable'}
                />
            )}

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

