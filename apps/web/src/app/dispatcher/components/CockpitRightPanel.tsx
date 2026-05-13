'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, Thermometer, Truck, AlertTriangle, CheckCircle2, Search } from 'lucide-react';
import { AssignmentPanel, type AssignmentWindows } from './AssignmentPanel';
import type { Vehicle, UnassignedOrder } from '../page';

export type ColdChainBreach = {
    tripId: string;
    tripNumber: string;
    breachCount: number;
    minC: number | null;
    maxC: number | null;
    lastAt: string | null;
};

interface CockpitRightPanelProps {
    orders: UnassignedOrder[];
    availableVehicles: Vehicle[];
    vehiclesOnMap: Vehicle[];
    selectedVehicle: string | null;
    onSelectVehicle: (id: string) => void;
    vehicleSearch: string;
    onVehicleSearchChange: (v: string) => void;
    vehicleStatusFilter: string;
    onVehicleStatusFilterChange: (v: string) => void;
    coldChainBreaches: ColdChainBreach[];
    onAssign: (orderId: string, vehicleId: string, windows?: AssignmentWindows) => Promise<void>;
}

const STATUS_DOT: Record<string, string> = {
    available: 'bg-emerald-500',
    assigned: 'bg-amber-500',
    in_trip: 'bg-blue-500',
    broken: 'bg-red-500',
    maintenance: 'bg-neutral-400',
};

const STATUS_LABEL: Record<string, string> = {
    available: 'Свободен',
    assigned: 'Назначен',
    in_trip: 'В рейсе',
    broken: 'Неисправ.',
    maintenance: 'ТО',
};

