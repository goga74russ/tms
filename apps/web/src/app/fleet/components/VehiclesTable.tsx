'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Search, Plus, ChevronRight, Truck } from 'lucide-react';
import { VehicleCard } from './VehicleCard';

type DeadlineColor = 'green' | 'yellow' | 'red' | 'blocked' | null;

interface Vehicle {
    id: string;
    plateNumber: string;
    vin: string;
    make: string;
    model: string;
    year: number;
    bodyType: string;
    payloadCapacityKg: number;
    status: string;
    currentOdometerKm: number;
    isArchived: boolean;
    deadlines: {
        techInspection: DeadlineColor;
        osago: DeadlineColor;
        maintenance: DeadlineColor;
        tachograph: DeadlineColor;
    };
    isBlocked: boolean;
}

const statusLabels: Record<string, { label: string; color: string }> = {
    available: { label: 'Доступен', color: 'bg-emerald-100 text-emerald-700' },
    assigned: { label: 'Назначен', color: 'bg-blue-100 text-blue-700' },
    in_trip: { label: 'В рейсе', color: 'bg-indigo-100 text-indigo-700' },
    maintenance: { label: 'ТО/Ремонт', color: 'bg-amber-100 text-amber-700' },
    broken: { label: 'Неисправен', color: 'bg-red-100 text-red-700' },
    blocked: { label: 'Заблокирован', color: 'bg-gray-100 text-gray-700' },
};

function DeadlineDot({ color, label }: { color: DeadlineColor; label: string }) {
    if (!color) return <span className="w-3 h-3 rounded-full bg-slate-200" title={`${label}: нет данных`} />;
    const colors: Record<string, string> = {
        green: 'bg-emerald-500',
        yellow: 'bg-amber-400',
        red: 'bg-red-500 animate-pulse',
        blocked: 'bg-red-700 animate-pulse',
    };
    const titles: Record<string, string> = {
        green: `${label}: >30 дней`,
        yellow: `${label}: 7–30 дней`,
        red: `${label}: <7 дней!`,
        blocked: `${label}: ПРОСРОЧЕН`,
    };
    return (
        <span
            className={`w-3 h-3 rounded-full ${colors[color]}`}
            title={titles[color]}
        />
    );
}

export function VehiclesTable() {
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [selectedId, setSelectedId] = useState<string | null>(null);

    // M-22 FIX: Debounce search input (300ms)
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(search), 300);
        return () => clearTimeout(timer);
    }, [search]);

    useEffect(() => {
        loadVehicles();
    }, [debouncedSearch]);

    async function loadVehicles() {
        setLoading(true);
        try {
            const result = await api.get<any>(`/fleet/vehicles?search=${debouncedSearch}&limit=50`);
            setVehicles(result.data || []);
        } catch (err) {
            console.error('Failed to load vehicles:', err);
        } finally {
            setLoading(false);
        }
    }

    if (selectedId) {
        return (
            <VehicleCard
                vehicleId={selectedId}
                onBack={() => { setSelectedId(null); loadVehicles(); }}
            />
        );
    }

    return (
        <div>
            {/* Toolbar */}
            <div className="p-4 border-b border-slate-200 flex items-center gap-4">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Поиск по номеру, марке..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 text-sm
                            focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                </div>
                <button className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg
                    text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm">
                    <Plus className="w-4 h-4" />
                    Добавить ТС
                </button>
            </div>

            {/* Legend */}
            <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-4 text-xs text-slate-500">
                <span>Светофор сроков:</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> &gt;30д</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" /> 7–30д</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> &lt;7д</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-700" /> просрочен</span>
            </div>

            {/* Table */}
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                </div>
            ) : vehicles.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                    <Truck className="w-12 h-12 mb-3" />
                    <p className="text-sm">Транспортные средства не найдены</p>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-slate-50 text-slate-500 text-left">
                                <th className="px-4 py-3 font-medium">Госномер</th>
                                <th className="px-4 py-3 font-medium">Марка / Модель</th>
                                <th className="px-4 py-3 font-medium">Тип</th>
                                <th className="px-4 py-3 font-medium">Грузоподъёмность</th>
                                <th className="px-4 py-3 font-medium">Пробег</th>
                                <th className="px-4 py-3 font-medium">Статус</th>
                                <th className="px-4 py-3 font-medium text-center" title="ТО / ОСАГО / Техосмотр / Тахограф">
                                    Сроки
                                </th>
                                <th className="px-4 py-3 w-10"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {vehicles.map(v => {
                                const st = statusLabels[v.status] || { label: v.status, color: 'bg-slate-100 text-slate-600' };
                                return (
                                    <tr
                                        key={v.id}
                                        className={`hover:bg-slate-50 cursor-pointer ${v.isBlocked ? 'bg-red-50/50' : ''}`}
                                        onClick={() => setSelectedId(v.id)}
                                    >
                                        <td className="px-4 py-3 font-mono font-semibold text-slate-900">
                                            {v.plateNumber}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="font-medium text-slate-800">{v.make}</span>{' '}
                                            <span className="text-slate-500">{v.model}</span>
                                            <span className="text-slate-400 ml-1">({v.year})</span>
                                        </td>
                                        <td className="px-4 py-3 text-slate-600">{v.bodyType}</td>
                                        <td className="px-4 py-3 text-slate-600">{(v.payloadCapacityKg / 1000).toFixed(1)} т</td>
                                        <td className="px-4 py-3 text-slate-600">
                                            {v.currentOdometerKm.toLocaleString()} км
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${st.color}`}>
                                                {st.label}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center justify-center gap-1.5">
                                                <DeadlineDot color={v.deadlines.maintenance} label="ТО" />
                                                <DeadlineDot color={v.deadlines.osago} label="ОСАГО" />
                                                <DeadlineDot color={v.deadlines.techInspection} label="Техосмотр" />
                                                <DeadlineDot color={v.deadlines.tachograph} label="Тахограф" />
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <ChevronRight className="w-4 h-4 text-slate-400" />
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
