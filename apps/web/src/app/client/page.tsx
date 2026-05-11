'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/lib/user-context';
import { api } from '@/lib/api';
import {
    Package, MapPin, FileText, DollarSign,
    Clock, CheckCircle2, Truck, AlertCircle,
    RefreshCw, ChevronRight, Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Stat } from '@/components/ui/stat';
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
    draft: { label: 'Черновик', color: 'bg-slate-100 text-slate-600', icon: Clock },
    confirmed: { label: 'В работе', color: 'bg-blue-100 text-blue-700', icon: CheckCircle2 },
    assigned: { label: 'Назначена', color: 'bg-indigo-100 text-indigo-700', icon: Truck },
    in_transit: { label: 'В пути', color: 'bg-amber-100 text-amber-700', icon: MapPin },
    delivered: { label: 'Доставлена', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
    completed: { label: 'Завершена', color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
    cancelled: { label: 'Отменена', color: 'bg-red-100 text-red-700', icon: AlertCircle },
};

const INVOICE_STATUS_LABELS: Record<string, { label: string; color: string }> = {
    draft: { label: 'Черновик', color: 'bg-slate-100 text-slate-600' },
    sent: { label: 'Отправлен', color: 'bg-blue-100 text-blue-700' },
    paid: { label: 'Оплачен', color: 'bg-green-100 text-green-700' },
    overdue: { label: 'Просрочен', color: 'bg-red-100 text-red-700' },
    cancelled: { label: 'Отменён', color: 'bg-slate-100 text-slate-500' },
};

const ALLOWED_ROLES = ['client', 'admin'];

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
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'orders' | 'invoices'>('orders');
    const [search, setSearch] = useState('');

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [ordersRes, invoicesRes] = await Promise.all([
                api.get<any>('/orders?limit=50'),
                api.get<any>('/finance/invoices?limit=50'),
            ]);
            setOrders(ordersRes.data || []);
            setInvoices(invoicesRes.data || []);
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

    // Stats
    const activeOrders = orders.filter(o => ['confirmed', 'assigned', 'in_transit'].includes(o.status)).length;
    const completedOrders = orders.filter(o => o.status === 'completed').length;
    const unpaidInvoices = invoices.filter(i => ['sent', 'overdue'].includes(i.status));
    const unpaidTotal = unpaidInvoices.reduce((sum, invoice) => {
        return sum + Number(invoice.totalAmount ?? invoice.total ?? 0);
    }, 0);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                    <div className="shrink-0 w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center">
                        <Package className="w-5 h-5" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-semibold text-slate-900">Портал клиента</h1>
                        <p className="text-sm text-slate-500 mt-0.5">Отслеживание заявок, рейсов и счетов</p>
                    </div>
                </div>
                <Button variant="outline" leftIcon={<RefreshCw className="w-4 h-4" />} onClick={loadData}>
                    Обновить
                </Button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Stat label="Активных заявок" value={activeOrders} icon={Package} tone="info" />
                <Stat label="Завершённых" value={completedOrders} icon={CheckCircle2} tone="success" />
                <Stat label="Неоплаченных счетов" value={unpaidInvoices.length} icon={FileText} tone={unpaidInvoices.length > 0 ? 'warning' : 'neutral'} />
                <Stat label="К оплате" value={formatMoney(unpaidTotal)} icon={DollarSign} tone={unpaidTotal > 0 ? 'danger' : 'success'} />
            </div>

            {/* Tabs + Search */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
                <div className="p-4 border-b border-slate-200 flex items-center gap-4">
                    <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
                        <button
                            onClick={() => setActiveTab('orders')}
                            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${activeTab === 'orders' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                                }`}
                        >
                            <Package className="w-4 h-4 inline mr-1.5" />
                            Заявки ({orders.length})
                        </button>
                        <button
                            onClick={() => setActiveTab('invoices')}
                            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${activeTab === 'invoices' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
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
                    /* Orders Table */
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50 text-slate-500 text-left">
                                    <th className="px-4 py-3 font-medium">Номер</th>
                                    <th className="px-4 py-3 font-medium">Статус</th>
                                    <th className="px-4 py-3 font-medium">Груз</th>
                                    <th className="px-4 py-3 font-medium">Откуда</th>
                                    <th className="px-4 py-3 font-medium">Куда</th>
                                    <th className="px-4 py-3 font-medium">Дата</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
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
                                    const st = ORDER_STATUS_LABELS[order.status] || { label: order.status, color: 'bg-slate-100 text-slate-600' };
                                    return (
                                        <tr key={order.id} className="hover:bg-blue-50/50 transition-colors">
                                            <td className="px-4 py-3">
                                                <span className="font-mono font-semibold text-blue-700">{order.number}</span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${st.color}`}>
                                                    {st.label}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-slate-700 max-w-48 truncate">{order.cargoDescription || '—'}</td>
                                            <td className="px-4 py-3 text-slate-600 text-xs max-w-40 truncate">{order.loadingAddress || '—'}</td>
                                            <td className="px-4 py-3 text-slate-600 text-xs max-w-40 truncate">{order.unloadingAddress || '—'}</td>
                                            <td className="px-4 py-3 text-slate-500 text-xs">
                                                {new Date(order.createdAt).toLocaleDateString('ru-RU')}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    /* Invoices Table */
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50 text-slate-500 text-left">
                                    <th className="px-4 py-3 font-medium">Номер</th>
                                    <th className="px-4 py-3 font-medium">Статус</th>
                                    <th className="px-4 py-3 font-medium">Сумма</th>
                                    <th className="px-4 py-3 font-medium">Период</th>
                                    <th className="px-4 py-3 font-medium">Дата</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
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
                                    const st = INVOICE_STATUS_LABELS[inv.status] || { label: inv.status, color: 'bg-slate-100 text-slate-600' };
                                    return (
                                        <tr key={inv.id} className="hover:bg-blue-50/50 transition-colors">
                                            <td className="px-4 py-3">
                                                <span className="font-mono font-semibold text-slate-700">{inv.number}</span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${st.color}`}>
                                                    {st.label}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 font-semibold text-slate-900">
                                                {formatMoney(inv.totalAmount ?? inv.total ?? 0)}
                                            </td>
                                            <td className="px-4 py-3 text-slate-600 text-xs">
                                                {inv.periodStart ? new Date(inv.periodStart).toLocaleDateString('ru-RU') : '—'}
                                                {' — '}
                                                {inv.periodEnd ? new Date(inv.periodEnd).toLocaleDateString('ru-RU') : '—'}
                                            </td>
                                            <td className="px-4 py-3 text-slate-500 text-xs">
                                                {new Date(inv.createdAt).toLocaleDateString('ru-RU')}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
