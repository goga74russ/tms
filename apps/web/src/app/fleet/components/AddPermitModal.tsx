'use client';

import { useEffect, useState } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { api } from '@/lib/api';

interface AddPermitModalProps {
    open: boolean;
    onClose: () => void;
    onCreated: () => void;
}

interface OptionItem { id: string; label: string }

const ZONE_OPTIONS = [
    { value: 'mkad', label: 'МКАД' },
    { value: 'ttk', label: 'ТТК' },
    { value: 'city', label: 'Город' },
];

export function AddPermitModal({ open, onClose, onCreated }: AddPermitModalProps) {
    const [vehicles, setVehicles] = useState<OptionItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [form, setForm] = useState({
        vehicleId: '', zoneType: 'mkad', zoneName: '', permitNumber: '',
        validFrom: new Date().toISOString().slice(0, 10),
        validUntil: '',
    });

    useEffect(() => {
        if (!open) return;
        setError('');
        (async () => {
            try {
                const res = await api.get<any>('/fleet/vehicles?limit=200');
                setVehicles((res.data || []).map((v: any) => ({ id: v.id, label: `${v.plateNumber} · ${v.make} ${v.model}` })));
            } catch (err) {
                console.error('Failed to load permit modal options', err);
            }
        })();
    }, [open]);

    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault();
        if (!form.vehicleId) { setError('Выберите транспорт.'); return; }
        if (!form.zoneName.trim() || !form.permitNumber.trim() || !form.validUntil) {
            setError('Заполните зону, номер пропуска и срок действия.'); return;
        }
        setLoading(true); setError('');
        try {
            await api.post('/fleet/permits', {
                vehicleId: form.vehicleId,
                zoneType: form.zoneType,
                zoneName: form.zoneName,
                permitNumber: form.permitNumber,
                validFrom: new Date(form.validFrom + 'T00:00:00').toISOString(),
                validUntil: new Date(form.validUntil + 'T00:00:00').toISOString(),
                isActive: true,
            });
            onCreated();
            onClose();
        } catch (err: any) {
            setError(err?.message || 'Не удалось сохранить пропуск.');
        } finally {
            setLoading(false);
        }
    }

    return (
        <Dialog open={open} onClose={onClose} title="Добавить пропуск">
            <form onSubmit={handleSubmit} className="space-y-4">
                {error ? <div className="rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700">{error}</div> : null}
                <div className="grid gap-4 md:grid-cols-2">
                    <label className="space-y-1 text-sm md:col-span-2">
                        <span className="text-neutral-600">Транспорт</span>
                        <select value={form.vehicleId} onChange={(e) => setForm((p) => ({ ...p, vehicleId: e.target.value }))} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm">
                            <option value="">Выберите ТС</option>
                            {vehicles.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                        </select>
                    </label>
                    <label className="space-y-1 text-sm">
                        <span className="text-neutral-600">Зона</span>
                        <select value={form.zoneType} onChange={(e) => setForm((p) => ({ ...p, zoneType: e.target.value }))} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm">
                            {ZONE_OPTIONS.map((z) => <option key={z.value} value={z.value}>{z.label}</option>)}
                        </select>
                    </label>
                    <label className="space-y-1 text-sm">
                        <span className="text-neutral-600">Наименование зоны</span>
                        <input value={form.zoneName} onChange={(e) => setForm((p) => ({ ...p, zoneName: e.target.value }))} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm" placeholder="Напр. Центр Москвы" />
                    </label>
                    <label className="space-y-1 text-sm">
                        <span className="text-neutral-600">Номер пропуска</span>
                        <input value={form.permitNumber} onChange={(e) => setForm((p) => ({ ...p, permitNumber: e.target.value }))} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm" />
                    </label>
                    <label className="space-y-1 text-sm">
                        <span className="text-neutral-600">Действует с</span>
                        <input type="date" value={form.validFrom} onChange={(e) => setForm((p) => ({ ...p, validFrom: e.target.value }))} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm" />
                    </label>
                    <label className="space-y-1 text-sm">
                        <span className="text-neutral-600">Действует до</span>
                        <input type="date" value={form.validUntil} onChange={(e) => setForm((p) => ({ ...p, validUntil: e.target.value }))} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm" />
                    </label>
                </div>
                <div className="flex justify-end gap-3">
                    <button type="button" onClick={onClose} className="rounded-lg border border-neutral-200 px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-50">Отмена</button>
                    <button type="submit" disabled={loading} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60">
                        {loading ? 'Сохраняем...' : 'Сохранить'}
                    </button>
                </div>
            </form>
        </Dialog>
    );
}
