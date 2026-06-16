'use client';

import { useEffect, useMemo, useState } from 'react';
import { Gauge, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDateTime, toLocalDateTimeInputValue } from './deepFleetShared';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { DataTable, type Column, Pill, type PillTone } from '@/components/ui/data-table';

type OdometerRow = {
    id: string;
    vehicleId: string;
    recordedAt: string;
    valueKm: number;
    source: string;
    tripId?: string | null;
};

type VehicleLink = { id: string; plateNumber: string };

type DisplayRow = {
    id: string;
    record: OdometerRow;
    vehiclePlate: string;
    delta?: number;
};

const SOURCE_LABELS: Record<string, string> = {
    manual: 'Вручную',
    gps: 'GPS',
    waybill: 'Путевой лист',
    inspection: 'Осмотр',
};

const SOURCE_TONES: Record<string, PillTone> = {
    manual: 'neutral',
    gps: 'success',
    waybill: 'info',
    inspection: 'warning',
};

function AddOdometerModal({
    open,
    onClose,
    onCreated,
    vehicles,
}: {
    open: boolean;
    onClose: () => void;
    onCreated: () => void;
    vehicles: VehicleLink[];
}) {
    const { toast } = useToast();
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [form, setForm] = useState({
        vehicleId: '',
        recordedAt: toLocalDateTimeInputValue(),
        valueKm: '',
        source: 'manual',
    });

    useEffect(() => {
        if (open) {
            setForm({
                vehicleId: '',
                recordedAt: toLocalDateTimeInputValue(),
                valueKm: '',
                source: 'manual',
            });
            setError('');
        }
    }, [open]);

    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault();
        if (!form.vehicleId) {
            setError('Выберите ТС.');
            return;
        }
        if (!form.valueKm) {
            setError('Укажите показание одометра.');
            return;
        }
        setSubmitting(true);
        setError('');
        try {
            await api.post('/fleet/odometer-readings', {
                vehicleId: form.vehicleId,
                recordedAt: new Date(form.recordedAt).toISOString(),
                valueKm: Number(form.valueKm),
                source: form.source,
            });
            toast({ variant: 'success', title: 'Показание записано' });
            onCreated();
            onClose();
        } catch (err: any) {
            const msg = err?.message || 'Не удалось записать показание.';
            setError(msg);
            toast({ variant: 'error', title: 'Ошибка', description: msg });
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <Dialog open={open} onClose={onClose} title="Записать пробег" size="md">
            <form onSubmit={handleSubmit} className="space-y-4">
                {error ? <div className="rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700">{error}</div> : null}
                <div className="grid gap-4 md:grid-cols-2">
                    <label className="space-y-1 text-sm md:col-span-2">
                        <span className="text-neutral-600">ТС</span>
                        <select
                            value={form.vehicleId}
                            onChange={(e) => setForm((prev) => ({ ...prev, vehicleId: e.target.value }))}
                            className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
                        >
                            <option value="">Выберите ТС</option>
                            {vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.plateNumber}</option>)}
                        </select>
                    </label>
                    <label className="space-y-1 text-sm">
                        <span className="text-neutral-600">Дата и время</span>
                        <input
                            type="datetime-local"
                            value={form.recordedAt}
                            onChange={(e) => setForm((prev) => ({ ...prev, recordedAt: e.target.value }))}
                            className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
                        />
                    </label>
                    <label className="space-y-1 text-sm">
                        <span className="text-neutral-600">Показание, км</span>
                        <input
                            type="number"
                            min="0"
                            value={form.valueKm}
                            onChange={(e) => setForm((prev) => ({ ...prev, valueKm: e.target.value }))}
                            placeholder="0"
                            className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
                        />
                    </label>
                    <label className="space-y-1 text-sm md:col-span-2">
                        <span className="text-neutral-600">Источник</span>
                        <select
                            value={form.source}
                            onChange={(e) => setForm((prev) => ({ ...prev, source: e.target.value }))}
                            className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
                        >
                            {Object.entries(SOURCE_LABELS).map(([value, label]) => (
                                <option key={value} value={value}>{label}</option>
                            ))}
                        </select>
                    </label>
                </div>
                <div className="flex justify-end gap-3 pt-2 border-t border-neutral-100">
                    <Button variant="outline" onClick={onClose} disabled={submitting} type="button">Отмена</Button>
                    <Button variant="brand" isLoading={submitting} type="submit">Записать</Button>
                </div>
            </form>
        </Dialog>
    );
}

