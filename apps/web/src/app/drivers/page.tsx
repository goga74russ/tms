'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { Search, Plus, Users, X, Loader2, AlertTriangle, Timer } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartTooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { format, subDays } from 'date-fns';

interface Driver {
    id: string;
    fullName: string;
    licenseNumber: string;
    licenseCategories: string[];
    licenseExpiry: string;
    medCertificateExpiry?: string;
    phone?: string;
    isActive: boolean;
    createdAt: string;
}

interface HosStatus {
    dayHours: number;
    weekHours: number;
    dayLimit: number;
    weekLimit: number;
    breach: boolean;
}

interface HoursSummary {
    dailyHours: Array<{ date: string; hours: number }>;
    weeklyHours: Array<{ weekStart: string; hours: number }>;
    breaches: Array<{ date: string; reason: string }>;
}

function formatDate(d?: string) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('ru-RU');
}

function expiryColor(d?: string) {
    if (!d) return '';
    const diff = (new Date(d).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    if (diff < 0) return 'text-red-700 font-bold';
    if (diff < 7) return 'text-red-600';
    if (diff <= 30) return 'text-amber-600';
    return 'text-emerald-600';
}

function HosBadge({ driverId }: { driverId: string }) {
    const [status, setStatus] = useState<HosStatus | null>(null);
    const [loading, setLoading] = useState(false);
    const [hover, setHover] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        api.get<{ success: boolean; data: HosStatus }>(`/drivers/${driverId}/hos-status`)
            .then(res => {
                if (cancelled) return;
                if (res?.success && res.data) setStatus(res.data);
            })
            .catch(() => { /* silent */ })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [driverId]);

    if (loading && !status) {
        return <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-300" />;
    }
    if (!status) return <span className="text-xs text-slate-300">—</span>;

    const breach = status.breach;
    return (
        <div className="relative inline-block" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
            {breach ? (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-xs font-semibold">
                    <AlertTriangle className="w-3 h-3" />
                    <span>⚠</span>
                </span>
            ) : (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-xs font-medium">
                    <Timer className="w-3 h-3" />
                    {status.dayHours.toFixed(1)}ч
                </span>
            )}
            {hover && (
                <div className="absolute z-10 left-0 top-full mt-1 w-56 px-3 py-2 rounded-lg bg-slate-900 text-white text-xs shadow-lg pointer-events-none">
                    <div>Сегодня: {status.dayHours.toFixed(1)} / {status.dayLimit} ч</div>
                    <div>Неделя: {status.weekHours.toFixed(1)} / {status.weekLimit} ч</div>
                    {breach && <div className="text-red-300 mt-0.5 font-semibold">Нарушение режима</div>}
                </div>
            )}
        </div>
    );
}

