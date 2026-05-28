'use client';

import { useEffect, useState } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { api } from '@/lib/api';

interface AddFineModalProps {
    open: boolean;
    onClose: () => void;
    onCreated: () => void;
}

interface OptionItem { id: string; label: string }

export function AddFineModal({ open, onClose, onCreated }: AddFineModalProps) {
    const [vehicles, setVehicles] = useState<OptionItem[]>([]);
    const [drivers, setDrivers] = useState<OptionItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [form, setForm] = useState({
        vehicleId: '', driverId: '',
        violationDate: new Date().toISOString().slice(0, 10),
        violationType: '', amount: '', resolutionNumber: '',
    });

    useEffect(() => {
        if (!open) return;
        setError('');
        (async () => {
            try {
                const [vRes, dRes] = await Promise.all([
                    api.get<any>('/fleet/vehicles?limit=200'),
                    api.get<any>('/fleet/drivers?limit=200'),
                ]);
                setVehicles((vRes.data || []).map((v: any) => ({ id: v.id, label: `${v.plateNumber} · ${v.make} ${v.model}` })));
                setDrivers((dRes.data || []).map((d: any) => ({ id: d.id, label: d.fullName || d.name || d.id })));
            } catch (err) {
                console.error('Failed to load fine modal options', err);
            }
        })();
    }, [open]);

    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault();
        if (!form.vehicleId) { setError('Выберите транспорт.'); return; }
        if (!form.violationType.trim() || !(Number(form.amount) > 0)) {
            setError('Укажите тип нарушения и сумму штрафа (> 0).'); return;
        }
        setLoading(true); setError('');
        try {
            await api.post('/fleet/fines', {
                vehicleId: form.vehicleId,
                driverId: form.driverId || undefined,
                violationDate: new Date(form.violationDate).toISOString(),
                violationType: form.violationType,
                amount: Number(form.amount),
                resolutionNumber: form.resolutionNumber || undefined,
                status: 'new',
            });
            onCreated();
            onClose();
        } catch (err: any) {
            setError(err?.message || 'Не удалось сохранить штраф.');
        } finally {
            setLoading(false);
        }
    }

    return (
        <Dialog open={open} onClose={onClose} title="Добавить штраф">
            <form onSubmit={handleSubmit} className="space-y-4">
                {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
                <div className="grid gap-4 md:grid-cols-2">
                    <label className="space-y-1 text-sm">
                        <span className="text-neutral-600">Транспорт</span>
                        <select value={form.vehicleId} onChange={(e) => setForm((p) => ({ ...p, vehicleId: e.target.value }))} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm">
                            <option value="">Выберите ТС</option>
                            {vehicles.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                        </select>
                    </label>
                    <label className="space-y-1 text-sm">
                        <span className="text-neutral-600">Водитель</span>
                        <select value={form.driverId} onChange={(e) => setForm((p) => ({ ...p, driverId: e.target.value }))} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm">
                            <option value="">Не выбран</option>
                            {drivers.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                        </select>
                    </label>
                    <label className="space-y-1 text-sm">
                        <span className="text-neutral-600">Дата нарушения</span>
                        <input type="date" value={form.violationDate} onChange={(e) => setForm((p) => ({ ...p, violationDate: e.target.value }))} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm" />
                    </label>
                    <label className="space-y-1 text-sm">
                        <span className="text-neutral-600">Сумма, ₽</span>
                        <input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm" />
                    </label>
                    <label className="space-y-1 text-sm md:col-span-2">
                        <span className="text-neutral-600">Тип нарушения</span>
                        <input value={form.violationType} onChange={(e) => setForm((p) => ({ ...p, violationType: e.target.value }))} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm" placeholder="Напр. Превышение скорости (ст. 12.9 КоАП)" />
                    </label>
                    <label className="space-y-1 text-sm md:col-span-2">
                        <span className="text-neutral-600">Номер постановления</span>
                        <input value={form.resolutionNumber} onChange={(e) => setForm((p) => ({ ...p, resolutionNumber: e.target.value }))} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm" placeholder="УИН / номер постановления" />
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
