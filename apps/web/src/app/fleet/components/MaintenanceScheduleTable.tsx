'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, RefreshCw, Wrench } from 'lucide-react';
import { api } from '@/lib/api';
import { AddMaintenanceModal } from './AddMaintenanceModal';
import { formatDate, formatMoney } from './deepFleetShared';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

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
    const [completingRecord, setCompletingRecord] = useState<MaintenanceRecord | null>(null);
    const [completeDraft, setCompleteDraft] = useState<{ actualDate: string; actualOdometerKm: string; cost: string }>({ actualDate: '', actualOdometerKm: '', cost: '' });
    const [submitting, setSubmitting] = useState(false);
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

    function openComplete(record: MaintenanceRecord) {
        setCompletingRecord(record);
        setCompleteDraft({
            actualDate: '',
            actualOdometerKm: record.plannedOdometerKm != null ? String(record.plannedOdometerKm) : '',
            cost: '',
        });
    }

    function closeComplete() {
        if (submitting) return;
        setCompletingRecord(null);
        setCompleteDraft({ actualDate: '', actualOdometerKm: '', cost: '' });
    }

    async function submitComplete() {
        if (!completingRecord) return;
        setSubmitting(true);
        try {
            await api.put(`/fleet/maintenance-schedule/${completingRecord.id}`, {
                status: 'done',
                actualDate: completeDraft.actualDate ? new Date(`${completeDraft.actualDate}T00:00:00`).toISOString() : new Date().toISOString(),
                actualOdometerKm: completeDraft.actualOdometerKm ? Number(completeDraft.actualOdometerKm) : undefined,
                cost: completeDraft.cost ? Number(completeDraft.cost) : undefined,
            });
            setCompletingRecord(null);
            setCompleteDraft({ actualDate: '', actualOdometerKm: '', cost: '' });
            await loadData();
        } catch (err) {
            console.error('Failed to mark maintenance done', err);
        } finally {
            setSubmitting(false);
        }
    }

    const statusTone: Record<string, string> = {
        planned: 'bg-blue-100 text-blue-700',
        overdue: 'bg-red-100 text-red-700',
        done: 'bg-emerald-100 text-emerald-700',
        cancelled: 'bg-neutral-100 text-neutral-600',
    };

    return (
        <div className="space-y-4 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="grid gap-3 md:grid-cols-3">
                    <select value={filters.vehicleId} onChange={(e) => setFilters((prev) => ({ ...prev, vehicleId: e.target.value }))} className="rounded-lg border border-neutral-200 px-3 py-2 text-sm">
                        <option value="">Все ТС</option>
                        {vehicles.map((vehicle: any) => <option key={vehicle.id} value={vehicle.id}>{vehicle.plateNumber}</option>)}
                    </select>
                    <select value={filters.status} onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))} className="rounded-lg border border-neutral-200 px-3 py-2 text-sm">
                        <option value="">Все статусы</option>
                        <option value="planned">План</option>
                        <option value="overdue">Просрочено</option>
                        <option value="done">Выполнено</option>
                        <option value="cancelled">Отменено</option>
                    </select>
                    <select value={filters.maintenanceType} onChange={(e) => setFilters((prev) => ({ ...prev, maintenanceType: e.target.value }))} className="rounded-lg border border-neutral-200 px-3 py-2 text-sm">
                        <option value="">Все виды ТО</option>
                        <option value="to1">ТО-1</option>
                        <option value="to2">ТО-2</option>
                        <option value="to3">ТО-3</option>
                        <option value="seasonal">Сезонное</option>
                        <option value="other">Прочее</option>
                    </select>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => loadData()} className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-50">
                        <RefreshCw className="h-4 w-4" />
                        Обновить
                    </button>
                    <button onClick={() => setShowAddModal(true)} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
                        <Wrench className="h-4 w-4" />
                        Запланировать ТО
                    </button>
                </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-neutral-200">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-neutral-50 text-left text-neutral-500">
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
                    <tbody className="divide-y divide-neutral-100">
                        {loading ? (
                            <tr><td colSpan={9} className="px-4 py-10 text-center text-neutral-400">Загружаем план ТО...</td></tr>
                        ) : rows.length === 0 ? (
                            <tr>
                                <td colSpan={9} className="p-4">
                                    <EmptyState
                                        icon={Wrench}
                                        title={filters.vehicleId || filters.status || filters.maintenanceType ? 'По фильтрам ничего не найдено' : 'План ТО пуст'}
                                        description={filters.vehicleId || filters.status || filters.maintenanceType ? 'Попробуйте сбросить фильтры.' : 'Запланируйте первое ТО, чтобы не пропустить регламентные работы.'}
                                        tone="brand"
                                        action={!filters.vehicleId && !filters.status && !filters.maintenanceType ? (
                                            <Button variant="brand" leftIcon={<Wrench className="w-4 h-4" />} onClick={() => setShowAddModal(true)}>
                                                Запланировать ТО
                                            </Button>
                                        ) : undefined}
                                    />
                                </td>
                            </tr>
                        ) : rows.map((record) => {
                            const visualStatus = record.computedStatus || record.status;
                            return (
                                <tr key={record.id}>
                                    <td className="px-4 py-3 font-medium text-neutral-800">{record.vehicle?.plateNumber || record.vehicleId}</td>
                                    <td className="px-4 py-3 text-neutral-600">{record.maintenanceType}</td>
                                    <td className="px-4 py-3 text-neutral-600">{formatDate(record.plannedDate)}</td>
                                    <td className="px-4 py-3 text-neutral-600">{record.plannedOdometerKm ? `${Number(record.plannedOdometerKm).toLocaleString('ru-RU')} км` : '—'}</td>
                                    <td className="px-4 py-3">
                                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusTone[visualStatus] || 'bg-neutral-100 text-neutral-700'}`}>{visualStatus}</span>
                                    </td>
                                    <td className="px-4 py-3 text-neutral-600">{record.actualDate ? formatDate(record.actualDate) : '—'}</td>
                                    <td className="px-4 py-3 text-neutral-600">{record.cost ? formatMoney(record.cost) : '—'}</td>
                                    <td className="px-4 py-3 text-neutral-600">{record.contractor || '—'}</td>
                                    <td className="px-4 py-3">
                                        {(visualStatus === 'planned' || visualStatus === 'overdue') ? (
                                            <button
                                                onClick={() => openComplete(record)}
                                                className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
                                            >
                                                <CheckCircle2 className="h-3.5 w-3.5" />
                                                Отметить ТО выполненным
                                            </button>
                                        ) : '—'}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <AddMaintenanceModal open={showAddModal} onClose={() => setShowAddModal(false)} onCreated={loadData} />

            <Dialog
                open={!!completingRecord}
                onClose={closeComplete}
                title="Отметить ТО выполненным"
                description={completingRecord ? `${completingRecord.vehicle?.plateNumber || completingRecord.vehicleId} · ${completingRecord.maintenanceType}` : undefined}
            >
                {completingRecord && (
                    <div className="space-y-4">
                        <div className="space-y-3">
                            <div>
                                <label className="mb-1 block text-xs font-medium text-neutral-600">Дата ТО</label>
                                <Input
                                    type="date"
                                    value={completeDraft.actualDate}
                                    onChange={(e) => setCompleteDraft((prev) => ({ ...prev, actualDate: e.target.value }))}
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-medium text-neutral-600">Пробег, км</label>
                                <Input
                                    type="number"
                                    min="0"
                                    placeholder="Например, 125000"
                                    value={completeDraft.actualOdometerKm}
                                    onChange={(e) => setCompleteDraft((prev) => ({ ...prev, actualOdometerKm: e.target.value }))}
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-medium text-neutral-600">Стоимость, ₽</label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    placeholder="Например, 12500"
                                    value={completeDraft.cost}
                                    onChange={(e) => setCompleteDraft((prev) => ({ ...prev, cost: e.target.value }))}
                                />
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 pt-2">
                            <Button variant="outline" onClick={closeComplete} disabled={submitting}>
                                Отмена
                            </Button>
                            <Button onClick={submitComplete} isLoading={submitting}>
                                Сохранить
                            </Button>
                        </div>
                    </div>
                )}
            </Dialog>
        </div>
    );
}
