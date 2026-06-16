'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useUser } from '@/lib/user-context';
import { api } from '@/lib/api';
import {
    Package, MapPin, FileText, DollarSign,
    Clock, CheckCircle2, Truck, AlertCircle,
    Search, Briefcase, ChevronRight,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { MetricCard } from '@/components/ui/metric-card';
import { DashboardHeader } from '@/components/ui/dashboard-header';
import { computeRange, type PeriodRange } from '@/components/ui/period-selector';
import { SkeletonTable } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';

interface Order {
    id: string;
    number: string;
    status: string;
    cargoDescription: string;
    loadingAddress: string;
    unloadingAddress: string;
    createdAt: string;
    tripId?: string;
}

interface Trip {
    id: string;
    number: string;
    status: string;
    vehicleId?: string;
    driverId?: string;
    plannedDistanceKm?: number;
    actualDepartureAt?: string;
    plannedCompletionAt?: string;
}

interface Invoice {
    id: string;
    number: string;
    status: string;
    totalAmount?: number | string;
    total?: number | string;
    periodStart: string;
    periodEnd: string;
    createdAt: string;
}

function formatMoney(value: number | string) {
    return Number(value).toLocaleString('ru-RU') + ' ₽';
}

const ORDER_STATUS_LABELS: Record<string, { label: string; color: string; icon: any }> = {
    draft: { label: 'Черновик', color: 'bg-neutral-100 text-neutral-600', icon: Clock },
    confirmed: { label: 'В работе', color: 'bg-info-100 text-info-700', icon: CheckCircle2 },
    assigned: { label: 'Назначена', color: 'bg-brand-100 text-brand-700', icon: Truck },
    in_transit: { label: 'В пути', color: 'bg-warning-100 text-warning-700', icon: MapPin },
    delivered: { label: 'Доставлена', color: 'bg-success-100 text-success-700', icon: CheckCircle2 },
    completed: { label: 'Завершена', color: 'bg-success-100 text-success-700', icon: CheckCircle2 },
    cancelled: { label: 'Отменена', color: 'bg-danger-100 text-danger-700', icon: AlertCircle },
};

// C2: актуальный invoice-FSM (раньше — устаревшие sent/paid/overdue, которых
// сервер больше не присылает → бейдж рендерил сырой 'issued').
const INVOICE_STATUS_LABELS: Record<string, { label: string; color: string }> = {
    draft: { label: 'Черновик', color: 'bg-neutral-100 text-neutral-600' },
    issued: { label: 'Выставлен', color: 'bg-info-100 text-info-700' },
    paid_partial: { label: 'Частично оплачен', color: 'bg-warning-100 text-warning-700' },
    paid_full: { label: 'Оплачен', color: 'bg-success-100 text-success-700' },
    corrected: { label: 'Скорректирован', color: 'bg-neutral-100 text-neutral-600' },
    cancelled: { label: 'Отменён', color: 'bg-neutral-100 text-neutral-500' },
};

const ALLOWED_ROLES = ['client', 'admin'];

// Серверный лимит выборки (см. /orders?limit=50 и /finance/invoices?limit=50).
// Агрегаты на этой странице считаются по загруженной выборке, поэтому при
// усечении показываем предупреждение, чтобы цифры не вводили в заблуждение.
const PAGE_LIMIT = 50;

export default function ClientPortalPage() {
    const { user, loading: userLoading } = useUser();
    const router = useRouter();

    useEffect(() => {
        if (!userLoading && (!user || !user.roles.some(r => ALLOWED_ROLES.includes(r)))) {
            router.push('/');
        }
    }, [user, userLoading, router]);

    const [orders, setOrders] = useState<Order[]>([]);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    // total из ответа сервера (orders отдаёт `total`; invoices — нет, тогда null).
    const [ordersTotal, setOrdersTotal] = useState<number | null>(null);
    const [invoicesTotal, setInvoicesTotal] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'orders' | 'invoices'>('orders');
    const [search, setSearch] = useState('');
    const [period, setPeriod] = useState<PeriodRange>(() => computeRange('mtd'));

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [ordersRes, invoicesRes] = await Promise.all([
                api.get<any>(`/orders?limit=${PAGE_LIMIT}`),
                api.get<any>(`/finance/invoices?limit=${PAGE_LIMIT}`),
            ]);
            setOrders(ordersRes.data || []);
            setInvoices(invoicesRes.data || []);
            // total присылает только /orders; для invoices остаётся null → усечение
            // определяем по достижению лимита (см. ниже ordersTruncated/invoicesTruncated).
            setOrdersTotal(typeof ordersRes.total === 'number' ? ordersRes.total : null);
            setInvoicesTotal(typeof invoicesRes.total === 'number' ? invoicesRes.total : null);
        } catch (err) {
            console.error('Failed to load client data:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const filteredOrders = orders.filter(o =>
        o.number.toLowerCase().includes(search.toLowerCase()) ||
        o.cargoDescription?.toLowerCase().includes(search.toLowerCase()) ||
        o.loadingAddress?.toLowerCase().includes(search.toLowerCase())
    );

    const filteredInvoices = invoices.filter(i =>
        i.number.toLowerCase().includes(search.toLowerCase())
    );

    // Period-scoped data
    const periodOrders = orders.filter((o) => {
        if (!o.createdAt) return true;
        const t = new Date(o.createdAt).getTime();
        return Number.isFinite(t) && t >= period.from.getTime() && t <= period.to.getTime();
    });
    const periodInvoices = invoices.filter((i) => {
        if (!i.createdAt) return true;
        const t = new Date(i.createdAt).getTime();
        return Number.isFinite(t) && t >= period.from.getTime() && t <= period.to.getTime();
    });

    // Stats
    const activeOrders = periodOrders.filter(o => ['confirmed', 'assigned', 'in_transit'].includes(o.status)).length;
    const completedOrders = periodOrders.filter(o => o.status === 'completed' || o.status === 'delivered').length;
    const unpaidInvoices = periodInvoices.filter(i => ['issued', 'paid_partial'].includes(i.status));
    const unpaidTotal = unpaidInvoices.reduce((sum, invoice) => {
        return sum + Number(invoice.totalAmount ?? invoice.total ?? 0);
    }, 0);

    // Funnel counts across full order set (lifecycle is independent of created-period filter)
    const funnel = [
        { key: 'draft', label: 'Создана', count: orders.filter(o => o.status === 'draft').length },
        { key: 'confirmed', label: 'В работе', count: orders.filter(o => o.status === 'confirmed').length },
        { key: 'assigned', label: 'Назначена', count: orders.filter(o => o.status === 'assigned').length },
        { key: 'in_transit', label: 'В пути', count: orders.filter(o => o.status === 'in_transit').length },
        { key: 'delivered', label: 'Доставлена', count: orders.filter(o => o.status === 'delivered' || o.status === 'completed').length },
    ];

    // 14-day sparkline of unpaid invoice volume
    const unpaidSparkline = (() => {
        const days = 14;
        const buckets = new Array<number>(days).fill(0);
        const todayMs = Date.now();
        invoices.forEach((inv) => {
            // C2: неоплаченные в актуальном FSM = issued + paid_partial (раньше
            // фильтр был по sent/overdue, которых сервер больше не присылает → пусто).
            if (!['issued', 'paid_partial'].includes(inv.status)) return;
            if (!inv.createdAt) return;
            const t = new Date(inv.createdAt).getTime();
            if (!Number.isFinite(t)) return;
            const age = Math.floor((todayMs - t) / 86_400_000);
            if (age < 0 || age >= days) return;
            buckets[days - 1 - age] += Number(inv.totalAmount ?? inv.total ?? 0);
        });
        return buckets;
    })();

    // Усечение выборки: total (если есть) больше загруженного, либо total неизвестен
    // и загрузка уперлась в лимит. Влияет на корректность агрегатов и счётчиков.
    const ordersTruncated = ordersTotal !== null
        ? ordersTotal > orders.length
        : orders.length >= PAGE_LIMIT;
    const invoicesTruncated = invoicesTotal !== null
        ? invoicesTotal > invoices.length
        : invoices.length >= PAGE_LIMIT;
    const anyTruncated = ordersTruncated || invoicesTruncated;

    return (
        <div className="space-y-6">
            <DashboardHeader
                title="Портал клиента"
                subtitle="Отслеживание заявок, рейсов и счетов"
                icon={Briefcase}
                iconTone="brand"
                period={period}
                onPeriodChange={setPeriod}
                onRefresh={loadData}
                refreshing={loading}
            />

            {/* Metric Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <MetricCard label="Активных заявок" value={activeOrders} hint="за период" icon={Package} tone="info" />
                <MetricCard label="Завершённых" value={completedOrders} hint="доставлено" icon={CheckCircle2} tone="success" />
                <MetricCard label="Неоплаченных счетов" value={unpaidInvoices.length} hint={unpaidInvoices.length > 0 ? 'требует оплаты' : 'нет неоплаченных'} icon={FileText} tone={unpaidInvoices.length > 0 ? 'warning' : 'neutral'} changeGood={false} />
                <MetricCard
                    label="К оплате"
                    value={formatMoney(unpaidTotal)}
                    hint="сумма неоплаченных"
                    sparkline={unpaidSparkline}
                    sparklineTone={unpaidTotal > 0 ? 'danger' : 'success'}
                    icon={DollarSign}
                    tone={unpaidTotal > 0 ? 'danger' : 'success'}
                    changeGood={false}
                />
            </div>

            {/* Предупреждение об усечении: агрегаты и счётчики выше посчитаны по
                загруженной выборке (лимит {PAGE_LIMIT}), а данных на сервере больше. */}
            {!loading && anyTruncated && (
                <div className="flex items-start gap-2 rounded-xl border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-800">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <div>
                        <p className="font-medium">Показаны не все данные</p>
                        <p className="mt-0.5 text-warning-700">
                            {ordersTruncated && (
                                <span>
                                    Заявки: показано {orders.length}
                                    {ordersTotal !== null ? ` из ${ordersTotal}` : ` из более чем ${PAGE_LIMIT}`}.{' '}
                                </span>
                            )}
                            {invoicesTruncated && (
                                <span>
                                    Счета: показано {invoices.length}
                                    {invoicesTotal !== null ? ` из ${invoicesTotal}` : ` из более чем ${PAGE_LIMIT}`}.{' '}
                                </span>
                            )}
                            Метрики и счётчики рассчитаны по загруженной части и могут быть неполными.
                        </p>
                    </div>
                </div>
            )}

            {/* Order Funnel */}
            <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
                <p className="mb-3 text-xs font-medium uppercase tracking-wide text-neutral-500">Жизненный цикл заявок</p>
                <div className="flex flex-wrap items-stretch gap-2">
                    {funnel.map((step, i) => (
                        <div key={step.key} className="flex items-center gap-2 flex-1 min-w-[120px]">
                            <div className="flex-1 rounded-lg border border-brand-100 bg-brand-50 px-3 py-2.5">
                                <div className="text-2xl font-bold tabular-nums text-brand-700 leading-none">{step.count}</div>
                                <div className="mt-1 text-xs font-medium text-neutral-600">{step.label}</div>
                            </div>
                            {i < funnel.length - 1 && (
                                <ChevronRight className="h-4 w-4 shrink-0 text-neutral-300" aria-hidden="true" />
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Tabs + Search */}
            <div className="bg-white rounded-xl border border-neutral-200 shadow-sm">
                <div className="p-4 border-b border-neutral-200 flex items-center gap-4">
                    <div className="flex gap-1 bg-neutral-100 rounded-lg p-1">
                        <button
                            onClick={() => setActiveTab('orders')}
                            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${activeTab === 'orders' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'
                                }`}
                        >
                            <Package className="w-4 h-4 inline mr-1.5" />
                            Заявки ({orders.length})
                        </button>
                        <button
                            onClick={() => setActiveTab('invoices')}
                            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${activeTab === 'invoices' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'
                                }`}
                        >
                            <FileText className="w-4 h-4 inline mr-1.5" />
                            Счета ({invoices.length})
                        </button>
                    </div>
                    <div className="flex-1 max-w-sm">
                        <Input
                            type="text"
                            placeholder="Поиск..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            leftAddon={<Search className="w-4 h-4" />}
                        />
                    </div>
                </div>

                {loading ? (
                    <div className="p-4"><SkeletonTable rows={6} columns={6} /></div>
                ) : activeTab === 'orders' ? (
                    <>
                        {/* Orders Table — desktop */}
                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-neutral-50 text-neutral-500 text-left">
                                        <th className="px-4 py-3 font-medium">Номер</th>
                                        <th className="px-4 py-3 font-medium">Статус</th>
                                        <th className="px-4 py-3 font-medium">Груз</th>
                                        <th className="px-4 py-3 font-medium">Откуда</th>
                                        <th className="px-4 py-3 font-medium">Куда</th>
                                        <th className="px-4 py-3 font-medium">Дата</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-neutral-100">
                                    {filteredOrders.length === 0 ? (
                                        <tr>
                                            <td colSpan={6}>
                                                <div className="p-6">
                                                    <EmptyState
                                                        icon={Package}
                                                        title="Заявок пока нет"
                                                        description="Заявки появятся здесь после оформления."
                                                    />
                                                </div>
                                            </td>
                                        </tr>
                                    ) : filteredOrders.map(order => {
                                        const st = ORDER_STATUS_LABELS[order.status] || { label: order.status, color: 'bg-neutral-100 text-neutral-600' };
                                        return (
                                            <tr key={order.id} className="hover:bg-info-50/50 transition-colors">
                                                <td className="px-4 py-3">
                                                    <Link
                                                        href={`/client/orders/${order.id}`}
                                                        className="font-mono font-semibold text-info-700 hover:underline focus:underline focus:outline-none"
                                                    >
                                                        {order.number}
                                                    </Link>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${st.color}`}>
                                                        {st.label}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-neutral-700 max-w-48 truncate" title={order.cargoDescription || undefined}>{order.cargoDescription || '—'}</td>
                                                <td className="px-4 py-3 text-neutral-600 text-xs max-w-40 truncate" title={order.loadingAddress || undefined}>{order.loadingAddress || '—'}</td>
                                                <td className="px-4 py-3 text-neutral-600 text-xs max-w-40 truncate" title={order.unloadingAddress || undefined}>{order.unloadingAddress || '—'}</td>
                                                <td className="px-4 py-3 text-neutral-500 text-xs">
                                                    {new Date(order.createdAt).toLocaleDateString('ru-RU')}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Orders Cards — mobile (<768px) */}
                        <div className="md:hidden p-3 space-y-3">
                            {filteredOrders.length === 0 ? (
                                <div className="p-3">
                                    <EmptyState
                                        icon={Package}
                                        title="Заявок пока нет"
                                        description="Заявки появятся здесь после оформления."
                                    />
                                </div>
                            ) : filteredOrders.map(order => {
                                const st = ORDER_STATUS_LABELS[order.status] || { label: order.status, color: 'bg-neutral-100 text-neutral-600' };
                                return (
                                    <Link
                                        key={order.id}
                                        href={`/client/orders/${order.id}`}
                                        className="block rounded-xl border border-neutral-200 bg-white p-4 shadow-sm transition-colors hover:border-info-200 hover:bg-info-50/30 focus:outline-none focus:ring-2 focus:ring-info-500/40"
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <span className="font-mono text-sm font-semibold text-info-700">{order.number}</span>
                                            <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${st.color}`}>
                                                {st.label}
                                            </span>
                                        </div>
                                        <div className="mt-2 text-sm font-medium text-neutral-900 break-words">
                                            {order.cargoDescription || '—'}
                                        </div>
                                        <div className="mt-2 space-y-1 text-xs text-neutral-600">
                                            <div className="flex gap-1.5">
                                                <span className="shrink-0 text-neutral-400">Откуда:</span>
                                                <span className="break-words">{order.loadingAddress || '—'}</span>
                                            </div>
                                            <div className="flex gap-1.5">
                                                <span className="shrink-0 text-neutral-400">Куда:</span>
                                                <span className="break-words">{order.unloadingAddress || '—'}</span>
                                            </div>
                                            <div className="flex gap-1.5">
                                                <span className="shrink-0 text-neutral-400">Дата:</span>
                                                <span>{new Date(order.createdAt).toLocaleDateString('ru-RU')}</span>
                                            </div>
                                        </div>
                                    </Link>
                                );
                            })}
                        </div>
                    </>
                ) : (
                    <>
                        {/* Invoices Table — desktop */}
                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-neutral-50 text-neutral-500 text-left">
                                        <th className="px-4 py-3 font-medium">Номер</th>
                                        <th className="px-4 py-3 font-medium">Статус</th>
                                        <th className="px-4 py-3 font-medium">Сумма</th>
                                        <th className="px-4 py-3 font-medium">Период</th>
                                        <th className="px-4 py-3 font-medium">Дата</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-neutral-100">
                                    {filteredInvoices.length === 0 ? (
                                        <tr>
                                            <td colSpan={5}>
                                                <div className="p-6">
                                                    <EmptyState
                                                        icon={FileText}
                                                        title="Счетов пока нет"
                                                        description="Здесь появятся счета по выполненным заявкам."
                                                    />
                                                </div>
                                            </td>
                                        </tr>
                                    ) : filteredInvoices.map(inv => {
                                        const st = INVOICE_STATUS_LABELS[inv.status] || { label: inv.status, color: 'bg-neutral-100 text-neutral-600' };
                                        return (
                                            <tr key={inv.id} className="hover:bg-info-50/50 transition-colors">
                                                <td className="px-4 py-3">
                                                    <span className="font-mono font-semibold text-neutral-700">{inv.number}</span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${st.color}`}>
                                                        {st.label}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 font-semibold text-neutral-900">
                                                    {formatMoney(inv.totalAmount ?? inv.total ?? 0)}
                                                </td>
                                                <td className="px-4 py-3 text-neutral-600 text-xs">
                                                    {inv.periodStart ? new Date(inv.periodStart).toLocaleDateString('ru-RU') : '—'}
                                                    {' — '}
                                                    {inv.periodEnd ? new Date(inv.periodEnd).toLocaleDateString('ru-RU') : '—'}
                                                </td>
                                                <td className="px-4 py-3 text-neutral-500 text-xs">
                                                    {new Date(inv.createdAt).toLocaleDateString('ru-RU')}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Invoices Cards — mobile (<768px) */}
                        <div className="md:hidden p-3 space-y-3">
                            {filteredInvoices.length === 0 ? (
                                <div className="p-3">
                                    <EmptyState
                                        icon={FileText}
                                        title="Счетов пока нет"
                                        description="Здесь появятся счета по выполненным заявкам."
                                    />
                                </div>
                            ) : filteredInvoices.map(inv => {
                                const st = INVOICE_STATUS_LABELS[inv.status] || { label: inv.status, color: 'bg-neutral-100 text-neutral-600' };
                                return (
                                    <div
                                        key={inv.id}
                                        className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm"
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <span className="font-mono text-sm font-semibold text-neutral-700">{inv.number}</span>
                                            <span className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${st.color}`}>
                                                {st.label}
                                            </span>
                                        </div>
                                        <div className="mt-2 text-base font-semibold text-neutral-900">
                                            {formatMoney(inv.totalAmount ?? inv.total ?? 0)}
                                        </div>
                                        <div className="mt-2 space-y-1 text-xs text-neutral-600">
                                            <div className="flex gap-1.5">
                                                <span className="shrink-0 text-neutral-400">Период:</span>
                                                <span>
                                                    {inv.periodStart ? new Date(inv.periodStart).toLocaleDateString('ru-RU') : '—'}
                                                    {' — '}
                                                    {inv.periodEnd ? new Date(inv.periodEnd).toLocaleDateString('ru-RU') : '—'}
                                                </span>
                                            </div>
                                            <div className="flex gap-1.5">
                                                <span className="shrink-0 text-neutral-400">Создан:</span>
                                                <span>{new Date(inv.createdAt).toLocaleDateString('ru-RU')}</span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
