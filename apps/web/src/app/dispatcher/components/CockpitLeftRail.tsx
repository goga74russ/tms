'use client';

import { useState, useMemo } from 'react';
import { AlertTriangle, AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Truck, Package } from 'lucide-react';
import { TRIP_STATUS, label } from '@tms/shared';
import type { CockpitFilter } from './CockpitTopBar';

export type OperationException = {
    id: string;
    type: string;
    severity: 'info' | 'warning' | 'blocking' | string;
    title: string;
    message?: string | null;
    status?: string;
    tripId?: string | null;
    tripNumber?: string | null;
    createdAt?: string;
    data?: Record<string, unknown>;
};

export type LiveTrip = {
    id: string;
    number: string;
    status: string;
    vehiclePlate?: string;
    fromCity?: string;
    toCity?: string;
};

interface CockpitLeftRailProps {
    exceptions: OperationException[];
    liveTrips: LiveTrip[];
    activeFilter: CockpitFilter;
    onSelectException?: (item: OperationException) => void;
    onSelectTrip?: (trip: LiveTrip) => void;
    localizeTitle: (item: OperationException) => string;
    localizeMessage?: (s: string | null | undefined) => string | null;
    isMojibake: (s: string | null | undefined) => boolean;
}

const STATUS_LABEL_RU: Record<string, string> = {
    in_transit: 'В пути',
    loading: 'Погрузка',
    waybill_issued: 'Выпущен',
    completed: 'Завершён',
    planned: 'План',
    cancelled: 'Отменён',
};

const STATUS_DOT: Record<string, string> = {
    in_transit: 'bg-info-500',
    loading: 'bg-warning-500',
    waybill_issued: 'bg-violet-500',
    completed: 'bg-success-500',
    planned: 'bg-neutral-400',
    cancelled: 'bg-danger-500',
};

const STATUS_PRIORITY: Record<string, number> = {
    in_transit: 0,
    loading: 1,
    waybill_issued: 2,
    planned: 3,
    completed: 4,
    cancelled: 5,
};

