'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { Plus, AlertTriangle } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { DataTable, type Column, Pill, type PillTone } from '@/components/ui/data-table';

interface Fine {
    id: string;
    vehicleId: string;
    driverId?: string;
    status: string;
    violationDate: string;
    violationType: string;
    amount: number | string;
    resolutionNumber?: string;
    paidAt?: string;
}

interface VehicleLink {
    id: string;
    plateNumber: string;
}

interface DriverLink {
    id: string;
    fullName?: string;
    name?: string;
}

function formatDate(d: string) {
    return new Date(d).toLocaleDateString('ru-RU');
}

function formatMoney(value: number | string) {
    const amount = typeof value === 'number' ? value : Number(value);
    return amount.toLocaleString('ru-RU') + ' ₽';
}

const STATUS_LABELS: Record<string, string> = {
    new: 'Новый',
    confirmed: 'Подтверждён',
    paid: 'Оплачен',
    appealed: 'Обжалован',
};

const STATUS_TONES: Record<string, PillTone> = {
    new: 'warning',
    confirmed: 'info',
    paid: 'success',
    appealed: 'brand',
};

export function FinesTable() {
    const [fines, setFines] = useState<Fine[]>([]);
    const [vehicles, setVehicles] = useState<VehicleLink[]>([]);
    const [drivers, setDrivers] = useState<DriverLink[]>([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({ status: '', vehicleId: '' });

    async function loadData() {
        setLoading(true);
        try {
            const query = new URLSearchParams({ limit: '50' });
            if (filters.status) query.set('status', filters.status);
            if (filters.vehicleId) query.set('vehicleId', filters.vehicleId);
            const [finesRes, vehiclesRes, driversRes] = await Promise.all([
                api.get<any>(`/fleet/fines?${query.toString()}`),
                api.get<any>('/fleet/vehicles?limit=200'),
                api.get<any>('/fleet/drivers?limit=200'),
            ]);
            setFines(finesRes.data || []);
            setVehicles(vehiclesRes.data || []);
            setDrivers(driversRes.data || []);
        } catch (err) {
            console.error('Failed to load fines:', err);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadData();
    }, [filters.status, filters.vehicleId]);

    const vehiclePlateById = useMemo(() => {
        const map = new Map<string, string>();
        for (const v of vehicles) map.set(v.id, v.plateNumber);
        return map;
    }, [vehicles]);

    const driverNameById = useMemo(() => {
        const map = new Map<string, string>();
        for (const d of drivers) map.set(d.id, d.fullName || d.name || '');
        return map;
    }, [drivers]);

    const totalAmount = useMemo(
        () => fines.reduce((sum, fine) => sum + Number(fine.amount || 0), 0),
        [fines],
    );
    const unpaidCount = useMemo(
        () => fines.filter((f) => f.status !== 'paid').length,
        [fines],
    );

    const columns: Column<Fine>[] = [
        {
            id: 'violationDate',
            header: 'Дата нарушения',
            accessor: (r) => r.violationDate,
            cell: (r) => <span className="text-neutral-600">{formatDate(r.violationDate)}</span>,
            sortable: true,
            width: '150px',
        },
        {
            id: 'vehicle',
            header: 'ТС',
            accessor: (r) => vehiclePlateById.get(r.vehicleId) || r.vehicleId,
            cell: (r) => (
                <span className="font-medium text-neutral-800">
                    {vehiclePlateById.get(r.vehicleId) || <span className="text-neutral-400">{r.vehicleId}</span>}
                </span>
            ),
            sortable: true,
            sticky: 'left',
            minWidth: '120px',
        },
        {
            id: 'driver',
            header: 'Водитель',
            accessor: (r) => (r.driverId ? driverNameById.get(r.driverId) || '' : ''),
            cell: (r) => {
                if (!r.driverId) return <span className="text-neutral-400">—</span>;
                const name = driverNameById.get(r.driverId);
                return <span className="text-neutral-600">{name || <span className="text-neutral-400">—</span>}</span>;
            },
            sortable: true,
            minWidth: '160px',
        },
        {
            id: 'violationType',
            header: 'Тип нарушения',
            accessor: (r) => r.violationType,
            cell: (r) => <span className="font-medium text-neutral-800">{r.violationType}</span>,
            sortable: true,
            minWidth: '180px',
        },
        {
            id: 'resolutionNumber',
            header: 'Номер постановления',
            accessor: (r) => r.resolutionNumber || '',
            cell: (r) => r.resolutionNumber
                ? <span className="text-neutral-500 text-xs">{r.resolutionNumber}</span>
                : <span className="text-neutral-400">—</span>,
            monospace: true,
            minWidth: '180px',
        },
        {
            id: 'amount',
            header: 'Сумма',
            accessor: (r) => Number(r.amount || 0),
            cell: (r) => <span className="font-semibold text-neutral-900">{formatMoney(r.amount)}</span>,
            sortable: true,
            align: 'right',
            width: '130px',
        },
        {
            id: 'status',
            header: 'Статус',
            accessor: (r) => STATUS_LABELS[r.status] || r.status,
            cell: (r) => (
                <Pill tone={STATUS_TONES[r.status] || 'neutral'}>
                    {STATUS_LABELS[r.status] || r.status}
                </Pill>
            ),
            sortable: true,
            width: '140px',
        },
        {
            id: 'paidAt',
            header: 'Дата оплаты',
            accessor: (r) => r.paidAt || '',
            cell: (r) => r.paidAt
                ? <span className="text-neutral-600">{formatDate(r.paidAt)}</span>
                : <span className="text-neutral-400">—</span>,
            sortable: true,
            width: '130px',
            hiddenByDefault: true,
        },
    ];

    return (
        <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3">
                    <p className="text-xs uppercase tracking-wide text-neutral-500">Всего штрафов</p>
                    <p className="mt-1 text-2xl font-bold text-neutral-900">{formatMoney(totalAmount)}</p>
                </div>
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3">
                    <p className="text-xs uppercase tracking-wide text-neutral-500">Неоплаченных</p>
                    <p className="mt-1 text-2xl font-bold text-neutral-900">{unpaidCount}</p>
                </div>
            </div>

            <DataTable<Fine>
                tableId="fleet-fines"
                data={fines}
                columns={columns}
                keyField="id"
                loading={loading}
                searchPlaceholder="Поиск по типу, ТС, постановлению…"
                searchKeys={['vehicle', 'violationType', 'resolutionNumber', 'driver']}
                filters={[
                    {
                        id: 'status',
                        label: 'Статус',
                        value: filters.status,
                        onChange: (value) => setFilters((prev) => ({ ...prev, status: value })),
                        options: Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })),
                    },
                    {
                        id: 'vehicleId',
                        label: 'ТС',
                        value: filters.vehicleId,
                        onChange: (value) => setFilters((prev) => ({ ...prev, vehicleId: value })),
                        options: vehicles.map((v) => ({ value: v.id, label: v.plateNumber })),
                    },
                ]}
                toolbar={
                    <Button
                        variant="brand"
                        leftIcon={<Plus className="w-4 h-4" />}
                        onClick={() => { /* TODO: модалка добавления штрафа */ }}
                    >
                        Добавить штраф
                    </Button>
                }
                emptyState={
                    <EmptyState
                        icon={AlertTriangle}
                        title="Штрафы не найдены"
                        description="Штрафы ГИБДД будут появляться здесь автоматически или при ручном добавлении."
                        tone="brand"
                    />
                }
                pageSize={50}
            />
        </div>
    );
}
