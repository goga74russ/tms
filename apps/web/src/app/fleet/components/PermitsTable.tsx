'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { Plus, ShieldCheck } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { DataTable, type Column, Pill, type PillTone } from '@/components/ui/data-table';
import { AddPermitModal } from './AddPermitModal';

interface Permit {
    id: string;
    vehicleId: string;
    zoneType: string;
    zoneName: string;
    permitNumber: string;
    validFrom: string;
    validUntil: string;
    isActive: boolean;
}

interface VehicleLink {
    id: string;
    plateNumber: string;
}

function formatDate(d: string) {
    return new Date(d).toLocaleDateString('ru-RU');
}

function daysUntil(d: string) {
    return Math.ceil((new Date(d).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

const zoneLabels: Record<string, string> = {
    mkad: 'МКАД',
    ttk: 'ТТК',
    city: 'Городская зона',
};

type Urgency = { tone: PillTone; label: string };

function urgencyForDays(days: number): Urgency {
    if (days < 0) return { tone: 'danger', label: `Просрочен ${Math.abs(days)} д.` };
    if (days < 7) return { tone: 'danger', label: `${days} д.` };
    if (days <= 30) return { tone: 'warning', label: `${days} д.` };
    return { tone: 'success', label: `${days} д.` };
}

export function PermitsTable() {
    const [permits, setPermits] = useState<Permit[]>([]);
    const [vehicles, setVehicles] = useState<VehicleLink[]>([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({ vehicleId: '', active: '' });
    const [addOpen, setAddOpen] = useState(false);

    async function loadData() {
        setLoading(true);
        try {
            const query = new URLSearchParams({ limit: '50' });
            if (filters.vehicleId) query.set('vehicleId', filters.vehicleId);
            if (filters.active) query.set('active', filters.active);
            const [permitsRes, vehiclesRes] = await Promise.all([
                api.get<any>(`/fleet/permits?${query.toString()}`),
                api.get<any>('/fleet/vehicles?limit=200'),
            ]);
            setPermits(permitsRes.data || []);
            setVehicles(vehiclesRes.data || []);
        } catch (err) {
            console.error('Failed to load permits:', err);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadData();
    }, [filters.vehicleId, filters.active]);

    const vehiclePlateById = useMemo(() => {
        const map = new Map<string, string>();
        for (const v of vehicles) map.set(v.id, v.plateNumber);
        return map;
    }, [vehicles]);

    const columns: Column<Permit>[] = [
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
            id: 'zone',
            header: 'Зона',
            accessor: (r) => `${zoneLabels[r.zoneType] || r.zoneType} ${r.zoneName}`,
            cell: (r) => (
                <span className="flex items-center gap-2">
                    <Pill tone="brand">{zoneLabels[r.zoneType] || r.zoneType}</Pill>
                    <span className="text-neutral-600">{r.zoneName}</span>
                </span>
            ),
            sortable: true,
            minWidth: '200px',
        },
        {
            id: 'permitNumber',
            header: 'Номер пропуска',
            accessor: (r) => r.permitNumber,
            sortable: true,
            monospace: true,
            minWidth: '160px',
        },
        {
            id: 'validFrom',
            header: 'Действует с',
            accessor: (r) => r.validFrom,
            cell: (r) => <span className="text-neutral-600">{formatDate(r.validFrom)}</span>,
            sortable: true,
            width: '130px',
        },
        {
            id: 'validUntil',
            header: 'Действует до',
            accessor: (r) => r.validUntil,
            cell: (r) => <span className="text-neutral-600">{formatDate(r.validUntil)}</span>,
            sortable: true,
            width: '130px',
        },
        {
            id: 'remaining',
            header: 'Осталось',
            accessor: (r) => daysUntil(r.validUntil),
            cell: (r) => {
                const u = urgencyForDays(daysUntil(r.validUntil));
                return <Pill tone={u.tone}>{u.label}</Pill>;
            },
            sortable: true,
            width: '140px',
        },
        {
            id: 'isActive',
            header: 'Статус',
            accessor: (r) => (r.isActive ? 1 : 0),
            cell: (r) => (
                <Pill tone={r.isActive ? 'success' : 'neutral'}>
                    {r.isActive ? 'Действует' : 'Неактивен'}
                </Pill>
            ),
            sortable: true,
            width: '120px',
        },
    ];

    return (
        <>
        <DataTable<Permit>
            tableId="fleet-permits"
            data={permits}
            columns={columns}
            keyField="id"
            loading={loading}
            searchPlaceholder="Поиск по номеру, зоне, ТС…"
            searchKeys={['vehicle', 'zone', 'permitNumber']}
            filters={[
                {
                    id: 'vehicleId',
                    label: 'ТС',
                    value: filters.vehicleId,
                    onChange: (value) => setFilters((prev) => ({ ...prev, vehicleId: value })),
                    options: vehicles.map((v) => ({ value: v.id, label: v.plateNumber })),
                },
                {
                    id: 'active',
                    label: 'Статус',
                    value: filters.active,
                    onChange: (value) => setFilters((prev) => ({ ...prev, active: value })),
                    options: [
                        { value: 'true', label: 'Действует' },
                        { value: 'false', label: 'Неактивен' },
                    ],
                },
            ]}
            toolbar={
                <Button
                    variant="brand"
                    leftIcon={<Plus className="w-4 h-4" />}
                    onClick={() => setAddOpen(true)}
                >
                    Добавить пропуск
                </Button>
            }
            emptyState={
                <EmptyState
                    icon={ShieldCheck}
                    title="Пропуска не найдены"
                    description="Добавьте пропуск МКАД, ТТК или городской зоны, чтобы планировать маршруты с ограничениями."
                    tone="brand"
                />
            }
            pageSize={50}
        />
        <AddPermitModal open={addOpen} onClose={() => setAddOpen(false)} onCreated={loadData} />
        </>
    );
}
