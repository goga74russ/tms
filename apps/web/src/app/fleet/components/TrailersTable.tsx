'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Search, Plus, Truck, X } from 'lucide-react';

interface Trailer {
    id: string;
    plateNumber: string;
    vin?: string | null;
    type: string;
    make?: string | null;
    model?: string | null;
    year?: number | null;
    payloadCapacityKg?: number | null;
    payloadVolumeM3?: number | null;
    currentVehicleId?: string | null;
    isArchived: boolean;
}

const trailerTypeLabels: Record<string, string> = {
    tent: 'Тент',
    board: 'Бортовой',
    refrigerator: 'Рефрижератор',
    cistern: 'Цистерна',
    flatbed: 'Платформа',
    container: 'Контейнер',
    other: 'Другое',
};

function AddTrailerModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
    const [form, setForm] = useState({
        plateNumber: '',
        vin: '',
        type: 'tent',
        make: '',
        model: '',
        year: '',
        payloadCapacityKg: '',
        payloadVolumeM3: '',
    });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    async function handleSubmit() {
        if (!form.plateNumber.trim()) {
            setError('Укажите госномер прицепа');
            return;
        }

        try {
            setSubmitting(true);
            setError('');
            await api.post('/fleet/trailers', {
                plateNumber: form.plateNumber.trim(),
                vin: form.vin.trim() || undefined,
                type: form.type,
                make: form.make.trim() || undefined,
                model: form.model.trim() || undefined,
                year: form.year ? Number(form.year) : undefined,
                payloadCapacityKg: form.payloadCapacityKg ? Number(form.payloadCapacityKg) : undefined,
                payloadVolumeM3: form.payloadVolumeM3 ? Number(form.payloadVolumeM3) : undefined,
            });
            onCreated();
        } catch (err: any) {
            setError(err.message || 'Не удалось создать прицеп');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="w-full max-w-xl rounded-2xl bg-white shadow-xl border border-slate-200">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                    <div>
                        <h3 className="text-lg font-bold text-slate-900">Новый прицеп</h3>
                        <p className="text-sm text-slate-500">Добавление сущности прицепа из Sprint 9</p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100">
                        <X className="w-4 h-4 text-slate-500" />
                    </button>
                </div>
                <div className="p-6 grid grid-cols-2 gap-4">
                    <input value={form.plateNumber} onChange={(e) => setForm(f => ({ ...f, plateNumber: e.target.value }))} placeholder="Госномер" className="px-4 py-3 rounded-xl border border-slate-200 text-sm" />
                    <input value={form.vin} onChange={(e) => setForm(f => ({ ...f, vin: e.target.value }))} placeholder="VIN" className="px-4 py-3 rounded-xl border border-slate-200 text-sm" />
                    <select value={form.type} onChange={(e) => setForm(f => ({ ...f, type: e.target.value }))} className="px-4 py-3 rounded-xl border border-slate-200 text-sm">
                        {Object.entries(trailerTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                    <input value={form.make} onChange={(e) => setForm(f => ({ ...f, make: e.target.value }))} placeholder="Марка" className="px-4 py-3 rounded-xl border border-slate-200 text-sm" />
                    <input value={form.model} onChange={(e) => setForm(f => ({ ...f, model: e.target.value }))} placeholder="Модель" className="px-4 py-3 rounded-xl border border-slate-200 text-sm" />
                    <input value={form.year} onChange={(e) => setForm(f => ({ ...f, year: e.target.value }))} placeholder="Год" type="number" className="px-4 py-3 rounded-xl border border-slate-200 text-sm" />
                    <input value={form.payloadCapacityKg} onChange={(e) => setForm(f => ({ ...f, payloadCapacityKg: e.target.value }))} placeholder="Грузоподъёмность, кг" type="number" className="px-4 py-3 rounded-xl border border-slate-200 text-sm" />
                    <input value={form.payloadVolumeM3} onChange={(e) => setForm(f => ({ ...f, payloadVolumeM3: e.target.value }))} placeholder="Объём, м³" type="number" className="px-4 py-3 rounded-xl border border-slate-200 text-sm" />
                </div>
                {error && <p className="px-6 pb-2 text-sm text-red-600">{error}</p>}
                <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
                    <button onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium">Отмена</button>
                    <button onClick={handleSubmit} disabled={submitting} className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                        {submitting ? 'Сохраняю...' : 'Создать прицеп'}
                    </button>
                </div>
            </div>
        </div>
    );
}

export function TrailersTable() {
    const [trailers, setTrailers] = useState<Trailer[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [showAddModal, setShowAddModal] = useState(false);

    async function loadTrailers() {
        setLoading(true);
        try {
            const result = await api.get<any>(`/fleet/trailers?search=${encodeURIComponent(search)}&limit=50`);
            setTrailers(result.data || []);
        } catch (err) {
            console.error('Failed to load trailers:', err);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        const timer = setTimeout(loadTrailers, 250);
        return () => clearTimeout(timer);
    }, [search]);

    return (
        <>
            <div>
                <div className="p-4 border-b border-slate-200 flex items-center gap-4">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Поиск по номеру, марке..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        />
                    </div>
                    <button onClick={() => setShowAddModal(true)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm">
                        <Plus className="w-4 h-4" />
                        Добавить прицеп
                    </button>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                    </div>
                ) : trailers.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                        <Truck className="w-12 h-12 mb-3" />
                        <p className="text-sm">Прицепы не найдены</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50 text-slate-500 text-left">
                                    <th className="px-4 py-3 font-medium">Госномер</th>
                                    <th className="px-4 py-3 font-medium">Тип</th>
                                    <th className="px-4 py-3 font-medium">Марка / Модель</th>
                                    <th className="px-4 py-3 font-medium">Грузоподъёмность</th>
                                    <th className="px-4 py-3 font-medium">Объём</th>
                                    <th className="px-4 py-3 font-medium">Статус</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {trailers.map((trailer) => (
                                    <tr key={trailer.id} className="hover:bg-slate-50">
                                        <td className="px-4 py-3 font-mono font-semibold text-slate-900">{trailer.plateNumber}</td>
                                        <td className="px-4 py-3 text-slate-600">{trailerTypeLabels[trailer.type] || trailer.type}</td>
                                        <td className="px-4 py-3 text-slate-700">{[trailer.make, trailer.model].filter(Boolean).join(' ') || '—'}</td>
                                        <td className="px-4 py-3 text-slate-600">{trailer.payloadCapacityKg ? `${(trailer.payloadCapacityKg / 1000).toFixed(1)} т` : '—'}</td>
                                        <td className="px-4 py-3 text-slate-600">{trailer.payloadVolumeM3 ? `${trailer.payloadVolumeM3} м³` : '—'}</td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${trailer.isArchived ? 'bg-slate-100 text-slate-500' : 'bg-emerald-100 text-emerald-700'}`}>
                                                {trailer.isArchived ? 'Архив' : 'Активен'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {showAddModal && <AddTrailerModal onClose={() => setShowAddModal(false)} onCreated={() => { setShowAddModal(false); loadTrailers(); }} />}
        </>
    );
}