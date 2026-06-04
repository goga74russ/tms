'use client';

import { useState, useCallback, useEffect } from 'react';
import { ClipboardList, Plus, Filter, RefreshCw, Loader2, AlertCircle, Truck, LayoutGrid, Rows3, Package, MapPin, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import { OrderFilters } from './components/OrderFilters';
import { CreateOrderModal } from './components/CreateOrderModal';
import { CreateTripModal } from './components/CreateTripModal';
import { Button } from '@/components/ui/button';
import { Stat } from '@/components/ui/stat';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import {
    KanbanBoard,
    KanbanColumn,
    KanbanCard,
    ViewTabs,
    type KanbanTone,
} from '@/components/ui/kanban';
import { DataTable, type Column, Pill } from '@/components/ui/data-table';
import { ORDER_STATE_TRANSITIONS } from '@tms/shared';
import { api } from '@/lib/api';

export type Order = {
    id: string;
    number: string;
    status: string;
    contractorId: string;
    contractorName: string;
    cargoDescription: string;
    cargoWeightKg: number;
    loadingAddress: string;
    unloadingAddress: string;
    loadingWindowStart?: string;
    loadingWindowEnd?: string;
    unloadingWindowStart?: string;
    unloadingWindowEnd?: string;
    adrClass?: string | null;
    adrUnNumber?: string | null;
    createdAt: string;
};

interface StatusColumn {
    key: string;
    label: string;
    tone: KanbanTone;
}

const STATUS_COLUMNS: StatusColumn[] = [
    { key: 'draft', label: 'Черновик', tone: 'neutral' },
    { key: 'confirmed', label: 'В работе', tone: 'info' },
    { key: 'assigned', label: 'Назначена', tone: 'brand' },
    { key: 'in_transit', label: 'В пути', tone: 'warning' },
    { key: 'delivered', label: 'Доставлена', tone: 'success' },
];

const STATUS_LABELS: Record<string, string> = STATUS_COLUMNS.reduce((acc, c) => {
    acc[c.key] = c.label;
    return acc;
}, {} as Record<string, string>);

const STATUS_TONES: Record<string, KanbanTone> = STATUS_COLUMNS.reduce((acc, c) => {
    acc[c.key] = c.tone;
    return acc;
}, {} as Record<string, KanbanTone>);

function formatWeight(kg: number): string {
    if (kg >= 1000) return `${(kg / 1000).toFixed(1)}т`;
    return `${kg}кг`;
}

function shortPlace(addr: string): string {
    // Extract the city part if the address has commas — assumes "City, ..." form.
    const first = addr.split(',')[0]?.trim();
    return first || addr;
}

type SlaIcon = React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;

function getSla(order: Order): { tone: 'neutral' | 'success' | 'warning' | 'danger'; label: string; icon: SlaIcon } | null {
    if (!order.unloadingWindowEnd) return null;
    const deadline = new Date(order.unloadingWindowEnd);
    const hours = (deadline.getTime() - Date.now()) / 3_600_000;
    if (hours < 0) return { tone: 'danger', label: 'Просрочено', icon: AlertCircle };
    if (hours < 4) return { tone: 'warning', label: `${Math.round(hours)}ч`, icon: AlertTriangle };
    if (hours < 24) return { tone: 'success', label: `${Math.round(hours)}ч`, icon: Clock };
    return { tone: 'success', label: `${Math.round(hours / 24)}д`, icon: CheckCircle2 };
}

export default function LogistPage() {
    const { toast } = useToast();
    const [ordersList, setOrdersList] = useState<Order[]>([]);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showTripModal, setShowTripModal] = useState(false);
    const [filtersVisible, setFiltersVisible] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [view, setView] = useState<'board' | 'table'>('board');
    const [activeFilters, setActiveFilters] = useState<{
        contractorId?: string;
        dateFrom?: string;
        dateTo?: string;
        search?: string;
    }>({});

    const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
        toast({ variant: type === 'error' ? 'error' : 'success', title: type === 'error' ? 'Ошибка' : 'Готово', description: message });
    }, [toast]);

    const loadOrders = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const json = await api.get('/orders?limit=100');
            if (json.success) {
                setOrdersList(json.data ?? []);
            } else {
                throw new Error(json.error || 'Unknown error');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Не удалось загрузить заявки');
            setOrdersList(prev => prev);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadOrders();
        const intervalId = setInterval(loadOrders, 30000);
        return () => clearInterval(intervalId);
    }, [loadOrders]);

    const filteredOrders = ordersList.filter(order => {
        if (activeFilters.contractorId && order.contractorId !== activeFilters.contractorId) return false;
        // C9: dateFrom/dateTo собирались в UI, но НЕ применялись (мёртвые фильтры).
        // Сравниваем по дате погрузки (операционная для логиста), иначе createdAt.
        // ISO-даты (YYYY-MM-DD...) сравнимы лексикографически по первым 10 символам.
        const df = activeFilters.dateFrom?.slice(0, 10);
        const dt = activeFilters.dateTo?.slice(0, 10);
        if (df || dt) {
            const od = (order.loadingWindowStart ?? order.createdAt)?.slice(0, 10);
            if (od) {
                if (df && od < df) return false;
                if (dt && od > dt) return false;
            }
        }
        if (activeFilters.search) {
            const q = activeFilters.search.toLowerCase();
            const match = order.number.toLowerCase().includes(q)
                || order.cargoDescription.toLowerCase().includes(q)
                || order.loadingAddress.toLowerCase().includes(q)
                || order.unloadingAddress.toLowerCase().includes(q)
                || order.contractorName?.toLowerCase().includes(q);
            if (!match) return false;
        }
        return true;
    });

    const isTransitionAllowed = useCallback((fromStatus: string, toStatus: string): boolean => {
        if (fromStatus === toStatus) return false;
        const allowed = ORDER_STATE_TRANSITIONS[fromStatus];
        return allowed ? allowed.includes(toStatus) : false;
    }, []);

    const handleMove = useCallback(async (orderId: string, _fromCol: string, toCol: string) => {
        const order = ordersList.find(o => o.id === orderId);
        if (!order) return;

        setOrdersList(prev => prev.map(o => (o.id === orderId ? { ...o, status: toCol } : o)));

        try {
            const json = await api.post(`/orders/${orderId}/status`, { status: toCol });
            if (!json.success) {
                throw new Error(json.error || 'API Error');
            }
            const statusLabel = STATUS_LABELS[toCol] || toCol;
            showToast(`Статус → ${statusLabel}`);
        } catch (err) {
            console.error('Failed to update order status', err);
            showToast(err instanceof Error ? err.message : 'Не удалось обновить статус', 'error');
            loadOrders();
        }
    }, [ordersList, loadOrders, showToast]);

    const handleMoveReject = useCallback((orderId: string, fromCol: string, toCol: string) => {
        const from = STATUS_LABELS[fromCol] || fromCol;
        const to = STATUS_LABELS[toCol] || toCol;
        showToast(`Нельзя: «${from}» → «${to}»`, 'error');
    }, [showToast]);

    const handleCreateOrder = useCallback((order: Order) => {
        setOrdersList(prev => [order, ...prev]);
        setShowCreateModal(false);
        showToast('Заявка создана');
        setTimeout(loadOrders, 500);
    }, [loadOrders, showToast]);

    const stats = STATUS_COLUMNS.map(col => ({
        ...col,
        count: filteredOrders.filter(o => o.status === col.key).length,
    }));

    const contractors = Array.from(
        new Map(ordersList.map(o => [o.contractorId, { id: o.contractorId, name: o.contractorName }])).values(),
    );

    // Table columns for "Таблица" view
    const tableColumns: Column<Order>[] = [
        {
            id: 'number',
            header: 'Номер',
            accessor: r => r.number,
            cell: r => <span className="font-mono text-xs font-semibold text-brand-700">{r.number}</span>,
            sortable: true,
            width: '120px',
        },
        {
            id: 'status',
            header: 'Статус',
            accessor: r => STATUS_LABELS[r.status] || r.status,
            cell: r => <Pill tone={mapToneToPill(STATUS_TONES[r.status])}>{STATUS_LABELS[r.status] || r.status}</Pill>,
            sortable: true,
        },
        {
            id: 'contractor',
            header: 'Контрагент',
            accessor: r => r.contractorName,
            sortable: true,
        },
        {
            id: 'route',
            header: 'Маршрут',
            cell: r => <span className="text-xs text-neutral-600">{shortPlace(r.loadingAddress)} → {shortPlace(r.unloadingAddress)}</span>,
        },
        {
            id: 'cargo',
            header: 'Груз',
            accessor: r => r.cargoDescription,
        },
        {
            id: 'weight',
            header: 'Вес',
            align: 'right',
            accessor: r => r.cargoWeightKg,
            cell: r => <span className="text-xs font-semibold tabular-nums">{formatWeight(r.cargoWeightKg)}</span>,
            sortable: true,
            width: '90px',
        },
        {
            id: 'sla',
            header: 'SLA',
            cell: r => {
                const sla = getSla(r);
                if (!sla) return <span className="text-xs text-neutral-400">—</span>;
                return <Pill tone={sla.tone} icon={sla.icon}>{sla.label}</Pill>;
            },
            width: '100px',
        },
    ];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
                        <ClipboardList className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-neutral-900">Заявки</h1>
                        <p className="text-sm text-neutral-500">Управление заявками на перевозку</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    {loading && (
                        <div className="flex items-center gap-2 text-neutral-400 text-sm mr-2">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Обновление...</span>
                        </div>
                    )}
                    <Button
                        variant={filtersVisible ? 'default' : 'outline'}
                        onClick={() => setFiltersVisible(!filtersVisible)}
                        className="gap-2"
                    >
                        <Filter className="w-4 h-4" />
                        Фильтры
                    </Button>
                    <Button variant="outline" className="gap-2 px-3" onClick={loadOrders}>
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => setShowTripModal(true)}
                        className="gap-2"
                    >
                        <Truck className="w-4 h-4" />
                        Новый рейс
                    </Button>
                    <Button
                        variant="brand"
                        leftIcon={<Plus className="w-4 h-4" />}
                        onClick={() => setShowCreateModal(true)}
                    >
                        Новая заявка
                    </Button>
                </div>
            </div>

            {/* Stats bar */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                {stats.map(s => (
                    <Stat key={s.key} label={s.label} value={s.count} tone={mapToneToStat(s.tone)} />
                ))}
            </div>

            {/* Error state */}
            {error && ordersList.length === 0 && (
                <EmptyState
                    icon={AlertCircle}
                    title={error}
                    description="Проверьте подключение к серверу"
                    tone="danger"
                    action={
                        <Button variant="outline" leftIcon={<RefreshCw className="w-4 h-4" />} onClick={loadOrders}>
                            Повторить
                        </Button>
                    }
                />
            )}

            {/* Empty (loaded, no orders) */}
            {!error && !loading && ordersList.length === 0 && (
                <EmptyState
                    icon={ClipboardList}
                    title="Пока нет заявок"
                    description="Создайте первую заявку, чтобы начать работу."
                    tone="brand"
                    action={
                        <Button variant="brand" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setShowCreateModal(true)}>
                            Новая заявка
                        </Button>
                    }
                />
            )}

            {/* View tabs + filters */}
            {(ordersList.length > 0 || !error) && (
                <div className="flex items-center justify-between flex-wrap gap-3">
                    <ViewTabs<'board' | 'table'>
                        value={view}
                        onChange={setView}
                        options={[
                            { value: 'board', label: 'Канбан', icon: LayoutGrid },
                            { value: 'table', label: 'Таблица', icon: Rows3 },
                        ]}
                    />
                </div>
            )}

            {/* Filters */}
            {filtersVisible && (
                <OrderFilters
                    filters={activeFilters}
                    onFiltersChange={setActiveFilters}
                    contractors={contractors}
                />
            )}

            {/* Board */}
            {(ordersList.length > 0 || !error) && view === 'board' && (
                <KanbanBoard
                    onMove={handleMove}
                    canMove={(_id, from, to) => isTransitionAllowed(from, to)}
                    onMoveReject={handleMoveReject}
                >
                    {STATUS_COLUMNS.map(col => {
                        const items = filteredOrders.filter(o => o.status === col.key);
                        return (
                            <KanbanColumn
                                key={col.key}
                                id={col.key}
                                title={col.label}
                                tone={col.tone}
                                count={items.length}
                                onQuickAdd={col.key === 'draft' ? () => setShowCreateModal(true) : undefined}
                            >
                                {items.map(order => {
                                    const sla = getSla(order);
                                    return (
                                        <KanbanCard key={order.id} id={order.id} fromCol={col.key}>
                                            <div className="p-3 space-y-2">
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-sm font-semibold text-neutral-900 leading-tight truncate">
                                                            {shortPlace(order.loadingAddress)} → {shortPlace(order.unloadingAddress)}
                                                        </p>
                                                        <p className="text-xs text-neutral-500 mt-0.5 truncate flex items-center gap-1">
                                                            <Package className="w-3 h-3 text-neutral-400" />
                                                            <span className="truncate">{order.cargoDescription}</span>
                                                            <span className="text-neutral-400">·</span>
                                                            <span className="font-medium text-neutral-600 whitespace-nowrap">{formatWeight(order.cargoWeightKg)}</span>
                                                        </p>
                                                    </div>
                                                    {sla && (
                                                        <span className={
                                                            sla.tone === 'danger' ? 'shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700'
                                                                : sla.tone === 'warning' ? 'shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700'
                                                                : 'shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700'
                                                        }>
                                                            {sla.label}
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-neutral-100">
                                                    <span className="text-xs text-neutral-600 truncate flex items-center gap-1">
                                                        <MapPin className="w-3 h-3 text-neutral-400 shrink-0" />
                                                        <span className="truncate">{order.contractorName}</span>
                                                    </span>
                                                    <span className="text-[10px] font-mono font-semibold text-brand-600 shrink-0">
                                                        {order.number}
                                                    </span>
                                                </div>
                                            </div>
                                        </KanbanCard>
                                    );
                                })}
                            </KanbanColumn>
                        );
                    })}
                </KanbanBoard>
            )}

            {/* Table view */}
            {(ordersList.length > 0 || !error) && view === 'table' && (
                <DataTable<Order>
                    tableId="logist-orders"
                    data={filteredOrders}
                    columns={tableColumns}
                    keyField="id"
                    loading={loading}
                    searchPlaceholder="Поиск..."
                    searchKeys={['number', 'contractor', 'cargo']}
                    pageSize={50}
                />
            )}

            {/* Create Order Modal */}
            {showCreateModal && (
                <CreateOrderModal
                    onClose={() => setShowCreateModal(false)}
                    onCreate={handleCreateOrder}
                />
            )}

            {/* Create Trip Modal */}
            {showTripModal && (
                <CreateTripModal
                    onClose={() => setShowTripModal(false)}
                    onCreated={() => {
                        setShowTripModal(false);
                        showToast('Рейс создан');
                        loadOrders();
                    }}
                />
            )}
        </div>
    );
}

function mapToneToPill(tone: KanbanTone): 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info' {
    return tone;
}

function mapToneToStat(tone: KanbanTone): 'neutral' | 'brand' | 'success' | 'warning' | 'info' | 'danger' {
    return tone;
}
