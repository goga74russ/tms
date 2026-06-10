'use client';

// ============================================================
// /orders — общая таблица заявок для logist / dispatcher / manager / accountant.
//
// Этот экран — data view (поиск, фильтры, экспорт). Воркфлоу-канбан
// логиста остался на /logist. Подробности про выбор A vs B см.
// docs/qa/test-runs/2026-05-24/report.md → BUG-DISP-001 и переписку
// с Desing.
//
// RBAC:
//   - logist / admin     — все колонки + quick-actions (Назначить рейс, В работу).
//   - dispatcher         — все операционные колонки, read-only.
//   - manager            — операционные + финансовые колонки, без редактирования.
//   - accountant         — финансовые + bulk-export, без редактирования.
//
// Колонки прячутся естественно: если у роли нет права видеть данные,
// колонка не рендерится. Кнопки не прячутся — они физически отсутствуют
// для роли, у которой нет права.
// ============================================================
import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
    ClipboardList,
    RefreshCw,
    Loader2,
    Plus,
    Download,
    AlertCircle,
    PackageOpen,
    Truck,
} from 'lucide-react';
import { ORDER_STATUS, label } from '@tms/shared';
import { Button } from '@/components/ui/button';
import { DataTable, type Column, Pill, type RowAction } from '@/components/ui/data-table';
import { useUser, type CurrentUser } from '@/lib/user-context';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { OrderDetailDrawer } from './components/OrderDetailDrawer';
import { CreateOrderModal } from '../logist/components/CreateOrderModal';
import { CreateTripModal } from '../logist/components/CreateTripModal';

// ----- Types -----
export interface OrderListRow {
    id: string;
    number: string;
    status: string;
    cargoDescription: string;
    cargoWeightKg: number;
    cargoVolumeM3: number | null;
    loadingAddress: string;
    loadingDate: string | null;
    unloadingAddress: string;
    unloadingDate: string | null;
    coldChainRequired: boolean;
    createdAt: string;
    contractor: { id: string; name: string; inn: string | null } | null;
    trip: { id: string; number: string; status: string } | null;
    // K7 — pricing (backend фильтрует RBAC: null если caller не manager+)
    customerPrice: number | null;
    customerPriceCurrency: string;
    customerPriceIncludesVat: boolean;
}

// ----- Status helpers -----
const STATUS_LABEL: Record<string, string> = {
    draft: 'Черновик',
    confirmed: 'В работе',
    assigned: 'Назначена',
    in_transit: 'В пути',
    delivered: 'Доставлена',
    completed: 'Завершена', // C9: отсутствовал → сырое 'completed' в badge
    cancelled: 'Отменена',
};

type PillTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

const STATUS_TONE: Record<string, PillTone> = {
    draft: 'neutral',
    confirmed: 'info',
    assigned: 'info',
    in_transit: 'warning',
    delivered: 'success',
    completed: 'success',
    cancelled: 'danger',
};

// ----- RBAC helpers -----
function isLogist(u: CurrentUser | null): boolean {
    return !!u && (u.roles.includes('logist') || u.roles.includes('admin'));
}
function isManager(u: CurrentUser | null): boolean {
    return !!u && (u.roles.includes('manager') || u.roles.includes('accountant') || u.roles.includes('admin'));
}
function canExport(u: CurrentUser | null): boolean {
    return !!u && (u.roles.includes('accountant') || u.roles.includes('manager') || u.roles.includes('admin'));
}

// ----- Date helpers -----
function formatDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    try {
        const d = new Date(iso);
        return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
        return '—';
    }
}

function shortAddr(addr: string): string {
    const head = addr.split(',')[0]?.trim();
    return head || addr;
}

function formatWeight(kg: number): string {
    if (kg >= 1000) return `${(kg / 1000).toFixed(1)} т`;
    return `${kg} кг`;
}

