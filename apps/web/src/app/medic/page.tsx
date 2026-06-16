'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/lib/user-context';
import { api } from '../../lib/api';
import {
    HeartPulse, CheckCircle2, XCircle, AlertTriangle, Clock,
    Shield, Users, BarChart3, RotateCcw,
    Activity, Thermometer, Wine, FileText, Calendar,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Stat } from '@/components/ui/stat';
import { SkeletonTable } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { SideDrawer } from '@/components/ui/side-drawer';
import { useToast } from '@/components/ui/toast';
import {
    checkSystolicBP,
    checkDiastolicBP,
    checkPulse,
    checkTemperature,
    type WarningResult,
} from './vitals-warnings';

// ================================================================
// Types
// ================================================================
interface DriverQueueItem {
    trip: {
        id: string;
        number: string;
        plannedDepartureAt: string | null;
        waybillId?: string | null;
        waybillNumber?: string | null;
    };
    driver: {
        id: string;
        fullName: string;
        birthDate: string;
        licenseNumber: string;
        licenseCategories: string[];
        personalDataConsent: boolean;
        medCertificateExpiry: string | null;
        medCertStatus: 'green' | 'yellow' | 'red' | 'unknown';
    };
}

interface MedFormData {
    systolicBp: string;
    diastolicBp: string;
    heartRate: string;
    temperature: string;
    condition: string;
    alcoholTest: 'negative' | 'positive' | '';
    complaints: string;
}

interface RejectionStats {
    total: number;
    approved: number;
    rejected: number;
    rejectionRate: number;
    period: string;
}

interface ExpiringCert {
    id: string;
    fullName: string;
    medCertificateExpiry: string;
}

interface MedInspectionRecord {
    id: string;
    driverId: string;
    tripId?: string;
    decision: string;
    createdAt: string;
}

interface TripReference {
    tripNumber: string | null;
    waybillNumber: string | null;
}

type DateFilter = 'all' | 'today' | 'week';

// ================================================================
// Certificate status badge
// ================================================================
function CertBadge({ status, expiry }: { status: string; expiry: string | null }) {
    const config: Record<string, { color: string; label: string; icon: React.ReactNode }> = {
        green: { color: 'bg-emerald-100 text-emerald-700', label: 'Актуальна', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
        yellow: { color: 'bg-amber-100 text-amber-700', label: 'Истекает скоро', icon: <AlertTriangle className="w-3.5 h-3.5" /> },
        red: { color: 'bg-red-100 text-red-700', label: 'Просрочена', icon: <XCircle className="w-3.5 h-3.5" /> },
        unknown: { color: 'bg-neutral-100 text-neutral-500', label: 'Нет данных', icon: <Clock className="w-3.5 h-3.5" /> },
    };

    const c = config[status] || config.unknown;

    return (
        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium ${c.color}`}>
            {c.icon}
            <span>Медсправка: {c.label}</span>
            {expiry && (
                <span className="opacity-70 ml-1">
                    до {new Date(expiry).toLocaleDateString('ru-RU')}
                </span>
            )}
        </div>
    );
}

// Compact status pill — just status, no expiry, for list rows
function CertStatusPill({ status }: { status: string }) {
    const cfg: Record<string, { color: string; label: string }> = {
        green: { color: 'bg-emerald-100 text-emerald-700', label: 'Справка OK' },
        yellow: { color: 'bg-amber-100 text-amber-700', label: 'Истекает' },
        red: { color: 'bg-red-100 text-red-700', label: 'Просрочена' },
        unknown: { color: 'bg-neutral-100 text-neutral-500', label: 'Нет данных' },
    };
    const c = cfg[status] || cfg.unknown;
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${c.color}`}>
            {c.label}
        </span>
    );
}

// ================================================================
// Inline warning badge for vital-sign threshold alerts.
// Renders nothing when `warning` is null so call sites can stay declarative.
// ================================================================
function WarningBadge({ warning }: { warning: WarningResult | null }) {
    if (!warning) return null;
    const isCritical = warning.level === 'critical';
    return (
        <div
            className={`text-[11px] flex items-start gap-1 ${isCritical ? 'text-red-700' : 'text-amber-700'}`}
            role={isCritical ? 'alert' : 'status'}
        >
            <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
            <span>{warning.message}</span>
        </div>
    );
}

