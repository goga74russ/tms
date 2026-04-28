'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { formatDateTime, toLocalDateTimeInputValue } from './deepFleetShared';

type OdometerRow = {
    id: string;
    vehicleId: string;
    recordedAt: string;
    valueKm: number;
    source: string;
    tripId?: string | null;
};

export function OdometerHistoryTable() {
    const [rows, setRows] = useState<OdometerRow[]>([]);
    const [vehicles, setVehicles] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [filters, setFilters] = useState({ vehicleId: '', source: '' });
    const [form, setForm] = useState({
        vehicleId: '',
        recordedAt: toLocalDateTimeInputValue(),
        valueKm: '',
        source: 'manual',
    });

    async function loadData() {
        setLoading(true);
        try {
            const query = new URLSearchParams();
            if (filters.vehicleId) query.set('vehicleId', filters.vehicleId);
            if (filters.source) query.set('source', filters.source);
            const [odometerRes, vehiclesRes] = await Promise.all([
                api.get<any>(`/fleet/odometer-readings?${query.toString()}`),
                api.get<any>('/fleet/vehicles?limit=200'),
            ]);
            setRows(odometerRes.data || []);
            setVehicles(vehiclesRes.data || []);
        } catch (err) {
            console.error('Failed to load odometer readings', err);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadData();
    }, [filters.vehicleId, filters.source]);

    const trends = useMemo(() => {
        const map = new Map<string, number>();
        for (let index = 0; index < rows.length; index += 1) {
            const current = rows[index];
            const next = rows[index + 1];
            if (next && next.vehicleId === current.vehicleId) {
                map.set(current.id, current.valueKm - next.valueKm);
            }
        }
        return map;
    }, [rows]);

    async function handleCreate(event: React.FormEvent) {
        event.preventDefault();
        if (!form.vehicleId || !form.valueKm) return;
        setSaving(true);
        try {
            await api.post('/fleet/odometer-readings', {
                vehicleId: form.vehicleId,
                recordedAt: new Date(form.recordedAt).toISOString(),
                valueKm: Number(form.valueKm),
                source: form.source,
            });
            setForm((prev) => ({ ...prev, valueKm: '' }));
            await loadData();
        } catch (err) {
            console.error('Failed to create odometer reading', err);
        } finally {
            setSaving(false);
        }
    }

    const sourceTone: Record<string, string> = {
        manual: 'bg-slate-100 text-slate-700',
        gps: 'bg-emerald-100 text-emerald-700',
        waybill: 'bg-indigo-100 text-indigo-700',
        inspection: 'bg-amber-100 text-amber-700',
    };

    return (
        <div className="space-y-4 p-4">
            <form onSubmit={handleCreate} className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-5">
                <select value={form.vehicleId} onChange={(e) => setForm((prev) => ({ ...prev, vehicleId: e.target.value }))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    <option value="">Выберите ТС</option>
                    {vehicles.map((vehicle: any) => <option key={vehicle.id} value={vehicle.id}>{vehicle.plateNumber}</option>)}
                </select>
                <input type="datetime-local" value={form.recordedAt} onChange={(e) => setForm((prev) => ({ ...prev, recordedAt: e.target.value }))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                <input type="number" min="0" value={form.valueKm} onChange={(e) => setForm((prev) => ({ ...prev, valueKm: e.target.value }))} placeholder="Показание, км" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                <select value={form.source} onChange={(e) => setForm((prev) => ({ ...prev, source: e.target.value }))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    <option value="manual">Вручную</option>
                    <option value="gps">GPS</option>
                    <option value="waybill">Путевой лист</option>
                    <option value="inspection">Осмотр</option>
                </select>
                <button type="submit" disabled={saving} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
                    {saving ? 'Сохраняем...' : 'Добавить'}
                </button>
            </form>

            <div className="flex gap-3">
                <select value={filters.vehicleId} onChange={(e) => setFilters((prev) => ({ ...prev, vehicleId: e.target.value }))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    <option value="">Все ТС</option>
                    {vehicles.map((vehicle: any) => <option key={vehicle.id} value={vehicle.id}>{vehicle.plateNumber}</option>)}
                </select>
                <select value={filters.source} onChange={(e) => setFilters((prev) => ({ ...prev, source: e.target.value }))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    <option value="">Все источники</option>
                    <option value="manual">Вручную</option>
                    <option value="gps">GPS</option>
                    <option value="waybill">Путевой лист</option>
                    <option value="inspection">Осмотр</option>
                </select>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-slate-50 text-left text-slate-500">
                            <th className="px-4 py-3 font-medium">Дата</th>
                            <th className="px-4 py-3 font-medium">ТС</th>
                            <th className="px-4 py-3 font-medium">Показание</th>
                            <th className="px-4 py-3 font-medium">Источник</th>
                            <th className="px-4 py-3 font-medium">Изменение</th>
                            <th className="px-4 py-3 font-medium">Рейс</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {loading ? (
                            <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">Загружаем показания...</td></tr>
                        ) : rows.length === 0 ? (
                            <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">История одометра пока пуста.</td></tr>
                        ) : rows.map((row) => {
                            const vehicle = vehicles.find((item) => item.id === row.vehicleId);
                            const delta = trends.get(row.id);
                            return (
                                <tr key={row.id}>
                                    <td className="px-4 py-3 text-slate-600">{formatDateTime(row.recordedAt)}</td>
                                    <td className="px-4 py-3 font-medium text-slate-800">{vehicle?.plateNumber || row.vehicleId}</td>
                                    <td className="px-4 py-3 text-slate-600">{Number(row.valueKm).toLocaleString('ru-RU')} км</td>
                                    <td className="px-4 py-3">
                                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${sourceTone[row.source] || 'bg-slate-100 text-slate-700'}`}>{row.source}</span>
                                    </td>
                                    <td className="px-4 py-3 text-slate-600">{delta !== undefined ? `+${delta.toLocaleString('ru-RU')} км` : '—'}</td>
                                    <td className="px-4 py-3 text-slate-600">{row.tripId || '—'}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
