'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Plus, Container, Pencil, Archive } from 'lucide-react';
import { Dialog, ConfirmDialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { DataTable, type Column, Pill } from '@/components/ui/data-table';

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

function TrailerFormModal({
    onClose,
    onSaved,
    editingItem,
}: {
    onClose: () => void;
    onSaved: () => void;
    editingItem?: Trailer | null;
}) {
    const { toast } = useToast();
    const isEdit = !!editingItem;
    const [vehicles, setVehicles] = useState<VehicleLink[]>([]);
    const [form, setForm] = useState({
        plateNumber: editingItem?.plateNumber ?? '',
        vin: editingItem?.vin ?? '',
        type: editingItem?.type ?? 'tent',
        make: editingItem?.make ?? '',
        model: editingItem?.model ?? '',
        year: editingItem?.year != null ? String(editingItem.year) : '',
        payloadCapacityKg: editingItem?.payloadCapacityKg != null ? String(editingItem.payloadCapacityKg) : '',
        payloadVolumeM3: editingItem?.payloadVolumeM3 != null ? String(editingItem.payloadVolumeM3) : '',
        currentVehicleId: editingItem?.currentVehicleId ?? '',
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
            const payload = {
                plateNumber: form.plateNumber.trim(),
                vin: form.vin.trim() || undefined,
                type: form.type,
                make: form.make.trim() || undefined,
                model: form.model.trim() || undefined,
                year: form.year ? Number(form.year) : undefined,
                payloadCapacityKg: form.payloadCapacityKg ? Number(form.payloadCapacityKg) : undefined,
                payloadVolumeM3: form.payloadVolumeM3 ? Number(form.payloadVolumeM3) : undefined,
                currentVehicleId: form.currentVehicleId || undefined,
            };
            if (isEdit) {
                await api.put(`/fleet/trailers/${editingItem!.id}`, payload);
                toast({ variant: 'success', title: 'Прицеп обновлён' });
            } else {
                await api.post('/fleet/trailers', payload);
                toast({ variant: 'success', title: 'Прицеп создан' });
            }
            onSaved();
        } catch (err: any) {
            const msg = err.message || (isEdit ? 'Не удалось сохранить прицеп' : 'Не удалось создать прицеп');
            setError(msg);
            toast({ variant: 'error', title: 'Ошибка', description: msg });
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <Dialog
            open={true}
            onClose={onClose}
            title={isEdit ? 'Редактировать прицеп' : 'Новый прицеп'}
            description={isEdit ? undefined : 'Добавление сущности прицепа из Sprint 9'}
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
                        value={form.vin ?? ''}
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
                        value={form.make ?? ''}
                        onChange={(e) => setForm(f => ({ ...f, make: e.target.value }))}
                        placeholder="Марка"
                        className="px-4 py-3 rounded-xl border border-neutral-200 text-sm"
                    />
                    <input
                        value={form.model ?? ''}
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
                            value={form.currentVehicleId ?? ''}
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
                <Button variant="outline" onClick={onClose} disabled={submitting}>Отмена</Button>
                <Button variant="brand" isLoading={submitting} onClick={handleSubmit}>
                    {isEdit ? 'Сохранить' : 'Создать прицеп'}
                </Button>
            </div>
        </Dialog>
    );
}

export function TrailersTable() {
    const { toast } = useToast();
    const [trailers, setTrailers] = useState<Trailer[]>([]);
    const [vehicleMap, setVehicleMap] = useState<Record<string, VehicleLink>>({});
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingTrailer, setEditingTrailer] = useState<Trailer | null>(null);
    const [confirmAction, setConfirmAction] = useState<null | { run: () => Promise<void> | void; title: string; description?: string; destructive?: boolean; confirmLabel?: string }>(null);

    async function loadTrailers() {
        setLoading(true);
        try {
            const result = await api.get<any>(`/fleet/trailers?limit=200`);
            setTrailers(result.data || []);
        } catch (err) {
            console.error('Failed to load trailers:', err);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadTrailers();
    }, []);

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

    async function toggleArchive(row: Trailer) {
        try {
            await api.put(`/fleet/trailers/${row.id}`, { isArchived: !row.isArchived });
            toast({ variant: 'success', title: row.isArchived ? 'Восстановлено' : 'Архивировано' });
            void loadTrailers();
        } catch (err: any) {
            toast({ variant: 'error', title: 'Ошибка', description: err?.message ?? 'Не удалось обновить' });
        }
    }

    const columns: Column<Trailer>[] = [
        {
            id: 'plateNumber',
            header: 'Госномер',
            accessor: (r) => r.plateNumber,
            cell: (r) => <span className="font-semibold text-neutral-900">{r.plateNumber}</span>,
            sortable: true,
            sticky: 'left',
            monospace: true,
            minWidth: '140px',
        },
        {
            id: 'type',
            header: 'Тип',
            accessor: (r) => trailerTypeLabels[r.type] ?? r.type,
            cell: (r) => <span className="text-neutral-600">{trailerTypeLabels[r.type] || r.type}</span>,
            sortable: true,
            width: '140px',
        },
        {
            id: 'makeModel',
            header: 'Марка / Модель',
            accessor: (r) => [r.make, r.model].filter(Boolean).join(' '),
            cell: (r) => (
                <span className="text-neutral-700">
                    {[r.make, r.model].filter(Boolean).join(' ') || <span className="text-neutral-400">—</span>}
                </span>
            ),
            sortable: true,
            minWidth: '180px',
        },
        {
            id: 'vehicle',
            header: 'Тягач',
            accessor: (r) => (r.currentVehicleId ? vehicleMap[r.currentVehicleId]?.plateNumber || r.currentVehicleId : ''),
            cell: (r) => (
                <span className="text-neutral-600">
                    {r.currentVehicleId
                        ? vehicleMap[r.currentVehicleId]?.plateNumber || r.currentVehicleId.slice(0, 8) + '...'
                        : <span className="text-neutral-400">—</span>}
                </span>
            ),
            sortable: true,
            width: '140px',
        },
        {
            id: 'payloadCapacityKg',
            header: 'Грузоподъёмность',
            accessor: (r) => r.payloadCapacityKg ?? 0,
            cell: (r) => (
                <span className="text-neutral-600">
                    {r.payloadCapacityKg ? `${(r.payloadCapacityKg / 1000).toFixed(1)} т` : <span className="text-neutral-400">—</span>}
                </span>
            ),
            sortable: true,
            align: 'right',
            width: '160px',
        },
        {
            id: 'payloadVolumeM3',
            header: 'Объём',
            accessor: (r) => r.payloadVolumeM3 ?? 0,
            cell: (r) => (
                <span className="text-neutral-600">
                    {r.payloadVolumeM3 ? `${r.payloadVolumeM3} м³` : <span className="text-neutral-400">—</span>}
                </span>
            ),
            sortable: true,
            align: 'right',
            width: '110px',
        },
        {
            id: 'isArchived',
            header: 'Статус',
            accessor: (r) => (r.isArchived ? 1 : 0),
            cell: (r) => (
                <Pill tone={r.isArchived ? 'neutral' : 'success'}>
                    {r.isArchived ? 'Архив' : 'Активен'}
                </Pill>
            ),
            sortable: true,
            width: '110px',
        },
    ];

    return (
        <div>
            <DataTable<Trailer>
                tableId="fleet-trailers"
                data={trailers}
                columns={columns}
                keyField="id"
                loading={loading}
                searchPlaceholder="Поиск по номеру, марке…"
                searchKeys={['plateNumber', 'makeModel', 'type', 'vehicle']}
                searchPredicate={(r, q) => {
                    const plate = (r.plateNumber || '').toLowerCase();
                    const makeModel = [r.make, r.model].filter(Boolean).join(' ').toLowerCase();
                    const vin = (r.vin || '').toLowerCase();
                    const type = (trailerTypeLabels[r.type] ?? r.type ?? '').toLowerCase();
                    const tractor = r.currentVehicleId ? (vehicleMap[r.currentVehicleId]?.plateNumber || '').toLowerCase() : '';
                    return plate.includes(q) || makeModel.includes(q) || vin.includes(q) || type.includes(q) || tractor.includes(q);
                }}
                toolbar={
                    <Button
                        variant="brand"
                        leftIcon={<Plus className="w-4 h-4" />}
                        onClick={() => setShowAddModal(true)}
                    >
                        Добавить прицеп
                    </Button>
                }
                rowClassName={(row) => (row.isArchived ? 'opacity-60' : '')}
                rowActions={(row) => [
                    {
                        id: 'edit',
                        label: 'Редактировать',
                        icon: <Pencil className="w-4 h-4" />,
                        onClick: () => setEditingTrailer(row),
                    },
                    {
                        id: 'toggle-archive',
                        label: row.isArchived ? 'Восстановить' : 'В архив',
                        icon: <Archive className="w-4 h-4" />,
                        onClick: () => {
                            if (row.isArchived) {
                                void toggleArchive(row);
                                return;
                            }
                            setConfirmAction({
                                run: () => toggleArchive(row),
                                title: `Архивировать прицеп "${row.plateNumber}"?`,
                                confirmLabel: 'Архивировать',
                            });
                        },
                    },
                ]}
                emptyState={
                    <EmptyState
                        icon={Container}
                        title="Пока нет прицепов"
                        description="Добавьте первый прицеп, чтобы закреплять его за тягачами."
                        tone="brand"
                        action={
                            <Button variant="brand" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setShowAddModal(true)}>
                                Добавить прицеп
                            </Button>
                        }
                    />
                }
                pageSize={50}
            />

            {showAddModal && (
                <TrailerFormModal
                    onClose={() => setShowAddModal(false)}
                    onSaved={() => { setShowAddModal(false); void loadTrailers(); }}
                />
            )}

            {editingTrailer && (
                <TrailerFormModal
                    key={editingTrailer.id}
                    editingItem={editingTrailer}
                    onClose={() => setEditingTrailer(null)}
                    onSaved={() => { setEditingTrailer(null); void loadTrailers(); }}
                />
            )}

            <ConfirmDialog
                open={!!confirmAction}
                onClose={() => setConfirmAction(null)}
                onConfirm={async () => { await confirmAction?.run(); setConfirmAction(null); }}
                title={confirmAction?.title ?? ''}
                description={confirmAction?.description}
                destructive={confirmAction?.destructive}
                confirmLabel={confirmAction?.confirmLabel}
            />
        </div>
    );
}
