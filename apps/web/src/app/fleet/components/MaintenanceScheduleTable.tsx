'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, RefreshCw, Wrench } from 'lucide-react';
import { api } from '@/lib/api';
import { AddMaintenanceModal } from './AddMaintenanceModal';
import { formatDate, formatMoney } from './deepFleetShared';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { DataTable, type Column, Pill, type PillTone } from '@/components/ui/data-table';
import { useToast } from '@/components/ui/toast';

type MaintenanceRecord = {
    id: string;
    vehicleId: string;
    maintenanceType: string;
    plannedDate?: string | null;
    plannedOdometerKm?: number | null;
    actualDate?: string | null;
    actualOdometerKm?: number | null;
    status: string;
    computedStatus?: string;
    cost?: number | string | null;
    contractor?: string | null;
    notes?: string | null;
    vehicle?: { plateNumber: string };
};

const STATUS_LABELS: Record<string, string> = {
    planned: 'План',
    overdue: 'Просрочено',
    done: 'Выполнено',
    cancelled: 'Отменено',
};

const STATUS_TONES: Record<string, PillTone> = {
    planned: 'info',
    overdue: 'danger',
    done: 'success',
    cancelled: 'neutral',
};

const MAINTENANCE_TYPE_LABELS: Record<string, string> = {
    to1: 'ТО-1',
    to2: 'ТО-2',
    to3: 'ТО-3',
    seasonal: 'Сезонное',
    other: 'Прочее',
};