export function OdometerHistoryTable() {
    const [rows, setRows] = useState<OdometerRow[]>([]);
    const [vehicles, setVehicles] = useState<VehicleLink[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [filters, setFilters] = useState({ vehicleId: '', source: '' });

    async function loadData() {
        setLoading(true);
        try {
            const query = new URLSearchParams();
            if (filters.vehicleId) query.set('vehicleId', filters.vehicleId);
            if (filters.source) query.set('source', filters.source);
            const [odometerRes, vehiclesRes] = await Promise.all([
                api.get<any>(`/fleet/odometer-readings?${query.toString()}`),
                api.get<any>('/fleet/vehicles?limit=200'),
            ]);
            setRows(odometerRes.data || []);
            setVehicles(vehiclesRes.data || []);
        } catch (err) {
            console.error('Failed to load odometer readings', err);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadData();
    }, [filters.vehicleId, filters.source]);

    const displayRows = useMemo<DisplayRow[]>(() => {
        const trendMap = new Map<string, number>();
        for (let index = 0; index < rows.length; index += 1) {
            const current = rows[index];
            const next = rows[index + 1];
            if (next && next.vehicleId === current.vehicleId) {
                trendMap.set(current.id, current.valueKm - next.valueKm);
            }
        }
        return rows.map((row) => {
            const vehicle = vehicles.find((item) => item.id === row.vehicleId);
            return {
                id: row.id,
                record: row,
                vehiclePlate: vehicle?.plateNumber || row.vehicleId,
                delta: trendMap.get(row.id),
            };
        });
    }, [rows, vehicles]);

    const hasFilters = !!(filters.vehicleId || filters.source);

    const columns: Column<DisplayRow>[] = [
        {
            id: 'recordedAt',
            header: 'Дата',
            accessor: (r) => r.record.recordedAt,
            cell: (r) => <span className="text-neutral-600">{formatDateTime(r.record.recordedAt)}</span>,
            sortable: true,
            width: '170px',
        },
        {
            id: 'vehicle',
            header: 'ТС',
            accessor: (r) => r.vehiclePlate,
            cell: (r) => <span className="font-medium text-neutral-800">{r.vehiclePlate}</span>,
            sortable: true,
            sticky: 'left',
            minWidth: '140px',
        },
        {
            id: 'source',
            header: 'Источник',
            accessor: (r) => SOURCE_LABELS[r.record.source] ?? r.record.source,
            cell: (r) => (
                <Pill tone={SOURCE_TONES[r.record.source] ?? 'neutral'}>
                    {SOURCE_LABELS[r.record.source] ?? r.record.source}
                </Pill>
            ),
            sortable: true,
            width: '140px',
        },
        {
            id: 'valueKm',
            header: 'Пробег',
            accessor: (r) => Number(r.record.valueKm || 0),
            cell: (r) => (
                <span className="text-neutral-700 font-medium">
                    {Number(r.record.valueKm).toLocaleString('ru-RU')} км
                </span>
            ),
            sortable: true,
            align: 'right',
            width: '140px',
        },
        {
            id: 'delta',
            header: 'Дельта',
            accessor: (r) => r.delta ?? 0,
            cell: (r) => (
                <span className="text-neutral-600">
                    {r.delta !== undefined ? `${r.delta >= 0 ? '+' : ''}${r.delta.toLocaleString('ru-RU')} км` : <span className="text-neutral-400">—</span>}
                </span>
            ),
            sortable: true,
            align: 'right',
            width: '140px',
        },
        {
            id: 'tripId',
            header: 'Рейс',
            accessor: (r) => r.record.tripId ?? '',
            cell: (r) => <span className="text-neutral-600">{r.record.tripId || <span className="text-neutral-400">—</span>}</span>,
            minWidth: '120px',
            hiddenByDefault: true,
        },
    ];

    return (
        <div>
            <DataTable<DisplayRow>
                tableId="fleet-odometer-history"
                data={displayRows}
                columns={columns}
                keyField="id"
                loading={loading}
                searchPlaceholder="Поиск по ТС…"
                searchKeys={['vehicle']}
                searchPredicate={(r, q) => r.vehiclePlate.toLowerCase().includes(q)}
                filters={[
                    {
                        id: 'vehicleId',
                        label: 'ТС',
                        value: filters.vehicleId,
                        onChange: (value) => setFilters((prev) => ({ ...prev, vehicleId: value })),
                        options: vehicles.map((v) => ({ value: v.id, label: v.plateNumber })),
                    },
                    {
                        id: 'source',
                        label: 'Источник',
                        value: filters.source,
                        onChange: (value) => setFilters((prev) => ({ ...prev, source: value })),
                        options: Object.entries(SOURCE_LABELS).map(([value, label]) => ({ value, label })),
                    },
                ]}
                toolbar={
                    <Button
                        variant="brand"
                        leftIcon={<Plus className="w-4 h-4" />}
                        onClick={() => setShowAddModal(true)}
                    >
                        Записать пробег
                    </Button>
                }
                emptyState={
                    <EmptyState
                        icon={Gauge}
                        title={hasFilters ? 'По фильтрам ничего не найдено' : 'История одометра пуста'}
                        description={hasFilters
                            ? 'Попробуйте сбросить фильтры.'
                            : 'Добавьте первое показание, чтобы контролировать пробег и планировать ТО.'}
                        tone="brand"
                        action={!hasFilters ? (
                            <Button variant="brand" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setShowAddModal(true)}>
                                Записать пробег
                            </Button>
                        ) : undefined}
                    />
                }
                pageSize={50}
            />

            <AddOdometerModal
                open={showAddModal}
                onClose={() => setShowAddModal(false)}
                onCreated={loadData}
                vehicles={vehicles}
            />
        </div>
    );
}
