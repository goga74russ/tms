"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { api } from "@/lib/api";

interface AddTariffModalProps {
    open: boolean;
    onClose: () => void;
    onCreated: () => void;
}

interface ContractOption { id: string; number: string; contractorName: string | null }

const TYPES = [
    { value: 'per_km', label: 'За километр' },
    { value: 'per_ton', label: 'За тонну' },
    { value: 'per_hour', label: 'За час' },
    { value: 'fixed_route', label: 'Фиксированный (маршрут)' },
    { value: 'combined', label: 'Комбинированный' },
];

export function AddTariffModal({ open, onClose, onCreated }: AddTariffModalProps) {
    const [contracts, setContracts] = useState<ContractOption[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [form, setForm] = useState({
        contractId: '', type: 'per_km',
        ratePerKm: '', ratePerTon: '', ratePerHour: '', fixedRate: '',
        combinedFixedRate: '', combinedKmThreshold: '', combinedRatePerKm: '',
        vatIncluded: true, vatRate: '20',
    });

    useEffect(() => {
        if (!open) return;
        setError('');
        (async () => {
            try {
                const res = await api.get<{ success: boolean; data: ContractOption[] }>('/auth/contracts');
                setContracts(res.data || []);
            } catch (err) {
                console.error('Failed to load contracts', err);
            }
        })();
    }, [open]);

    const num = (v: string) => (v.trim() === '' ? undefined : Number(v));

    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault();
        if (!form.contractId) { setError('Выберите договор.'); return; }
        // Проверка: для выбранного типа указана соответствующая ставка.
        const rateOk = (
            (form.type === 'per_km' && num(form.ratePerKm)! > 0) ||
            (form.type === 'per_ton' && num(form.ratePerTon)! > 0) ||
            (form.type === 'per_hour' && num(form.ratePerHour)! > 0) ||
            (form.type === 'fixed_route' && num(form.fixedRate)! > 0) ||
            (form.type === 'combined' && num(form.combinedFixedRate) != null && num(form.combinedRatePerKm) != null)
        );
        if (!rateOk) { setError('Укажите ставку для выбранного типа тарифа.'); return; }

        setLoading(true); setError('');
        try {
            await api.post('/auth/tariffs', {
                contractId: form.contractId,
                type: form.type,
                ratePerKm: form.type === 'per_km' ? num(form.ratePerKm) : undefined,
                ratePerTon: form.type === 'per_ton' ? num(form.ratePerTon) : undefined,
                ratePerHour: form.type === 'per_hour' ? num(form.ratePerHour) : undefined,
                fixedRate: form.type === 'fixed_route' ? num(form.fixedRate) : undefined,
                combinedFixedRate: form.type === 'combined' ? num(form.combinedFixedRate) : undefined,
                combinedKmThreshold: form.type === 'combined' ? num(form.combinedKmThreshold) : undefined,
                combinedRatePerKm: form.type === 'combined' ? num(form.combinedRatePerKm) : undefined,
                vatIncluded: form.vatIncluded,
                vatRate: num(form.vatRate),
            });
            onCreated();
            onClose();
        } catch (err: any) {
            setError(err?.message || 'Не удалось создать тариф.');
        } finally {
            setLoading(false);
        }
    }

    const inputCls = "w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm";

    return (
        <Dialog open={open} onClose={onClose} title="Новый тариф">
            <form onSubmit={handleSubmit} className="space-y-4">
                {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
                <label className="space-y-1 text-sm block">
                    <span className="text-neutral-600">Договор</span>
                    <select value={form.contractId} onChange={(e) => setForm((p) => ({ ...p, contractId: e.target.value }))} className={inputCls}>
                        <option value="">Выберите договор</option>
                        {contracts.map((c) => <option key={c.id} value={c.id}>{c.number} · {c.contractorName ?? '—'}</option>)}
                    </select>
                </label>
                <label className="space-y-1 text-sm block">
                    <span className="text-neutral-600">Тип тарифа</span>
                    <select value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))} className={inputCls}>
                        {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                </label>

                {form.type === 'per_km' && (
                    <label className="space-y-1 text-sm block"><span className="text-neutral-600">Ставка, ₽/км</span>
                        <input type="number" step="0.01" min="0" value={form.ratePerKm} onChange={(e) => setForm((p) => ({ ...p, ratePerKm: e.target.value }))} className={inputCls} /></label>
                )}
                {form.type === 'per_ton' && (
                    <label className="space-y-1 text-sm block"><span className="text-neutral-600">Ставка, ₽/т</span>
                        <input type="number" step="0.01" min="0" value={form.ratePerTon} onChange={(e) => setForm((p) => ({ ...p, ratePerTon: e.target.value }))} className={inputCls} /></label>
                )}
                {form.type === 'per_hour' && (
                    <label className="space-y-1 text-sm block"><span className="text-neutral-600">Ставка, ₽/ч</span>
                        <input type="number" step="0.01" min="0" value={form.ratePerHour} onChange={(e) => setForm((p) => ({ ...p, ratePerHour: e.target.value }))} className={inputCls} /></label>
                )}
                {form.type === 'fixed_route' && (
                    <label className="space-y-1 text-sm block"><span className="text-neutral-600">Фиксированная ставка, ₽</span>
                        <input type="number" step="0.01" min="0" value={form.fixedRate} onChange={(e) => setForm((p) => ({ ...p, fixedRate: e.target.value }))} className={inputCls} /></label>
                )}
                {form.type === 'combined' && (
                    <div className="grid grid-cols-3 gap-2">
                        <label className="space-y-1 text-sm"><span className="text-neutral-600">Фикс, ₽</span>
                            <input type="number" step="0.01" min="0" value={form.combinedFixedRate} onChange={(e) => setForm((p) => ({ ...p, combinedFixedRate: e.target.value }))} className={inputCls} /></label>
                        <label className="space-y-1 text-sm"><span className="text-neutral-600">Порог, км</span>
                            <input type="number" step="1" min="0" value={form.combinedKmThreshold} onChange={(e) => setForm((p) => ({ ...p, combinedKmThreshold: e.target.value }))} className={inputCls} /></label>
                        <label className="space-y-1 text-sm"><span className="text-neutral-600">Сверх, ₽/км</span>
                            <input type="number" step="0.01" min="0" value={form.combinedRatePerKm} onChange={(e) => setForm((p) => ({ ...p, combinedRatePerKm: e.target.value }))} className={inputCls} /></label>
                    </div>
                )}

                <div className="grid grid-cols-2 gap-3 items-end">
                    <label className="space-y-1 text-sm"><span className="text-neutral-600">Ставка НДС, %</span>
                        <input type="number" step="1" min="0" value={form.vatRate} onChange={(e) => setForm((p) => ({ ...p, vatRate: e.target.value }))} className={inputCls} /></label>
                    <label className="flex items-center gap-2 text-sm text-neutral-600 pb-2">
                        <input type="checkbox" checked={form.vatIncluded} onChange={(e) => setForm((p) => ({ ...p, vatIncluded: e.target.checked }))} /> НДС в ставке
                    </label>
                </div>

                <div className="flex justify-end gap-3">
                    <button type="button" onClick={onClose} className="rounded-lg border border-neutral-200 px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-50">Отмена</button>
                    <button type="submit" disabled={loading} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
                        {loading ? 'Создаём...' : 'Создать тариф'}
                    </button>
                </div>
            </form>
        </Dialog>
    );
}