export function MaintenanceScheduleTable() {
    // C9: показываем ошибку загрузки (была молча проглочена)
    const { toast } = useToast();
    const [rows, setRows] = useState<MaintenanceRecord[]>([]);
    const [vehicles, setVehicles] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [completingRecord, setCompletingRecord] = useState<MaintenanceRecord | null>(null);
    const [completeDraft, setCompleteDraft] = useState<{ actualDate: string; actualOdometerKm: string; cost: string }>({ actualDate: '', actualOdometerKm: '', cost: '' });
    const [submitting, setSubmitting] = useState(false);
    const [filters, setFilters] = useState({ vehicleId: '', status: '', maintenanceType: '' });

    async function loadData() {
        setLoading(true);
        try {
            const query = new URLSearchParams();
            if (filters.vehicleId) query.set('vehicleId', filters.vehicleId);
            if (filters.status) query.set('status', filters.status);
            if (filters.maintenanceType) query.set('maintenanceType', filters.maintenanceType);
            const [recordsRes, vehiclesRes] = await Promise.all([
                api.get<any>(`/fleet/maintenance-schedule?${query.toString()}`),
                api.get<any>('/fleet/vehicles?limit=200'),
            ]);
            setRows(recordsRes.data || []);
            setVehicles(vehiclesRes.data || []);
        } catch (err) {
            console.error('Failed to load maintenance schedule', err);
            toast({ variant: 'error', title: 'Ошибка загрузки графика ТО', description: (err as Error)?.message });
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadData();
    }, [filters.vehicleId, filters.status, filters.maintenanceType]);

    function openComplete(record: MaintenanceRecord) {
        setCompletingRecord(record);
        setCompleteDraft({
            actualDate: '',
            actualOdometerKm: record.plannedOdometerKm != null ? String(record.plannedOdometerKm) : '',
            cost: '',
        });
    }

    function closeComplete() {
        if (submitting) return;
        setCompletingRecord(null);
        setCompleteDraft({ actualDate: '', actualOdometerKm: '', cost: '' });
    }

    async function submitComplete() {
        if (!completingRecord) return;
        setSubmitting(true);
        try {
            await api.put(`/fleet/maintenance-schedule/${completingRecord.id}`, {
                status: 'done',
                actualDate: completeDraft.actualDate ? new Date(`${completeDraft.actualDate}T00:00:00`).toISOString() : new Date().toISOString(),
                actualOdometerKm: completeDraft.actualOdometerKm ? Number(completeDraft.actualOdometerKm) : undefined,
                cost: completeDraft.cost ? Number(completeDraft.cost) : undefined,
            });
            setCompletingRecord(null);
            setCompleteDraft({ actualDate: '', actualOdometerKm: '', cost: '' });
            await loadData();
        } catch (err) {
            // C9: ошибка отметки ТО больше не молчит (была без toast, в отличие от DowntimeRecordsTable).
            console.error('Failed to mark maintenance done', err);
            toast({ variant: 'error', title: 'Не удалось отметить ТО', description: (err as Error)?.message });
        } finally {
            setSubmitting(false);
        }
    }

    const columns: Column<MaintenanceRecord>[] = [
        {
            id: 'vehicle',
            header: 'ТС',
            accessor: (r) => r.vehicle?.plateNumber || r.vehicleId,
            cell: (r) => (
                <span className="font-medium text-neutral-800">{r.vehicle?.plateNumber || r.vehicleId}</span>
            ),
            sortable: true,
            sticky: 'left',
            minWidth: '140px',
        },
        {
            id: 'maintenanceType',
            header: 'Вид ТО',
            accessor: (r) => MAINTENANCE_TYPE_LABELS[r.maintenanceType] ?? r.maintenanceType,
            sortable: true,
            width: '120px',
        },
        {
            id: 'plannedDate',
            header: 'Плановая дата',
            accessor: (r) => r.plannedDate ?? '',
            cell: (r) => <span className="text-neutral-600">{formatDate(r.plannedDate)}</span>,
            sortable: true,
            width: '150px',
        },
        {
            id: 'plannedOdometerKm',
            header: 'Плановый одометр',
            accessor: (r) => r.plannedOdometerKm ?? 0,
            cell: (r) => (
                <span className="text-neutral-600">
                    {r.plannedOdometerKm ? `${Number(r.plannedOdometerKm).toLocaleString('ru-RU')} км` : '—'}
                </span>
            ),
            sortable: true,
            align: 'right',
            width: '160px',
        },
        {
            id: 'status',
            header: 'Статус',
            accessor: (r) => r.computedStatus || r.status,
            cell: (r) => {
                const visualStatus = r.computedStatus || r.status;
                return (
                    <Pill tone={STATUS_TONES[visualStatus] ?? 'neutral'}>
                        {STATUS_LABELS[visualStatus] ?? visualStatus}
                    </Pill>
                );
            },
            sortable: true,
            width: '130px',
        },
        {
            id: 'actualDate',
            header: 'Факт',
            accessor: (r) => r.actualDate ?? '',
            cell: (r) => <span className="text-neutral-600">{r.actualDate ? formatDate(r.actualDate) : '—'}</span>,
            sortable: true,
            width: '130px',
        },
        {
            id: 'cost',
            header: 'Стоимость',
            accessor: (r) => (r.cost ? Number(r.cost) : 0),
            cell: (r) => <span className="text-neutral-600">{r.cost ? formatMoney(r.cost) : '—'}</span>,
            sortable: true,
            align: 'right',
            width: '130px',
        },
        {
            id: 'contractor',
            header: 'Подрядчик',
            accessor: (r) => r.contractor ?? '',
            cell: (r) => <span className="text-neutral-600">{r.contractor || '—'}</span>,
            minWidth: '160px',
        },
    ];

    const hasFilters = !!(filters.vehicleId || filters.status || filters.maintenanceType);

    return (
        <div className="space-y-4 p-4">
            <DataTable<MaintenanceRecord>
                tableId="fleet-maintenance-schedule"
                data={rows}
                columns={columns}
                keyField="id"
                loading={loading}
                searchPlaceholder="Поиск по ТС, подрядчику…"
                searchKeys={['vehicle', 'contractor', 'maintenanceType']}
                searchPredicate={(r, q) => {
                    const plate = (r.vehicle?.plateNumber || r.vehicleId || '').toLowerCase();
                    const contractor = (r.contractor || '').toLowerCase();
                    const type = (MAINTENANCE_TYPE_LABELS[r.maintenanceType] ?? r.maintenanceType ?? '').toLowerCase();
                    return plate.includes(q) || contractor.includes(q) || type.includes(q);
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
                        id: 'status',
                        label: 'Статус',
                        value: filters.status,
                        onChange: (value) => setFilters((prev) => ({ ...prev, status: value })),
                        options: Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })),
                    },
                    {
                        id: 'maintenanceType',
                        label: 'Вид ТО',
                        value: filters.maintenanceType,
                        onChange: (value) => setFilters((prev) => ({ ...prev, maintenanceType: value })),
                        options: Object.entries(MAINTENANCE_TYPE_LABELS).map(([value, label]) => ({ value, label })),
                    },
                ]}
                toolbar={
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            leftIcon={<RefreshCw className="w-4 h-4" />}
                            onClick={() => loadData()}
                        >
                            Обновить
                        </Button>
                        <Button
                            variant="brand"
                            leftIcon={<Wrench className="w-4 h-4" />}
                            onClick={() => setShowAddModal(true)}
                        >
                            Запланировать ТО
                        </Button>
                    </div>
                }
                rowActions={(row) => {
                    const visualStatus = row.computedStatus || row.status;
                    if (visualStatus !== 'planned' && visualStatus !== 'overdue') return [];
                    return [
                        {
                            id: 'complete',
                            label: 'Отметить ТО выполненным',
                            icon: <CheckCircle2 className="w-4 h-4" />,
                            onClick: () => openComplete(row),
                        },
                    ];
                }}
                emptyState={
                    <EmptyState
                        icon={Wrench}
                        title={hasFilters ? 'По фильтрам ничего не найдено' : 'План ТО пуст'}
                        description={hasFilters ? 'Попробуйте сбросить фильтры.' : 'Запланируйте первое ТО, чтобы не пропустить регламентные работы.'}
                        tone="brand"
                        action={!hasFilters ? (
                            <Button variant="brand" leftIcon={<Wrench className="w-4 h-4" />} onClick={() => setShowAddModal(true)}>
                                Запланировать ТО
                            </Button>
                        ) : undefined}
                    />
                }
                pageSize={50}
            />

            <AddMaintenanceModal open={showAddModal} onClose={() => setShowAddModal(false)} onCreated={loadData} />

            <Dialog
                open={!!completingRecord}
                onClose={closeComplete}
                title="Отметить ТО выполненным"
                description={completingRecord ? `${completingRecord.vehicle?.plateNumber || completingRecord.vehicleId} · ${MAINTENANCE_TYPE_LABELS[completingRecord.maintenanceType] ?? completingRecord.maintenanceType}` : undefined}
            >
                {completingRecord && (
                    <div className="space-y-4">
                        <div className="space-y-3">
                            <div>
                                <label className="mb-1 block text-xs font-medium text-neutral-600">Дата ТО</label>
                                <Input
                                    type="date"
                                    value={completeDraft.actualDate}
                                    onChange={(e) => setCompleteDraft((prev) => ({ ...prev, actualDate: e.target.value }))}
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-medium text-neutral-600">Пробег, км</label>
                                <Input
                                    type="number"
                                    min="0"
                                    placeholder="Например, 125000"
                                    value={completeDraft.actualOdometerKm}
                                    onChange={(e) => setCompleteDraft((prev) => ({ ...prev, actualOdometerKm: e.target.value }))}
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-medium text-neutral-600">Стоимость, ₽</label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    placeholder="Например, 12500"
                                    value={completeDraft.cost}
                                    onChange={(e) => setCompleteDraft((prev) => ({ ...prev, cost: e.target.value }))}
                                />
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 pt-2">
                            <Button variant="outline" onClick={closeComplete} disabled={submitting}>
                                Отмена
                            </Button>
                            <Button onClick={submitComplete} isLoading={submitting}>
                                Сохранить
                            </Button>
                        </div>
                    </div>
                )}
            </Dialog>
        </div>
    );
}