function HoursChartDialog({ driver, onClose }: { driver: Driver; onClose: () => void }) {
    const [summary, setSummary] = useState<HoursSummary | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const to = new Date();
        const from = subDays(to, 6);
        const fromStr = format(from, 'yyyy-MM-dd');
        const toStr = format(to, 'yyyy-MM-dd');
        setLoading(true);
        api.get<{ success: boolean; data: HoursSummary }>(
            `/drivers/${driver.id}/hours-summary?from=${fromStr}&to=${toStr}`,
        )
            .then(res => {
                if (res?.success && res.data) setSummary(res.data);
            })
            .catch(() => { /* silent */ })
            .finally(() => setLoading(false));
    }, [driver.id]);

    const chartData = (summary?.dailyHours || []).map(d => ({
        day: format(new Date(d.date), 'dd.MM'),
        hours: Number(d.hours.toFixed(2)),
    }));

    return (
        <Dialog open onClose={onClose} title={`РТО — ${driver.fullName}`}>
            <div className="space-y-3">
                <p className="text-sm text-slate-500">Часы работы за последние 7 дней</p>
                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
                    </div>
                ) : chartData.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-8">Нет данных за период</p>
                ) : (
                    <div style={{ width: '100%', height: 240 }}>
                        <ResponsiveContainer>
                            <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                                <YAxis tick={{ fontSize: 12 }} domain={[0, 12]} />
                                <RechartTooltip />
                                <ReferenceLine y={9} stroke="#dc2626" strokeDasharray="4 2" label={{ value: 'Лимит 9ч', position: 'right', fontSize: 10, fill: '#dc2626' }} />
                                <Bar dataKey="hours" fill="#6366f1" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                )}
                {summary?.breaches && summary.breaches.length > 0 && (
                    <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs space-y-1">
                        <div className="font-semibold text-rose-700 flex items-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            Нарушения ({summary.breaches.length})
                        </div>
                        {summary.breaches.slice(0, 5).map((b, i) => (
                            <div key={i} className="text-rose-700">
                                {format(new Date(b.date), 'dd.MM')}: {b.reason}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </Dialog>
    );
}

function CreateDriverModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
    const [fullName, setFullName] = useState('');
    const [licenseNumber, setLicenseNumber] = useState('');
    const [licenseCategories, setLicenseCategories] = useState('');
    const [licenseExpiry, setLicenseExpiry] = useState('');
    const [medCertExpiry, setMedCertExpiry] = useState('');
    const [adrCertExpiry, setAdrCertExpiry] = useState('');
    const [phone, setPhone] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    async function handleSubmit() {
        if (!fullName || !licenseNumber) {
            setError('Укажите ФИО и номер ВУ');
            return;
        }
        setSubmitting(true);
        setError('');
        try {
            const result = await api.post<any>('/fleet/drivers', {
                fullName,
                licenseNumber,
                licenseCategories: licenseCategories.split(',').map(s => s.trim()).filter(Boolean),
                licenseExpiry: licenseExpiry || undefined,
                medCertificateExpiry: medCertExpiry || undefined,
                adrCertificateExpiry: adrCertExpiry || undefined,
                phone: phone || undefined,
            });
            if (result.success) {
                onCreated();
            } else {
                throw new Error(result.error || 'Ошибка');
            }
        } catch (err: any) {
            setError(err.message || 'Ошибка сервера');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                    <h2 className="text-lg font-bold text-slate-900">Новый водитель</h2>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X className="w-5 h-5" /></button>
                </div>
                <div className="px-6 py-5 space-y-4">
                    <div>
                        <label className="text-sm font-medium text-slate-700 mb-1.5 block">ФИО *</label>
                        <input type="text" value={fullName} onChange={e => setFullName(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            placeholder="Иванов Иван Иванович" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-sm font-medium text-slate-700 mb-1.5 block">Номер ВУ *</label>
                            <input type="text" value={licenseNumber} onChange={e => setLicenseNumber(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                placeholder="77 01 123456" />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-slate-700 mb-1.5 block">Категории</label>
                            <input type="text" value={licenseCategories} onChange={e => setLicenseCategories(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                placeholder="B, C, CE" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-sm font-medium text-slate-700 mb-1.5 block">Срок ВУ</label>
                            <input type="date" value={licenseExpiry} onChange={e => setLicenseExpiry(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-slate-700 mb-1.5 block">Медсправка до</label>
                            <input type="date" value={medCertExpiry} onChange={e => setMedCertExpiry(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                        </div>
                    </div>
                    <div>
                        <label className="text-sm font-medium text-slate-700 mb-1.5 block">ADR-сертификат до</label>
                        <input type="date" value={adrCertExpiry} onChange={e => setAdrCertExpiry(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                        <p className="text-xs text-slate-400 mt-1">Срок действия свидетельства о подготовке водителей ТС, перевозящих опасные грузы.</p>
                    </div>
                    <div>
                        <label className="text-sm font-medium text-slate-700 mb-1.5 block">Телефон</label>
                        <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            placeholder="+7 (999) 123-45-67" />
                    </div>
                    {error && <p className="text-sm text-red-600">{error}</p>}
                </div>
                <div className="px-6 py-4 border-t border-slate-100 flex gap-3 justify-end">
                    <button onClick={onClose} disabled={submitting} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100">Отмена</button>
                    <button onClick={handleSubmit} disabled={submitting}
                        className="px-5 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
                        {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                        {submitting ? 'Создание...' : 'Создать'}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function DriversPage() {
    const [drivers, setDrivers] = useState<Driver[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [hosDriver, setHosDriver] = useState<Driver | null>(null);

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(search), 300);
        return () => clearTimeout(timer);
    }, [search]);

    const loadDrivers = useCallback(async () => {
        setLoading(true);
        try {
            const result = await api.get<any>(`/fleet/drivers?search=${debouncedSearch}&limit=100`);
            setDrivers(result.data || []);
        } catch (err) {
            console.error('Failed to load drivers:', err);
        } finally {
            setLoading(false);
        }
    }, [debouncedSearch]);

    useEffect(() => {
        loadDrivers();
    }, [loadDrivers]);

    const activeCount = drivers.filter(d => d.isActive).length;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Водители</h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Реестр водителей • {activeCount} активных из {drivers.length}
                    </p>
                </div>
                <button
                    onClick={() => setShowCreateModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg
                    text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm">
                    <Plus className="w-4 h-4" />
                    Добавить водителя
                </button>
            </div>

            {/* Content Card */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200">
                {/* Search */}
                <div className="p-4 border-b border-slate-200">
                    <div className="relative max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Поиск по ФИО, номеру ВУ..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 text-sm
                                focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        />
                    </div>
                </div>

                {/* Table */}
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                    </div>
                ) : drivers.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                        <Users className="w-12 h-12 mb-3" />
                        <p className="text-sm">Водители не найдены</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50 text-slate-500 text-left">
                                    <th className="px-4 py-3 font-medium">ФИО</th>
                                    <th className="px-4 py-3 font-medium">Номер ВУ</th>
                                    <th className="px-4 py-3 font-medium">Категории</th>
                                    <th className="px-4 py-3 font-medium">Срок ВУ</th>
                                    <th className="px-4 py-3 font-medium">Медсправка</th>
                                    <th className="px-4 py-3 font-medium">РТО</th>
                                    <th className="px-4 py-3 font-medium">Статус</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {drivers.map(d => (
                                    <tr
                                        key={d.id}
                                        className="hover:bg-slate-50 transition-colors cursor-pointer"
                                        onClick={() => setHosDriver(d)}
                                    >
                                        <td className="px-4 py-3 font-medium text-slate-900">{d.fullName}</td>
                                        <td className="px-4 py-3 font-mono text-slate-600">{d.licenseNumber}</td>
                                        <td className="px-4 py-3">
                                            <div className="flex gap-1">
                                                {d.licenseCategories.map(c => (
                                                    <span key={c} className="px-1.5 py-0.5 bg-slate-100 rounded text-xs font-medium text-slate-600">
                                                        {c}
                                                    </span>
                                                ))}
                                            </div>
                                        </td>
                                        <td className={`px-4 py-3 text-sm ${expiryColor(d.licenseExpiry)}`}>
                                            {formatDate(d.licenseExpiry)}
                                        </td>
                                        <td className={`px-4 py-3 text-sm ${expiryColor(d.medCertificateExpiry)}`}>
                                            {formatDate(d.medCertificateExpiry)}
                                        </td>
                                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                                            {d.isActive ? <HosBadge driverId={d.id} /> : <span className="text-xs text-slate-300">—</span>}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium
                                                ${d.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                                {d.isActive ? 'Активен' : 'Неактивен'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {showCreateModal && (
                <CreateDriverModal
                    onClose={() => setShowCreateModal(false)}
                    onCreated={() => { setShowCreateModal(false); loadDrivers(); }}
                />
            )}

            {hosDriver && (
                <HoursChartDialog driver={hosDriver} onClose={() => setHosDriver(null)} />
            )}
        </div>
    );
}