// ----- CSV export (client-side) -----
// B4.4 — каждая ячейка экранируется через `"..."` и protect-against
// formula-injection (если строка начинается с `=`, `+`, `-`, `@`, добавляем
// одинарную кавычку). Импорт хелпера через @tms/shared был бы чище,
// но shared'у больше не место для UI-helper'ов — оставляем локально.
function csvCell(v: unknown): string {
    if (v === null || v === undefined) return '';
    const s = String(v);
    const needsQuote = /[",\n;]/.test(s);
    const protectedS = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return needsQuote ? `"${protectedS.replace(/"/g, '""')}"` : protectedS;
}

function buildCsv(rows: OrderListRow[]): string {
    const header = [
        '№ заявки', 'Статус', 'Контрагент', 'ИНН', 'Груз', 'Вес (кг)',
        'Откуда', 'Куда', 'Дата погрузки', 'Дата выгрузки', 'Рейс', 'Создана',
    ];
    const lines = [header.map(csvCell).join(';')];
    for (const r of rows) {
        lines.push([
            r.number,
            STATUS_LABEL[r.status] ?? r.status,
            r.contractor?.name ?? '',
            r.contractor?.inn ?? '',
            r.cargoDescription,
            r.cargoWeightKg,
            r.loadingAddress,
            r.unloadingAddress,
            r.loadingDate ?? '',
            r.unloadingDate ?? '',
            r.trip?.number ?? '',
            r.createdAt,
        ].map(csvCell).join(';'));
    }
    return '﻿' + lines.join('\r\n'); // BOM для Excel
}

// ============================================================
// Page
// ============================================================
export default function OrdersPage() {
    const { user } = useUser();
    const toast = useToast();

    const [rows, setRows] = useState<OrderListRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [statusFilter, setStatusFilter] = useState<string>('');
    const [tripFilter, setTripFilter] = useState<string>(''); // '' | 'with' | 'without'

    const [drawerOrderId, setDrawerOrderId] = useState<string | null>(null);
    const [createOpen, setCreateOpen] = useState(false);
    const [assignOrderId, setAssignOrderId] = useState<string | null>(null);

    const fetchOrders = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams();
            if (statusFilter) params.set('status', statusFilter);
            if (tripFilter === 'with') params.set('hasTrip', 'true');
            if (tripFilter === 'without') params.set('hasTrip', 'false');
            params.set('limit', '100');
            const qs = params.toString();
            const resp = await api.get<{ success: boolean; data: OrderListRow[]; total: number }>(
                `/orders/list${qs ? `?${qs}` : ''}`,
            );
            setRows(resp.data ?? []);
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Не удалось загрузить заявки';
            setError(msg);
        } finally {
            setLoading(false);
        }
    }, [statusFilter, tripFilter]);

    useEffect(() => {
        void fetchOrders();
    }, [fetchOrders]);

    // ----- Quick action: перевести заявку в работу -----
    const moveToWork = useCallback(async (orderId: string) => {
        try {
            await api.post(`/orders/${orderId}/status`, { status: 'confirmed' });
            toast.toast({ variant: 'success', title: 'Заявка переведена в работу' });
            void fetchOrders();
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Не удалось обновить статус';
            toast.toast({ variant: 'error', title: msg });
        }
    }, [toast, fetchOrders]);

    // ----- CSV export -----
    const exportCsv = useCallback((rowsToExport: OrderListRow[]) => {
        const csv = buildCsv(rowsToExport);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.toast({ variant: 'success', title: `Экспортировано: ${rowsToExport.length} заявок` });
    }, [toast]);

    // ----- Columns (RBAC через условный набор) -----
    const showFinanceCols = isManager(user);
    const showActionsCol = isLogist(user);

    const columns = useMemo<Column<OrderListRow>[]>(() => {
        const cols: Column<OrderListRow>[] = [
            {
                id: 'number',
                header: '№ заявки',
                accessor: (r) => r.number,
                cell: (r) => <span className="font-medium text-neutral-900">{r.number}</span>,
                sortable: true,
                sticky: 'left',
                monospace: true,
            },
            {
                id: 'status',
                header: 'Статус',
                accessor: (r) => STATUS_LABEL[r.status] ?? r.status,
                cell: (r) => (
                    <Pill tone={STATUS_TONE[r.status] ?? 'neutral'}>
                        {STATUS_LABEL[r.status] ?? r.status}
                    </Pill>
                ),
                sortable: true,
            },
            {
                id: 'contractor',
                header: 'Контрагент',
                accessor: (r) => r.contractor?.name ?? '',
                cell: (r) => (
                    <div className="min-w-0">
                        <div className="truncate font-medium text-neutral-800">
                            {r.contractor?.name ?? '—'}
                        </div>
                        {r.contractor?.inn && (
                            <div className="text-xs text-neutral-500">ИНН {r.contractor.inn}</div>
                        )}
                    </div>
                ),
                sortable: true,
                minWidth: '180px',
            },
            {
                id: 'route',
                header: 'Маршрут',
                accessor: (r) => `${r.loadingAddress} → ${r.unloadingAddress}`,
                cell: (r) => (
                    <div className="text-sm text-neutral-700">
                        {shortAddr(r.loadingAddress)} → {shortAddr(r.unloadingAddress)}
                    </div>
                ),
                minWidth: '180px',
            },
            {
                id: 'cargo',
                header: 'Груз',
                accessor: (r) => r.cargoDescription,
                cell: (r) => (
                    <div className="text-sm">
                        <div className="truncate text-neutral-800">{r.cargoDescription}</div>
                        <div className="text-xs text-neutral-500">
                            {formatWeight(r.cargoWeightKg)}
                            {r.coldChainRequired && <span className="ml-2 text-info-600">❄ cold-chain</span>}
                        </div>
                    </div>
                ),
                minWidth: '180px',
            },
            {
                id: 'loadingDate',
                header: 'Дата погрузки',
                accessor: (r) => r.loadingDate ?? '',
                cell: (r) => <span className="text-sm">{formatDate(r.loadingDate)}</span>,
                sortable: true,
            },
            {
                id: 'trip',
                header: 'Рейс',
                accessor: (r) => r.trip?.number ?? '',
                cell: (r) =>
                    r.trip ? (
                        <Link
                            href={`/trips/${r.trip.id}`}
                            className="text-brand-600 hover:underline text-sm font-medium"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {r.trip.number}
                        </Link>
                    ) : (
                        <span className="text-neutral-400 text-sm">—</span>
                    ),
                sortable: true,
            },
        ];

        // K7 (Этап 2) — финансовая колонка для manager+/accountant/admin.
        // Backend сам фильтрует customer_price=null для не-finance ролей.
        if (showFinanceCols) {
            cols.push({
                id: 'customerPrice',
                header: 'Стоимость',
                accessor: (r) => r.customerPrice ?? 0,
                cell: (r) => {
                    if (r.customerPrice == null) {
                        return <span className="text-neutral-400 text-xs italic">—</span>;
                    }
                    const formatted = new Intl.NumberFormat('ru-RU', {
                        style: 'currency',
                        currency: r.customerPriceCurrency || 'RUB',
                        maximumFractionDigits: 0,
                    }).format(r.customerPrice);
                    return (
                        <div className="text-right">
                            <div className="text-sm font-medium text-emerald-700">{formatted}</div>
                            <div className="text-[10px] text-neutral-500">
                                {r.customerPriceIncludesVat ? 'с НДС' : 'без НДС'}
                            </div>
                        </div>
                    );
                },
                sortable: true,
                align: 'right',
                monospace: true,
            });
        }

        return cols;
    }, [showFinanceCols]);

    // ----- Row actions (logist+admin only) -----
    const rowActions = useMemo<((row: OrderListRow) => RowAction<OrderListRow>[]) | undefined>(() => {
        if (!showActionsCol) return undefined;
        return (row) => {
            const actions: RowAction<OrderListRow>[] = [
                {
                    id: 'view',
                    label: 'Открыть детали',
                    onClick: (r) => setDrawerOrderId(r.id),
                },
            ];
            if (row.status === 'draft') {
                actions.push({
                    id: 'work',
                    label: 'В работу',
                    onClick: (r) => void moveToWork(r.id),
                });
            }
            if (row.status === 'confirmed' && !row.trip) {
                actions.push({
                    id: 'assign',
                    label: 'Назначить рейс',
                    onClick: (r) => setAssignOrderId(r.id),
                });
            }
            return actions;
        };
    }, [showActionsCol, moveToWork]);

    // ----- Bulk actions: CSV export для accountant/manager/admin -----
    const bulkActions = canExport(user)
        ? (selected: OrderListRow[], clear: () => void) => (
            <div className="flex items-center gap-2">
                <span className="text-sm text-neutral-600">
                    Выбрано: <strong>{selected.length}</strong>
                </span>
                <Button
                    variant="secondary"
                    size="sm"
                    leftIcon={<Download className="w-4 h-4" />}
                    onClick={() => {
                        exportCsv(selected);
                        clear();
                    }}
                >
                    Экспорт CSV
                </Button>
            </div>
        )
        : undefined;

    return (
        <div className="p-6 max-w-screen-2xl mx-auto space-y-6">
            <header className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold text-neutral-900 flex items-center gap-3">
                        <ClipboardList className="w-7 h-7 text-brand-600" />
                        Заявки
                    </h1>
                    <p className="text-sm text-neutral-500 mt-1">
                        Все заявки в текущей организации. Поиск, фильтры, переход к деталям и рейсу.
                    </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <Button
                        variant="ghost"
                        size="sm"
                        leftIcon={loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        onClick={() => void fetchOrders()}
                        disabled={loading}
                    >
                        Обновить
                    </Button>
                    {isLogist(user) && (
                        <Button
                            variant="brand"
                            size="sm"
                            leftIcon={<Plus className="w-4 h-4" />}
                            onClick={() => setCreateOpen(true)}
                        >
                            Новая заявка
                        </Button>
                    )}
                </div>
            </header>

            {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                    <div>
                        <div className="font-medium text-red-800">Не удалось загрузить заявки</div>
                        <div className="text-sm text-red-700">{error}</div>
                    </div>
                </div>
            )}

            <DataTable<OrderListRow>
                data={rows}
                columns={columns}
                keyField="id"
                loading={loading}
                searchPlaceholder="Поиск по номеру, контрагенту, адресу…"
                searchKeys={['number', 'contractor', 'route', 'cargo']}
                tableId="orders-list-v1"
                filters={[
                    {
                        id: 'status',
                        label: 'Статус',
                        value: statusFilter,
                        onChange: setStatusFilter,
                        options: [
                            { value: '', label: 'Все статусы' },
                            ...Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label })),
                        ],
                    },
                    {
                        id: 'trip',
                        label: 'Рейс',
                        value: tripFilter,
                        onChange: setTripFilter,
                        options: [
                            { value: '', label: 'Все' },
                            { value: 'with', label: 'С назначенным рейсом' },
                            { value: 'without', label: 'Без рейса' },
                        ],
                    },
                ]}
                onRowClick={(r) => setDrawerOrderId(r.id)}
                rowActions={rowActions}
                bulkActions={bulkActions}
                emptyState={
                    <div className="flex flex-col items-center justify-center py-10 text-neutral-500">
                        <PackageOpen className="w-12 h-12 mb-3 text-neutral-300" aria-hidden="true" />
                        <div className="font-medium">Заявок не найдено</div>
                        <div className="text-sm mt-1">Измените фильтры или создайте новую заявку.</div>
                    </div>
                }
                density="comfortable"
                pageSize={25}
            />

            {/* Side drawer with order details */}
            {drawerOrderId && (
                <OrderDetailDrawer
                    orderId={drawerOrderId}
                    onClose={() => setDrawerOrderId(null)}
                />
            )}

            {/* Create modal — logist+admin only */}
            {createOpen && isLogist(user) && (
                <CreateOrderModal
                    onClose={() => setCreateOpen(false)}
                    onCreate={() => {
                        setCreateOpen(false);
                        void fetchOrders();
                    }}
                />
            )}

            {/* Assign trip modal — logist+admin only.
                CreateTripModal сейчас не поддерживает preselectedOrderIds;
                logist выбирает заявку в самом модале. Пока ассайн открывает
                модал без preselect — расширение модала отдельным PR. */}
            {assignOrderId && isLogist(user) && (
                <CreateTripModal
                    onClose={() => setAssignOrderId(null)}
                    onCreated={() => {
                        setAssignOrderId(null);
                        void fetchOrders();
                    }}
                />
            )}
        </div>
    );
}
