'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { Plus, Truck, History, ShieldOff, ShieldCheck, Edit2, Pencil, CheckCircle2, UserCheck, Wrench, AlertCircle, Ban, Download } from 'lucide-react';
import { VehicleCard } from './VehicleCard';
import { AddVehicleModal, type EditableVehicle } from './AddVehicleModal';
import { getVehicleProfile, getVehicleWaybillCue } from './vehicleProfile';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { DataTable, type Column, Pill, type PillTone } from '@/components/ui/data-table';
import { ConfirmDialog } from '@/components/ui/dialog';

type DeadlineColor = 'green' | 'yellow' | 'red' | 'blocked' | null;

interface Vehicle {
    id: string;
    plateNumber: string;
    vin: string;
    make: string;
    model: string;
    year: number;
    bodyType: string;
    payloadCapacityKg: number;
    status: string;
    currentOdometerKm: number;
    isArchived: boolean;
    deadlines: {
        techInspection: DeadlineColor;
        osago: DeadlineColor;
        maintenance: DeadlineColor;
        tachograph: DeadlineColor;
    };
    isBlocked: boolean;
}

interface TrailerLink {
    id: string;
    plateNumber: string;
    currentVehicleId?: string | null;
}

const STATUS_LABELS: Record<string, string> = {
    available: 'Доступен',
    assigned: 'Назначен',
    in_trip: 'В рейсе',
    maintenance: 'ТО/Ремонт',
    broken: 'Неисправен',
    blocked: 'Заблокирован',
};

const STATUS_TONES: Record<string, PillTone> = {
    available: 'success',
    assigned: 'info',
    in_trip: 'brand',
    maintenance: 'warning',
    broken: 'danger',
    blocked: 'neutral',
};

const STATUS_ICONS: Record<string, React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>> = {
    available: CheckCircle2,
    assigned: UserCheck,
    in_trip: Truck,
    maintenance: Wrench,
    broken: AlertCircle,
    blocked: Ban,
};

const BODY_TYPE_LABELS: Record<string, string> = {
    tent: 'Тент',
    isothermal: 'Изотерм',
    refrigerator: 'Рефрижератор',
    box: 'Фургон',
    open_platform: 'Бортовой',
    tank: 'Цистерна',
    container: 'Контейнеровоз',
    other: 'Другое',
};

function DeadlineDot({ color, label }: { color: DeadlineColor; label: string }) {
    if (!color) {
        const text = `${label}: нет данных`;
        return (
            <span
                className="w-3 h-3 rounded-full bg-neutral-200 inline-block"
                title={text}
                role="img"
                aria-label={text}
            />
        );
    }
    const colors: Record<string, string> = {
        green: 'bg-emerald-500',
        yellow: 'bg-amber-400',
        red: 'bg-red-500 animate-pulse',
        blocked: 'bg-red-700 animate-pulse',
    };
    const titles: Record<string, string> = {
        green: `${label}: >30 дней`,
        yellow: `${label}: 7–30 дней`,
        red: `${label}: <7 дней!`,
        blocked: `${label}: ПРОСРОЧЕН`,
    };
    return (
        <span
            className={`w-3 h-3 rounded-full inline-block ${colors[color]}`}
            title={titles[color]}
            role="img"
            aria-label={titles[color]}
        />
    );
}

