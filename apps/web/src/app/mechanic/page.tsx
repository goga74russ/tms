'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '../../lib/api';
import {
    Wrench, CheckCircle2, XCircle, AlertTriangle, Clock,
    ChevronRight, Shield, Fuel, FileCheck, Calendar,
    Thermometer, Eye, ClipboardCheck, RotateCcw, Truck,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

// ================================================================
// Types
// ================================================================
interface VehicleQueueItem {
    trip: { id: string; number: string; plannedDepartureAt: string | null };
    vehicle: {
        id: string;
        plateNumber: string;
        make: string;
        model: string;
        year: number;
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
    decision: string;
    createdAt: string;
    items: Array<{ name: string; result: string; comment?: string }>;
}

// ================================================================
// Document Expiry Traffic Light
// ================================================================
function ExpiryBadge({ status, label, date }: { status: string; label: string; date: string | null }) {
    const colors: Record<string, string> = {
        green: 'bg-emerald-100 text-emerald-700 border-emerald-200',
        yellow: 'bg-amber-100 text-amber-700 border-amber-200',
        red: 'bg-red-100 text-red-700 border-red-200',
        unknown: 'bg-slate-100 text-slate-500 border-slate-200',
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
export default function MechanicPage() {
    const [queue, setQueue] = useState<VehicleQueueItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedVehicle, setSelectedVehicle] = useState<VehicleQueueItem | null>(null);
    const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [signature, setSignature] = useState('');
    const [journal, setJournal] = useState<InspectionRecord[]>([]);
    const [vehicleMap, setVehicleMap] = useState<Record<string, string>>({});
    const [activeTab, setActiveTab] = useState<'queue' | 'journal'>('queue');
    const [inspectionType, setInspectionType] = useState<'pre_trip' | 'periodic'>('pre_trip');
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

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

            setSelectedVehicle(null);
            await loadQueue();
            await loadJournal();
        } catch (err: any) {
            setToast({ message: err.message || 'Ошибка', type: 'error' });
        } finally {
            setSubmitting(false);
        }
    };

    // Auto-dismiss toast
    useEffect(() => {
        if (toast) {
            const timer = setTimeout(() => setToast(null), 4000);
            return () => clearTimeout(timer);
        }
    }, [toast]);

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Header */}
            <header className="bg-white border-b border-slate-200 px-6 py-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center">
                            <Wrench className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-slate-900">Техосмотр</h1>
                            <p className="text-sm text-slate-500">Предрейсовый осмотр ТС</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={loadQueue}
                            className="p-2.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"
                            title="Обновить"
                        >
                            <RotateCcw className="w-5 h-5" />
                        </button>
                        <div className="flex bg-slate-100 rounded-xl p-1">
                            <button
                                onClick={() => setActiveTab('queue')}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${activeTab === 'queue'
                                    ? 'bg-white text-slate-900 shadow-sm'
                                    : 'text-slate-500 hover:text-slate-700'
                                    }`}
                            >
                                Очередь ({queue.length})
                            </button>
                            <button
                                onClick={() => setActiveTab('journal')}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${activeTab === 'journal'
                                    ? 'bg-white text-slate-900 shadow-sm'
                                    : 'text-slate-500 hover:text-slate-700'
                                    }`}
                            >
                                Журнал
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            {/* Toast */}
            {toast && (
                <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-xl shadow-lg text-white font-medium text-sm animate-in slide-in-from-top ${toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'
                    }`}>
                    {toast.message}
                </div>
            )}

            <div className="p-6">
                {/* Inspection Form (selected vehicle) */}
                {selectedVehicle && activeTab === 'queue' && (
                    <div className="mb-6 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        {/* Vehicle header */}
                        <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-6 py-4 text-white">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center">
                                        <Truck className="w-7 h-7" />
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-bold">{selectedVehicle.vehicle.plateNumber}</h2>
                                        <p className="text-slate-300 text-sm">
                                            {selectedVehicle.vehicle.make} {selectedVehicle.vehicle.model} ({selectedVehicle.vehicle.year})
                                            • {Math.round(selectedVehicle.vehicle.currentOdometerKm).toLocaleString()} км
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setSelectedVehicle(null)}
                                    className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm transition"
                                >
                                    ← Назад
                                </button>
                            </div>

                            {/* Document expiry */}
                            <div className="flex gap-2 mt-3 flex-wrap">
                                <ExpiryBadge
                                    status={selectedVehicle.documentExpiry.techInspection.status}
                                    label="Техосмотр"
                                    date={selectedVehicle.documentExpiry.techInspection.expiry}
                                />
                                <ExpiryBadge
                                    status={selectedVehicle.documentExpiry.osago.status}
                                    label="ОСАГО"
                                    date={selectedVehicle.documentExpiry.osago.expiry}
                                />
                                <ExpiryBadge
                                    status={selectedVehicle.documentExpiry.maintenance.status}
                                    label="ТО"
                                    date={selectedVehicle.documentExpiry.maintenance.expiry}
                                />
                                <ExpiryBadge
                                    status={selectedVehicle.documentExpiry.tachograph.status}
                                    label="Тахограф"
                                    date={selectedVehicle.documentExpiry.tachograph.expiry}
                                />
                            </div>
                        </div>

                        {/* Checklist */}
                        <div className="p-6">
                            <div className="flex items-center justify-between gap-3 mb-4">
                                <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Inspection type</h3>
                                
                                <div className="flex bg-slate-100 rounded-xl p-1">
                                    <button
                                        onClick={() => setInspectionType('pre_trip')}
                                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${inspectionType === 'pre_trip' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
                                    >
                                        Pre-trip
                                    </button>
                                    <button
                                        onClick={() => setInspectionType('periodic')}
                                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${inspectionType === 'periodic' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
                                    >
                                        Periodic
                                    </button>
                                </div>
                            </div>

                            <p className="text-xs text-slate-500 mb-4">
                                {inspectionType === 'pre_trip'
                                    ? 'Inspection is linked to the selected trip and can advance the waybill status.'
                                    : 'Periodic inspection is recorded without affecting the trip or waybill.'}
                            </p>

                            <h3 className="sr-only">
                                <ClipboardCheck className="w-4 h-4 inline mr-1.5" />
                                Чек-лист осмотра
                            </h3>

                            <div className="space-y-2">
                                {checklistItems.map((item, idx) => (
                                    <div
                                        key={idx}
                                        className={`flex items-center gap-3 p-3 rounded-xl border transition ${item.result === 'ok'
                                            ? 'border-emerald-200 bg-emerald-50'
                                            : item.result === 'fault'
                                                ? 'border-red-200 bg-red-50'
                                                : 'border-slate-200 bg-white'
                                            }`}
                                    >
                                        <span className="flex-1 text-sm font-medium text-slate-800 min-w-[180px]">
                                            {item.name}
                                        </span>

                                        <div className="flex items-center gap-1.5">
                                            <button
                                                onClick={() => updateItem(idx, 'result', 'ok')}
                                                className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${item.result === 'ok'
                                                    ? 'bg-emerald-600 text-white shadow-sm'
                                                    : 'bg-slate-100 text-slate-500 hover:bg-emerald-100 hover:text-emerald-700'
                                                    }`}
                                            >
                                                ОК
                                            </button>
                                            <button
                                                onClick={() => updateItem(idx, 'result', 'fault')}
                                                className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${item.result === 'fault'
                                                    ? 'bg-red-600 text-white shadow-sm'
                                                    : 'bg-slate-100 text-slate-500 hover:bg-red-100 hover:text-red-700'
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
                                                className="flex-1 max-w-[250px] px-3 py-2 text-sm border border-red-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-red-300"
                                            />
                                        )}
                                    </div>
                                ))}
                            </div>

                            {/* Signature (PEP) */}
                            <div className="mt-6 p-4 bg-slate-50 rounded-xl border border-slate-200">
                                <label className="block text-sm font-semibold text-slate-700 mb-2">
                                    <Shield className="w-4 h-4 inline mr-1.5" />
                                    Подтверждение (ПЭП) — введите пароль
                                </label>
                                <input
                                    type="password"
                                    placeholder="Пароль для электронной подписи"
                                    value={signature}
                                    onChange={e => setSignature(e.target.value)}
                                    className="w-full max-w-md px-4 py-3 text-base border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400"
                                />
                            </div>

                            {/* Decision buttons */}
                            <div className="flex gap-4 mt-6">
                                <button
                                    onClick={() => submitInspection('approved')}
                                    disabled={submitting}
                                    className="flex-1 flex items-center justify-center gap-2 px-8 py-4 bg-gradient-to-r from-emerald-600 to-emerald-500 text-white rounded-xl text-lg font-bold shadow-lg shadow-emerald-200 hover:shadow-emerald-300 hover:from-emerald-700 hover:to-emerald-600 transition disabled:opacity-50"
                                >
                                    <CheckCircle2 className="w-6 h-6" />
                                    Допустить
                                </button>
                                <button
                                    onClick={() => submitInspection('rejected')}
                                    disabled={submitting}
                                    className="flex-1 flex items-center justify-center gap-2 px-8 py-4 bg-gradient-to-r from-red-600 to-red-500 text-white rounded-xl text-lg font-bold shadow-lg shadow-red-200 hover:shadow-red-300 hover:from-red-700 hover:to-red-600 transition disabled:opacity-50"
                                >
                                    <XCircle className="w-6 h-6" />
                                    Не допустить
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Queue Tab */}
                {activeTab === 'queue' && !selectedVehicle && (
                    <div>
                        <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                            <Truck className="w-5 h-5 text-orange-500" />
                            Очередь на техосмотр
                        </h2>

                        {loading ? (
                            <div className="flex items-center justify-center py-20">
                                <div className="w-10 h-10 border-4 border-orange-200 border-t-orange-600 rounded-full animate-spin" />
                            </div>
                        ) : queue.length === 0 ? (
                            <div className="text-center py-20 bg-white rounded-2xl border border-slate-200">
                                <CheckCircle2 className="w-16 h-16 text-emerald-400 mx-auto mb-4" />
                                <p className="text-lg font-semibold text-slate-600">Все ТС осмотрены</p>
                                <p className="text-sm text-slate-400 mt-1">Новые ТС появятся после назначения рейсов</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                {queue.map((item) => (
                                    <Card
                                        key={item.vehicle.id}
                                        onClick={() => selectVehicle(item)}
                                        className="cursor-pointer hover:border-orange-300 hover:shadow-lg hover:shadow-orange-50 transition-all text-left group"
                                    >
                                        <CardContent className="p-5">
                                            <div className="flex items-center justify-between mb-3">
                                                <span className="text-xl font-bold text-slate-900">
                                                    {item.vehicle.plateNumber}
                                                </span>
                                                <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-orange-500 transition" />
                                            </div>

                                            <p className="text-sm text-slate-500 mb-1">
                                                {item.vehicle.make} {item.vehicle.model} ({item.vehicle.year})
                                            </p>
                                            <p className="text-xs text-slate-400 mb-3">
                                                Пробег: {Math.round(item.vehicle.currentOdometerKm).toLocaleString()} км
                                                • Рейс: {item.trip.number}
                                            </p>

                                            {/* Document expiry mini */}
                                            <div className="flex flex-wrap gap-1.5">
                                                <ExpiryBadge
                                                    status={item.documentExpiry.techInspection.status}
                                                    label="ТО"
                                                    date={null}
                                                />
                                                <ExpiryBadge
                                                    status={item.documentExpiry.osago.status}
                                                    label="ОСАГО"
                                                    date={null}
                                                />
                                                <ExpiryBadge
                                                    status={item.documentExpiry.tachograph.status}
                                                    label="Тахограф"
                                                    date={null}
                                                />
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Journal Tab */}
                {activeTab === 'journal' && (
                    <div>
                        <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                            <FileCheck className="w-5 h-5 text-blue-500" />
                            Журнал техосмотров
                        </h2>

                        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-slate-100 bg-slate-50">
                                        <th className="text-left px-4 py-3 font-semibold text-slate-600">Дата</th>
                                        <th className="text-left px-4 py-3 font-semibold text-slate-600">ТС</th>
                                        <th className="text-left px-4 py-3 font-semibold text-slate-600">Решение</th>
                                        <th className="text-left px-4 py-3 font-semibold text-slate-600">Неисправности</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {journal.length === 0 ? (
                                        <tr>
                                            <td colSpan={4} className="text-center py-10 text-slate-400">
                                                Нет записей
                                            </td>
                                        </tr>
                                    ) : (
                                        journal.map((record) => (
                                            <tr key={record.id} className="border-b border-slate-50 hover:bg-slate-50">
                                                <td className="px-4 py-3 text-slate-600">
                                                    {new Date(record.createdAt).toLocaleString('ru-RU', {
                                                        day: '2-digit',
                                                        month: '2-digit',
                                                        year: '2-digit',
                                                        hour: '2-digit',
                                                        minute: '2-digit',
                                                    })}
                                                </td>
                                                <td className="px-4 py-3 font-medium text-slate-900">
                                                    {vehicleMap[record.vehicleId] || record.vehicleId.substring(0, 8) + '...'}
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
                                                <td className="px-4 py-3 text-slate-500 text-xs">
                                                    {record.items
                                                        ?.filter(i => i.result === 'fault')
                                                        .map(i => i.name)
                                                        .join(', ') || '—'}
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
        </div>
    );
}
