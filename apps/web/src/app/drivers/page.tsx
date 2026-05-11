'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { Search, Plus, Users, X, Loader2, AlertTriangle, Timer, ShieldCheck, HeartPulse, UserCheck } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Stat } from '@/components/ui/stat';
import { SkeletonTable } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
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
    const { toast } = useToast();
    const [fullName, setFullName] = useState('');
    const [licenseNumber, setLicenseNumber] = useState('');
    const [licenseCategories, setLicenseCategories] = useState('');
    const [licenseExpiry, setLicenseExpiry] = useState('');
    const [medCertExpiry, setMedCertExpiry] = useState('');
    const [adrCertExpiry, setAdrCertExpiry] = useState('');
    const [phone, setPhone] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [fieldError, setFieldError] = useState<{ fullName?: string; licenseNumber?: string }>({});

    async function handleSubmit() {
        const errs: { fullName?: string; licenseNumber?: string } = {};
        if (!fullName.trim()) errs.fullName = 'Укажите ФИО';
        if (!licenseNumber.trim()) errs.licenseNumber = 'Укажите номер ВУ';
        setFieldError(errs);
        if (Object.keys(errs).length > 0) return;

        setSubmitting(true);
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
                toast({ variant: 'success', title: 'Готово', description: `Водитель ${fullName} добавлен` });
                onCreated();
            } else {
                throw new Error(result.error || 'Ошибка');
            }
        } catch (err: any) {
            toast({ variant: 'error', title: 'Ошибка', description: err.message || 'Не удалось создать водителя' });
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
                    <button onClick={onClose} aria-label="Закрыть" className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X className="w-5 h-5" /></button>
                </div>
                <div className="px-6 py-5 space-y-4">
                    <Input
                        label="ФИО"
                        required
                        value={fullName}
                        onChange={e => setFullName(e.target.value)}
                        placeholder="Иванов Иван Иванович"
                        error={fieldError.fullName}
                    />
                    <div className="grid grid-cols-2 gap-3">
                        <Input
                            label="Номер ВУ"
                            required
                            value={licenseNumber}
                            onChange={e => setLicenseNumber(e.target.value)}
                            placeholder="77 01 123456"
                            error={fieldError.licenseNumber}
                        />
                        <Input
                            label="Категории"
                            value={licenseCategories}
                            onChange={e => setLicenseCategories(e.target.value)}
                            placeholder="B, C, CE"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <Input label="Срок ВУ" type="date" value={licenseExpiry} onChange={e => setLicenseExpiry(e.target.value)} />
                        <Input label="Медсправка до" type="date" value={medCertExpiry} onChange={e => setMedCertExpiry(e.target.value)} />
                    </div>
                    <Input
                        label="ADR-сертификат до"
                        type="date"
                        value={adrCertExpiry}
                        onChange={e => setAdrCertExpiry(e.target.value)}
                        helperText="Срок действия свидетельства о подготовке водителей ТС, перевозящих опасные грузы."
                    />
                    <Input
                        label="Телефон"
                        type="tel"
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                        placeholder="+7 (999) 123-45-67"
                    />
                </div>
                <div className="px-6 py-4 border-t border-slate-100 flex gap-3 justify-end">
                    <Button variant="outline" onClick={onClose} disabled={submitting}>Отмена</Button>
                    <Button variant="brand" isLoading={submitting} onClick={handleSubmit}>
                        {submitting ? 'Создание...' : 'Создать'}
                    </Button>
                </div>
            </div>
        </div>
    );
}

export default function DriversPage() {
    const { toast } = useToast();
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
        } catch (err: any) {
            toast({ variant: 'error', title: 'Не удалось загрузить водителей', description: err?.message || 'Сетевая ошибка' });
        } finally {
            setLoading(false);
        }
    }, [debouncedSearch, toast]);

    useEffect(() => {
        loadDrivers();
    }, [loadDrivers]);

    const activeCount = drivers.filter(d => d.isActive).length;
    const inactiveCount = drivers.length - activeCount;
    const now = Date.now();
    const licenseExpiringSoon = drivers.filter(d => {
        if (!d.licenseExpiry) return false;
        const diff = (new Date(d.licenseExpiry).getTime() - now) / (1000 * 60 * 60 * 24);
        return diff <= 30;
    }).length;
    const medExpiringSoon = drivers.filter(d => {
        if (!d.medCertificateExpiry) return false;
        const diff = (new Date(d.medCertificateExpiry).getTime() - now) / (1000 * 60 * 60 * 24);
        return diff <= 30;
    }).length;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                    <div className="shrink-0 w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center">
                        <Users className="w-5 h-5" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-semibold text-slate-900">Водители</h1>
                        <p className="text-sm text-slate-500 mt-0.5">
                            Реестр водителей, документы, режим труда и отдыха
                        </p>
                    </div>
                </div>
                <Button variant="brand" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setShowCreateModal(true)}>
                    Добавить водителя
                </Button>
            </div>

            {/* Stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Stat label="Всего" value={drivers.length} icon={Users} tone="neutral" />
                <Stat label="Активные" value={activeCount} icon={UserCheck} tone="success" hint={inactiveCount ? `${inactiveCount} неактивных` : undefined} />
                <Stat label="ВУ — истекают" value={licenseExpiringSoon} icon={ShieldCheck} tone={licenseExpiringSoon > 0 ? 'warning' : 'neutral'} hint="в течение 30 дней" />
                <Stat label="Медсправки — истекают" value={medExpiringSoon} icon={HeartPulse} tone={medExpiringSoon > 0 ? 'warning' : 'neutral'} hint="в течение 30 дней" />
            </div>

            {/* Content Card */}
            <div className="bg-white rounded-xl shadow-soft border border-slate-200">
                {/* Search */}
                <div className="p-4 border-b border-slate-200">
                    <div className="max-w-sm">
                        <Input
                            type="text"
                            placeholder="Поиск по ФИО, номеру ВУ..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            leftAddon={<Search className="h-4 w-4" />}
                        />
                    </div>
                </div>

                {/* Table */}
                {loading ? (
                    <div className="p-4">
                        <SkeletonTable rows={6} columns={7} />
                    </div>
                ) : drivers.length === 0 ? (
                    <div className="p-6">
                        <EmptyState
                            icon={Users}
                            title={debouncedSearch ? 'Водители не найдены' : 'Пока нет водителей'}
                            description={debouncedSearch ? 'Попробуйте изменить условия поиска.' : 'Добавьте первого водителя, чтобы начать.'}
                            tone="brand"
                            action={!debouncedSearch ? (
                                <Button variant="brand" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setShowCreateModal(true)}>
                                    Добавить водителя
                                </Button>
                            ) : undefined}
                        />
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="sticky top-0 z-10 bg-white shadow-soft">
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
                                        className="hover:bg-neutral-50 transition-colors cursor-pointer"
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
                    onCreated={() => { setShowCreateModal(false); void loadDrivers(); }}
                />
            )}

            {hosDriver && (
                <HoursChartDialog driver={hosDriver} onClose={() => setHosDriver(null)} />
            )}
        </div>
    );
}