export function CockpitRightPanel({
    orders,
    availableVehicles,
    vehiclesOnMap,
    selectedVehicle,
    onSelectVehicle,
    vehicleSearch,
    onVehicleSearchChange,
    vehicleStatusFilter,
    onVehicleStatusFilterChange,
    coldChainBreaches,
    onAssign,
}: CockpitRightPanelProps) {
    const router = useRouter();
    const [assignOpen, setAssignOpen] = useState(true);
    const [vehiclesOpen, setVehiclesOpen] = useState(true);
    const [coldOpen, setColdOpen] = useState(coldChainBreaches.length > 0);

    const sectionHeader = (
        open: boolean,
        toggle: () => void,
        label: string,
        count: number | string,
        Icon: typeof Truck,
        toneClass: string,
    ) => (
        <button
            type="button"
            onClick={toggle}
            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-neutral-50 border-b border-neutral-100 transition-colors bg-neutral-50/60"
        >
            {open ? <ChevronDown className="w-3 h-3 text-neutral-400" /> : <ChevronRight className="w-3 h-3 text-neutral-400" />}
            <Icon className={`w-3.5 h-3.5 ${toneClass}`} />
            <span className="text-xs font-semibold uppercase tracking-wide text-neutral-600 flex-1 text-left">{label}</span>
            <span className="tabular-nums text-[11px] font-medium text-neutral-500">{count}</span>
        </button>
    );

    return (
        <aside className="w-[360px] shrink-0 border-l border-neutral-200 bg-white flex flex-col h-full overflow-hidden">
            <div className="flex-1 overflow-y-auto">
                {/* Назначение */}
                <div>
                    {sectionHeader(assignOpen, () => setAssignOpen(o => !o), 'Назначение', orders.length, Truck, 'text-emerald-600')}
                    {assignOpen && (
                        <div className="p-2" data-tour="dispatcher-orders" data-tour-secondary="dispatcher-new-order" id="dispatcher-orders-anchor">
                            <AssignmentPanel
                                orders={orders}
                                vehicles={availableVehicles}
                                onAssign={onAssign}
                            />
                        </div>
                    )}
                </div>

                {/* Транспорт */}
                <div>
                    {sectionHeader(vehiclesOpen, () => setVehiclesOpen(o => !o), 'Транспорт', vehiclesOnMap.length, Truck, 'text-blue-600')}
                    {vehiclesOpen && (
                        <div className="px-2 py-2">
                            <div className="flex gap-1.5 mb-2">
                                <div className="relative flex-1">
                                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-neutral-400" />
                                    <input
                                        type="text"
                                        value={vehicleSearch}
                                        onChange={e => onVehicleSearchChange(e.target.value)}
                                        placeholder="Номер, водитель..."
                                        className="w-full pl-6 pr-2 py-1 text-[11px] border border-neutral-200 rounded-md bg-neutral-50 focus:outline-none focus:ring-1 focus:ring-emerald-300"
                                    />
                                </div>
                                <select
                                    value={vehicleStatusFilter}
                                    onChange={e => onVehicleStatusFilterChange(e.target.value)}
                                    className="text-[11px] border border-neutral-200 rounded-md px-1.5 py-1 bg-neutral-50 focus:outline-none focus:ring-1 focus:ring-emerald-300"
                                >
                                    <option value="">Все</option>
                                    <option value="available">Своб.</option>
                                    <option value="assigned">Назнач.</option>
                                    <option value="in_trip">В рейсе</option>
                                    <option value="broken">Неиспр.</option>
                                </select>
                            </div>
                            <div className="space-y-0.5 max-h-[280px] overflow-y-auto">
                                {vehiclesOnMap.length === 0 ? (
                                    <div className="px-2 py-4 text-center text-[11px] text-neutral-400 italic">
                                        Нет ТС с координатами
                                    </div>
                                ) : (
                                    vehiclesOnMap.map(v => (
                                        <button
                                            key={v.id}
                                            type="button"
                                            onClick={() => onSelectVehicle(v.id)}
                                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors text-xs ${
                                                selectedVehicle === v.id
                                                    ? 'bg-emerald-50 border border-emerald-200'
                                                    : 'hover:bg-neutral-50 border border-transparent'
                                            }`}
                                        >
                                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[v.status] || 'bg-neutral-400'}`} />
                                            <div className="min-w-0 flex-1">
                                                <div className="font-mono font-semibold text-neutral-900 truncate">{v.plateNumber}</div>
                                                <div className="text-[10px] text-neutral-500 truncate">
                                                    {v.driverName || `${v.make} ${v.model}`}
                                                </div>
                                            </div>
                                            <span className="text-[10px] text-neutral-400 shrink-0">{STATUS_LABEL[v.status] || v.status}</span>
                                        </button>
                                    ))
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Cold chain */}
                {coldChainBreaches.length > 0 && (
                    <div>
                        {sectionHeader(coldOpen, () => setColdOpen(o => !o), 'Холодовая цепь', coldChainBreaches.length, Thermometer, 'text-rose-600')}
                        {coldOpen && (
                            <div className="px-2 py-2 space-y-1">
                                {coldChainBreaches.map(item => (
                                    <a
                                        key={item.tripId}
                                        href={`/trips?focus=${item.tripId}`}
                                        onClick={(e) => {
                                            e.preventDefault();
                                            router.push(`/trips?focus=${item.tripId}`);
                                        }}
                                        className="block rounded-md border border-rose-200 bg-rose-50/60 px-2 py-1.5 hover:bg-rose-100 transition-colors"
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-xs font-semibold text-rose-800 font-mono">#{item.tripNumber}</span>
                                            <span className="inline-flex items-center gap-0.5 rounded-full bg-rose-200 px-1.5 py-0.5 text-[10px] font-semibold text-rose-800">
                                                <AlertTriangle className="w-2.5 h-2.5" />
                                                {item.breachCount}
                                            </span>
                                        </div>
                                        <div className="text-[10px] text-rose-700 mt-0.5">
                                            мин {item.minC !== null ? `${item.minC.toFixed(1)}°` : '—'} / макс {item.maxC !== null ? `${item.maxC.toFixed(1)}°` : '—'}
                                        </div>
                                    </a>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {coldChainBreaches.length === 0 && (
                    <div className="px-3 py-2 flex items-center gap-2 text-[11px] text-emerald-700 bg-emerald-50/40 border-b border-neutral-100">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Холодовая цепь — норма
                    </div>
                )}
            </div>
        </aside>
    );
}
