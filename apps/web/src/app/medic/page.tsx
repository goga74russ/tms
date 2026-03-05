'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '../../lib/api';
import {
    HeartPulse, CheckCircle2, XCircle, AlertTriangle, Clock,
    ChevronRight, Shield, Users, BarChart3, RotateCcw,
    Activity, Thermometer, Wine, FileText, Calendar,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

// ================================================================
// Types
// ================================================================
interface DriverQueueItem {
    trip: { id: string; number: string; plannedDepartureAt: string | null };
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
    decision: string;
    createdAt: string;
}

// ================================================================
// Certificate status badge
// ================================================================
function CertBadge({ status, expiry }: { status: string; expiry: string | null }) {
    const config: Record<string, { color: string; label: string; icon: React.ReactNode }> = {
        green: { color: 'bg-emerald-100 text-emerald-700', label: 'Актуальна', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
        yellow: { color: 'bg-amber-100 text-amber-700', label: 'Истекает скоро', icon: <AlertTriangle className="w-3.5 h-3.5" /> },
        red: { color: 'bg-red-100 text-red-700', label: 'Просрочена', icon: <XCircle className="w-3.5 h-3.5" /> },
        unknown: { color: 'bg-slate-100 text-slate-500', label: 'Нет данных', icon: <Clock className="w-3.5 h-3.5" /> },
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

// ================================================================
// Main Page
// ================================================================
export default function MedicPage() {
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
    const [activeTab, setActiveTab] = useState<'queue' | 'journal' | 'stats'>('queue');
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

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
    }, [loadQueue, loadStats, loadExpiringCerts, loadJournal]);

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
            !formData.temperature || !formData.alcoholTest) {
            setToast({ message: 'Заполните все обязательные показатели', type: 'error' });
            return;
        }

        try {
            setSubmitting(true);
            await api.post('/inspections/med', {
                driverId: selectedDriver.driver.id,
                tripId: selectedDriver.trip.id,
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

            setSelectedDriver(null);
            await loadQueue();
            await loadJournal();
            await loadStats();
        } catch (err: any) {
            setToast({ message: err.message || 'Ошибка', type: 'error' });
        } finally {
            setSubmitting(false);
        }
    };

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
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center">
                            <HeartPulse className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-slate-900">Медосмотр</h1>
                            <p className="text-sm text-slate-500">Предрейсовый осмотр водителей</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => { loadQueue(); loadStats(); }}
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
                            <button
                                onClick={() => setActiveTab('stats')}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${activeTab === 'stats'
                                    ? 'bg-white text-slate-900 shadow-sm'
                                    : 'text-slate-500 hover:text-slate-700'
                                    }`}
                            >
                                Статистика
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            {/* Toast */}
            {toast && (
                <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-xl shadow-lg text-white font-medium text-sm ${toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'
                    }`}>
                    {toast.message}
                </div>
            )}

            <div className="p-6">
                {/* Expiring certificates warning */}
                {expiringCerts.length > 0 && activeTab === 'queue' && !selectedDriver && (
                    <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
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

                {/* Inspection form */}
                {selectedDriver && activeTab === 'queue' && (
                    <div className="mb-6 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        {/* Driver header */}
                        <div className="bg-gradient-to-r from-rose-700 to-pink-600 px-6 py-4 text-white">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center text-xl font-bold">
                                        {selectedDriver.driver.fullName.charAt(0)}
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-bold">{selectedDriver.driver.fullName}</h2>
                                        <p className="text-rose-200 text-sm">
                                            ВУ: {selectedDriver.driver.licenseNumber} •
                                            Категории: {selectedDriver.driver.licenseCategories?.join(', ') || '—'} •
                                            Рейс: {selectedDriver.trip.number}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setSelectedDriver(null)}
                                    className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm transition"
                                >
                                    ← Назад
                                </button>
                            </div>

                            <div className="mt-3">
                                <CertBadge
                                    status={selectedDriver.driver.medCertStatus}
                                    expiry={selectedDriver.driver.medCertificateExpiry}
                                />
                            </div>
                        </div>

                        {/* Medical form */}
                        <div className="p-6">
                            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">
                                <Activity className="w-4 h-4 inline mr-1.5" />
                                Показатели осмотра
                            </h3>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {/* Blood Pressure */}
                                <div className="space-y-2">
                                    <label className="block text-sm font-semibold text-slate-700">
                                        <Activity className="w-4 h-4 inline mr-1" />
                                        АД (мм рт.ст.) *
                                    </label>
                                    <div className="flex gap-2">
                                        <input
                                            type="number"
                                            placeholder="Систолическое"
                                            value={formData.systolicBp}
                                            onChange={e => updateForm('systolicBp', e.target.value)}
                                            className="flex-1 px-4 py-3 text-base border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-rose-400"
                                            min={60}
                                            max={250}
                                        />
                                        <span className="flex items-center text-slate-400 font-bold">/</span>
                                        <input
                                            type="number"
                                            placeholder="Диастолическое"
                                            value={formData.diastolicBp}
                                            onChange={e => updateForm('diastolicBp', e.target.value)}
                                            className="flex-1 px-4 py-3 text-base border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-rose-400"
                                            min={40}
                                            max={150}
                                        />
                                    </div>
                                </div>

                                {/* Heart Rate */}
                                <div className="space-y-2">
                                    <label className="block text-sm font-semibold text-slate-700">
                                        <HeartPulse className="w-4 h-4 inline mr-1" />
                                        Пульс (уд/мин) *
                                    </label>
                                    <input
                                        type="number"
                                        placeholder="60-100"
                                        value={formData.heartRate}
                                        onChange={e => updateForm('heartRate', e.target.value)}
                                        className="w-full px-4 py-3 text-base border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-rose-400"
                                        min={30}
                                        max={200}
                                    />
                                </div>

                                {/* Temperature */}
                                <div className="space-y-2">
                                    <label className="block text-sm font-semibold text-slate-700">
                                        <Thermometer className="w-4 h-4 inline mr-1" />
                                        Температура (°C) *
                                    </label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        placeholder="36.6"
                                        value={formData.temperature}
                                        onChange={e => updateForm('temperature', e.target.value)}
                                        className="w-full px-4 py-3 text-base border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-rose-400"
                                        min={34}
                                        max={42}
                                    />
                                </div>

                                {/* Condition */}
                                <div className="space-y-2">
                                    <label className="block text-sm font-semibold text-slate-700">
                                        Состояние *
                                    </label>
                                    <select
                                        value={formData.condition}
                                        onChange={e => updateForm('condition', e.target.value)}
                                        className="w-full px-4 py-3 text-base border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-rose-400 bg-white"
                                    >
                                        <option value="удовлетворительное">Удовлетворительное</option>
                                        <option value="неудовлетворительное">Неудовлетворительное</option>
                                        <option value="подозрение на заболевание">Подозрение на заболевание</option>
                                    </select>
                                </div>

                                {/* Alcohol test */}
                                <div className="space-y-2">
                                    <label className="block text-sm font-semibold text-slate-700">
                                        <Wine className="w-4 h-4 inline mr-1" />
                                        Алкотест *
                                    </label>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => updateForm('alcoholTest', 'negative')}
                                            className={`flex-1 px-4 py-3 rounded-xl text-sm font-semibold transition ${formData.alcoholTest === 'negative'
                                                ? 'bg-emerald-600 text-white shadow-sm'
                                                : 'bg-slate-100 text-slate-500 hover:bg-emerald-100 hover:text-emerald-700'
                                                }`}
                                        >
                                            Отрицательный
                                        </button>
                                        <button
                                            onClick={() => updateForm('alcoholTest', 'positive')}
                                            className={`flex-1 px-4 py-3 rounded-xl text-sm font-semibold transition ${formData.alcoholTest === 'positive'
                                                ? 'bg-red-600 text-white shadow-sm'
                                                : 'bg-slate-100 text-slate-500 hover:bg-red-100 hover:text-red-700'
                                                }`}
                                        >
                                            Положительный
                                        </button>
                                    </div>
                                </div>

                                {/* Complaints */}
                                <div className="space-y-2">
                                    <label className="block text-sm font-semibold text-slate-700">
                                        Жалобы
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="Нет жалоб"
                                        value={formData.complaints}
                                        onChange={e => updateForm('complaints', e.target.value)}
                                        className="w-full px-4 py-3 text-base border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-rose-400"
                                    />
                                </div>
                            </div>

                            {/* Signature */}
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
                                    className="w-full max-w-md px-4 py-3 text-base border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-rose-400"
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
                {activeTab === 'queue' && !selectedDriver && (
                    <div>
                        <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                            <Users className="w-5 h-5 text-rose-500" />
                            Очередь на медосмотр
                        </h2>

                        {loading ? (
                            <div className="flex items-center justify-center py-20">
                                <div className="w-10 h-10 border-4 border-rose-200 border-t-rose-600 rounded-full animate-spin" />
                            </div>
                        ) : queue.length === 0 ? (
                            <div className="text-center py-20 bg-white rounded-2xl border border-slate-200">
                                <CheckCircle2 className="w-16 h-16 text-emerald-400 mx-auto mb-4" />
                                <p className="text-lg font-semibold text-slate-600">Все водители осмотрены</p>
                                <p className="text-sm text-slate-400 mt-1">Новые водители появятся после назначения рейсов</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                {queue.map((item) => (
                                    <Card
                                        key={item.driver.id}
                                        onClick={() => selectDriver(item)}
                                        className={`cursor-pointer transition-all text-left group ${item.driver.personalDataConsent
                                            ? 'hover:border-rose-300 hover:shadow-rose-50'
                                            : 'border-red-200 bg-red-50 opacity-75'
                                            }`}
                                    >
                                        <CardContent className="p-5">
                                            <div className="flex items-center justify-between mb-3">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-100 to-pink-100 flex items-center justify-center text-rose-600 font-bold">
                                                        {item.driver.fullName.charAt(0)}
                                                    </div>
                                                    <span className="text-base font-bold text-slate-900">
                                                        {item.driver.fullName}
                                                    </span>
                                                </div>
                                                <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-rose-500 transition" />
                                            </div>

                                            <p className="text-xs text-slate-400 mb-2">
                                                ВУ: {item.driver.licenseNumber} • Рейс: {item.trip.number}
                                            </p>

                                            <div className="flex flex-wrap gap-1.5">
                                                <CertBadge
                                                    status={item.driver.medCertStatus}
                                                    expiry={item.driver.medCertificateExpiry}
                                                />
                                                {!item.driver.personalDataConsent && (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-red-100 text-red-700">
                                                        <XCircle className="w-3.5 h-3.5" />
                                                        Нет согласия ПД
                                                    </span>
                                                )}
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
                            <FileText className="w-5 h-5 text-blue-500" />
                            Журнал медосмотров
                        </h2>

                        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-slate-100 bg-slate-50">
                                        <th className="text-left px-4 py-3 font-semibold text-slate-600">Дата / Время</th>
                                        <th className="text-left px-4 py-3 font-semibold text-slate-600">Водитель</th>
                                        <th className="text-left px-4 py-3 font-semibold text-slate-600">Решение</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {journal.length === 0 ? (
                                        <tr>
                                            <td colSpan={3} className="text-center py-10 text-slate-400">
                                                Нет записей
                                            </td>
                                        </tr>
                                    ) : (
                                        journal.map((record) => (
                                            <tr key={record.id} className="border-b border-slate-50 hover:bg-slate-50">
                                                <td className="px-4 py-3 text-slate-600">
                                                    {new Date(record.createdAt).toLocaleString('ru-RU', {
                                                        day: '2-digit', month: '2-digit', year: '2-digit',
                                                        hour: '2-digit', minute: '2-digit',
                                                    })}
                                                </td>
                                                <td className="px-4 py-3 font-medium text-slate-900">
                                                    {record.driverId.substring(0, 8)}...
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
                        <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                            <BarChart3 className="w-5 h-5 text-indigo-500" />
                            Статистика недопусков (30 дней)
                        </h2>

                        {stats && (
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                                <Card>
                                    <CardContent className="p-5">
                                        <p className="text-sm text-slate-500 mb-1">Всего осмотров</p>
                                        <p className="text-3xl font-bold text-slate-900">{stats.total}</p>
                                    </CardContent>
                                </Card>
                                <Card className="border-emerald-200">
                                    <CardContent className="p-5">
                                        <p className="text-sm text-emerald-600 mb-1">Допущены</p>
                                        <p className="text-3xl font-bold text-emerald-700">{stats.approved}</p>
                                    </CardContent>
                                </Card>
                                <Card className="border-red-200">
                                    <CardContent className="p-5">
                                        <p className="text-sm text-red-600 mb-1">Не допущены</p>
                                        <p className="text-3xl font-bold text-red-700">{stats.rejected}</p>
                                    </CardContent>
                                </Card>
                                <Card className="border-amber-200">
                                    <CardContent className="p-5">
                                        <p className="text-sm text-amber-600 mb-1">% недопусков</p>
                                        <p className="text-3xl font-bold text-amber-700">{stats.rejectionRate}%</p>
                                    </CardContent>
                                </Card>
                            </div>
                        )}

                        {/* Expiring certificates section */}
                        {expiringCerts.length > 0 && (
                            <div className="bg-white rounded-2xl border border-slate-200 p-5">
                                <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
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
                                                <span className="font-medium text-slate-800 text-sm">{cert.fullName}</span>
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
        </div>
    );
}
