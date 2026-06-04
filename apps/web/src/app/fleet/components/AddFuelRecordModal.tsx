'use client';

import { useEffect, useMemo, useState } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { formatMoney, toLocalDateTimeInputValue } from './deepFleetShared';

interface AddFuelRecordModalProps {
    open: boolean;
    onClose: () => void;
    onCreated: () => void;
}

interface OptionItem {
    id: string;
    label: string;
}

function createInitialForm() {
    return {
        vehicleId: '',
        driverId: '',
        tripId: '',
        recordedAt: toLocalDateTimeInputValue(),
        liters: '',
        costPerLiter: '',
        fuelType: 'diesel',
        station: '',
        odometerAtFill: '',
    };
}

export function AddFuelRecordModal({ open, onClose, onCreated }: AddFuelRecordModalProps) {
    const [vehicles, setVehicles] = useState<OptionItem[]>([]);
    const [drivers, setDrivers] = useState<OptionItem[]>([]);
    const [trips, setTrips] = useState<OptionItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [form, setForm] = useState(createInitialForm);

    useEffect(() => {
        if (!open) return;
        setForm(createInitialForm());
        setError('');
        (async () => {
            try {
                const [vehicleRes, driverRes, tripRes] = await Promise.all([
                    api.get<any>('/fleet/vehicles?limit=200'),
                    api.get<any>('/fleet/drivers?limit=200'),
                    api.get<any>('/trips?limit=200'),
                ]);
                setVehicles((vehicleRes.data || []).map((vehicle: any) => ({ id: vehicle.id, label: `${vehicle.plateNumber} · ${vehicle.make} ${vehicle.model}` })));
                setDrivers((driverRes.data || []).map((driver: any) => ({ id: driver.id, label: driver.fullName || driver.name || driver.id })));
                setTrips((tripRes.data || []).map((trip: any) => ({ id: trip.id, label: trip.number || trip.id })));
            } catch (err) {
                console.error('Failed to load fuel modal options', err);
            }
        })();
    }, [open]);

    const totalCost = useMemo(() => Number(form.liters || 0) * Number(form.costPerLiter || 0), [form.liters, form.costPerLiter]);

    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault();
        if (!form.vehicleId) {
            setError('Выберите транспорт.');
            return;
        }
        const liters = Number(form.liters);
        const costPerLiter = Number(form.costPerLiter);
        if (!Number.isFinite(liters) || liters <= 0) {
            setError('Укажите количество литров больше нуля.');
            return;
        }
        if (!Number.isFinite(costPerLiter) || costPerLiter <= 0) {
            setError('Укажите цену за литр больше нуля.');
            return;
        }
        setLoading(true);
        setError('');
        try {
            await api.post('/fleet/fuel-records', {
                vehicleId: form.vehicleId,
                driverId: form.driverId || undefined,
                tripId: form.tripId || undefined,
                recordedAt: new Date(form.recordedAt).toISOString(),
                liters,
                costPerLiter,
                totalCost: liters * costPerLiter,
                fuelType: form.fuelType,
                station: form.station || undefined,
                odometerAtFill: form.odometerAtFill ? Number(form.odometerAtFill) : undefined,
            });
            onCreated();
            onClose();
        } catch (err: any) {
            setError(err?.message || 'Не удалось сохранить заправку.');
        } finally {
            setLoading(false);
        }
    }

    return (
        <Dialog open={open} onClose={onClose} title="Добавить заправку">
            <form onSubmit={handleSubmit} className="space-y-4">
                {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
                <div className="grid gap-4 md:grid-cols-2">
                    <label className="space-y-1 text-sm">
                        <span className="text-neutral-600">Транспорт</span>
                        <select value={form.vehicleId} onChange={(e) => setForm((prev) => ({ ...prev, vehicleId: e.target.value }))} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm">
                            <option value="">Выберите ТС</option>
                            {vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.label}</option>)}
                        </select>
                    </label>
                    <label className="space-y-1 text-sm">
                        <span className="text-neutral-600">Водитель</span>
                        <select value={form.driverId} onChange={(e) => setForm((prev) => ({ ...prev, driverId: e.target.value }))} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm">
                            <option value="">Не выбран</option>
                            {drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.label}</option>)}
                        </select>
                    </label>
                    <label className="space-y-1 text-sm">
                        <span className="text-neutral-600">Дата и время</span>
                        <input type="datetime-local" value={form.recordedAt} onChange={(e) => setForm((prev) => ({ ...prev, recordedAt: e.target.value }))} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm" />
                    </label>
                    <label className="space-y-1 text-sm">
                        <span className="text-neutral-600">Тип топлива</span>
                        <select value={form.fuelType} onChange={(e) => setForm((prev) => ({ ...prev, fuelType: e.target.value }))} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm">
                            <option value="diesel">Дизель</option>
                            <option value="petrol">Бензин</option>
                            <option value="gas">Газ</option>
                            <option value="adblue">AdBlue</option>
                        </select>
                    </label>
                    <label className="space-y-1 text-sm">
                        <span className="text-neutral-600">Литры</span>
                        <input type="number" step="0.01" min="0" value={form.liters} onChange={(e) => setForm((prev) => ({ ...prev, liters: e.target.value }))} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm" />
                    </label>
                    <label className="space-y-1 text-sm">
                        <span className="text-neutral-600">Цена за литр</span>
                        <input type="number" step="0.01" min="0" value={form.costPerLiter} onChange={(e) => setForm((prev) => ({ ...prev, costPerLiter: e.target.value }))} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm" />
                    </label>
                    <label className="space-y-1 text-sm">
                        <span className="text-neutral-600">Итоговая стоимость</span>
                        <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm font-medium text-neutral-700">{formatMoney(totalCost)}</div>
                    </label>
                    <label className="space-y-1 text-sm">
                        <span className="text-neutral-600">Одометр при заправке</span>
                        <input type="number" min="0" value={form.odometerAtFill} onChange={(e) => setForm((prev) => ({ ...prev, odometerAtFill: e.target.value }))} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm" />
                    </label>
                    <label className="space-y-1 text-sm md:col-span-2">
                        <span className="text-neutral-600">Рейс</span>
                        <select value={form.tripId} onChange={(e) => setForm((prev) => ({ ...prev, tripId: e.target.value }))} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm">
                            <option value="">Не выбран</option>
                            {trips.map((trip) => <option key={trip.id} value={trip.id}>{trip.label}</option>)}
                        </select>
                    </label>
                    <label className="space-y-1 text-sm md:col-span-2">
                        <span className="text-neutral-600">АЗС</span>
                        <input value={form.station} onChange={(e) => setForm((prev) => ({ ...prev, station: e.target.value }))} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm" placeholder="Название АЗС" />
                    </label>
                </div>
                <div className="flex justify-end gap-3">
                    <button type="button" onClick={onClose} className="rounded-lg border border-neutral-200 px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-50">Отмена</button>
                    <button type="submit" disabled={loading} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
                        {loading ? 'Сохраняем...' : 'Сохранить'}
                    </button>
                </div>
            </form>
        </Dialog>
    );
}
