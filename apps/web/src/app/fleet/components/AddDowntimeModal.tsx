'use client';

import { useEffect, useState } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { toLocalDateTimeInputValue } from './deepFleetShared';

interface AddDowntimeModalProps {
    open: boolean;
    onClose: () => void;
    onCreated: () => void;
}

export function AddDowntimeModal({ open, onClose, onCreated }: AddDowntimeModalProps) {
    const [vehicles, setVehicles] = useState<Array<{ id: string; label: string }>>([]);
    const [trips, setTrips] = useState<Array<{ id: string; label: string }>>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [form, setForm] = useState({
        vehicleId: '',
        startAt: toLocalDateTimeInputValue(),
        reasonCode: 'repair',
        description: '',
        tripId: '',
    });

    useEffect(() => {
        if (!open) return;
        (async () => {
            try {
                const [vehicleRes, tripRes] = await Promise.all([
                    api.get<any>('/fleet/vehicles?limit=200'),
                    api.get<any>('/trips?limit=200'),
                ]);
                setVehicles((vehicleRes.data || []).map((vehicle: any) => ({ id: vehicle.id, label: `${vehicle.plateNumber} · ${vehicle.make} ${vehicle.model}` })));
                setTrips((tripRes.data || []).map((trip: any) => ({ id: trip.id, label: trip.number || trip.id })));
            } catch (err) {
                console.error('Failed to load downtime modal options', err);
            }
        })();
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
            await api.post('/fleet/downtime-records', {
                vehicleId: form.vehicleId,
                startAt: new Date(form.startAt).toISOString(),
                reasonCode: form.reasonCode,
                description: form.description || undefined,
                tripId: form.tripId || undefined,
            });
            onCreated();
            onClose();
        } catch (err: any) {
            setError(err?.message || 'Не удалось открыть простой.');
        } finally {
            setLoading(false);
        }
    }

    return (
        <Dialog open={open} onClose={onClose} title="Открыть простой">
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
                        <span className="text-neutral-600">Начало</span>
                        <input type="datetime-local" value={form.startAt} onChange={(e) => setForm((prev) => ({ ...prev, startAt: e.target.value }))} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm" />
                    </label>
                    <label className="space-y-1 text-sm">
                        <span className="text-neutral-600">Причина</span>
                        <select value={form.reasonCode} onChange={(e) => setForm((prev) => ({ ...prev, reasonCode: e.target.value }))} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm">
                            <option value="repair">Ремонт</option>
                            <option value="waiting_load">Ожидание загрузки</option>
                            <option value="waiting_docs">Ожидание документов</option>
                            <option value="driver_absence">Нет водителя</option>
                            <option value="weather">Погода</option>
                            <option value="other">Прочее</option>
                        </select>
                    </label>
                    <label className="space-y-1 text-sm md:col-span-2">
                        <span className="text-neutral-600">Рейс</span>
                        <select value={form.tripId} onChange={(e) => setForm((prev) => ({ ...prev, tripId: e.target.value }))} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm">
                            <option value="">Не выбран</option>
                            {trips.map((trip) => <option key={trip.id} value={trip.id}>{trip.label}</option>)}
                        </select>
                    </label>
                    <label className="space-y-1 text-sm md:col-span-2">
                        <span className="text-neutral-600">Описание</span>
                        <textarea value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} rows={4} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm" />
                    </label>
                </div>
                <div className="flex justify-end gap-3">
                    <button type="button" onClick={onClose} className="rounded-lg border border-neutral-200 px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-50">Отмена</button>
                    <button type="submit" disabled={loading} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60">
                        {loading ? 'Сохраняем...' : 'Открыть простой'}
                    </button>
                </div>
            </form>
        </Dialog>
    );
}
