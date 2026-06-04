'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, PauseCircle, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { AddDowntimeModal } from './AddDowntimeModal';
import { durationHours, formatDateTime, getRowRecord, toLocalDateTimeInputValue } from './deepFleetShared';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { DataTable, type Column, Pill, type PillTone } from '@/components/ui/data-table';

type DowntimeRow = {
    id: string;
    vehicleId: string;
    startAt: string;
    endAt?: string | null;
    reasonCode: string;
    description?: string | null;
};

type DisplayRow = {
    id: string;
    record: DowntimeRow;
    vehiclePlate: string;
    isActive: boolean;
    duration: number;
    raw: any;
};

const REASON_LABELS: Record<string, string> = {
    repair: 'Ремонт',
    waiting_load: 'Ожидание загрузки',
    waiting_docs: 'Ожидание документов',
    driver_absence: 'Нет водителя',
    weather: 'Погода',
    other: 'Прочее',
};

const REASON_TONES: Record<string, PillTone> = {
    repair: 'warning',
    waiting_load: 'info',
    waiting_docs: 'info',
    driver_absence: 'danger',
    weather: 'neutral',
    other: 'neutral',
};

export function DowntimeRecordsTable() {
    const { toast } = useToast();
    const [rows, setRows] = useState<any[]>([]);
    const [vehicles, setVehicles] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [closingRow, setClosingRow] = useState<DisplayRow | null>(null);
    const [closeDraft, setCloseDraft] = useState<{ endAt: string; description: string }>({ endAt: toLocalDateTimeInputValue(), description: '' });
    const [submitting, setSubmitting] = useState(false);
    const [filters, setFilters] = useState({ vehicleId: '', reasonCode: '', openOnly: true });

    async function loadData() {
        setLoading(true);
        try {
            const query = new URLSearchParams();
            if (filters.vehicleId) query.set('vehicleId', filters.vehicleId);
            if (filters.reasonCode) query.set('reasonCode', filters.reasonCode);
            if (filters.openOnly) query.set('openOnly', 'true');
            const [recordsRes, vehiclesRes] = await Promise.all([
                api.get<any>(`/fleet/downtime-records?${query.toString()}`),
                api.get<any>('/fleet/vehicles?limit=200'),
            ]);
            setRows(recordsRes.data || []);
            setVehicles(vehiclesRes.data || []);
        } catch (err) {
            // C9: ошибка загрузки больше не молчит (пустая таблица ≠ нет ошибки).
            console.error('Failed to load downtime records', err);
            toast({ variant: 'error', title: 'Ошибка загрузки простоев', description: (err as Error)?.message });
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadData();
    }, [filters.vehicleId, filters.reasonCode, filters.openOnly]);

    const displayRows = useMemo<DisplayRow[]>(() => rows.map((row: any) => {
        const record = getRowRecord<DowntimeRow>(row, 'downtime_records');
        const vehicle = row.vehicles;
        return {
            id: record.id,
            record,
            vehiclePlate: vehicle?.plateNumber || record.vehicleId,
            isActive: !record.endAt,
            duration: durationHours(record.startAt, record.endAt),
            raw: row,
        };
    }), [rows]);

    const totalHours = useMemo(
        () => displayRows.reduce((sum, r) => sum + r.duration, 0),
        [displayRows],
    );

    const hasFilters = !!(filters.vehicleId || filters.reasonCode);

    function openClose(row: DisplayRow) {
        setClosingRow(row);
        setCloseDraft({
            endAt: toLocalDateTimeInputValue(),
            description: row.record.description || '',
        });
    }

    function dismissClose() {
        if (submitting) return;
        setClosingRow(null);
    }

    async function submitClose() {
        if (!closingRow) return;
        setSubmitting(true);
        try {
            await api.put(`/fleet/downtime-records/${closingRow.record.id}`, {
                endAt: new Date(closeDraft.endAt).toISOString(),
                description: closeDraft.description || undefined,
            });
            toast({ variant: 'success', title: 'Простой завершён' });
            setClosingRow(null);
            await loadData();
        } catch (err: any) {
            toast({ variant: 'error', title: 'Ошибка', description: err?.message ?? 'Не удалось завершить простой' });
        } finally {
            setSubmitting(false);
        }
    }

    const columns: Column<DisplayRow>[] = [
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
            id: 'reasonCode',
            header: 'Причина',
            accessor: (r) => REASON_LABELS[r.record.reasonCode] ?? r.record.reasonCode,
            cell: (r) => (
                <Pill tone={REASON_TONES[r.record.reasonCode] ?? 'neutral'}>
                    {REASON_LABELS[r.record.reasonCode] ?? r.record.reasonCode}
                </Pill>
            ),
            sortable: true,
            width: '180px',
        },
        {
            id: 'startAt',
            header: 'Начало',
            accessor: (r) => r.record.startAt,
            cell: (r) => <span className="text-neutral-600">{formatDateTime(r.record.startAt)}</span>,
            sortable: true,
            width: '170px',
        },
        {
            id: 'endAt',
            header: 'Окончание',
            accessor: (r) => r.record.endAt ?? '',
            cell: (r) => (
                r.isActive
                    ? <Pill tone="danger">Активен</Pill>
                    : <span className="text-neutral-600">{formatDateTime(r.record.endAt)}</span>
            ),
            sortable: true,
            width: '170px',
        },
        {
            id: 'duration',
            header: 'Длительность',
            accessor: (r) => r.duration,
            cell: (r) => (
                <span className="text-neutral-700">
                    {r.duration.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} ч
                </span>
            ),
            sortable: true,
            align: 'right',
            width: '140px',
        },
        {
            id: 'description',
            header: 'Описание',
            accessor: (r) => r.record.description ?? '',
            cell: (r) => (
                <span className="text-neutral-600">
                    {r.record.description || <span className="text-neutral-400">—</span>}
                </span>
            ),
            minWidth: '200px',
        },
    ];

    return (
        <div className="space-y-4 p-4">
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-neutral-500">Суммарная длительность</p>
                <p className="mt-1 text-2xl font-bold text-neutral-900">
                    {totalHours.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} ч
                </p>
            </div>

            <DataTable<DisplayRow>
                tableId="fleet-downtime-records"
                data={displayRows}
                columns={columns}
                keyField="id"
                loading={loading}
                searchPlaceholder="Поиск по ТС, описанию…"
                searchKeys={['vehicle', 'description']}
                searchPredicate={(r, q) => {
                    const plate = r.vehiclePlate.toLowerCase();
                    const description = (r.record.description || '').toLowerCase();
                    const reason = (REASON_LABELS[r.record.reasonCode] ?? r.record.reasonCode ?? '').toLowerCase();
                    return plate.includes(q) || description.includes(q) || reason.includes(q);
                }}
                filters={[
                    {
                        id: 'vehicleId',
                        label: 'ТС',
                        value: filters.vehicleId,
                        onChange: (value) => setFilters((prev) => ({ ...prev, vehicleId: value })),
                        options: vehicles.map((v: any) => ({ value: v.id, label: v.plateNumber })),
                    },
                    {
                        id: 'reasonCode',
                        label: 'Причина',
                        value: filters.reasonCode,
                        onChange: (value) => setFilters((prev) => ({ ...prev, reasonCode: value })),
                        options: Object.entries(REASON_LABELS).map(([value, label]) => ({ value, label })),
                    },
                ]}
                toolbar={
                    <div className="flex items-center gap-2">
                        <label className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-600">
                            <input
                                type="checkbox"
                                checked={filters.openOnly}
                                onChange={(e) => setFilters((prev) => ({ ...prev, openOnly: e.target.checked }))}
                            />
                            Только открытые
                        </label>
                        <Button
                            variant="outline"
                            leftIcon={<RefreshCw className="w-4 h-4" />}
                            onClick={() => loadData()}
                        >
                            Обновить
                        </Button>
                        <Button
                            variant="brand"
                            leftIcon={<PauseCircle className="w-4 h-4" />}
                            onClick={() => setShowAddModal(true)}
                        >
                            Открыть простой
                        </Button>
                    </div>
                }
                rowActions={(row) => {
                    if (!row.isActive) return [];
                    return [
                        {
                            id: 'close',
                            label: 'Завершить простой',
                            icon: <CheckCircle2 className="w-4 h-4" />,
                            onClick: () => openClose(row),
                        },
                    ];
                }}
                emptyState={
                    <EmptyState
                        icon={PauseCircle}
                        title={filters.openOnly && !hasFilters ? 'Активных простоев нет' : (hasFilters ? 'По фильтрам ничего не найдено' : 'Простоев пока нет')}
                        description={
                            filters.openOnly && !hasFilters
                                ? 'Все простои закрыты. Откройте новый, если ТС простаивает прямо сейчас.'
                                : (hasFilters
                                    ? 'Попробуйте сбросить фильтры.'
                                    : 'Откройте простой, чтобы фиксировать причины и длительность.')
                        }
                        tone="brand"
                        action={
                            <Button variant="brand" leftIcon={<PauseCircle className="w-4 h-4" />} onClick={() => setShowAddModal(true)}>
                                Открыть простой
                            </Button>
                        }
                    />
                }
                pageSize={50}
            />

            <AddDowntimeModal open={showAddModal} onClose={() => setShowAddModal(false)} onCreated={loadData} />

            <Dialog
                open={!!closingRow}
                onClose={dismissClose}
                title="Завершить простой"
                description={closingRow ? `${closingRow.vehiclePlate} · ${REASON_LABELS[closingRow.record.reasonCode] ?? closingRow.record.reasonCode}` : undefined}
                size="md"
            >
                {closingRow && (
                    <div className="space-y-4">
                        <div className="grid gap-4">
                            <label className="space-y-1 text-sm">
                                <span className="text-neutral-600">Окончание</span>
                                <input
                                    type="datetime-local"
                                    value={closeDraft.endAt}
                                    onChange={(e) => setCloseDraft((prev) => ({ ...prev, endAt: e.target.value }))}
                                    className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
                                />
                            </label>
                            <label className="space-y-1 text-sm">
                                <span className="text-neutral-600">Описание</span>
                                <textarea
                                    value={closeDraft.description}
                                    onChange={(e) => setCloseDraft((prev) => ({ ...prev, description: e.target.value }))}
                                    rows={4}
                                    placeholder="Что произошло за время простоя"
                                    className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
                                />
                            </label>
                        </div>
                        <div className="flex justify-end gap-3 pt-2 border-t border-neutral-100">
                            <Button variant="outline" onClick={dismissClose} disabled={submitting}>Отмена</Button>
                            <Button variant="brand" isLoading={submitting} onClick={submitClose}>Завершить</Button>
                        </div>
                    </div>
                )}
            </Dialog>
        </div>
    );
}
