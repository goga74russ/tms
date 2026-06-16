'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/lib/user-context';
import { api } from '@/lib/api';
import { Wrench, Plus, LayoutGrid, Rows3, List } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { RepairKanban } from './components/RepairKanban';
import { RepairCatalogManager } from './components/RepairCatalogManager';
import { Button } from '@/components/ui/button';
import { Stat } from '@/components/ui/stat';
import { useToast } from '@/components/ui/toast';
import { ViewTabs } from '@/components/ui/kanban';
import { DataTable, type Column, Pill } from '@/components/ui/data-table';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { REPAIR_STATUS, PRIORITY_LABELS, label } from '@tms/shared';

type RepairDraft = {
    vehicleId?: string;
    description?: string;
    priority?: string;
    source?: string;
    tripId?: string;
};

// Round 5 audit v3: repair category constants.
// TODO(constants): if a shared constants/categories.ts is added later,
// re-export from there. Inlined here to avoid a new module right now.
type RepairCategory =
    | 'engine'
    | 'transmission'
    | 'brakes'
    | 'electrical'
    | 'body'
    | 'tires'
    | 'other';

const REPAIR_CATEGORIES: ReadonlyArray<{ id: RepairCategory; label: string; tone: 'danger' | 'warning' | 'info' | 'brand' | 'success' | 'neutral' }> = [
    { id: 'engine', label: 'Двигатель', tone: 'danger' },
    { id: 'transmission', label: 'Трансмиссия', tone: 'warning' },
    { id: 'brakes', label: 'Тормозная система', tone: 'danger' },
    { id: 'electrical', label: 'Электрика', tone: 'info' },
    { id: 'body', label: 'Кузов', tone: 'neutral' },
    { id: 'tires', label: 'Шины и колёса', tone: 'brand' },
    { id: 'other', label: 'Прочее', tone: 'neutral' },
];

const REPAIR_CATEGORY_LABEL: Record<string, string> = REPAIR_CATEGORIES.reduce(
    (acc, c) => { acc[c.id] = c.label; return acc; },
    {} as Record<string, string>,
);

const REPAIR_CATEGORY_TONE: Record<string, 'danger' | 'warning' | 'info' | 'brand' | 'success' | 'neutral'> = REPAIR_CATEGORIES.reduce(
    (acc, c) => { acc[c.id] = c.tone; return acc; },
    {} as Record<string, 'danger' | 'warning' | 'info' | 'brand' | 'success' | 'neutral'>,
);

