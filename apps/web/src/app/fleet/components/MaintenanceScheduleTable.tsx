'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, Wrench } from 'lucide-react';
import { api } from '@/lib/api';
import { AddMaintenanceModal } from './AddMaintenanceModal';
import { formatDate, formatMoney } from './deepFleetShared';

type MaintenanceRecord = {
    id: string;
    vehicleId: string;
    maintenanceType: string;
    plannedDate?: string | null;
    plannedOdometerKm?: number | null;
    actualDate?: string | null;
    actualOdometerKm?: number | null;
    status: string;
    computedStatus?: string;
    cost?: number | string | null;
    contractor?: string | null;
    notes?: string | null;
    vehicle?: { plateNumber: string };
};

export function MaintenanceScheduleTable() {
    const [rows, setRows] = useState<MaintenanceRecord[]>([]);
    const [vehicles, setVehicles] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [completeDrafts, setCompleteDrafts] = useState<Record<string, { actualDate: string; actualOdometerKm: string; cost: string }>>({});
    const [filters, setFilters] = useState({ vehicleId: '', status: '', maintenanceType: '' });

    async function loadData() {
        setLoading(true);
        try {
            const query = new URLSearchParams();
            if (filters.vehicleId) query.set('vehicleId', filters.vehicleId);
            if (filters.status) query.set('status', filters.status);
            if (filters.maintenanceType) query.set('maintenanceType', filters.maintenanceType);
            const [recordsRes, vehiclesRes] = await Promise.all([
                api.get<any>(`/fleet/maintenance-schedule?${query.toString()}`),
                api.get<any>('/fleet/vehicles?limit=200'),
            ]);
            setRows(recordsRes.data || []);
            setVehicles(vehiclesRes.data || []);
        } catch (err) {
            console.error('Failed to load maintenance schedule', err);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadData();
    }, [filters.vehicleId, filters.status, filters.maintenanceType]);

    async function markDone(record: MaintenanceRecord) {
        const draft = completeDrafts[record.id];
        await api.put(`/fleet/maintenance-schedule/${record.id}`, {
            status: 'done',
            actualDate: draft?.actualDate ? new Date(`${draft.actualDate}T00:00:00`).toISOString() : new Date().toISOString(),
            actualOdometerKm: draft?.actualOdometerKm ? Number(draft.actualOdometerKm) : undefined,
            cost: draft?.cost ? Number(draft.cost) : undefined,
        });
        setCompleteDrafts((prev) => {
            const next = { ...prev };
            delete next[record.id];
            return next;
        });
        await loadData();
    }

    const statusTone: Record<string, string> = {
        planned: 'bg-blue-100 text-blue-700',
        overdue: 'bg-red-100 text-red-700',
        done: 'bg-emerald-100 text-emerald-700',
        cancelled: 'bg-slate-100 text-slate-600',
    };

    return (
        <div className="space-y-4 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="grid gap-3 md:grid-cols-3">
                    <select value={filters.vehicleId} onChange={(e) => setFilters((prev) => ({ ...prev, vehicleId: e.target.value }))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                        <option value="">Все ТС</option>
                        {vehicles.map((vehicle: any) => <option key={vehicle.id} value={vehicle.id}>{vehicle.plateNumber}</option>)}
                    </select>
                    <select value={filters.status} onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                        <option value="">Все статусы</option>
                        <option value="planned">План</option>
                        <option value="overdue">Просрочено</option>
                        <option value="done">Выполнено</option>
                        <option value="cancelled">Отменено</option>
                    </select>
                    <select value={filters.maintenanceType} onChange={(e) => setFilters((prev) => ({ ...prev, maintenanceType: e.target.value }))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                        <option value="">Все виды ТО</option>
                        <option value="to1">ТО-1</option>
                        <option value="to2">ТО-2</option>
                        <option value="to3">ТО-3</option>
                        <option value="seasonal">Сезонное</option>
                        <option value="other">Прочее</option>
                    </select>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => loadData()} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
                        <RefreshCw className="h-4 w-4" />
                        Обновить
                    </button>
                    <button onClick={() => setShowAddModal(true)} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
                        <Wrench className="h-4 w-4" />
                        Запланировать ТО
                    </button>
                </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-slate-50 text-left text-slate-500">
                            <th className="px-4 py-3 font-medium">ТС</th>
                            <th className="px-4 py-3 font-medium">Вид ТО</th>
                            <th className="px-4 py-3 font-medium">Плановая дата</th>
                            <th className="px-4 py-3 font-medium">Плановый одометр</th>
                            <th className="px-4 py-3 font-medium">Статус</th>
                            <th className="px-4 py-3 font-medium">Факт</th>
                            <th className="px-4 py-3 font-medium">Стоимость</th>
                            <th className="px-4 py-3 font-medium">Подрядчик</th>
                            <th className="px-4 py-3 font-medium">Действия</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {loading ? (
                            <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-400">Загружаем план ТО...</td></tr>
                        ) : rows.length === 0 ? (
                            <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-400">Плановых работ пока нет.</td></tr>
                        ) : rows.map((record) => {
                            const visualStatus = record.computedStatus || record.status;
                            const draft = completeDrafts[record.id] || { actualDate: '', actualOdometerKm: '', cost: '' };
                            return (
                                <tr key={record.id}>
                                    <td className="px-4 py-3 font-medium text-slate-800">{record.vehicle?.plateNumber || record.vehicleId}</td>
                                    <td className="px-4 py-3 text-slate-600">{record.maintenanceType}</td>
                                    <td className="px-4 py-3 text-slate-600">{formatDate(record.plannedDate)}</td>
                                    <td className="px-4 py-3 text-slate-600">{record.plannedOdometerKm ? `${Number(record.plannedOdometerKm).toLocaleString('ru-RU')} км` : '—'}</td>
                                    <td className="px-4 py-3">
                                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusTone[visualStatus] || 'bg-slate-100 text-slate-700'}`}>{visualStatus}</span>
                                    </td>
                                    <td className="px-4 py-3 text-slate-600">{record.actualDate ? formatDate(record.actualDate) : '—'}</td>
                                    <td className="px-4 py-3 text-slate-600">{record.cost ? formatMoney(record.cost) : '—'}</td>
                                    <td className="px-4 py-3 text-slate-600">{record.contractor || '—'}</td>
                                    <td className="px-4 py-3">
                                        {(visualStatus === 'planned' || visualStatus === 'overdue') ? (
                                            <div className="space-y-2">
                                                <div className="grid gap-2 md:grid-cols-3">
                                                    <input type="date" value={draft.actualDate} onChange={(e) => setCompleteDrafts((prev) => ({ ...prev, [record.id]: { ...draft, actualDate: e.target.value } }))} className="rounded-lg border border-slate-200 px-2 py-1 text-xs" />
                                                    <input type="number" min="0" value={draft.actualOdometerKm} onChange={(e) => setCompleteDrafts((prev) => ({ ...prev, [record.id]: { ...draft, actualOdometerKm: e.target.value } }))} placeholder="Км" className="rounded-lg border border-slate-200 px-2 py-1 text-xs" />
                                                    <input type="number" step="0.01" min="0" value={draft.cost} onChange={(e) => setCompleteDrafts((prev) => ({ ...prev, [record.id]: { ...draft, cost: e.target.value } }))} placeholder="Стоимость" className="rounded-lg border border-slate-200 px-2 py-1 text-xs" />
                                                </div>
                                                <button onClick={() => markDone(record)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                                                    Отметить выполненным
                                                </button>
                                            </div>
                                        ) : '—'}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <AddMaintenanceModal open={showAddModal} onClose={() => setShowAddModal(false)} onCreated={loadData} />
        </div>
    );
}
