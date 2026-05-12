'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/lib/user-context';
import { api } from '../../lib/api';
import {
    Wrench, CheckCircle2, XCircle, AlertTriangle, Clock,
    Shield, FileCheck, ClipboardCheck, RotateCcw, Truck, FileText,
} from 'lucide-react';
import { Stat } from '@/components/ui/stat';
import { SkeletonTable } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { SideDrawer } from '@/components/ui/side-drawer';
import { useToast } from '@/components/ui/toast';
import { getVehicleProfile } from '../fleet/components/vehicleProfile';

// ================================================================
// Types
// ================================================================
interface VehicleQueueItem {
    trip: {
        id: string;
        number: string;
        plannedDepartureAt: string | null;
        waybillId?: string | null;
        waybillNumber?: string | null;
    };
    vehicle: {
        id: string;
        plateNumber: string;
        make: string;
        model: string;
        year: number;
        bodyType?: string;
        currentOdometerKm: number;
        status: string;
        permits: Array<{
            zoneName: string;
            validUntil: string;
        }>;
    };
    documentExpiry: {
        techInspection: { status: string; expiry: string | null };
        osago: { status: string; expiry: string | null };
        maintenance: { status: string; expiry: string | null };
        tachograph: { status: string; expiry: string | null };
    };
}

interface ChecklistItem {
    name: string;
    result: 'ok' | 'fault' | null;
    comment: string;
    photoUrl: string;
}

interface InspectionRecord {
    id: string;
    vehicleId: string;
    tripId?: string;
    decision: string;
    createdAt: string;
    items: Array<{ name: string; result: string; comment?: string }>;
}

interface TripReference {
    tripNumber: string | null;
    waybillNumber: string | null;
}

type DateFilter = 'all' | 'today' | 'week';

// ================================================================
// Document Expiry Traffic Light
// ================================================================
function ExpiryBadge({ status, label, date }: { status: string; label: string; date: string | null }) {
    const colors: Record<string, string> = {
        green: 'bg-emerald-100 text-emerald-700 border-emerald-200',
        yellow: 'bg-amber-100 text-amber-700 border-amber-200',
        red: 'bg-red-100 text-red-700 border-red-200',
        unknown: 'bg-neutral-100 text-neutral-500 border-neutral-200',
    };

    const icons: Record<string, React.ReactNode> = {
        green: <CheckCircle2 className="w-3.5 h-3.5" />,
        yellow: <AlertTriangle className="w-3.5 h-3.5" />,
        red: <XCircle className="w-3.5 h-3.5" />,
        unknown: <Clock className="w-3.5 h-3.5" />,
    };

    return (
        <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium ${colors[status] || colors.unknown}`}>
            {icons[status] || icons.unknown}
            <span>{label}</span>
            {date && (
                <span className="opacity-70 ml-1">
                    {new Date(date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                </span>
            )}
        </div>
    );
}

// ================================================================
// Status pill — for top-right of list row
// ================================================================
function VehicleStatusPill({ item }: { item: VehicleQueueItem }) {
    // Aggregate worst document status
    const docs = [
        item.documentExpiry.techInspection.status,
        item.documentExpiry.osago.status,
        item.documentExpiry.maintenance.status,
        item.documentExpiry.tachograph.status,
    ];
    const worst = docs.includes('red') ? 'red' : docs.includes('yellow') ? 'yellow' : docs.includes('unknown') ? 'unknown' : 'green';
    const cfg: Record<string, { color: string; label: string }> = {
        green: { color: 'bg-emerald-100 text-emerald-700', label: 'Документы OK' },
        yellow: { color: 'bg-amber-100 text-amber-700', label: 'Истекают' },
        red: { color: 'bg-red-100 text-red-700', label: 'Просрочены' },
        unknown: { color: 'bg-neutral-100 text-neutral-500', label: 'Нет данных' },
    };
    const c = cfg[worst];
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${c.color}`}>
            {c.label}
        </span>
    );
}