function csvCell(value: unknown): string {
    let s = value === null || value === undefined ? '' : String(value);
    // B4.4: formula-injection guard — см. trips/page.tsx:csvCell.
    if (s.length > 0 && /^[=+\-@\t\r]/.test(s)) {
        s = "'" + s;
    }
    if (/[",;\n\r]/.test(s)) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}

function downloadCSV(filename: string, lines: string[]) {
    const csv = '﻿' + lines.join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

const DEADLINE_LABELS: Record<string, string> = {
    green: 'OK',
    yellow: 'скоро',
    red: 'срочно',
    blocked: 'просрочен',
};

function exportVehiclesCSV(rows: Vehicle[], trailersByVehicleId: Record<string, TrailerLink>) {
    const headers = ['Госномер', 'VIN', 'Марка', 'Модель', 'Год', 'Кузов', 'Грузоподъёмность (кг)', 'Пробег (км)', 'Прицеп', 'ТО', 'ОСАГО', 'Техосмотр', 'Тахограф', 'Статус', 'Заблокирован'];
    const lines = [
        headers.map(csvCell).join(','),
        ...rows.map(v => {
            const trailer = trailersByVehicleId[v.id];
            return [
                v.plateNumber,
                v.vin,
                v.make,
                v.model,
                v.year,
                BODY_TYPE_LABELS[v.bodyType] ?? v.bodyType,
                v.payloadCapacityKg,
                v.currentOdometerKm,
                trailer?.plateNumber ?? '',
                v.deadlines.maintenance ? DEADLINE_LABELS[v.deadlines.maintenance] ?? v.deadlines.maintenance : '',
                v.deadlines.osago ? DEADLINE_LABELS[v.deadlines.osago] ?? v.deadlines.osago : '',
                v.deadlines.techInspection ? DEADLINE_LABELS[v.deadlines.techInspection] ?? v.deadlines.techInspection : '',
                v.deadlines.tachograph ? DEADLINE_LABELS[v.deadlines.tachograph] ?? v.deadlines.tachograph : '',
                STATUS_LABELS[v.status] ?? v.status,
                v.isBlocked ? 'да' : 'нет',
            ].map(csvCell).join(',');
        }),
    ];
    downloadCSV(`vehicles-${new Date().toISOString().split('T')[0]}.csv`, lines);
}

export function VehiclesTable() {
    const { toast } = useToast();
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [trailersByVehicleId, setTrailersByVehicleId] = useState<Record<string, TrailerLink>>({});
    const [loading, setLoading] = useState(true);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingVehicle, setEditingVehicle] = useState<EditableVehicle | null>(null);
    const [statusFilter, setStatusFilter] = useState('');
    const [bodyTypeFilter, setBodyTypeFilter] = useState('');
    const [confirmAction, setConfirmAction] = useState<null | { run: () => Promise<void> | void; title: string; description?: string; destructive?: boolean; confirmLabel?: string }>(null);

    const loadVehicles = useCallback(async () => {
        setLoading(true);
        try {
            const result = await api.get<any>(`/fleet/vehicles?limit=200`);
            setVehicles(result.data || []);
        } catch (err) {
            console.error('Failed to load vehicles:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadVehicles();
    }, [loadVehicles]);

    useEffect(() => {
        (async () => {
            try {
                const result = await api.get<any>('/fleet/trailers?limit=200');
                const map: Record<string, TrailerLink> = {};
                for (const trailer of result.data || []) {
                    if (trailer.currentVehicleId) {
                        map[trailer.currentVehicleId] = {
                            id: trailer.id,
                            plateNumber: trailer.plateNumber,
                            currentVehicleId: trailer.currentVehicleId,
                        };
                    }
                }
                setTrailersByVehicleId(map);
            } catch (err) {
                console.error('Failed to load trailers for vehicles table:', err);
            }
        })();
    }, []);

    if (selectedId) {
        return (
            <VehicleCard
                vehicleId={selectedId}
                onBack={() => { setSelectedId(null); loadVehicles(); }}
            />
        );
    }

    const filtered = vehicles.filter(v => {
        if (statusFilter && v.status !== statusFilter) return false;
        if (bodyTypeFilter && v.bodyType !== bodyTypeFilter) return false;
        return true;
    });

    async function openEditModal(v: Vehicle) {
        try {
            const result = await api.get<any>(`/fleet/vehicles/${v.id}`);
            const full = result.data || result;
            setEditingVehicle({
                id: full.id,
                plateNumber: full.plateNumber,
                vin: full.vin,
                make: full.make,
                model: full.model,
                year: full.year,
                bodyType: full.bodyType,
                payloadCapacityKg: full.payloadCapacityKg,
                payloadVolumeM3: full.payloadVolumeM3,
                fuelTankLiters: full.fuelTankLiters,
                fuelNormPer100Km: full.fuelNormPer100Km,
                adrEquipped: full.adrEquipped,
            });
        } catch (err: any) {
            toast({ variant: 'error', title: 'Ошибка', description: err?.message ?? 'Не удалось загрузить ТС' });
        }
    }

    async function toggleBlock(v: Vehicle, block: boolean) {
        try {
            await api.put(`/fleet/vehicles/${v.id}`, { isBlocked: block });
            toast({ variant: 'success', title: block ? 'ТС заблокировано' : 'Блокировка снята' });
            await loadVehicles();
        } catch (err: any) {
            toast({ variant: 'error', title: 'Ошибка', description: err?.message ?? 'Не удалось обновить' });
        }
    }

    async function blockSelected(rows: Vehicle[]) {
        const toBlock = rows.filter(r => !r.isBlocked);
        if (toBlock.length === 0) return;
        setConfirmAction({
            run: async () => {
                try {
                    await Promise.all(toBlock.map(r => api.put(`/fleet/vehicles/${r.id}`, { isBlocked: true })));
                    toast({ variant: 'success', title: `Заблокировано: ${toBlock.length}` });
                    await loadVehicles();
                } catch (err: any) {
                    toast({ variant: 'error', title: 'Ошибка', description: err?.message ?? 'Не удалось обновить' });
                }
            },
            title: `Заблокировать ${toBlock.length} ТС?`,
            destructive: true,
            confirmLabel: 'Заблокировать',
        });
    }

    const columns: Column<Vehicle>[] = [
        {
            id: 'plateNumber',
            header: 'Госномер',
            accessor: (r) => r.plateNumber,
            cell: (r) => (
                <span className="font-mono font-semibold text-neutral-900">
                    {r.plateNumber}
                </span>
            ),
            sortable: true,
            sticky: 'left',
            minWidth: '140px',
        },
        {
            id: 'makeModel',
            header: 'Марка / Модель',
            accessor: (r) => `${r.make} ${r.model}`,
            cell: (r) => (
                <span>
                    <span className="font-medium text-neutral-800">{r.make}</span>{' '}
                    <span className="text-neutral-500">{r.model}</span>
                    <span className="text-neutral-400 ml-1">({r.year})</span>
                </span>
            ),
            minWidth: '180px',
        },
        {
            id: 'bodyType',
            header: 'Вид ТС',
            accessor: (r) => r.bodyType,
            cell: (r) => {
                const trailer = trailersByVehicleId[r.id] || null;
                const profile = getVehicleProfile(r.bodyType, r.payloadCapacityKg);
                const waybillCue = getVehicleWaybillCue(r.bodyType, r.payloadCapacityKg, {
                    trailerPlate: trailer?.plateNumber || null,
                    isBlocked: r.isBlocked,
                });
                return (
                    <div className="flex flex-col">
                        <span className="font-medium text-neutral-800 text-sm">{profile.classLabel}</span>
                        <span className="text-xs text-neutral-400">{profile.bodyLabel}</span>
                        <span
                            className={`mt-1 inline-flex w-fit rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                waybillCue.tone === 'warning'
                                    ? 'bg-rose-100 text-rose-700'
                                    : waybillCue.tone === 'attention'
                                        ? 'bg-amber-100 text-amber-700'
                                        : 'bg-emerald-100 text-emerald-700'
                            }`}
                        >
                            {waybillCue.tone === 'ready' ? 'ПЛ готов' : waybillCue.tone === 'attention' ? 'ПЛ: нужна проверка' : 'ПЛ: блок'}
                        </span>
                    </div>
                );
            },
            minWidth: '180px',
        },
        {
            id: 'trailer',
            header: 'Прицеп',
            accessor: (r) => trailersByVehicleId[r.id]?.plateNumber ?? '',
            cell: (r) => {
                const trailer = trailersByVehicleId[r.id] || null;
                return trailer ? (
                    <div className="flex flex-col">
                        <span className="font-medium text-neutral-800 text-sm">{trailer.plateNumber}</span>
                        <span className="text-xs text-neutral-400">закреплён</span>
                    </div>
                ) : <span className="text-neutral-400">—</span>;
            },
            width: '140px',
        },
        {
            id: 'payloadCapacityKg',
            header: 'Грузоподъёмность',
            accessor: (r) => r.payloadCapacityKg,
            cell: (r) => <span className="text-neutral-600 text-sm">{(r.payloadCapacityKg / 1000).toFixed(1)} т</span>,
            sortable: true,
            align: 'right',
            width: '160px',
        },
        {
            id: 'currentOdometerKm',
            header: 'Пробег',
            accessor: (r) => r.currentOdometerKm,
            cell: (r) => <span className="text-neutral-600 text-sm">{r.currentOdometerKm.toLocaleString('ru-RU')} км</span>,
            sortable: true,
            align: 'right',
            width: '130px',
        },
        {
            id: 'status',
            header: 'Статус',
            accessor: (r) => STATUS_LABELS[r.status] ?? r.status,
            cell: (r) => (
                <Pill tone={STATUS_TONES[r.status] ?? 'neutral'} icon={STATUS_ICONS[r.status]}>
                    {STATUS_LABELS[r.status] ?? r.status}
                </Pill>
            ),
            width: '140px',
        },
        {
            id: 'deadlines',
            header: 'Сроки',
            align: 'center',
            cell: (r) => (
                <div className="flex items-center justify-center gap-1.5" title="ТО / ОСАГО / Техосмотр / Тахограф">
                    <DeadlineDot color={r.deadlines.maintenance} label="ТО" />
                    <DeadlineDot color={r.deadlines.osago} label="ОСАГО" />
                    <DeadlineDot color={r.deadlines.techInspection} label="Техосмотр" />
                    <DeadlineDot color={r.deadlines.tachograph} label="Тахограф" />
                </div>
            ),
            width: '120px',
        },
    ];

    return (
        <>
            <div>
                {/* Legend */}
                <div className="px-4 py-2 bg-neutral-50 border-b border-neutral-200 flex items-center gap-4 text-xs text-neutral-500">
                    <span>Светофор сроков:</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> &gt;30д</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" /> 7–30д</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> &lt;7д</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-700" /> просрочен</span>
                </div>

                <DataTable<Vehicle>
                    tableId="fleet-vehicles"
                    data={filtered}
                    columns={columns}
                    keyField="id"
                    loading={loading}
                    searchPlaceholder="Поиск по номеру, марке, VIN…"
                    searchKeys={['plateNumber', 'make', 'model', 'vin']}
                    filters={[
                        {
                            id: 'status',
                            label: 'Статус',
                            value: statusFilter,
                            onChange: setStatusFilter,
                            options: Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })),
                        },
                        {
                            id: 'bodyType',
                            label: 'Вид ТС',
                            value: bodyTypeFilter,
                            onChange: setBodyTypeFilter,
                            options: Object.entries(BODY_TYPE_LABELS).map(([value, label]) => ({ value, label })),
                        },
                    ]}
                    toolbar={
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                leftIcon={<Download className="w-4 h-4" />}
                                onClick={() => exportVehiclesCSV(filtered, trailersByVehicleId)}
                                disabled={filtered.length === 0}
                                title={filtered.length === 0 ? 'Нет данных для экспорта' : `Экспортировать ${filtered.length} записей`}
                            >
                                Экспорт CSV
                            </Button>
                            <Button variant="brand" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setShowAddModal(true)}>
                                Добавить ТС
                            </Button>
                        </div>
                    }
                    onRowClick={(row) => setSelectedId(row.id)}
                    rowClassName={(row) => row.isBlocked ? 'bg-red-50/40' : ''}
                    bulkActions={(rows) => (
                        <Button
                            size="sm"
                            variant="outline"
                            leftIcon={<ShieldOff className="w-3.5 h-3.5" />}
                            onClick={() => blockSelected(rows)}
                        >
                            Заблокировать ({rows.filter(r => !r.isBlocked).length})
                        </Button>
                    )}
                    rowActions={(row) => [
                        {
                            id: 'edit-vehicle',
                            label: 'Редактировать',
                            icon: <Pencil className="w-4 h-4" />,
                            onClick: () => openEditModal(row),
                        },
                        {
                            id: 'edit',
                            label: 'Открыть карточку',
                            icon: <Edit2 className="w-4 h-4" />,
                            onClick: () => setSelectedId(row.id),
                        },
                        {
                            id: 'toggle-block',
                            label: row.isBlocked ? 'Снять блокировку' : 'Заблокировать',
                            icon: row.isBlocked ? <ShieldCheck className="w-4 h-4" /> : <ShieldOff className="w-4 h-4" />,
                            onClick: () => toggleBlock(row, !row.isBlocked),
                            tone: row.isBlocked ? 'default' : 'danger',
                        },
                        {
                            id: 'history',
                            label: 'История одометра',
                            icon: <History className="w-4 h-4" />,
                            onClick: () => setSelectedId(row.id),
                        },
                    ]}
                    emptyState={
                        <EmptyState
                            icon={Truck}
                            title="Транспортные средства не найдены"
                            description={statusFilter || bodyTypeFilter ? 'Попробуйте сбросить фильтры.' : 'Добавьте первое ТС, чтобы начать.'}
                            tone="brand"
                            action={!statusFilter && !bodyTypeFilter ? (
                                <Button variant="brand" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setShowAddModal(true)}>
                                    Добавить ТС
                                </Button>
                            ) : undefined}
                        />
                    }
                    pageSize={50}
                />
            </div>

            {showAddModal && (
                <AddVehicleModal
                    onClose={() => setShowAddModal(false)}
                    onCreated={() => { setShowAddModal(false); loadVehicles(); }}
                />
            )}

            {editingVehicle && (
                <AddVehicleModal
                    editingVehicle={editingVehicle}
                    onClose={() => setEditingVehicle(null)}
                    onCreated={() => { setEditingVehicle(null); loadVehicles(); }}
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
        </>
    );
}
