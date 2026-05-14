'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Search, Plus, Container } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';

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

interface VehicleLink {
    id: string;
    plateNumber: string;
    make?: string | null;
    model?: string | null;
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
    const [vehicles, setVehicles] = useState<VehicleLink[]>([]);
    const [form, setForm] = useState({
        plateNumber: '',
        vin: '',
        type: 'tent',
        make: '',
        model: '',
        year: '',
        payloadCapacityKg: '',
        payloadVolumeM3: '',
        currentVehicleId: '',
    });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        (async () => {
            try {
                const result = await api.get<any>('/fleet/vehicles?limit=200');
                setVehicles(Array.isArray(result.data) ? result.data : []);
            } catch (err) {
                console.error('Failed to load vehicles for trailer form:', err);
            }
        })();
    }, []);

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
                currentVehicleId: form.currentVehicleId || undefined,
            });
            onCreated();
        } catch (err: any) {
            setError(err.message || 'Не удалось создать прицеп');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <Dialog
            open={true}
            onClose={onClose}
            title="Новый прицеп"
            description="Добавление сущности прицепа из Sprint 9"
            size="md"
        >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <input
                        value={form.plateNumber}
                        onChange={(e) => setForm(f => ({ ...f, plateNumber: e.target.value }))}
                        placeholder="Госномер"
                        className="px-4 py-3 rounded-xl border border-neutral-200 text-sm"
                    />
                    <input
                        value={form.vin}
                        onChange={(e) => setForm(f => ({ ...f, vin: e.target.value }))}
                        placeholder="VIN"
                        className="px-4 py-3 rounded-xl border border-neutral-200 text-sm"
                    />
                    <select
                        value={form.type}
                        onChange={(e) => setForm(f => ({ ...f, type: e.target.value }))}
                        className="px-4 py-3 rounded-xl border border-neutral-200 text-sm"
                    >
                        {Object.entries(trailerTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                    <input
                        value={form.make}
                        onChange={(e) => setForm(f => ({ ...f, make: e.target.value }))}
                        placeholder="Марка"
                        className="px-4 py-3 rounded-xl border border-neutral-200 text-sm"
                    />
                    <input
                        value={form.model}
                        onChange={(e) => setForm(f => ({ ...f, model: e.target.value }))}
                        placeholder="Модель"
                        className="px-4 py-3 rounded-xl border border-neutral-200 text-sm"
                    />
                    <input
                        value={form.year}
                        onChange={(e) => setForm(f => ({ ...f, year: e.target.value }))}
                        placeholder="Год"
                        type="number"
                        className="px-4 py-3 rounded-xl border border-neutral-200 text-sm"
                    />
                    <input
                        value={form.payloadCapacityKg}
                        onChange={(e) => setForm(f => ({ ...f, payloadCapacityKg: e.target.value }))}
                        placeholder="Грузоподъёмность, кг"
                        type="number"
                        className="px-4 py-3 rounded-xl border border-neutral-200 text-sm"
                    />
                    <input
                        value={form.payloadVolumeM3}
                        onChange={(e) => setForm(f => ({ ...f, payloadVolumeM3: e.target.value }))}
                        placeholder="Объём, м³"
                        type="number"
                        className="px-4 py-3 rounded-xl border border-neutral-200 text-sm"
                    />
                    <div className="col-span-2">
                        <label className="block text-xs font-medium text-neutral-600 mb-1">Тягач</label>
                        <select
                            value={form.currentVehicleId}
                            onChange={(e) => setForm(f => ({ ...f, currentVehicleId: e.target.value }))}
                            className="w-full px-4 py-3 rounded-xl border border-neutral-200 text-sm"
                        >
                            <option value="">Не закреплён</option>
                            {vehicles.map(vehicle => (
                                <option key={vehicle.id} value={vehicle.id}>
                                    {vehicle.plateNumber}
                                    {vehicle.make || vehicle.model ? ` • ${[vehicle.make, vehicle.model].filter(Boolean).join(' ')}` : ''}
                                </option>
                            ))}
                        </select>
                    </div>
            </div>
            {error && <p className="pt-3 text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-3 pt-4 mt-4 border-t border-neutral-100">
                <button onClick={onClose} className="px-4 py-2 rounded-xl border border-neutral-200 text-sm font-medium">Отмена</button>
                <button onClick={handleSubmit} disabled={submitting} className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                    {submitting ? 'Сохраняю...' : 'Создать прицеп'}
                </button>
            </div>
        </Dialog>
    );
}

export function TrailersTable() {
    const [trailers, setTrailers] = useState<Trailer[]>([]);
    const [vehicleMap, setVehicleMap] = useState<Record<string, VehicleLink>>({});
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

    useEffect(() => {
        (async () => {
            try {
                const result = await api.get<any>('/fleet/vehicles?limit=200');
                const map: Record<string, VehicleLink> = {};
                for (const vehicle of result.data || []) {
                    map[vehicle.id] = {
                        id: vehicle.id,
                        plateNumber: vehicle.plateNumber,
                        make: vehicle.make,
                        model: vehicle.model,
                    };
                }
                setVehicleMap(map);
            } catch (err) {
                console.error('Failed to load vehicles for trailer table:', err);
            }
        })();
    }, []);

    return (
        <>
            <div>
                <div className="p-4 border-b border-neutral-200 flex items-center gap-4">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                        <input
                            type="text"
                            placeholder="Поиск по номеру, марке..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 rounded-lg border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
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
                    <div className="p-6">
                        <EmptyState
                            icon={Container}
                            title={search ? 'Прицепы не найдены' : 'Пока нет прицепов'}
                            description={search ? 'Попробуйте изменить запрос или сбросить поиск.' : 'Добавьте первый прицеп, чтобы закреплять его за тягачами.'}
                            tone="brand"
                            action={search ? (
                                <Button variant="outline" onClick={() => setSearch('')}>Сбросить поиск</Button>
                            ) : (
                                <Button variant="brand" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setShowAddModal(true)}>
                                    Добавить прицеп
                                </Button>
                            )}
                        />
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-neutral-50 text-neutral-500 text-left">
                                    <th className="px-4 py-3 font-medium">Госномер</th>
                                    <th className="px-4 py-3 font-medium">Тип</th>
                                    <th className="px-4 py-3 font-medium">Марка / Модель</th>
                                    <th className="px-4 py-3 font-medium">Тягач</th>
                                    <th className="px-4 py-3 font-medium">Грузоподъёмность</th>
                                    <th className="px-4 py-3 font-medium">Объём</th>
                                    <th className="px-4 py-3 font-medium">Статус</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-100">
                                {trailers.map((trailer) => (
                                    <tr key={trailer.id} className="hover:bg-neutral-50">
                                        <td className="px-4 py-3 font-mono font-semibold text-neutral-900">{trailer.plateNumber}</td>
                                        <td className="px-4 py-3 text-neutral-600">{trailerTypeLabels[trailer.type] || trailer.type}</td>
                                        <td className="px-4 py-3 text-neutral-700">{[trailer.make, trailer.model].filter(Boolean).join(' ') || '—'}</td>
                                        <td className="px-4 py-3 text-neutral-600">
                                            {trailer.currentVehicleId
                                                ? vehicleMap[trailer.currentVehicleId]?.plateNumber || trailer.currentVehicleId.slice(0, 8) + '...'
                                                : '—'}
                                        </td>
                                        <td className="px-4 py-3 text-neutral-600">{trailer.payloadCapacityKg ? `${(trailer.payloadCapacityKg / 1000).toFixed(1)} т` : '—'}</td>
                                        <td className="px-4 py-3 text-neutral-600">{trailer.payloadVolumeM3 ? `${trailer.payloadVolumeM3} м³` : '—'}</td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${trailer.isArchived ? 'bg-neutral-100 text-neutral-500' : 'bg-emerald-100 text-emerald-700'}`}>
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
