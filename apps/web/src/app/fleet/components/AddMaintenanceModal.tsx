'use client';

import { useEffect, useState } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { toLocalDateInputValue } from './deepFleetShared';

interface AddMaintenanceModalProps {
    open: boolean;
    onClose: () => void;
    onCreated: () => void;
}

export function AddMaintenanceModal({ open, onClose, onCreated }: AddMaintenanceModalProps) {
    const [vehicles, setVehicles] = useState<Array<{ id: string; label: string }>>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [form, setForm] = useState({
        vehicleId: '',
        maintenanceType: 'to1',
        plannedDate: toLocalDateInputValue(),
        plannedOdometerKm: '',
        contractor: '',
        notes: '',
    });

    useEffect(() => {
        if (!open) return;
        api.get<any>('/fleet/vehicles?limit=200')
            .then((res) => setVehicles((res.data || []).map((vehicle: any) => ({ id: vehicle.id, label: `${vehicle.plateNumber} · ${vehicle.make} ${vehicle.model}` }))))
            .catch((err) => console.error('Failed to load maintenance modal options', err));
    }, [open]);

    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault();
        if (!form.vehicleId) {
            setError('Выберите транспорт.');
            return;
        }
        setLoading(true);
        setError('');
        try {
            await api.post('/fleet/maintenance-schedule', {
                vehicleId: form.vehicleId,
                maintenanceType: form.maintenanceType,
                plannedDate: form.plannedDate ? new Date(`${form.plannedDate}T00:00:00`).toISOString() : undefined,
                plannedOdometerKm: form.plannedOdometerKm ? Number(form.plannedOdometerKm) : undefined,
                contractor: form.contractor || undefined,
                notes: form.notes || undefined,
            });
            onCreated();
            onClose();
        } catch (err: any) {
            setError(err?.message || 'Не удалось запланировать ТО.');
        } finally {
            setLoading(false);
        }
    }

    return (
        <Dialog open={open} onClose={onClose} title="Запланировать ТО">
            <form onSubmit={handleSubmit} className="space-y-4">
                {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
                <div className="grid gap-4 md:grid-cols-2">
                    <label className="space-y-1 text-sm md:col-span-2">
                        <span className="text-neutral-600">Транспорт</span>
                        <select value={form.vehicleId} onChange={(e) => setForm((prev) => ({ ...prev, vehicleId: e.target.value }))} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm">
                            <option value="">Выберите ТС</option>
                            {vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.label}</option>)}
                        </select>
                    </label>
                    <label className="space-y-1 text-sm">
                        <span className="text-neutral-600">Вид ТО</span>
                        <select value={form.maintenanceType} onChange={(e) => setForm((prev) => ({ ...prev, maintenanceType: e.target.value }))} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm">
                            <option value="to1">ТО-1</option>
                            <option value="to2">ТО-2</option>
                            <option value="to3">ТО-3</option>
                            <option value="seasonal">Сезонное</option>
                            <option value="other">Прочее</option>
                        </select>
                    </label>
                    <label className="space-y-1 text-sm">
                        <span className="text-neutral-600">Плановая дата</span>
                        <input type="date" value={form.plannedDate} onChange={(e) => setForm((prev) => ({ ...prev, plannedDate: e.target.value }))} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm" />
                    </label>
                    <label className="space-y-1 text-sm">
                        <span className="text-neutral-600">Плановый пробег, км</span>
                        <input type="number" min="0" value={form.plannedOdometerKm} onChange={(e) => setForm((prev) => ({ ...prev, plannedOdometerKm: e.target.value }))} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm" />
                    </label>
                    <label className="space-y-1 text-sm">
                        <span className="text-neutral-600">Подрядчик</span>
                        <input value={form.contractor} onChange={(e) => setForm((prev) => ({ ...prev, contractor: e.target.value }))} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm" />
                    </label>
                    <label className="space-y-1 text-sm md:col-span-2">
                        <span className="text-neutral-600">Примечание</span>
                        <textarea value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} rows={4} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm" />
                    </label>
                </div>
                <div className="flex justify-end gap-3">
                    <button type="button" onClick={onClose} className="rounded-lg border border-neutral-200 px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-50">Отмена</button>
                    <button type="submit" disabled={loading} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
                        {loading ? 'Сохраняем...' : 'Запланировать'}
                    </button>
                </div>
            </form>
        </Dialog>
    );
}
