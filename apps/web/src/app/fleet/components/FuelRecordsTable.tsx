'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { AddFuelRecordModal } from './AddFuelRecordModal';
import { formatDateTime, formatMoney, getRowRecord } from './deepFleetShared';

type FuelRow = {
    id: string;
    vehicleId: string;
    driverId?: string | null;
    tripId?: string | null;
    recordedAt: string;
    liters: number | string;
    totalCost: number | string;
    fuelType: string;
    station?: string | null;
    odometerAtFill?: number | null;
};

export function FuelRecordsTable() {
    const [rows, setRows] = useState<any[]>([]);
    const [vehicles, setVehicles] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [filters, setFilters] = useState({
        vehicleId: '',
        dateFrom: '',
        dateTo: '',
        fuelType: '',
    });

    async function loadData() {
        setLoading(true);
        try {
            const query = new URLSearchParams();
            if (filters.vehicleId) query.set('vehicleId', filters.vehicleId);
            if (filters.dateFrom) query.set('dateFrom', new Date(`${filters.dateFrom}T00:00:00`).toISOString());
            if (filters.dateTo) query.set('dateTo', new Date(`${filters.dateTo}T23:59:59`).toISOString());
            const [fuelRes, vehiclesRes] = await Promise.all([
                api.get<any>(`/fleet/fuel-records?${query.toString()}`),
                api.get<any>('/fleet/vehicles?limit=200'),
            ]);
            let data = fuelRes.data || [];
            if (filters.fuelType) {
                data = data.filter((row: any) => getRowRecord<FuelRow>(row, 'fuel_records').fuelType === filters.fuelType);
            }
            setRows(data);
            setVehicles(vehiclesRes.data || []);
        } catch (err) {
            console.error('Failed to load fuel records', err);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadData();
    }, [filters.vehicleId, filters.dateFrom, filters.dateTo, filters.fuelType]);

    const summary = useMemo(() => rows.reduce((acc, row) => {
        const record = getRowRecord<FuelRow>(row, 'fuel_records');
        acc.liters += Number(record.liters || 0);
        acc.totalCost += Number(record.totalCost || 0);
        return acc;
    }, { liters: 0, totalCost: 0 }), [rows]);

    return (
        <div className="space-y-4 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="grid gap-3 md:grid-cols-4">
                    <select value={filters.vehicleId} onChange={(e) => setFilters((prev) => ({ ...prev, vehicleId: e.target.value }))} className="rounded-lg border border-neutral-200 px-3 py-2 text-sm">
                        <option value="">Все ТС</option>
                        {vehicles.map((vehicle: any) => <option key={vehicle.id} value={vehicle.id}>{vehicle.plateNumber}</option>)}
                    </select>
                    <input type="date" value={filters.dateFrom} onChange={(e) => setFilters((prev) => ({ ...prev, dateFrom: e.target.value }))} className="rounded-lg border border-neutral-200 px-3 py-2 text-sm" />
                    <input type="date" value={filters.dateTo} onChange={(e) => setFilters((prev) => ({ ...prev, dateTo: e.target.value }))} className="rounded-lg border border-neutral-200 px-3 py-2 text-sm" />
                    <select value={filters.fuelType} onChange={(e) => setFilters((prev) => ({ ...prev, fuelType: e.target.value }))} className="rounded-lg border border-neutral-200 px-3 py-2 text-sm">
                        <option value="">Все типы топлива</option>
                        <option value="diesel">Дизель</option>
                        <option value="petrol">Бензин</option>
                        <option value="gas">Газ</option>
                        <option value="adblue">AdBlue</option>
                    </select>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => loadData()} className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-50">
                        <RefreshCw className="h-4 w-4" />
                        Обновить
                    </button>
                    <button onClick={() => setShowAddModal(true)} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
                        <Plus className="h-4 w-4" />
                        Добавить заправку
                    </button>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3">
                    <p className="text-xs uppercase tracking-wide text-neutral-500">Итог за период</p>
                    <p className="mt-1 text-2xl font-bold text-neutral-900">{summary.liters.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} л</p>
                </div>
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3">
                    <p className="text-xs uppercase tracking-wide text-neutral-500">Стоимость</p>
                    <p className="mt-1 text-2xl font-bold text-neutral-900">{formatMoney(summary.totalCost)}</p>
                </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-neutral-200">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-neutral-50 text-left text-neutral-500">
                            <th className="px-4 py-3 font-medium">Дата</th>
                            <th className="px-4 py-3 font-medium">ТС</th>
                            <th className="px-4 py-3 font-medium">Водитель</th>
                            <th className="px-4 py-3 font-medium">Литры</th>
                            <th className="px-4 py-3 font-medium">Тип</th>
                            <th className="px-4 py-3 font-medium">Стоимость</th>
                            <th className="px-4 py-3 font-medium">АЗС</th>
                            <th className="px-4 py-3 font-medium">Одометр</th>
                            <th className="px-4 py-3 font-medium">Рейс</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                        {loading ? (
                            <tr><td colSpan={9} className="px-4 py-10 text-center text-neutral-400">Загружаем записи...</td></tr>
                        ) : rows.length === 0 ? (
                            <tr><td colSpan={9} className="px-4 py-10 text-center text-neutral-400">Заправки пока не зарегистрированы.</td></tr>
                        ) : rows.map((row: any) => {
                            const record = getRowRecord<FuelRow>(row, 'fuel_records');
                            const vehicle = row.vehicles;
                            const driver = row.drivers;
                            return (
                                <tr key={record.id}>
                                    <td className="px-4 py-3 text-neutral-600">{formatDateTime(record.recordedAt)}</td>
                                    <td className="px-4 py-3 font-medium text-neutral-800">{vehicle?.plateNumber || record.vehicleId}</td>
                                    <td className="px-4 py-3 text-neutral-600">{driver?.fullName || driver?.name || '—'}</td>
                                    <td className="px-4 py-3 text-neutral-600">{Number(record.liters).toLocaleString('ru-RU', { maximumFractionDigits: 2 })}</td>
                                    <td className="px-4 py-3 text-neutral-600">{record.fuelType}</td>
                                    <td className="px-4 py-3 text-neutral-600">{formatMoney(record.totalCost)}</td>
                                    <td className="px-4 py-3 text-neutral-600">{record.station || '—'}</td>
                                    <td className="px-4 py-3 text-neutral-600">{record.odometerAtFill ? `${Number(record.odometerAtFill).toLocaleString('ru-RU')} км` : '—'}</td>
                                    <td className="px-4 py-3 text-neutral-600">{record.tripId || '—'}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <AddFuelRecordModal open={showAddModal} onClose={() => setShowAddModal(false)} onCreated={loadData} />
        </div>
    );
}
