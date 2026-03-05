'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import {
    Package, MapPin, FileText, DollarSign,
    Clock, CheckCircle2, Truck, AlertCircle,
    RefreshCw, ChevronRight, Search,
} from 'lucide-react';

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
    totalAmount: number;
    periodStart: string;
    periodEnd: string;
    createdAt: string;
}

const ORDER_STATUS_LABELS: Record<string, { label: string; color: string; icon: any }> = {
    draft: { label: 'Черновик', color: 'bg-slate-100 text-slate-600', icon: Clock },
    confirmed: { label: 'Подтверждена', color: 'bg-blue-100 text-blue-700', icon: CheckCircle2 },
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

export default function ClientPortalPage() {
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
    const unpaidTotal = unpaidInvoices.reduce((s, i) => s + (i.totalAmount || 0), 0);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Портал клиента</h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Отслеживание заявок, рейсов и счетов
                    </p>
                </div>
                <button
                    onClick={loadData}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600
                        hover:bg-slate-100 rounded-lg transition-colors"
                >
                    <RefreshCw className="w-4 h-4" />
                    Обновить
                </button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 rounded-lg">
                            <Package className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-slate-900">{activeOrders}</p>
                            <p className="text-xs text-slate-500">Активных заявок</p>
                        </div>
                    </div>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-green-100 rounded-lg">
                            <CheckCircle2 className="w-5 h-5 text-green-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-slate-900">{completedOrders}</p>
                            <p className="text-xs text-slate-500">Завершённых</p>
                        </div>
                    </div>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-amber-100 rounded-lg">
                            <FileText className="w-5 h-5 text-amber-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-slate-900">{unpaidInvoices.length}</p>
                            <p className="text-xs text-slate-500">Неоплаченных счетов</p>
                        </div>
                    </div>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-red-100 rounded-lg">
                            <DollarSign className="w-5 h-5 text-red-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-slate-900">{unpaidTotal.toLocaleString('ru-RU')} ₽</p>
                            <p className="text-xs text-slate-500">К оплате</p>
                        </div>
                    </div>
                </div>
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
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Поиск..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 text-sm
                                focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        />
                    </div>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                    </div>
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
                                        <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                                            Заявки не найдены
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
                                        <td colSpan={5} className="px-4 py-12 text-center text-slate-400">
                                            Счета не найдены
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
                                                {(inv.totalAmount || 0).toLocaleString('ru-RU')} ₽
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
