'use client';

import { useEffect, useMemo, useState } from 'react';
import { PauseCircle, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { AddDowntimeModal } from './AddDowntimeModal';
import { durationHours, formatDateTime, getRowRecord } from './deepFleetShared';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';

type DowntimeRow = {
    id: string;
    vehicleId: string;
    startAt: string;
    endAt?: string | null;
    reasonCode: string;
    description?: string | null;
};

export function DowntimeRecordsTable() {
    const [rows, setRows] = useState<any[]>([]);
    const [vehicles, setVehicles] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [filters, setFilters] = useState({ vehicleId: '', reasonCode: '', openOnly: true });

    async function loadData() {
        setLoading(true);
        try {
            const query = new URLSearchParams();
            if (filters.vehicleId) query.set('vehicleId', filters.vehicleId);
            if (filters.reasonCode) query.set('reasonCode', filters.reasonCode);
            if (filters.openOnly) query.set('openOnly', 'true');
            const [recordsRes, vehiclesRes] = await Promise.all([
                api.get<any>(`/fleet/downtime-records?${query.toString()}`),
                api.get<any>('/fleet/vehicles?limit=200'),
            ]);
            setRows(recordsRes.data || []);
            setVehicles(vehiclesRes.data || []);
        } catch (err) {
            console.error('Failed to load downtime records', err);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadData();
    }, [filters.vehicleId, filters.reasonCode, filters.openOnly]);

    const totalHours = useMemo(
        () => rows.reduce((sum, row) => sum + durationHours(getRowRecord<DowntimeRow>(row, 'downtime_records').startAt, getRowRecord<DowntimeRow>(row, 'downtime_records').endAt), 0),
        [rows],
    );

    async function closeDowntime(id: string) {
        await api.put(`/fleet/downtime-records/${id}`, { endAt: new Date().toISOString() });
        await loadData();
    }

    return (
        <div className="space-y-4 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="grid gap-3 md:grid-cols-3">
                    <select value={filters.vehicleId} onChange={(e) => setFilters((prev) => ({ ...prev, vehicleId: e.target.value }))} className="rounded-lg border border-neutral-200 px-3 py-2 text-sm">
                        <option value="">Все ТС</option>
                        {vehicles.map((vehicle: any) => <option key={vehicle.id} value={vehicle.id}>{vehicle.plateNumber}</option>)}
                    </select>
                    <select value={filters.reasonCode} onChange={(e) => setFilters((prev) => ({ ...prev, reasonCode: e.target.value }))} className="rounded-lg border border-neutral-200 px-3 py-2 text-sm">
                        <option value="">Все причины</option>
                        <option value="repair">Ремонт</option>
                        <option value="waiting_load">Ожидание загрузки</option>
                        <option value="waiting_docs">Ожидание документов</option>
                        <option value="driver_absence">Нет водителя</option>
                        <option value="weather">Погода</option>
                        <option value="other">Прочее</option>
                    </select>
                    <label className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-600">
                        <input type="checkbox" checked={filters.openOnly} onChange={(e) => setFilters((prev) => ({ ...prev, openOnly: e.target.checked }))} />
                        Только открытые
                    </label>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => loadData()} className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-50">
                        <RefreshCw className="h-4 w-4" />
                        Обновить
                    </button>
                    <button onClick={() => setShowAddModal(true)} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
                        <PauseCircle className="h-4 w-4" />
                        Открыть простой
                    </button>
                </div>
            </div>

            <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-neutral-500">Суммарная длительность</p>
                <p className="mt-1 text-2xl font-bold text-neutral-900">{totalHours.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} ч</p>
            </div>

            <div className="overflow-x-auto rounded-xl border border-neutral-200">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-neutral-50 text-left text-neutral-500">
                            <th className="px-4 py-3 font-medium">ТС</th>
                            <th className="px-4 py-3 font-medium">Начало</th>
                            <th className="px-4 py-3 font-medium">Конец</th>
                            <th className="px-4 py-3 font-medium">Длительность</th>
                            <th className="px-4 py-3 font-medium">Причина</th>
                            <th className="px-4 py-3 font-medium">Описание</th>
                            <th className="px-4 py-3 font-medium">Действия</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                        {loading ? (
                            <tr><td colSpan={7} className="px-4 py-10 text-center text-neutral-400">Загружаем простои...</td></tr>
                        ) : rows.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="p-4">
                                    <EmptyState
                                        icon={PauseCircle}
                                        title={filters.openOnly ? 'Активных простоев нет' : 'Простоев пока нет'}
                                        description={filters.openOnly ? 'Все простои закрыты. Откройте новый, если ТС простаивает прямо сейчас.' : 'Откройте простой, чтобы фиксировать причины и длительность.'}
                                        tone="brand"
                                        action={
                                            <Button variant="brand" leftIcon={<PauseCircle className="w-4 h-4" />} onClick={() => setShowAddModal(true)}>
                                                Открыть простой
                                            </Button>
                                        }
                                    />
                                </td>
                            </tr>
                        ) : rows.map((row: any) => {
                            const record = getRowRecord<DowntimeRow>(row, 'downtime_records');
                            const vehicle = row.vehicles;
                            const isActive = !record.endAt;
                            return (
                                <tr key={record.id}>
                                    <td className="px-4 py-3 font-medium text-neutral-800">{vehicle?.plateNumber || record.vehicleId}</td>
                                    <td className="px-4 py-3 text-neutral-600">{formatDateTime(record.startAt)}</td>
                                    <td className="px-4 py-3 text-neutral-600">
                                        {isActive ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Активен</span> : formatDateTime(record.endAt)}
                                    </td>
                                    <td className="px-4 py-3 text-neutral-600">{durationHours(record.startAt, record.endAt).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} ч</td>
                                    <td className="px-4 py-3 text-neutral-600">{record.reasonCode}</td>
                                    <td className="px-4 py-3 text-neutral-600">{record.description || '—'}</td>
                                    <td className="px-4 py-3">
                                        {isActive ? (
                                            <button onClick={() => closeDowntime(record.id)} className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50">
                                                Закрыть
                                            </button>
                                        ) : '—'}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <AddDowntimeModal open={showAddModal} onClose={() => setShowAddModal(false)} onCreated={loadData} />
        </div>
    );
}