// ================================================================
// Main Page
// ================================================================
const ALLOWED_ROLES = ['medic', 'admin'];

export default function MedicPage() {
    const { user, loading: userLoading } = useUser();
    const router = useRouter();

    useEffect(() => {
        if (!userLoading && (!user || !user.roles.some(r => ALLOWED_ROLES.includes(r)))) {
            router.push('/');
        }
    }, [user, userLoading, router]);

    const [queue, setQueue] = useState<DriverQueueItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedDriver, setSelectedDriver] = useState<DriverQueueItem | null>(null);
    const [formData, setFormData] = useState<MedFormData>({
        systolicBp: '', diastolicBp: '', heartRate: '',
        temperature: '', condition: 'удовлетворительное',
        alcoholTest: '', complaints: '',
    });
    const [signature, setSignature] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [stats, setStats] = useState<RejectionStats | null>(null);
    const [expiringCerts, setExpiringCerts] = useState<ExpiringCert[]>([]);
    const [journal, setJournal] = useState<MedInspectionRecord[]>([]);
    const [driverMap, setDriverMap] = useState<Record<string, string>>({});
    const [tripReferences, setTripReferences] = useState<Record<string, TripReference>>({});
    const [activeTab, setActiveTab] = useState<'queue' | 'journal' | 'stats'>('queue');
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

    const loadQueue = useCallback(async () => {
        try {
            setLoading(true);
            const result = await api.get<{ success: boolean; data: DriverQueueItem[] }>('/inspections/med/queue');
            if (result.success) setQueue(result.data);
        } catch (err) {
            console.error('Failed to load queue:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    const loadStats = useCallback(async () => {
        try {
            const result = await api.get<{ success: boolean; data: RejectionStats }>('/inspections/med/stats?days=30');
            if (result.success) setStats(result.data);
        } catch (err) {
            console.error('Failed to load stats:', err);
        }
    }, []);

    const loadExpiringCerts = useCallback(async () => {
        try {
            const result = await api.get<{ success: boolean; data: ExpiringCert[] }>('/inspections/med/expiring-certificates?days=30');
            if (result.success) setExpiringCerts(result.data);
        } catch (err) {
            console.error('Failed to load expiring certs:', err);
        }
    }, []);

    const loadJournal = useCallback(async () => {
        try {
            const result = await api.get<{ success: boolean; data: MedInspectionRecord[] }>('/inspections/med?page=1&limit=50');
            if (result.success) setJournal(result.data);
        } catch (err) {
            console.error('Failed to load journal:', err);
        }
    }, []);

    useEffect(() => {
        loadQueue();
        loadStats();
        loadExpiringCerts();
        loadJournal();
        // Load driver names for journal
        (async () => {
            try {
                const res = await api.get<any>('/fleet/drivers?limit=200');
                const dm: Record<string, string> = {};
                for (const d of (res.data || [])) dm[d.id] = d.fullName;
                setDriverMap(dm);
            } catch { /* ignore */ }
        })();
    }, [loadQueue, loadStats, loadExpiringCerts, loadJournal]);

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
            if (dateFilter !== 'all' && item.trip.plannedDepartureAt) {
                const t = new Date(item.trip.plannedDepartureAt).getTime();
                if (dateFilter === 'today' && (t < startOfToday || t >= endOfToday)) return false;
                if (dateFilter === 'week' && (t < startOfWeek || t >= endOfToday)) return false;
            } else if (dateFilter !== 'all' && !item.trip.plannedDepartureAt) {
                return false;
            }
            if (q) {
                const hay = `${item.driver.fullName} ${item.driver.licenseNumber} ${item.trip.number}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });
    }, [queue, dateFilter, searchQuery]);

    const selectDriver = (item: DriverQueueItem) => {
        if (!item.driver.personalDataConsent) {
            setToast({
                message: '⚠️ Нет согласия на обработку персональных данных. Медосмотр в системе невозможен.',
                type: 'error',
            });
            return;
        }
        setSelectedDriver(item);
        setFormData({
            systolicBp: '', diastolicBp: '', heartRate: '',
            temperature: '', condition: 'удовлетворительное',
            alcoholTest: '', complaints: '',
        });
        setSignature('');
        setInspectionType('pre_trip');
        setDrawerOpen(true);
    };

    const closeDetail = () => {
        setSelectedDriver(null);
        setDrawerOpen(false);
    };

    const updateForm = (field: keyof MedFormData, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const submitInspection = async (decision: 'approved' | 'rejected') => {
        if (!selectedDriver) return;

        if (!signature) {
            setToast({ message: 'Введите пароль для подтверждения (ПЭП)', type: 'error' });
            return;
        }

        if (!formData.systolicBp || !formData.diastolicBp || !formData.heartRate ||
            !formData.temperature) {
            setToast({ message: 'Заполните показатели: АД, пульс, температура', type: 'error' });
            return;
        }
        // F-05: отдельная понятная ошибка вместо общей «заполните всё» — раньше
        // пустой алкотест ловился вместе с остальными и причина была неочевидна.
        if (!formData.alcoholTest) {
            setToast({ message: 'Укажите результат алкотеста: Отрицательный или Положительный', type: 'error' });
            return;
        }
        // P3 (код-аудит 2026-06-14): клиент не блокировал «Допустить» при
        // положительном алкотесте / критических витальных — допуск уезжал на
        // сервер и зависел только от серверной проверки. Блокируем здесь явно.
        if (decision === 'approved') {
            if (formData.alcoholTest === 'positive') {
                setToast({ message: 'Положительный алкотест — допуск запрещён', type: 'error' });
                return;
            }
            const criticalVital = [
                checkSystolicBP(formData.systolicBp),
                checkDiastolicBP(formData.diastolicBp),
                checkPulse(formData.heartRate),
                checkTemperature(formData.temperature),
            ].find((w): w is WarningResult => w?.level === 'critical');
            if (criticalVital) {
                setToast({ message: criticalVital.message, type: 'error' });
                return;
            }
        }

        try {
            setSubmitting(true);
            await api.post('/inspections/med', {
                driverId: selectedDriver.driver.id,
                tripId: inspectionType === 'pre_trip' ? selectedDriver.trip.id : undefined,
                inspectionType,
                checklistVersion: '1.0',
                systolicBp: parseInt(formData.systolicBp),
                diastolicBp: parseInt(formData.diastolicBp),
                heartRate: parseInt(formData.heartRate),
                temperature: parseFloat(formData.temperature),
                condition: formData.condition,
                alcoholTest: formData.alcoholTest,
                complaints: formData.complaints || undefined,
                decision,
                signature,
            });

            setToast({
                message: decision === 'approved'
                    ? `✅ ${selectedDriver.driver.fullName} — допущен`
                    : `❌ ${selectedDriver.driver.fullName} — не допущен`,
                type: decision === 'approved' ? 'success' : 'error',
            });

            closeDetail();
            await loadQueue();
            await loadJournal();
            await loadStats();
        } catch (err: any) {
            setToast({ message: err.message || 'Ошибка', type: 'error' });
        } finally {
            setSubmitting(false);
        }
    };

    // D5: quick override of an existing decision (no full vitals re-entry).
    const overrideDecision = async (record: MedInspectionRecord, decision: 'approved' | 'rejected') => {
        if (record.decision === decision) return;
        try {
            await api.post(`/inspections/med/${record.id}/decision`, { decision });
            setToast({
                message: decision === 'approved' ? 'Решение изменено: Допущен' : 'Решение изменено: Не допущен',
                type: decision === 'approved' ? 'success' : 'error',
            });
            await loadJournal();
            await loadQueue();
            await loadStats();
        } catch (err: any) {
            setToast({ message: err.message || 'Ошибка', type: 'error' });
        }
    };

    // ================================================================
    // Inspection form (re-usable: inline pane + SideDrawer)
    // ================================================================
    const renderInspectionForm = (compact: boolean) => {
        if (!selectedDriver) return null;
        return (
            <div className="bg-white">
                {/* Driver header */}
                {!compact && (
                    <div className="bg-gradient-to-r from-rose-700 to-pink-600 px-5 py-4 text-white rounded-t-2xl">
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-base font-bold shrink-0">
                                    {selectedDriver.driver.fullName.charAt(0)}
                                </div>
                                <div className="min-w-0">
                                    <h2 className="text-base font-bold truncate">{selectedDriver.driver.fullName}</h2>
                                    <p className="text-rose-200 text-xs truncate">
                                        ВУ: {selectedDriver.driver.licenseNumber}
                                        · Кат.: {selectedDriver.driver.licenseCategories?.join(', ') || '—'}
                                        · {tripReferences[selectedDriver.trip.id]?.waybillNumber
                                            ? `ПЛ: ${tripReferences[selectedDriver.trip.id]!.waybillNumber}`
                                            : 'ПЛ: не оформлен'}
                                        · Рейс: {selectedDriver.trip.number}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="mt-3">
                            <CertBadge
                                status={selectedDriver.driver.medCertStatus}
                                expiry={selectedDriver.driver.medCertificateExpiry}
                            />
                        </div>
                    </div>
                )}

                {/* Medical form */}
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
                        <Activity className="w-4 h-4 inline mr-1.5" />
                        Показатели осмотра
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {/* Blood Pressure */}
                        <div className="space-y-1.5">
                            <label className="block text-xs font-semibold text-neutral-700">
                                <Activity className="w-3.5 h-3.5 inline mr-1" />
                                АД (мм рт.ст.) *
                            </label>
                            <div className="flex gap-1.5">
                                <input
                                    type="number"
                                    placeholder="Сист."
                                    value={formData.systolicBp}
                                    onChange={e => updateForm('systolicBp', e.target.value)}
                                    className="flex-1 px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-rose-400"
                                    min={60}
                                    max={250}
                                />
                                <span className="flex items-center text-neutral-400 font-bold">/</span>
                                <input
                                    type="number"
                                    placeholder="Диаст."
                                    value={formData.diastolicBp}
                                    onChange={e => updateForm('diastolicBp', e.target.value)}
                                    className="flex-1 px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-rose-400"
                                    min={40}
                                    max={150}
                                />
                            </div>
                            {(() => {
                                const sysWarning = checkSystolicBP(formData.systolicBp);
                                const diaWarning = checkDiastolicBP(formData.diastolicBp);
                                if (!sysWarning && !diaWarning) return null;
                                return (
                                    <div className="space-y-0.5">
                                        <WarningBadge warning={sysWarning} />
                                        <WarningBadge warning={diaWarning} />
                                    </div>
                                );
                            })()}
                        </div>

                        {/* Heart Rate */}
                        <div className="space-y-1.5">
                            <label className="block text-xs font-semibold text-neutral-700">
                                <HeartPulse className="w-3.5 h-3.5 inline mr-1" />
                                Пульс (уд/мин) *
                            </label>
                            <input
                                type="number"
                                placeholder="60-100"
                                value={formData.heartRate}
                                onChange={e => updateForm('heartRate', e.target.value)}
                                className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-rose-400"
                                min={30}
                                max={200}
                            />
                            <WarningBadge warning={checkPulse(formData.heartRate)} />
                        </div>

                        {/* Temperature */}
                        <div className="space-y-1.5">
                            <label className="block text-xs font-semibold text-neutral-700">
                                <Thermometer className="w-3.5 h-3.5 inline mr-1" />
                                Температура (°C) *
                            </label>
                            <input
                                type="number"
                                step="0.1"
                                placeholder="36.6"
                                value={formData.temperature}
                                onChange={e => updateForm('temperature', e.target.value)}
                                className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-rose-400"
                                min={34}
                                max={42}
                            />
                            <WarningBadge warning={checkTemperature(formData.temperature)} />
                        </div>

                        {/* Condition */}
                        <div className="space-y-1.5">
                            <label className="block text-xs font-semibold text-neutral-700">
                                Состояние *
                            </label>
                            <select
                                value={formData.condition}
                                onChange={e => updateForm('condition', e.target.value)}
                                className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-rose-400 bg-white"
                            >
                                <option value="удовлетворительное">Удовлетворительное</option>
                                <option value="неудовлетворительное">Неудовлетворительное</option>
                                <option value="подозрение на заболевание">Подозрение на заболевание</option>
                            </select>
                        </div>

                        {/* Alcohol test */}
                        <div className="space-y-1.5 md:col-span-2">
                            <label className="block text-xs font-semibold text-neutral-700">
                                <Wine className="w-3.5 h-3.5 inline mr-1" />
                                Алкотест *
                            </label>
                            {/* F-05: type=button (тогглы были без него — риск submit формы),
                                + подсветка «не выбрано» для обязательного поля без дефолта
                                (дефолт «Отрицательный» сознательно не ставим — это запись
                                непроведённого теста под ПЭП-подписью медика). */}
                            <div className={`flex gap-2 rounded-lg ${formData.alcoholTest === '' ? 'ring-1 ring-amber-300' : ''}`}>
                                <button
                                    type="button"
                                    onClick={() => updateForm('alcoholTest', 'negative')}
                                    className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold transition ${formData.alcoholTest === 'negative'
                                        ? 'bg-emerald-600 text-white shadow-sm'
                                        : 'bg-neutral-100 text-neutral-500 hover:bg-emerald-100 hover:text-emerald-700'
                                        }`}
                                >
                                    Отрицательный
                                </button>
                                <button
                                    type="button"
                                    onClick={() => updateForm('alcoholTest', 'positive')}
                                    className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold transition ${formData.alcoholTest === 'positive'
                                        ? 'bg-red-600 text-white shadow-sm'
                                        : 'bg-neutral-100 text-neutral-500 hover:bg-red-100 hover:text-red-700'
                                        }`}
                                >
                                    Положительный
                                </button>
                            </div>
                            {formData.alcoholTest === '' && (
                                <p className="text-[11px] text-amber-600">Не выбрано — обязательное поле</p>
                            )}
                        </div>

                        {/* Complaints */}
                        <div className="space-y-1.5 md:col-span-2">
                            <label className="block text-xs font-semibold text-neutral-700">
                                Жалобы
                            </label>
                            <input
                                type="text"
                                placeholder="Нет жалоб"
                                value={formData.complaints}
                                onChange={e => updateForm('complaints', e.target.value)}
                                className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-rose-400"
                            />
                        </div>
                    </div>

                    {/* Signature */}
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
                            className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-rose-400"
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
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center">
                            <HeartPulse className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-neutral-900">Медосмотр</h1>
                            <p className="text-sm text-neutral-500">Предрейсовый осмотр водителей</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => { loadQueue(); loadStats(); }}
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
                            <button
                                onClick={() => setActiveTab('stats')}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${activeTab === 'stats'
                                    ? 'bg-white text-neutral-900 shadow-sm'
                                    : 'text-neutral-500 hover:text-neutral-700'
                                    }`}
                            >
                                Статистика
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            <div className="p-4 sm:p-6 space-y-6">
                {/* Stat cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Stat label="В очереди" value={queue.length} icon={Users} tone="warning" />
                    <Stat label="Истекают справки" value={expiringCerts.length} icon={Calendar} tone={expiringCerts.length > 0 ? 'warning' : 'success'} hint="в течение 30 дней" />
                    <Stat label="Допущено сегодня" value={journal.filter(r => r.decision === 'approved' && r.createdAt && new Date(r.createdAt).toDateString() === new Date().toDateString()).length} icon={CheckCircle2} tone="success" />
                    <Stat label="Отстранено сегодня" value={journal.filter(r => r.decision === 'rejected' && r.createdAt && new Date(r.createdAt).toDateString() === new Date().toDateString()).length} icon={XCircle} tone="danger" />
                </div>

                {/* Expiring certificates warning */}
                {expiringCerts.length > 0 && activeTab === 'queue' && !selectedDriver && (
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                        <div className="flex items-center gap-2 mb-2">
                            <AlertTriangle className="w-5 h-5 text-amber-600" />
                            <span className="font-semibold text-amber-800 text-sm">
                                Медсправки истекают в ближайшие 30 дней
                            </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {expiringCerts.map((cert) => (
                                <span key={cert.id} className="text-xs bg-amber-100 text-amber-700 px-2.5 py-1 rounded-lg">
                                    {cert.fullName} — до {new Date(cert.medCertificateExpiry).toLocaleDateString('ru-RU')}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {/* Queue Tab — two-pane */}
                {activeTab === 'queue' && (
                    <div className={`grid gap-4 ${selectedDriver ? 'xl:grid-cols-[minmax(360px,1fr)_minmax(0,420px)]' : 'grid-cols-1'}`}>
                        {/* LEFT: List + filters */}
                        <div className="min-w-0">
                            <div className="sticky top-0 z-10 -mx-1 px-1 py-2 bg-neutral-50/95 backdrop-blur-sm flex flex-wrap items-center gap-2 mb-2">
                                <div className="flex bg-white border border-neutral-200 rounded-lg p-0.5 shadow-sm">
                                    {(['all', 'today', 'week'] as DateFilter[]).map(f => (
                                        <button
                                            key={f}
                                            onClick={() => setDateFilter(f)}
                                            className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${dateFilter === f
                                                ? 'bg-rose-100 text-rose-700'
                                                : 'text-neutral-500 hover:text-neutral-700'
                                                }`}
                                        >
                                            {f === 'all' ? 'Все' : f === 'today' ? 'Сегодня' : 'Эта неделя'}
                                        </button>
                                    ))}
                                </div>
                                <input
                                    type="text"
                                    placeholder="Поиск по водителю / рейсу..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    className="flex-1 min-w-[160px] max-w-xs px-3 py-1.5 text-xs border border-neutral-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-rose-300"
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
                                    description="Новые водители появятся после назначения рейсов."
                                    tone="success"
                                />
                            ) : (
                                <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden divide-y divide-neutral-100">
                                    {filteredQueue.map((item) => {
                                        const isSelected = selectedDriver?.driver.id === item.driver.id;
                                        const noConsent = !item.driver.personalDataConsent;
                                        return (
                                            <div
                                                key={item.driver.id}
                                                onClick={() => selectDriver(item)}
                                                className={`group flex items-center gap-3 px-4 py-3 cursor-pointer transition relative ${isSelected
                                                    ? 'bg-rose-50 ring-1 ring-inset ring-rose-200'
                                                    : noConsent
                                                        ? 'bg-red-50/40 hover:bg-red-50'
                                                        : 'hover:bg-neutral-50'
                                                    }`}
                                            >
                                                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-rose-100 to-pink-100 flex items-center justify-center text-rose-700 font-bold text-xs shrink-0">
                                                    {item.driver.fullName.charAt(0)}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="text-sm font-bold text-neutral-900 truncate">
                                                            {item.driver.fullName}
                                                        </span>
                                                        <CertStatusPill status={item.driver.medCertStatus} />
                                                        {noConsent && (
                                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 text-red-700">
                                                                <XCircle className="w-3 h-3" />
                                                                Нет согласия ПД
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-[11px] text-neutral-500 truncate mt-0.5">
                                                        ВУ: {item.driver.licenseNumber}
                                                        {' · ПЛ: '}{tripReferences[item.trip.id]?.waybillNumber || 'еще не создан'}
                                                        {' · Рейс: '}{item.trip.number}
                                                    </p>
                                                </div>
                                                <div className="hidden group-hover:flex items-center gap-1 shrink-0">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); selectDriver(item); }}
                                                        className="px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold inline-flex items-center gap-1"
                                                        title="Открыть осмотр для допуска"
                                                    >
                                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                                        Допустить
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); selectDriver(item); }}
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
                        {selectedDriver && (
                            <div className="hidden xl:block min-w-0">
                                <div className="sticky top-2 rounded-2xl border border-neutral-200 shadow-sm overflow-hidden bg-white max-h-[calc(100vh-7rem)] overflow-y-auto">
                                    <div className="flex items-center justify-between px-4 py-2.5 bg-neutral-100 border-b border-neutral-200">
                                        <span className="text-xs font-semibold text-neutral-600 uppercase tracking-wide">
                                            Карточка медосмотра
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
                            <FileText className="w-5 h-5 text-blue-500" />
                            Журнал медосмотров
                        </h2>

                        <div className="bg-white rounded-2xl border border-neutral-200 overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-neutral-100 bg-neutral-50">
                                        <th className="text-left px-4 py-3 font-semibold text-neutral-600">Дата / Время</th>
                                        <th className="text-left px-4 py-3 font-semibold text-neutral-600">Водитель</th>
                                        <th className="text-left px-4 py-3 font-semibold text-neutral-600">ПЛ</th>
                                        <th className="text-left px-4 py-3 font-semibold text-neutral-600">Решение</th>
                                        <th className="text-left px-4 py-3 font-semibold text-neutral-600">Акт</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {journal.length === 0 ? (
                                        <tr>
                                            <td colSpan={5}>
                                                <div className="p-6">
                                                    <EmptyState
                                                        icon={FileText}
                                                        title="Журнал пуст"
                                                        description="Здесь появятся записи о медосмотрах."
                                                    />
                                                </div>
                                            </td>
                                        </tr>
                                    ) : (
                                        journal.map((record) => (
                                            <tr key={record.id} className="border-b border-neutral-50 hover:bg-neutral-50">
                                                <td className="px-4 py-3 text-neutral-600">
                                                    {new Date(record.createdAt).toLocaleString('ru-RU', {
                                                        day: '2-digit', month: '2-digit', year: '2-digit',
                                                        hour: '2-digit', minute: '2-digit',
                                                    })}
                                                </td>
                                                <td className="px-4 py-3 font-medium text-neutral-900">
                                                    {driverMap[record.driverId] || record.driverId.substring(0, 8) + '...'}
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
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <a
                                                            href={`/api/inspections/med/${record.id}/pdf`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100 transition"
                                                            title="Скачать акт PDF"
                                                        >
                                                            <FileText className="w-3.5 h-3.5" />
                                                            PDF акт
                                                        </a>
                                                        {/* D5: per-row decision override (calls POST /inspections/med/:id/decision). */}
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

                {/* Stats Tab */}
                {activeTab === 'stats' && (
                    <div>
                        <h2 className="text-lg font-bold text-neutral-800 mb-4 flex items-center gap-2">
                            <BarChart3 className="w-5 h-5 text-brand-500" />
                            Статистика недопусков (30 дней)
                        </h2>

                        {stats && (
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                                <Card>
                                    <CardContent className="p-5">
                                        <p className="text-sm text-neutral-500 mb-1">Всего осмотров</p>
                                        <p className="text-2xl sm:text-3xl font-bold text-neutral-900">{stats.total}</p>
                                    </CardContent>
                                </Card>
                                <Card className="border-emerald-200">
                                    <CardContent className="p-5">
                                        <p className="text-sm text-emerald-600 mb-1">Допущены</p>
                                        <p className="text-2xl sm:text-3xl font-bold text-emerald-700">{stats.approved}</p>
                                    </CardContent>
                                </Card>
                                <Card className="border-red-200">
                                    <CardContent className="p-5">
                                        <p className="text-sm text-red-600 mb-1">Не допущены</p>
                                        <p className="text-2xl sm:text-3xl font-bold text-red-700">{stats.rejected}</p>
                                    </CardContent>
                                </Card>
                                <Card className="border-amber-200">
                                    <CardContent className="p-5">
                                        <p className="text-sm text-amber-600 mb-1">% недопусков</p>
                                        <p className="text-2xl sm:text-3xl font-bold text-amber-700">{stats.rejectionRate}%</p>
                                    </CardContent>
                                </Card>
                            </div>
                        )}

                        {/* Expiring certificates section */}
                        {expiringCerts.length > 0 && (
                            <div className="bg-white rounded-2xl border border-neutral-200 p-5">
                                <h3 className="font-semibold text-neutral-800 mb-3 flex items-center gap-2">
                                    <Calendar className="w-4 h-4 text-amber-500" />
                                    Медсправки истекают ({expiringCerts.length})
                                </h3>
                                <div className="space-y-2">
                                    {expiringCerts.map((cert) => {
                                        const daysLeft = Math.ceil(
                                            (new Date(cert.medCertificateExpiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                                        );
                                        return (
                                            <div key={cert.id} className="flex items-center justify-between p-3 bg-amber-50 rounded-xl border border-amber-100">
                                                <span className="font-medium text-neutral-800 text-sm">{cert.fullName}</span>
                                                <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg ${daysLeft <= 0
                                                    ? 'bg-red-100 text-red-700'
                                                    : daysLeft <= 7
                                                        ? 'bg-red-100 text-red-600'
                                                        : 'bg-amber-100 text-amber-700'
                                                    }`}>
                                                    {daysLeft <= 0 ? 'Просрочена' : `${daysLeft} дн.`}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* SideDrawer — used on screens < xl */}
            <div className="xl:hidden">
                <SideDrawer
                    open={drawerOpen && !!selectedDriver && activeTab === 'queue'}
                    onClose={closeDetail}
                    title={selectedDriver ? `Медосмотр: ${selectedDriver.driver.fullName}` : ''}
                    subtitle={selectedDriver ? `ВУ ${selectedDriver.driver.licenseNumber} · Рейс ${selectedDriver.trip.number}` : ''}
                    width="lg"
                >
                    {renderInspectionForm(true)}
                </SideDrawer>
            </div>
        </div>
    );
}