// ================================================================
// Default tech checklist items
// ================================================================
const DEFAULT_CHECKLIST: string[] = [
    'Тормозная система',
    'Рулевое управление',
    'Шины и колёса',
    'Внешние световые приборы',
    'Стеклоочистители',
    'Зеркала заднего вида',
    'Уровень масла',
    'Уровень охлаждающей жидкости',
    'Уровень тормозной жидкости',
    'Кузов / Кабина',
    'Огнетушитель',
    'Аптечка',
    'Знак аварийной остановки',
    'Тахограф',
    'Сцепное устройство',
];

// ================================================================
// Main Page
// ================================================================
const ALLOWED_ROLES = ['mechanic', 'admin'];

export default function MechanicPage() {
    const { user, loading: userLoading } = useUser();
    const router = useRouter();

    useEffect(() => {
        if (!userLoading && (!user || !user.roles.some(r => ALLOWED_ROLES.includes(r)))) {
            router.push('/');
        }
    }, [user, userLoading, router]);

    const [queue, setQueue] = useState<VehicleQueueItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedVehicle, setSelectedVehicle] = useState<VehicleQueueItem | null>(null);
    const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [signature, setSignature] = useState('');
    const [journal, setJournal] = useState<InspectionRecord[]>([]);
    const [vehicleMap, setVehicleMap] = useState<Record<string, string>>({});
    const [tripReferences, setTripReferences] = useState<Record<string, TripReference>>({});
    const [activeTab, setActiveTab] = useState<'queue' | 'journal'>('queue');
    const [inspectionType, setInspectionType] = useState<'pre_trip' | 'periodic'>('pre_trip');
    const [dateFilter, setDateFilter] = useState<DateFilter>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [drawerOpen, setDrawerOpen] = useState(false);
    const { toast: toastFn } = useToast();
    const setToast = useCallback((value: { message: string; type: 'success' | 'error' } | null) => {
        if (!value) return;
        toastFn({
            variant: value.type === 'error' ? 'error' : 'success',
            title: value.type === 'error' ? 'Ошибка' : 'Готово',
            description: value.message,
        });
    }, [toastFn]);

    // Load queue
    const loadQueue = useCallback(async () => {
        try {
            setLoading(true);
            const result = await api.get<{ success: boolean; data: VehicleQueueItem[] }>('/inspections/tech/queue');
            if (result.success) setQueue(result.data);
        } catch (err) {
            console.error('Failed to load queue:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    // Load journal
    const loadJournal = useCallback(async () => {
        try {
            const result = await api.get<{ success: boolean; data: InspectionRecord[] }>('/inspections/tech?page=1&limit=50');
            if (result.success) setJournal(result.data);
        } catch (err) {
            console.error('Failed to load journal:', err);
        }
    }, []);

    useEffect(() => {
        loadQueue();
        loadJournal();
        // Load vehicle names for journal
        (async () => {
            try {
                const res = await api.get<any>('/fleet/vehicles?limit=200');
                const vm: Record<string, string> = {};
                for (const v of (res.data || [])) vm[v.id] = v.plateNumber;
                setVehicleMap(vm);
            } catch { /* ignore */ }
        })();
    }, [loadQueue, loadJournal]);

    useEffect(() => {
        const tripIds = [...new Set([
            ...queue.map(item => item.trip.id),
            ...journal.map(record => record.tripId).filter((id): id is string => !!id),
        ])];

        if (tripIds.length === 0) {
            setTripReferences({});
            return;
        }

        let cancelled = false;

        (async () => {
            const results = await Promise.allSettled(tripIds.map(async (tripId) => {
                const tripRes = await api.get<{ success: boolean; data: { number: string; waybillId?: string | null } }>(`/trips/${tripId}`);
                if (!tripRes.success) {
                    return [tripId, { tripNumber: null, waybillNumber: null }] as const;
                }

                let waybillNumber: string | null = null;
                if (tripRes.data.waybillId) {
                    const waybillRes = await api.get<{ success: boolean; data: { number: string } }>(`/waybills/${tripRes.data.waybillId}`);
                    if (waybillRes.success) {
                        waybillNumber = waybillRes.data.number;
                    }
                }

                return [tripId, { tripNumber: tripRes.data.number, waybillNumber }] as const;
            }));

            if (cancelled) return;

            const next: Record<string, TripReference> = {};
            for (const result of results) {
                if (result.status === 'fulfilled') {
                    const [tripId, ref] = result.value;
                    next[tripId] = ref;
                }
            }
            setTripReferences(next);
        })().catch(() => {
            if (!cancelled) setTripReferences({});
        });

        return () => {
            cancelled = true;
        };
    }, [queue, journal]);

    // Filtered queue
    const filteredQueue = useMemo(() => {
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const endOfToday = startOfToday + 24 * 60 * 60 * 1000;
        const startOfWeek = startOfToday - 6 * 24 * 60 * 60 * 1000;
        const q = searchQuery.trim().toLowerCase();

        return queue.filter(item => {
            // Date filter — based on plannedDepartureAt
            if (dateFilter !== 'all' && item.trip.plannedDepartureAt) {
                const t = new Date(item.trip.plannedDepartureAt).getTime();
                if (dateFilter === 'today' && (t < startOfToday || t >= endOfToday)) return false;
                if (dateFilter === 'week' && (t < startOfWeek || t >= endOfToday)) return false;
            } else if (dateFilter !== 'all' && !item.trip.plannedDepartureAt) {
                return false;
            }
            // Search
            if (q) {
                const hay = `${item.vehicle.plateNumber} ${item.vehicle.make} ${item.vehicle.model} ${item.trip.number}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });
    }, [queue, dateFilter, searchQuery]);

    // Select vehicle and init checklist
    const selectVehicle = (item: VehicleQueueItem) => {
        setSelectedVehicle(item);
        setChecklistItems(
            DEFAULT_CHECKLIST.map(name => ({
                name,
                result: null,
                comment: '',
                photoUrl: '',
            })),
        );
        setSignature('');
        setInspectionType('pre_trip');
        // Open drawer on smaller screens; on xl+ inline pane is visible regardless.
        setDrawerOpen(true);
    };

    const closeDetail = () => {
        setSelectedVehicle(null);
        setDrawerOpen(false);
    };

    // Update checklist item
    const updateItem = (index: number, field: keyof ChecklistItem, value: string) => {
        setChecklistItems(prev => {
            const updated = [...prev];
            (updated[index] as any)[field] = value;
            return updated;
        });
    };

    // Submit inspection
    const submitInspection = async (decision: 'approved' | 'rejected') => {
        if (!selectedVehicle) return;
        if (!signature) {
            setToast({ message: 'Введите пароль для подтверждения (ПЭП)', type: 'error' });
            return;
        }

        const allFilled = checklistItems.every(i => i.result !== null);
        if (!allFilled) {
            setToast({ message: 'Заполните все пункты чек-листа', type: 'error' });
            return;
        }

        try {
            setSubmitting(true);
            await api.post('/inspections/tech', {
                vehicleId: selectedVehicle.vehicle.id,
                tripId: inspectionType === 'pre_trip' ? selectedVehicle.trip.id : undefined,
                inspectionType,
                checklistVersion: '1.0',
                items: checklistItems.map(i => ({
                    name: i.name,
                    result: i.result,
                    comment: i.comment || undefined,
                    photoUrl: i.photoUrl || undefined,
                })),
                decision,
                signature,
            });

            setToast({
                message: decision === 'approved'
                    ? `✅ ТС ${selectedVehicle.vehicle.plateNumber} допущено`
                    : `❌ ТС ${selectedVehicle.vehicle.plateNumber} не допущено — заявка на ремонт создана`,
                type: decision === 'approved' ? 'success' : 'error',
            });

            closeDetail();
            await loadQueue();
            await loadJournal();
        } catch (err: any) {
            setToast({ message: err.message || 'Ошибка', type: 'error' });
        } finally {
            setSubmitting(false);
        }
    };

    // D5: Quick override of a journal entry's decision (no full checklist re-entry).
    const overrideDecision = async (record: InspectionRecord, decision: 'approved' | 'rejected') => {
        if (record.decision === decision) return;
        try {
            await api.post(`/inspections/tech/${record.id}/decision`, { decision });
            setToast({
                message: decision === 'approved' ? 'Решение изменено: Допущен' : 'Решение изменено: Не допущен',
                type: decision === 'approved' ? 'success' : 'error',
            });
            await loadJournal();
            await loadQueue();
        } catch (err: any) {
            setToast({ message: err.message || 'Ошибка', type: 'error' });
        }
    };

    // ================================================================
    // Inspection form (re-usable: inline pane + SideDrawer)
    // ================================================================
    const renderInspectionForm = (compact: boolean) => {
        if (!selectedVehicle) return null;
        return (
            <div className="bg-white">
                {/* Vehicle header */}
                {!compact && (
                    <div className="bg-gradient-to-r from-neutral-800 to-neutral-700 px-5 py-4 text-white rounded-t-2xl">
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                                    <Truck className="w-5 h-5" />
                                </div>
                                <div className="min-w-0">
                                    <h2 className="text-base font-bold truncate">{selectedVehicle.vehicle.plateNumber}</h2>
                                    {selectedVehicle.vehicle.bodyType && (
                                        <p className="text-[11px] text-indigo-300 truncate">
                                            {getVehicleProfile(selectedVehicle.vehicle.bodyType).displayLabel}
                                        </p>
                                    )}
                                    <p className="text-neutral-300 text-xs truncate">
                                        {selectedVehicle.vehicle.make} {selectedVehicle.vehicle.model} ({selectedVehicle.vehicle.year})
                                        · {Math.round(selectedVehicle.vehicle.currentOdometerKm).toLocaleString()} км
                                        · {tripReferences[selectedVehicle.trip.id]?.waybillNumber
                                            ? `ПЛ: ${tripReferences[selectedVehicle.trip.id]!.waybillNumber}`
                                            : 'ПЛ: не оформлен'}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Document expiry */}
                        <div className="flex gap-1.5 mt-3 flex-wrap">
                            <ExpiryBadge status={selectedVehicle.documentExpiry.techInspection.status} label="ТО" date={selectedVehicle.documentExpiry.techInspection.expiry} />
                            <ExpiryBadge status={selectedVehicle.documentExpiry.osago.status} label="ОСАГО" date={selectedVehicle.documentExpiry.osago.expiry} />
                            <ExpiryBadge status={selectedVehicle.documentExpiry.maintenance.status} label="ТО План." date={selectedVehicle.documentExpiry.maintenance.expiry} />
                            <ExpiryBadge status={selectedVehicle.documentExpiry.tachograph.status} label="Тахограф" date={selectedVehicle.documentExpiry.tachograph.expiry} />
                        </div>
                    </div>
                )}

                {/* Checklist */}
                <div className="p-5">
                    <div className="flex items-center justify-between gap-3 mb-3">
                        <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">Тип осмотра</h3>
                        <div className="flex bg-neutral-100 rounded-lg p-0.5">
                            <button
                                onClick={() => setInspectionType('pre_trip')}
                                className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${inspectionType === 'pre_trip' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'}`}
                            >
                                Предрейсовый
                            </button>
                            <button
                                onClick={() => setInspectionType('periodic')}
                                className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${inspectionType === 'periodic' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'}`}
                            >
                                Периодический
                            </button>
                        </div>
                    </div>

                    <p className="text-[11px] text-neutral-500 mb-4">
                        {inspectionType === 'pre_trip'
                            ? 'Осмотр привязан к путевому листу выбранного рейса и может продвинуть статус выпуска.'
                            : 'Периодический осмотр фиксируется без влияния на рейс или путевой лист.'
                        }
                    </p>

                    <h3 className="sr-only">
                        <ClipboardCheck className="w-4 h-4 inline mr-1.5" />
                        Чек-лист осмотра
                    </h3>

                    <div className="space-y-1.5">
                        {checklistItems.map((item, idx) => (
                            <div
                                key={idx}
                                className={`flex flex-wrap items-center gap-2 px-2.5 py-2 rounded-lg border transition ${item.result === 'ok'
                                    ? 'border-emerald-200 bg-emerald-50'
                                    : item.result === 'fault'
                                        ? 'border-red-200 bg-red-50'
                                        : 'border-neutral-200 bg-white'
                                    }`}
                            >
                                <span className="flex-1 text-xs font-medium text-neutral-800 min-w-[140px]">
                                    {item.name}
                                </span>

                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => updateItem(idx, 'result', 'ok')}
                                        className={`px-2.5 py-1 rounded-md text-xs font-semibold transition ${item.result === 'ok'
                                            ? 'bg-emerald-600 text-white shadow-sm'
                                            : 'bg-neutral-100 text-neutral-500 hover:bg-emerald-100 hover:text-emerald-700'
                                            }`}
                                    >
                                        ОК
                                    </button>
                                    <button
                                        onClick={() => updateItem(idx, 'result', 'fault')}
                                        className={`px-2.5 py-1 rounded-md text-xs font-semibold transition ${item.result === 'fault'
                                            ? 'bg-red-600 text-white shadow-sm'
                                            : 'bg-neutral-100 text-neutral-500 hover:bg-red-100 hover:text-red-700'
                                            }`}
                                    >
                                        Неиспр.
                                    </button>
                                </div>

                                {item.result === 'fault' && (
                                    <input
                                        type="text"
                                        placeholder="Комментарий..."
                                        value={item.comment}
                                        onChange={e => updateItem(idx, 'comment', e.target.value)}
                                        className="w-full mt-1 px-2.5 py-1.5 text-xs border border-red-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-red-300"
                                    />
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Signature (PEP) */}
                    <div className="mt-4 p-3 bg-neutral-50 rounded-lg border border-neutral-200">
                        <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                            <Shield className="w-3.5 h-3.5 inline mr-1" />
                            Подтверждение (ПЭП) — введите пароль
                        </label>
                        <input
                            type="password"
                            placeholder="Пароль для электронной подписи"
                            value={signature}
                            onChange={e => setSignature(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400"
                        />
                    </div>

                    {/* Decision buttons */}
                    <div className="flex gap-2 mt-4">
                        <button
                            onClick={() => submitInspection('approved')}
                            disabled={submitting}
                            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-3 bg-gradient-to-r from-emerald-600 to-emerald-500 text-white rounded-xl text-sm font-bold shadow-md shadow-emerald-200 hover:shadow-emerald-300 hover:from-emerald-700 hover:to-emerald-600 transition disabled:opacity-50"
                        >
                            <CheckCircle2 className="w-5 h-5" />
                            Допустить
                        </button>
                        <button
                            onClick={() => submitInspection('rejected')}
                            disabled={submitting}
                            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-3 bg-gradient-to-r from-red-600 to-red-500 text-white rounded-xl text-sm font-bold shadow-md shadow-red-200 hover:shadow-red-300 hover:from-red-700 hover:to-red-600 transition disabled:opacity-50"
                        >
                            <XCircle className="w-5 h-5" />
                            Не допустить
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-neutral-50">
            {/* Header */}
            <header className="bg-white border-b border-neutral-200 px-6 py-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center">
                            <Wrench className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-neutral-900">Техосмотр</h1>
                            <p className="text-sm text-neutral-500">Предрейсовый осмотр ТС</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={loadQueue}
                            className="p-2.5 rounded-xl hover:bg-neutral-100 text-neutral-400 hover:text-neutral-600 transition"
                            title="Обновить"
                        >
                            <RotateCcw className="w-5 h-5" />
                        </button>
                        <div className="flex bg-neutral-100 rounded-xl p-1">
                            <button
                                onClick={() => setActiveTab('queue')}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${activeTab === 'queue'
                                    ? 'bg-white text-neutral-900 shadow-sm'
                                    : 'text-neutral-500 hover:text-neutral-700'
                                    }`}
                            >
                                Очередь ({queue.length})
                            </button>
                            <button
                                onClick={() => setActiveTab('journal')}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${activeTab === 'journal'
                                    ? 'bg-white text-neutral-900 shadow-sm'
                                    : 'text-neutral-500 hover:text-neutral-700'
                                    }`}
                            >
                                Журнал
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            <div className="p-6 space-y-6">
                {/* Stat cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Stat label="В очереди" value={queue.length} icon={Truck} tone="warning" />
                    <Stat
                        label="Записей в журнале"
                        value={journal.length}
                        icon={FileCheck}
                        tone="info"
                    />
                    <Stat
                        label="Допущено сегодня"
                        value={journal.filter(r => r.decision === 'approved' && r.createdAt && new Date(r.createdAt).toDateString() === new Date().toDateString()).length}
                        icon={CheckCircle2}
                        tone="success"
                    />
                    <Stat
                        label="Не допущено сегодня"
                        value={journal.filter(r => r.decision === 'rejected' && r.createdAt && new Date(r.createdAt).toDateString() === new Date().toDateString()).length}
                        icon={XCircle}
                        tone="danger"
                    />
                </div>

                {/* Queue Tab — two-pane layout */}
                {activeTab === 'queue' && (
                    <div className={`grid gap-4 ${selectedVehicle ? 'xl:grid-cols-[minmax(360px,1fr)_minmax(0,420px)]' : 'grid-cols-1'}`}>
                        {/* LEFT: List + filters */}
                        <div className="min-w-0">
                            {/* Sticky filter chips */}
                            <div className="sticky top-0 z-10 -mx-1 px-1 py-2 bg-neutral-50/95 backdrop-blur-sm flex flex-wrap items-center gap-2 mb-2">
                                <div className="flex bg-white border border-neutral-200 rounded-lg p-0.5 shadow-sm">
                                    {(['all', 'today', 'week'] as DateFilter[]).map(f => (
                                        <button
                                            key={f}
                                            onClick={() => setDateFilter(f)}
                                            className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${dateFilter === f
                                                ? 'bg-orange-100 text-orange-700'
                                                : 'text-neutral-500 hover:text-neutral-700'
                                                }`}
                                        >
                                            {f === 'all' ? 'Все' : f === 'today' ? 'Сегодня' : 'Эта неделя'}
                                        </button>
                                    ))}
                                </div>
                                <input
                                    type="text"
                                    placeholder="Поиск по ТС / рейсу..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    className="flex-1 min-w-[160px] max-w-xs px-3 py-1.5 text-xs border border-neutral-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-orange-300"
                                />
                                <span className="text-[11px] text-neutral-400 ml-auto">
                                    {filteredQueue.length} из {queue.length}
                                </span>
                            </div>

                            {loading ? (
                                <div className="rounded-2xl border border-neutral-200 bg-white p-5">
                                    <SkeletonTable rows={6} columns={2} />
                                </div>
                            ) : filteredQueue.length === 0 ? (
                                <EmptyState
                                    icon={CheckCircle2}
                                    title="Очередь пуста — все осмотрены сегодня"
                                    description="Новые ТС появятся после назначения рейсов."
                                    tone="success"
                                />
                            ) : (
                                <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden divide-y divide-neutral-100">
                                    {filteredQueue.map((item) => {
                                        const isSelected = selectedVehicle?.vehicle.id === item.vehicle.id;
                                        return (
                                            <div
                                                key={item.vehicle.id}
                                                onClick={() => selectVehicle(item)}
                                                className={`group flex items-center gap-3 px-4 py-3 cursor-pointer transition relative ${isSelected
                                                    ? 'bg-orange-50 ring-1 ring-inset ring-orange-200'
                                                    : 'hover:bg-neutral-50'
                                                    }`}
                                            >
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm font-bold text-neutral-900 truncate">
                                                            {item.vehicle.plateNumber}
                                                        </span>
                                                        <VehicleStatusPill item={item} />
                                                    </div>
                                                    <p className="text-[11px] text-neutral-500 truncate mt-0.5">
                                                        {item.vehicle.make} {item.vehicle.model}
                                                        {' · ПЛ: '}{tripReferences[item.trip.id]?.waybillNumber || 'еще не создан'}
                                                        {' · Рейс: '}{item.trip.number}
                                                    </p>
                                                </div>
                                                {/* Hover quick actions */}
                                                <div className="hidden group-hover:flex items-center gap-1 shrink-0">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); selectVehicle(item); }}
                                                        className="px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold inline-flex items-center gap-1"
                                                        title="Открыть осмотр для допуска"
                                                    >
                                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                                        Допустить
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); selectVehicle(item); }}
                                                        className="px-2.5 py-1 rounded-md bg-red-600 hover:bg-red-700 text-white text-[11px] font-semibold inline-flex items-center gap-1"
                                                        title="Открыть осмотр для отказа"
                                                    >
                                                        <XCircle className="w-3.5 h-3.5" />
                                                        Не пропускать
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* RIGHT: Detail pane (xl+ only) */}
                        {selectedVehicle && (
                            <div className="hidden xl:block min-w-0">
                                <div className="sticky top-2 rounded-2xl border border-neutral-200 shadow-sm overflow-hidden bg-white max-h-[calc(100vh-7rem)] overflow-y-auto">
                                    <div className="flex items-center justify-between px-4 py-2.5 bg-neutral-100 border-b border-neutral-200">
                                        <span className="text-xs font-semibold text-neutral-600 uppercase tracking-wide">
                                            Карточка осмотра
                                        </span>
                                        <button
                                            onClick={closeDetail}
                                            className="text-xs text-neutral-500 hover:text-neutral-700"
                                        >
                                            Закрыть ✕
                                        </button>
                                    </div>
                                    {renderInspectionForm(false)}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Journal Tab */}
                {activeTab === 'journal' && (
                    <div>
                        <h2 className="text-lg font-bold text-neutral-800 mb-4 flex items-center gap-2">
                            <FileCheck className="w-5 h-5 text-blue-500" />
                            Журнал техосмотров
                        </h2>

                        <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-neutral-100 bg-neutral-50">
                                        <th className="text-left px-4 py-3 font-semibold text-neutral-600">Дата</th>
                                        <th className="text-left px-4 py-3 font-semibold text-neutral-600">ТС</th>
                                        <th className="text-left px-4 py-3 font-semibold text-neutral-600">ПЛ</th>
                                        <th className="text-left px-4 py-3 font-semibold text-neutral-600">Решение</th>
                                        <th className="text-left px-4 py-3 font-semibold text-neutral-600">Неисправности</th>
                                        <th className="text-left px-4 py-3 font-semibold text-neutral-600">Акт</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {journal.length === 0 ? (
                                        <tr>
                                            <td colSpan={6}>
                                                <div className="p-6">
                                                    <EmptyState
                                                        icon={FileCheck}
                                                        title="Журнал пуст"
                                                        description="Здесь появятся записи о техосмотрах."
                                                    />
                                                </div>
                                            </td>
                                        </tr>
                                    ) : (
                                        journal.map((record) => (
                                            <tr key={record.id} className="border-b border-neutral-50 hover:bg-neutral-50">
                                                <td className="px-4 py-3 text-neutral-600">
                                                    {new Date(record.createdAt).toLocaleString('ru-RU', {
                                                        day: '2-digit',
                                                        month: '2-digit',
                                                        year: '2-digit',
                                                        hour: '2-digit',
                                                        minute: '2-digit',
                                                    })}
                                                </td>
                                                <td className="px-4 py-3 font-medium text-neutral-900">
                                                    {vehicleMap[record.vehicleId] || record.vehicleId.substring(0, 8) + '...'}
                                                </td>
                                                <td className="px-4 py-3 text-neutral-500 text-xs">
                                                    {record.tripId ? (
                                                        tripReferences[record.tripId]?.waybillNumber ? (
                                                            <div className="space-y-0.5">
                                                                <div className="font-semibold text-neutral-800">
                                                                    ПЛ № {tripReferences[record.tripId]!.waybillNumber}
                                                                </div>
                                                                <div className="text-neutral-400">
                                                                    Рейс {tripReferences[record.tripId]?.tripNumber ?? '—'}
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="space-y-0.5">
                                                                <div className="font-semibold text-neutral-500">
                                                                    ПЛ не оформлен
                                                                </div>
                                                                <div className="text-neutral-400">
                                                                    Рейс {tripReferences[record.tripId]?.tripNumber ?? '—'}
                                                                </div>
                                                            </div>
                                                        )
                                                    ) : '—'}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${record.decision === 'approved'
                                                        ? 'bg-emerald-100 text-emerald-700'
                                                        : 'bg-red-100 text-red-700'
                                                        }`}>
                                                        {record.decision === 'approved' ? (
                                                            <><CheckCircle2 className="w-3 h-3" /> Допущен</>
                                                        ) : (
                                                            <><XCircle className="w-3 h-3" /> Не допущен</>
                                                        )}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-neutral-500 text-xs">
                                                    {record.items
                                                        ?.filter(i => i.result === 'fault')
                                                        .map(i => i.name)
                                                        .join(', ') || '—'}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <a
                                                            href={`/api/inspections/tech/${record.id}/pdf`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100 transition"
                                                            title="Скачать акт PDF"
                                                        >
                                                            <FileText className="w-3.5 h-3.5" />
                                                            PDF акт
                                                        </a>
                                                        {/* D5: per-row decision override (calls POST /inspections/tech/:id/decision). */}
                                                        {record.decision !== 'approved' && (
                                                            <button
                                                                onClick={() => overrideDecision(record, 'approved')}
                                                                className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 transition"
                                                                title="Допустить"
                                                            >
                                                                <CheckCircle2 className="w-3.5 h-3.5" />
                                                                Допустить
                                                            </button>
                                                        )}
                                                        {record.decision !== 'rejected' && (
                                                            <button
                                                                onClick={() => overrideDecision(record, 'rejected')}
                                                                className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100 transition"
                                                                title="Не допускать"
                                                            >
                                                                <XCircle className="w-3.5 h-3.5" />
                                                                Не допускать
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {/* SideDrawer — used on screens < xl (selectedVehicle but inline pane is hidden) */}
            <div className="xl:hidden">
                <SideDrawer
                    open={drawerOpen && !!selectedVehicle && activeTab === 'queue'}
                    onClose={closeDetail}
                    title={selectedVehicle ? `Осмотр: ${selectedVehicle.vehicle.plateNumber}` : ''}
                    subtitle={selectedVehicle ? `${selectedVehicle.vehicle.make} ${selectedVehicle.vehicle.model} · Рейс ${selectedVehicle.trip.number}` : ''}
                    width="lg"
                >
                    {renderInspectionForm(true)}
                </SideDrawer>
            </div>

        </div>
    );
}
