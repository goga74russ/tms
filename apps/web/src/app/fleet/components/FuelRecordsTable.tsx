'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, Fuel } from 'lucide-react';
import { api } from '@/lib/api';
import { AddFuelRecordModal } from './AddFuelRecordModal';
import { formatDateTime, formatMoney, getRowRecord } from './deepFleetShared';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';

type FuelRow = {
    id: string;
    vehicleId: string;
    driverId?: string | null;
    tripId?: string | null;
    recordedAt: string;
    liters: number | string;
    totalCost: number | string;
    fuelType: string;
    station?: string | null;
    odometerAtFill?: number | null;
};

type DisplayRow = {
    id: string;
    record: FuelRow;
    vehiclePlate: string;
    driverName: string;
    raw: any;
};

const FUEL_TYPE_LABELS: Record<string, string> = {
    diesel: 'Дизель',
    petrol: 'Бензин',
    gas: 'Газ',
    adblue: 'AdBlue',
};

export function FuelRecordsTable() {
    const [rows, setRows] = useState<any[]>([]);
    const [vehicles, setVehicles] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [filters, setFilters] = useState({
        vehicleId: '',
        dateFrom: '',
        dateTo: '',
        fuelType: '',
    });

    async function loadData() {
        setLoading(true);
        try {
            const query = new URLSearchParams();
            if (filters.vehicleId) query.set('vehicleId', filters.vehicleId);
            if (filters.dateFrom) query.set('dateFrom', new Date(`${filters.dateFrom}T00:00:00`).toISOString());
            if (filters.dateTo) query.set('dateTo', new Date(`${filters.dateTo}T23:59:59`).toISOString());
            const [fuelRes, vehiclesRes] = await Promise.all([
                api.get<any>(`/fleet/fuel-records?${query.toString()}`),
                api.get<any>('/fleet/vehicles?limit=200'),
            ]);
            let data = fuelRes.data || [];
            if (filters.fuelType) {
                data = data.filter((row: any) => getRowRecord<FuelRow>(row, 'fuel_records').fuelType === filters.fuelType);
            }
            setRows(data);
            setVehicles(vehiclesRes.data || []);
        } catch (err) {
            console.error('Failed to load fuel records', err);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadData();
    }, [filters.vehicleId, filters.dateFrom, filters.dateTo, filters.fuelType]);

    const displayRows = useMemo<DisplayRow[]>(() => rows.map((row: any) => {
        const record = getRowRecord<FuelRow>(row, 'fuel_records');
        const vehicle = row.vehicles;
        const driver = row.drivers;
        return {
            id: record.id,
            record,
            vehiclePlate: vehicle?.plateNumber || record.vehicleId,
            driverName: driver?.fullName || driver?.name || '',
            raw: row,
        };
    }), [rows]);

    const summary = useMemo(() => rows.reduce((acc, row) => {
        const record = getRowRecord<FuelRow>(row, 'fuel_records');
        acc.liters += Number(record.liters || 0);
        acc.totalCost += Number(record.totalCost || 0);
        return acc;
    }, { liters: 0, totalCost: 0 }), [rows]);

    const hasFilters = !!(filters.vehicleId || filters.dateFrom || filters.dateTo || filters.fuelType);

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
            minWidth: '120px',
        },
        {
            id: 'driver',
            header: 'Водитель',
            accessor: (r) => r.driverName,
            cell: (r) => <span className="text-neutral-600">{r.driverName || <span className="text-neutral-400">—</span>}</span>,
            sortable: true,
            minWidth: '160px',
        },
        {
            id: 'liters',
            header: 'Литры',
            accessor: (r) => Number(r.record.liters || 0),
            cell: (r) => (
                <span className="text-neutral-600">
                    {Number(r.record.liters).toLocaleString('ru-RU', { maximumFractionDigits: 2 })}
                </span>
            ),
            sortable: true,
            align: 'right',
            width: '110px',
        },
        {
            id: 'fuelType',
            header: 'Тип',
            accessor: (r) => FUEL_TYPE_LABELS[r.record.fuelType] ?? r.record.fuelType,
            cell: (r) => <span className="text-neutral-600">{FUEL_TYPE_LABELS[r.record.fuelType] ?? r.record.fuelType}</span>,
            sortable: true,
            width: '110px',
        },
        {
            id: 'totalCost',
            header: 'Стоимость',
            accessor: (r) => Number(r.record.totalCost || 0),
            cell: (r) => <span className="text-neutral-600">{formatMoney(r.record.totalCost)}</span>,
            sortable: true,
            align: 'right',
            width: '140px',
        },
        {
            id: 'station',
            header: 'АЗС',
            accessor: (r) => r.record.station ?? '',
            cell: (r) => <span className="text-neutral-600">{r.record.station || <span className="text-neutral-400">—</span>}</span>,
            sortable: true,
            minWidth: '140px',
        },
        {
            id: 'odometer',
            header: 'Одометр',
            accessor: (r) => r.record.odometerAtFill ?? 0,
            cell: (r) => (
                <span className="text-neutral-600">
                    {r.record.odometerAtFill ? `${Number(r.record.odometerAtFill).toLocaleString('ru-RU')} км` : <span className="text-neutral-400">—</span>}
                </span>
            ),
            sortable: true,
            align: 'right',
            width: '130px',
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
        <div className="space-y-4 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-600">
                    <span className="text-xs uppercase tracking-wide text-neutral-500">Период:</span>
                    <input
                        type="date"
                        value={filters.dateFrom}
                        onChange={(e) => setFilters((prev) => ({ ...prev, dateFrom: e.target.value }))}
                        className="h-9 rounded-lg border border-neutral-200 px-3 text-sm"
                        aria-label="Дата с"
                    />
                    <span className="text-neutral-400">—</span>
                    <input
                        type="date"
                        value={filters.dateTo}
                        onChange={(e) => setFilters((prev) => ({ ...prev, dateTo: e.target.value }))}
                        className="h-9 rounded-lg border border-neutral-200 px-3 text-sm"
                        aria-label="Дата по"
                    />
                    {(filters.dateFrom || filters.dateTo) && (
                        <button
                            type="button"
                            onClick={() => setFilters((prev) => ({ ...prev, dateFrom: '', dateTo: '' }))}
                            className="text-xs text-neutral-500 hover:text-neutral-700 underline"
                        >
                            Сбросить
                        </button>
                    )}
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3">
                    <p className="text-xs uppercase tracking-wide text-neutral-500">Итог за период</p>
                    <p className="mt-1 text-2xl font-bold text-neutral-900">
                        {summary.liters.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} л
                    </p>
                </div>
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3">
                    <p className="text-xs uppercase tracking-wide text-neutral-500">Стоимость</p>
                    <p className="mt-1 text-2xl font-bold text-neutral-900">{formatMoney(summary.totalCost)}</p>
                </div>
            </div>

            <DataTable<DisplayRow>
                tableId="fleet-fuel-records"
                data={displayRows}
                columns={columns}
                keyField="id"
                loading={loading}
                searchPlaceholder="Поиск по ТС, водителю, АЗС…"
                searchKeys={['vehicle', 'driver', 'station']}
                searchPredicate={(r, q) => {
                    const plate = r.vehiclePlate.toLowerCase();
                    const driver = r.driverName.toLowerCase();
                    const station = (r.record.station || '').toLowerCase();
                    return plate.includes(q) || driver.includes(q) || station.includes(q);
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
                        id: 'fuelType',
                        label: 'Топливо',
                        value: filters.fuelType,
                        onChange: (value) => setFilters((prev) => ({ ...prev, fuelType: value })),
                        options: Object.entries(FUEL_TYPE_LABELS).map(([value, label]) => ({ value, label })),
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
                            leftIcon={<Plus className="w-4 h-4" />}
                            onClick={() => setShowAddModal(true)}
                        >
                            Добавить заправку
                        </Button>
                    </div>
                }
                emptyState={
                    <EmptyState
                        icon={Fuel}
                        title={hasFilters ? 'По фильтрам ничего не найдено' : 'Заправок пока нет'}
                        description={hasFilters
                            ? 'Попробуйте изменить параметры периода или сбросить фильтры.'
                            : 'Зарегистрируйте первую заправку, чтобы отслеживать расход и затраты на топливо.'}
                        tone="brand"
                        action={!hasFilters ? (
                            <Button variant="brand" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setShowAddModal(true)}>
                                Добавить заправку
                            </Button>
                        ) : undefined}
                    />
                }
                pageSize={50}
            />

            <AddFuelRecordModal open={showAddModal} onClose={() => setShowAddModal(false)} onCreated={loadData} />
        </div>
    );
}