export function CockpitLeftRail({
    exceptions,
    liveTrips,
    activeFilter,
    onSelectException,
    onSelectTrip,
    localizeTitle,
    localizeMessage,
    isMojibake,
}: CockpitLeftRailProps) {
    const [blockingOpen, setBlockingOpen] = useState(true);
    const [warningOpen, setWarningOpen] = useState(true);
    const [okOpen, setOkOpen] = useState(false);
    const [tripsOpen, setTripsOpen] = useState(true);

    const blockers = useMemo(() => exceptions.filter(e => e.severity === 'blocking'), [exceptions]);
    const warnings = useMemo(() => exceptions.filter(e => e.severity === 'warning'), [exceptions]);
    const infos = useMemo(() => exceptions.filter(e => e.severity === 'info'), [exceptions]);

    const sortedTrips = useMemo(() => {
        return [...liveTrips].sort((a, b) => {
            const pa = STATUS_PRIORITY[a.status] ?? 99;
            const pb = STATUS_PRIORITY[b.status] ?? 99;
            if (pa !== pb) return pa - pb;
            return a.number.localeCompare(b.number);
        });
    }, [liveTrips]);

    const showBlocking = activeFilter === 'all' || activeFilter === 'blocking';
    const showWarning = activeFilter === 'all' || activeFilter === 'warning';
    const showOk = activeFilter === 'all' || activeFilter === 'ok';

    const renderExceptionRow = (item: OperationException) => {
        const icon = item.severity === 'blocking' ? AlertTriangle : item.severity === 'warning' ? AlertCircle : CheckCircle2;
        const Icon = icon;
        const tone = item.severity === 'blocking'
            ? 'text-danger-600'
            : item.severity === 'warning'
                ? 'text-warning-600'
                : 'text-info-500';
        return (
            <button
                key={item.id}
                type="button"
                onClick={() => onSelectException?.(item)}
                className="w-full text-left px-3 py-1.5 hover:bg-neutral-50 border-b border-neutral-100 transition-colors group"
            >
                <div className="flex items-start gap-2">
                    <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${tone}`} />
                    <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-neutral-900 truncate leading-tight">
                            {localizeTitle(item)}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-neutral-500">
                            {item.tripNumber && <span className="font-mono">#{item.tripNumber}</span>}
                            {item.message && !isMojibake(item.message) && (
                                <span className="truncate">{localizeMessage ? (localizeMessage(item.message) ?? item.message) : item.message}</span>
                            )}
                        </div>
                    </div>
                </div>
            </button>
        );
    };

    const sectionHeader = (
        open: boolean,
        toggle: () => void,
        label: string,
        count: number,
        Icon: typeof AlertTriangle,
        toneClass: string,
    ) => (
        <button
            type="button"
            onClick={toggle}
            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-neutral-50 border-b border-neutral-100 transition-colors"
        >
            {open ? <ChevronDown className="w-3 h-3 text-neutral-400" /> : <ChevronRight className="w-3 h-3 text-neutral-400" />}
            <Icon className={`w-3.5 h-3.5 ${toneClass}`} />
            <span className="text-xs font-semibold uppercase tracking-wide text-neutral-600 flex-1 text-left">{label}</span>
            <span className="tabular-nums text-[11px] font-medium text-neutral-500">{count}</span>
        </button>
    );

    return (
        <aside className="w-80 shrink-0 border-r border-neutral-200 bg-white flex flex-col h-full overflow-hidden">
            <div className="flex-1 overflow-y-auto">
                {/* Блокеры */}
                {showBlocking && (
                    <div>
                        {sectionHeader(blockingOpen, () => setBlockingOpen(o => !o), 'Блокеры', blockers.length, AlertTriangle, 'text-danger-600')}
                        {blockingOpen && (
                            blockers.length === 0 ? (
                                <div className="px-3 py-2 text-[11px] text-neutral-400 italic border-b border-neutral-100">Нет блокеров</div>
                            ) : (
                                blockers.map(renderExceptionRow)
                            )
                        )}
                    </div>
                )}

                {/* Риски */}
                {showWarning && (
                    <div>
                        {sectionHeader(warningOpen, () => setWarningOpen(o => !o), 'Риски', warnings.length, AlertCircle, 'text-warning-600')}
                        {warningOpen && (
                            warnings.length === 0 ? (
                                <div className="px-3 py-2 text-[11px] text-neutral-400 italic border-b border-neutral-100">Нет рисков</div>
                            ) : (
                                warnings.map(renderExceptionRow)
                            )
                        )}
                    </div>
                )}

                {/* OK / info */}
                {showOk && (
                    <div>
                        {sectionHeader(okOpen, () => setOkOpen(o => !o), 'OK / инфо', infos.length, CheckCircle2, 'text-success-600')}
                        {okOpen && (
                            infos.length === 0 ? (
                                <div className="px-3 py-2 text-[11px] text-neutral-400 italic border-b border-neutral-100">Нет событий</div>
                            ) : (
                                infos.map(renderExceptionRow)
                            )
                        )}
                    </div>
                )}

                {/* Live trips */}
                <div>
                    <button
                        type="button"
                        onClick={() => setTripsOpen(o => !o)}
                        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-neutral-50 border-b border-neutral-100 bg-neutral-50/60"
                    >
                        {tripsOpen ? <ChevronDown className="w-3 h-3 text-neutral-400" /> : <ChevronRight className="w-3 h-3 text-neutral-400" />}
                        <Package className="w-3.5 h-3.5 text-success-600" />
                        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-600 flex-1 text-left">Live рейсы</span>
                        <span className="tabular-nums text-[11px] font-medium text-neutral-500">{sortedTrips.length}</span>
                    </button>
                    {tripsOpen && (
                        sortedTrips.length === 0 ? (
                            <div className="px-3 py-3 text-[11px] text-neutral-400 italic">Нет активных рейсов</div>
                        ) : (
                            sortedTrips.map(trip => (
                                <button
                                    key={trip.id}
                                    type="button"
                                    onClick={() => onSelectTrip?.(trip)}
                                    className="w-full text-left px-3 py-1.5 hover:bg-success-50 border-b border-neutral-100 transition-colors group"
                                >
                                    <div className="flex items-center gap-2 mb-0.5">
                                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[trip.status] || 'bg-neutral-400'}`} />
                                        <span className="text-sm font-semibold text-neutral-900 font-mono">#{trip.number}</span>
                                        <span className="ml-auto text-[10px] font-medium text-neutral-500">
                                            {STATUS_LABEL_RU[trip.status] || trip.status}
                                        </span>
                                    </div>
                                    {(trip.fromCity || trip.toCity) && (
                                        <div className="text-[11px] text-neutral-500 truncate pl-3.5">
                                            {trip.fromCity || '—'} → {trip.toCity || '—'}
                                        </div>
                                    )}
                                    {trip.vehiclePlate && (
                                        <div className="flex items-center gap-1 mt-0.5 pl-3.5 text-[10px] text-neutral-400">
                                            <Truck className="w-2.5 h-2.5" />
                                            <span className="font-mono">{trip.vehiclePlate}</span>
                                        </div>
                                    )}
                                </button>
                            ))
                        )
                    )}
                </div>
            </div>
        </aside>
    );
}
