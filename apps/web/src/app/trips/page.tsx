'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Search, Map, Truck, User, ArrowRight } from 'lucide-react';

interface Trip {
    id: string;
    number: string;
    status: string;
    vehicleId?: string;
    driverId?: string;
    plannedDistanceKm?: number;
    actualDistanceKm?: number;
    plannedDepartureAt?: string;
    actualDepartureAt?: string;
    actualCompletionAt?: string;
    notes?: string;
    createdAt: string;
}

interface VehicleInfo {
    id: string;
    plateNumber: string;
    make?: string;
    model?: string;
}

const STATUS_LABELS: Record<string, string> = {
    planning: 'Планирование',
    assigned: 'Назначен',
    inspection: 'Осмотр',
    waybill_issued: 'ПЛ выдан',
    loading: 'Погрузка',
    in_transit: 'В пути',
    completed: 'Завершён',
    billed: 'Оплачен',
    cancelled: 'Отменён',
};

const STATUS_COLORS: Record<string, string> = {
    planning: 'bg-slate-100 text-slate-700',
    assigned: 'bg-blue-100 text-blue-700',
    inspection: 'bg-cyan-100 text-cyan-700',
    waybill_issued: 'bg-violet-100 text-violet-700',
    loading: 'bg-orange-100 text-orange-700',
    in_transit: 'bg-amber-100 text-amber-800',
    completed: 'bg-emerald-100 text-emerald-700',
    billed: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-700',
};

function formatDate(d?: string) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('ru-RU', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

export default function TripsPage() {
    const [trips, setTrips] = useState<Trip[]>([]);
    const [loading, setLoading] = useState(true);
    const [vehicleMap, setVehicleMap] = useState<Record<string, VehicleInfo>>({});
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(search), 300);
        return () => clearTimeout(timer);
    }, [search]);

    useEffect(() => {
        loadTrips();
    }, [debouncedSearch, statusFilter]);

    // Load vehicles once to resolve IDs to plate numbers
    useEffect(() => {
        (async () => {
            try {
                const res = await api.get<any>('/fleet/vehicles?limit=200');
                const map: Record<string, VehicleInfo> = {};
                for (const v of (res.data || [])) {
                    map[v.id] = { id: v.id, plateNumber: v.plateNumber, make: v.make, model: v.model };
                }
                setVehicleMap(map);
            } catch { /* ignore */ }
        })();
    }, []);

    async function loadTrips() {
        setLoading(true);
        try {
            let url = `/trips?limit=100`;
            if (statusFilter) url += `&status=${statusFilter}`;
            if (debouncedSearch) url += `&search=${debouncedSearch}`;
            const result = await api.get<any>(url);
            setTrips(result.data || []);
        } catch (err) {
            console.error('Failed to load trips:', err);
        } finally {
            setLoading(false);
        }
    }

    // Status counters
    const statusCounts = trips.reduce((acc, t) => {
        acc[t.status] = (acc[t.status] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Рейсы</h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Все рейсы • {trips.length} записей
                    </p>
                </div>
            </div>

            {/* Status pills */}
            <div className="flex flex-wrap gap-2">
                <button
                    onClick={() => setStatusFilter('')}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all
                        ${!statusFilter ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                    Все ({trips.length})
                </button>
                {Object.entries(STATUS_LABELS).map(([key, label]) => (
                    <button
                        key={key}
                        onClick={() => setStatusFilter(key === statusFilter ? '' : key)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all
                            ${statusFilter === key ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                    >
                        {label} ({statusCounts[key] || 0})
                    </button>
                ))}
            </div>

            {/* Content Card */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200">
                {/* Search */}
                <div className="p-4 border-b border-slate-200">
                    <div className="relative max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Поиск по номеру рейса..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 text-sm
                                focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        />
                    </div>
                </div>

                {/* Table */}
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                    </div>
                ) : trips.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                        <Map className="w-12 h-12 mb-3" />
                        <p className="text-sm">Рейсы не найдены</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50 text-slate-500 text-left">
                                    <th className="px-4 py-3 font-medium">№ Рейса</th>
                                    <th className="px-4 py-3 font-medium">Статус</th>
                                    <th className="px-4 py-3 font-medium">ТС</th>
                                    <th className="px-4 py-3 font-medium">Дистанция</th>
                                    <th className="px-4 py-3 font-medium">Выезд (план)</th>
                                    <th className="px-4 py-3 font-medium">Выезд (факт)</th>
                                    <th className="px-4 py-3 font-medium">Завершён</th>
                                    <th className="px-4 py-3 font-medium">Создан</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {trips.map(t => (
                                    <tr key={t.id} className="hover:bg-slate-50 transition-colors cursor-pointer">
                                        <td className="px-4 py-3 font-semibold text-indigo-600">{t.number}</td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[t.status] || 'bg-slate-100 text-slate-700'}`}>
                                                {STATUS_LABELS[t.status] || t.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-slate-600">
                                            {t.vehicleId ? (
                                                <span className="flex items-center gap-1">
                                                    <Truck className="w-3.5 h-3.5" />
                                                    <span className="font-medium">
                                                        {vehicleMap[t.vehicleId]?.plateNumber || t.vehicleId.slice(0, 8) + '...'}
                                                    </span>
                                                </span>
                                            ) : '—'}
                                        </td>
                                        <td className="px-4 py-3 text-slate-600">
                                            {t.plannedDistanceKm ? `${t.plannedDistanceKm} км` : '—'}
                                            {t.actualDistanceKm ? (
                                                <span className="text-emerald-600 ml-1">
                                                    <ArrowRight className="w-3 h-3 inline" />
                                                    {t.actualDistanceKm} км
                                                </span>
                                            ) : null}
                                        </td>
                                        <td className="px-4 py-3 text-slate-500">{formatDate(t.plannedDepartureAt)}</td>
                                        <td className="px-4 py-3 text-slate-500">{formatDate(t.actualDepartureAt)}</td>
                                        <td className="px-4 py-3 text-slate-500">{formatDate(t.actualCompletionAt)}</td>
                                        <td className="px-4 py-3 text-slate-400 text-xs">{formatDate(t.createdAt)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