interface MechanicOption {
    id: string;
    email: string;
    fullName: string;
    roles: string[];
}

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
    const [mechanics, setMechanics] = useState<MechanicOption[]>([]);
    const [vehicleId, setVehicleId] = useState(initialDraft?.vehicleId || '');
    const [description, setDescription] = useState(initialDraft?.description || '');
    const [priority, setPriority] = useState(initialDraft?.priority || 'medium');
    const [assignedTo, setAssignedTo] = useState<string>('');
    const [category, setCategory] = useState<RepairCategory>('other');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [touched, setTouched] = useState<Record<string, boolean>>({});

    useEffect(() => {
        api.get<any>('/fleet/vehicles?limit=100').then(r => setVehicles(r.data || [])).catch(() => { });
        // Load mechanic candidates. /auth/users returns all users; we filter
        // by role client-side because there's no role= query parameter yet.
        // TODO(api): add `?role=mechanic,repair_service` filter on /auth/users
        // to avoid loading the full org user list for this picker.
        api.get<{ success: boolean; data: MechanicOption[] }>('/auth/users')
            .then(r => {
                const list = (r.data || []).filter(u =>
                    Array.isArray(u.roles) && u.roles.some(role => role === 'mechanic' || role === 'repair_service'),
                );
                setMechanics(list);
            })
            .catch(() => { });
    }, []);

    const errors = useMemo(() => {
        const e: Record<string, string> = {};
        if (!vehicleId) e.vehicleId = 'Выберите ТС';
        if (!description || description.trim().length < 5) {
            e.description = 'Опишите неисправность (минимум 5 символов)';
        }
        if (!priority) e.priority = 'Укажите приоритет';
        return e;
    }, [vehicleId, description, priority]);

    const isValid = Object.keys(errors).length === 0;

    function markTouched(field: string) {
        setTouched(prev => prev[field] ? prev : { ...prev, [field]: true });
    }

    async function handleSubmit() {
        if (!isValid) {
            setTouched({ vehicleId: true, description: true, priority: true });
            return;
        }
        setSubmitting(true);
        setError('');
        try {
            // P2 (код-аудит 2026-06-14): assignedTo персистится бэкендом
            // (RepairRequestCreateSchema + createRepair). category НЕ слаём — колонки
            // на repair_requests нет, бэкенд его молча игнорировал (ложный контракт).
            // TODO(api): добавить колонку category (миграция) и вернуть поле, если нужно.
            const result = await api.post<any>('/repairs', {
                vehicleId,
                description,
                priority,
                source: initialDraft?.source || 'mechanic',
                assignedTo: assignedTo || null,
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

    const inputClass = (field: string) =>
        `w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 transition-colors ${
            touched[field] && errors[field]
                ? 'border-red-300 focus:ring-red-500/20 focus:border-red-500'
                : 'border-neutral-200 focus:ring-brand-500/20 focus:border-brand-500'
        }`;

    return (
        <Dialog open={true} onClose={onClose} title="Новая заявка на ремонт" size="md">
            <div className="space-y-4">
                    <div>
                        <label className="text-sm font-medium text-neutral-700 mb-1.5 block">Транспорт *</label>
                        <select
                            value={vehicleId}
                            onChange={e => { setVehicleId(e.target.value); markTouched('vehicleId'); }}
                            onBlur={() => markTouched('vehicleId')}
                            className={inputClass('vehicleId')}
                            aria-invalid={touched.vehicleId && !!errors.vehicleId}
                        >
                            <option value="">Выберите ТС</option>
                            {vehicles.map(v => (
                                <option key={v.id} value={v.id}>{v.plateNumber} — {v.make} {v.model}</option>
                            ))}
                        </select>
                        {touched.vehicleId && errors.vehicleId && (
                            <p className="text-xs text-red-500 mt-1">{errors.vehicleId}</p>
                        )}
                    </div>
                    <div>
                        <label className="text-sm font-medium text-neutral-700 mb-1.5 block">Описание неисправности *</label>
                        <textarea
                            value={description}
                            onChange={e => { setDescription(e.target.value); markTouched('description'); }}
                            onBlur={() => markTouched('description')}
                            className={`${inputClass('description')} resize-none`}
                            rows={3}
                            placeholder="Опишите проблему..."
                            aria-invalid={touched.description && !!errors.description}
                        />
                        {touched.description && errors.description && (
                            <p className="text-xs text-red-500 mt-1">{errors.description}</p>
                        )}
                    </div>
                    <div>
                        <label className="text-sm font-medium text-neutral-700 mb-1.5 block">Приоритет *</label>
                        <select
                            value={priority}
                            onChange={e => { setPriority(e.target.value); markTouched('priority'); }}
                            onBlur={() => markTouched('priority')}
                            className={inputClass('priority')}
                            aria-invalid={touched.priority && !!errors.priority}
                        >
                            <option value="low">Низкий</option>
                            <option value="medium">Обычный</option>
                            <option value="high">Высокий</option>
                            <option value="critical">Критический</option>
                        </select>
                        {touched.priority && errors.priority && (
                            <p className="text-xs text-red-500 mt-1">{errors.priority}</p>
                        )}
                    </div>
                    <div>
                        <label className="text-sm font-medium text-neutral-700 mb-1.5 block">Категория неисправности</label>
                        <select
                            value={category}
                            onChange={e => setCategory(e.target.value as RepairCategory)}
                            className={inputClass('category')}
                        >
                            {REPAIR_CATEGORIES.map(c => (
                                <option key={c.id} value={c.id}>{c.label}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="text-sm font-medium text-neutral-700 mb-1.5 block">Ответственный механик</label>
                        <select
                            value={assignedTo}
                            onChange={e => setAssignedTo(e.target.value)}
                            className={inputClass('assignedTo')}
                        >
                            <option value="">Не назначен</option>
                            {mechanics.map(m => (
                                <option key={m.id} value={m.id}>
                                    {m.fullName || m.email}
                                </option>
                            ))}
                        </select>
                        {mechanics.length === 0 && (
                            <p className="text-xs text-neutral-400 mt-1">В организации пока нет пользователей с ролью «mechanic» или «repair_service».</p>
                        )}
                    </div>
                    {error && <p className="text-sm text-red-600">{error}</p>}
                <div className="pt-2 border-t border-neutral-100 flex gap-3 justify-end">
                    <Button variant="outline" onClick={onClose} disabled={submitting}>Отмена</Button>
                    <Button variant="brand" isLoading={submitting} disabled={!isValid || submitting} onClick={handleSubmit}>
                        Создать
                    </Button>
                </div>
            </div>
        </Dialog>
    );
}

// C9: 'manager' отсутствовал → менеджеров редиректило с /repair на '/'.
const ALLOWED_ROLES = ['repair_service', 'mechanic', 'admin', 'manager'];

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
    const [repairsForTable, setRepairsForTable] = useState<Array<{ id: string; status: string; description: string; priority: string; source: string; vehicleId: string; assignedTo?: string; assignedToName?: string; category?: string; totalCost: number | string; createdAt: string }>>([]);
    const [tableTotal, setTableTotal] = useState(0);
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

    // Цвет-индикатор статуса (UI-тон, не enum-перевод). Текст берём из канона REPAIR_STATUS.
    const statusColors: Record<string, string> = {
        created: 'bg-amber-500',
        waiting_parts: 'bg-blue-500',
        in_progress: 'bg-brand-500',
        done: 'bg-emerald-500',
    };

    useEffect(() => {
        if (view === 'board') return;
        let cancelled = false;
        setTableLoading(true);
        // ВНИМАНИЕ: серверная пагинация по курсору не построена — берём первые
        // 200 записей и показываем «N из M» по total из ответа (поле total
        // приходит из result.pagination на /repairs). Полную пагинацию здесь
        // не строим: при превышении лимита пользователь видит явный счётчик.
        api.get<any>('/repairs?limit=200')
            .then(r => {
                if (!cancelled) {
                    const rows = r.data || [];
                    setRepairsForTable(rows);
                    setTableTotal(typeof r.total === 'number' ? r.total : rows.length);
                }
            })
            .catch(() => { })
            .finally(() => { if (!cancelled) setTableLoading(false); });
        return () => { cancelled = true; };
    }, [view, catalogRefreshKey]);

    const tableColumns: Column<typeof repairsForTable[number]>[] = useMemo(() => [
        {
            id: 'status',
            header: 'Статус',
            accessor: r => label(REPAIR_STATUS, r.status),
            cell: r => {
                const tone = r.status === 'done' ? 'success'
                    : r.status === 'in_progress' ? 'info'
                    : r.status === 'waiting_parts' ? 'warning'
                    : 'neutral';
                return <Pill tone={tone}>{label(REPAIR_STATUS, r.status)}</Pill>;
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
            id: 'category',
            header: 'Категория',
            accessor: r => r.category ? REPAIR_CATEGORY_LABEL[r.category] || r.category : '',
            cell: r => {
                if (!r.category) return <span className="text-xs text-neutral-400">—</span>;
                const tone = REPAIR_CATEGORY_TONE[r.category] || 'neutral';
                return <Pill tone={tone}>{REPAIR_CATEGORY_LABEL[r.category] || r.category}</Pill>;
            },
            width: '160px',
            sortable: true,
        },
        {
            id: 'assignedTo',
            header: 'Механик',
            accessor: r => r.assignedToName || r.assignedTo || '',
            cell: r => {
                const label = r.assignedToName || r.assignedTo;
                return label
                    ? <span className="text-xs text-neutral-600">{label}</span>
                    : <span className="text-xs text-neutral-400">Не назначен</span>;
            },
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
    ], []);

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
                <div className="rounded-2xl border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-brand-700">
                    Заявка на ремонт открыта из закрытия рейса. Контекст рейса уже заполнен в описании — создайте заявку и продолжайте замену или закрытие в карточке рейса.
                </div>
            )}

            {/* Stats bar */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {(['created', 'waiting_parts', 'in_progress', 'done'] as const).map(status => {
                    const count = stats.find(s => s.status === status)?.count || 0;
                    const tone: 'warning' | 'info' | 'brand' | 'success' =
                        status === 'created' ? 'warning'
                            : status === 'waiting_parts' ? 'info'
                                : status === 'in_progress' ? 'brand'
                                    : 'success';
                    return <Stat key={status} label={label(REPAIR_STATUS, status)} value={count} tone={tone} />;
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
                <ErrorBoundary scope="repair-kanban">
                    <RepairKanban
                        onStatusChange={loadStats}
                        catalogRefreshKey={catalogRefreshKey}
                        onCreateRequest={() => setShowCreateModal(true)}
                    />
                </ErrorBoundary>
            )}

            {/* Table view */}
            {(view === 'table' || view === 'list') && (
                <div className="space-y-2">
                    {!tableLoading && tableTotal > repairsForTable.length && (
                        <p className="text-xs text-amber-600">
                            Показано {repairsForTable.length} из {tableTotal} заявок. Уточните поиск или фильтры, чтобы увидеть остальные.
                        </p>
                    )}
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
                </div>
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

