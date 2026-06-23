'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { Plus, Users, Loader2, AlertTriangle, Timer, ShieldCheck, HeartPulse, UserCheck, UserX, Pencil, Download } from 'lucide-react';
import { Dialog, ConfirmDialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { Stat } from '@/components/ui/stat';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { DataTable, type Column, Pill } from '@/components/ui/data-table';
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartTooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { format, subDays } from 'date-fns';

interface Driver {
    id: string;
    fullName: string;
    licenseNumber: string;
    licenseCategories: string[];
    licenseExpiry: string;
    licenseSeries?: string;
    licenseIssueDate?: string;
    inn?: string;
    medCertificateExpiry?: string;
    adrCertificateExpiry?: string;
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
    // BOM так, чтобы Excel корректно открывал UTF-8
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

function exportDriversCSV(rows: Driver[]) {
    const headers = ['ФИО', 'Телефон', 'Категории ВУ', 'Номер ВУ', 'Срок ВУ', 'Срок медсправки', 'Срок ADR', 'Статус'];
    const lines = [
        headers.map(csvCell).join(','),
        ...rows.map(r => [
            r.fullName,
            r.phone ?? '',
            (r.licenseCategories ?? []).join(';'),
            r.licenseNumber,
            r.licenseExpiry ? formatDate(r.licenseExpiry) : '',
            r.medCertificateExpiry ? formatDate(r.medCertificateExpiry) : '',
            r.adrCertificateExpiry ? formatDate(r.adrCertificateExpiry) : '',
            r.isActive ? 'активен' : 'неактивен',
        ].map(csvCell).join(',')),
    ];
    downloadCSV(`drivers-${new Date().toISOString().split('T')[0]}.csv`, lines);
}

function expiryColor(d?: string) {
    if (!d) return '';
    const diff = (new Date(d).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    if (diff < 0) return 'text-danger-700 font-bold';
    if (diff < 7) return 'text-danger-600';
    if (diff <= 30) return 'text-warning-600';
    return 'text-success-600';
}

function HosBadge({ status, loading }: { status: HosStatus | null; loading: boolean }) {
    const [hover, setHover] = useState(false);

    if (loading && !status) {
        return <Loader2 className="w-3.5 h-3.5 animate-spin text-neutral-300" />;
    }
    if (!status) return <span className="text-xs text-neutral-300">—</span>;

    const breach = status.breach;
    return (
        <div className="relative inline-block" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
            {breach ? (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-danger-100 text-danger-700 text-xs font-semibold">
                    <AlertTriangle className="w-3 h-3" />
                    <span>⚠</span>
                </span>
            ) : (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-success-50 text-success-700 text-xs font-medium">
                    <Timer className="w-3 h-3" />
                    {status.dayHours.toFixed(1)}ч
                </span>
            )}
            {hover && (
                <div className="absolute z-10 left-0 top-full mt-1 w-56 px-3 py-2 rounded-lg bg-neutral-900 text-white text-xs shadow-lg pointer-events-none">
                    <div>Сегодня: {status.dayHours.toFixed(1)} / {status.dayLimit} ч</div>
                    <div>Неделя: {status.weekHours.toFixed(1)} / {status.weekLimit} ч</div>
                    {breach && <div className="text-danger-300 mt-0.5 font-semibold">Нарушение режима</div>}
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
                <p className="text-sm text-neutral-500">Часы работы за последние 7 дней</p>
                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
                    </div>
                ) : chartData.length === 0 ? (
                    <p className="text-sm text-neutral-400 text-center py-8">Нет данных за период</p>
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
                    <div className="rounded-lg border border-danger-200 bg-danger-50 p-3 text-xs space-y-1">
                        <div className="font-semibold text-danger-700 flex items-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            Нарушения ({summary.breaches.length})
                        </div>
                        {summary.breaches.slice(0, 5).map((b) => (
                            <div key={`${b.date}:${b.reason}`} className="text-danger-700">
                                {format(new Date(b.date), 'dd.MM')}: {b.reason}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </Dialog>
    );
}

function CreateDriverModal({ onClose, onCreated, editingItem }: { onClose: () => void; onCreated: () => void; editingItem?: Driver | null }) {
    const { toast } = useToast();
    const isEdit = !!editingItem;
    const toDateInput = (s?: string) => (s ? s.slice(0, 10) : '');
    const [fullName, setFullName] = useState(editingItem?.fullName ?? '');
    const [licenseNumber, setLicenseNumber] = useState(editingItem?.licenseNumber ?? '');
    const [licenseCategories, setLicenseCategories] = useState((editingItem?.licenseCategories ?? []).join(', '));
    const [licenseExpiry, setLicenseExpiry] = useState(toDateInput(editingItem?.licenseExpiry));
    // ЭПД: обязательны для документов ФНС (ЭЗЗ/ЭПЛ/ЭТрН).
    const [licenseSeries, setLicenseSeries] = useState(editingItem?.licenseSeries ?? '');
    const [licenseIssueDate, setLicenseIssueDate] = useState(toDateInput(editingItem?.licenseIssueDate));
    const [inn, setInn] = useState(editingItem?.inn ?? '');
    const [medCertExpiry, setMedCertExpiry] = useState(toDateInput(editingItem?.medCertificateExpiry));
    const [adrCertExpiry, setAdrCertExpiry] = useState(toDateInput(editingItem?.adrCertificateExpiry));
    const [phone, setPhone] = useState(editingItem?.phone ?? '');
    // Привязка к существующему аккаунту + поля, обязательные ТОЛЬКО при создании.
    const [userId, setUserId] = useState('');
    const [birthDate, setBirthDate] = useState('');
    const [consent, setConsent] = useState(true);
    const [users, setUsers] = useState<{ id: string; email: string; fullName: string; roles: string[] }[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [fieldError, setFieldError] = useState<{ fullName?: string; licenseNumber?: string; userId?: string; birthDate?: string; licenseExpiry?: string; licenseSeries?: string; licenseIssueDate?: string; inn?: string; phone?: string }>({});

    useEffect(() => {
        if (isEdit) return;
        (async () => {
            try {
                const res = await api.get<{ success: boolean; data: { id: string; email: string; fullName: string; roles: string[] }[] }>('/auth/users');
                setUsers((res.data ?? []).filter((u) => (u.roles ?? []).includes('driver')));
            } catch { /* пусто — покажем подсказку */ }
        })();
    }, [isEdit]);

    async function handleSubmit() {
        const errs: { fullName?: string; licenseNumber?: string; userId?: string; birthDate?: string; licenseExpiry?: string; licenseSeries?: string; licenseIssueDate?: string; inn?: string; phone?: string } = {};
        if (!fullName.trim()) errs.fullName = 'Укажите ФИО';
        if (!licenseNumber.trim()) errs.licenseNumber = 'Укажите номер ВУ';
        if (!licenseExpiry) errs.licenseExpiry = 'Укажите срок действия ВУ';
        if (!licenseSeries.trim()) errs.licenseSeries = 'Укажите серию ВУ (для ЭПД)';
        if (!licenseIssueDate) errs.licenseIssueDate = 'Укажите дату выдачи ВУ (для ЭПД)';
        if (!/^\d{12}$/.test(inn.trim())) errs.inn = 'ИНН водителя: 12 цифр (для ЭПД)';
        if (!phone.trim()) errs.phone = 'Укажите телефон (для ЭПД)';
        if (!isEdit && !userId) errs.userId = 'Выберите учётную запись водителя';
        if (!isEdit && !birthDate) errs.birthDate = 'Укажите дату рождения';
        setFieldError(errs);
        if (Object.keys(errs).length > 0) return;

        setSubmitting(true);
        try {
            const payload = {
                fullName,
                licenseNumber,
                licenseSeries,
                licenseIssueDate: licenseIssueDate ? new Date(licenseIssueDate).toISOString() : undefined,
                inn,
                licenseCategories: licenseCategories.split(',').map(s => s.trim()).filter(Boolean),
                licenseExpiry: licenseExpiry || undefined,
                medCertificateExpiry: medCertExpiry || undefined,
                adrCertificateExpiry: adrCertExpiry || undefined,
                phone,
                ...(isEdit ? {} : {
                    userId,
                    birthDate,
                    personalDataConsent: consent,
                    personalDataConsentDate: consent ? new Date().toISOString() : undefined,
                }),
            };
            const result = isEdit
                ? await api.put<any>(`/fleet/drivers/${editingItem!.id}`, payload)
                : await api.post<any>('/fleet/drivers', payload);
            if (result.success) {
                toast({
                    variant: 'success',
                    title: 'Готово',
                    description: isEdit ? `Водитель ${fullName} обновлён` : `Водитель ${fullName} добавлен`,
                });
                onCreated();
            } else {
                throw new Error(result.error || 'Ошибка');
            }
        } catch (err: any) {
            toast({
                variant: 'error',
                title: 'Ошибка',
                description: err.message || (isEdit ? 'Не удалось обновить водителя' : 'Не удалось создать водителя'),
            });
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <Dialog open={true} onClose={onClose} title={isEdit ? 'Редактировать водителя' : 'Новый водитель'} size="md">
            <div className="space-y-4">
                <Input
                    label="ФИО"
                    required
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    placeholder="Иванов Иван Иванович"
                    error={fieldError.fullName}
                />
                {!isEdit && (
                    <>
                        <div>
                            <label className="block text-sm font-medium text-neutral-700 mb-1">
                                Учётная запись водителя <span className="text-danger-500">*</span>
                            </label>
                            <select
                                value={userId}
                                onChange={e => setUserId(e.target.value)}
                                className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-300"
                            >
                                <option value="">— выберите аккаунт —</option>
                                {users.map(u => (
                                    <option key={u.id} value={u.id}>{u.fullName ? `${u.fullName} (${u.email})` : u.email}</option>
                                ))}
                            </select>
                            {fieldError.userId && <p className="text-xs text-danger-600 mt-1">{fieldError.userId}</p>}
                            {users.length === 0 && (
                                <p className="text-xs text-neutral-500 mt-1">
                                    Нет пользователей с ролью «Водитель». Сначала создайте пользователя и назначьте роль «Водитель» на странице «Пользователи».
                                </p>
                            )}
                        </div>
                        <Input
                            label="Дата рождения"
                            type="date"
                            required
                            value={birthDate}
                            onChange={e => setBirthDate(e.target.value)}
                            error={fieldError.birthDate}
                        />
                    </>
                )}
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
                    <Input label="Срок ВУ" type="date" required value={licenseExpiry} onChange={e => setLicenseExpiry(e.target.value)} error={fieldError.licenseExpiry} />
                    <Input label="Медсправка до" type="date" value={medCertExpiry} onChange={e => setMedCertExpiry(e.target.value)} />
                </div>
                {/* ЭПД: обязательные реквизиты для документов ФНС (ЭЗЗ/ЭПЛ/ЭТрН) */}
                <div className="grid grid-cols-2 gap-3">
                    <Input label="Серия ВУ" required value={licenseSeries} onChange={e => setLicenseSeries(e.target.value)} placeholder="7701" error={fieldError.licenseSeries} />
                    <Input label="Дата выдачи ВУ" type="date" required value={licenseIssueDate} onChange={e => setLicenseIssueDate(e.target.value)} error={fieldError.licenseIssueDate} />
                </div>
                <Input label="ИНН водителя" required value={inn} onChange={e => setInn(e.target.value)} placeholder="123456789012" error={fieldError.inn} />
                <Input
                    label="ADR-сертификат до"
                    type="date"
                    value={adrCertExpiry}
                    onChange={e => setAdrCertExpiry(e.target.value)}
                    helperText="Срок действия свидетельства о подготовке водителей ТС, перевозящих опасные грузы."
                />
                <FormField
                    format="phone"
                    label="Телефон"
                    required
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    externalError={fieldError.phone}
                />
                {!isEdit && (
                    <label className="flex items-start gap-2 text-sm text-neutral-700">
                        <input type="checkbox" className="mt-0.5" checked={consent} onChange={e => setConsent(e.target.checked)} />
                        <span>Согласие на обработку персональных данных водителя (152-ФЗ) получено</span>
                    </label>
                )}
                <div className="flex gap-3 justify-end pt-2">
                    <Button variant="outline" onClick={onClose} disabled={submitting}>Отмена</Button>
                    <Button variant="brand" isLoading={submitting} onClick={handleSubmit}>
                        {submitting ? (isEdit ? 'Сохранение...' : 'Создание...') : (isEdit ? 'Сохранить' : 'Создать')}
                    </Button>
                </div>
            </div>
        </Dialog>
    );
}

export default function DriversPage() {
    const { toast } = useToast();
    const [drivers, setDrivers] = useState<Driver[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
    const [hosDriver, setHosDriver] = useState<Driver | null>(null);
    const [statusFilter, setStatusFilter] = useState('');
    const [confirmAction, setConfirmAction] = useState<null | { run: () => Promise<void> | void; title: string; description?: string; destructive?: boolean; confirmLabel?: string }>(null);
    // A-P1-10: HOS statuses for all active drivers, batched once at parent
    // level instead of N parallel fetches inside each row's HosBadge.
    // TODO(backend): expose a bulk endpoint like `GET /drivers/hos-status?ids=...`
    // (or include hosStatus in `GET /fleet/drivers`) so this can be a single
    // request instead of N parallel ones via Promise.all.
    const [hosMap, setHosMap] = useState<Record<string, HosStatus | null>>({});
    const [hosLoading, setHosLoading] = useState(false);

    const loadDrivers = useCallback(async () => {
        setLoading(true);
        try {
            const result = await api.get<any>(`/fleet/drivers?limit=200`);
            setDrivers(result.data || []);
        } catch (err: any) {
            toast({ variant: 'error', title: 'Не удалось загрузить водителей', description: err?.message || 'Сетевая ошибка' });
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        loadDrivers();
    }, [loadDrivers]);

    // Pre-load HOS for all active drivers in one batch.
    useEffect(() => {
        const activeIds = drivers.filter(d => d.isActive).map(d => d.id);
        if (activeIds.length === 0) {
            setHosMap({});
            return;
        }
        let cancelled = false;
        setHosLoading(true);
        Promise.all(
            activeIds.map(async (id) => {
                try {
                    const res = await api.get<{ success: boolean; data: HosStatus }>(`/drivers/${id}/hos-status`);
                    return [id, res?.success && res.data ? res.data : null] as const;
                } catch {
                    return [id, null] as const;
                }
            }),
        )
            .then(entries => {
                if (cancelled) return;
                const next: Record<string, HosStatus | null> = {};
                for (const [id, status] of entries) next[id] = status;
                setHosMap(next);
            })
            .finally(() => { if (!cancelled) setHosLoading(false); });
        return () => { cancelled = true; };
    }, [drivers]);

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

    const filtered = drivers.filter(d => {
        if (statusFilter === 'active' && !d.isActive) return false;
        if (statusFilter === 'archived' && d.isActive) return false;
        return true;
    });

    async function deactivateSelected(rows: Driver[]) {
        const active = rows.filter(d => d.isActive);
        if (active.length === 0) return;
        setConfirmAction({
            run: async () => {
                try {
                    await Promise.all(active.map(d => api.put(`/fleet/drivers/${d.id}`, { isActive: false })));
                    toast({ variant: 'success', title: `Деактивировано: ${active.length}` });
                    void loadDrivers();
                } catch (err: any) {
                    toast({ variant: 'error', title: 'Ошибка', description: err?.message });
                }
            },
            title: `Деактивировать ${active.length} водителей?`,
            confirmLabel: 'Деактивировать',
        });
    }

    const columns: Column<Driver>[] = [
        {
            id: 'fullName',
            header: 'ФИО',
            accessor: (r) => r.fullName,
            cell: (r) => <span className="font-medium text-neutral-900">{r.fullName}</span>,
            sortable: true,
            sticky: 'left',
            minWidth: '200px',
        },
        {
            id: 'licenseNumber',
            header: 'Номер ВУ',
            accessor: (r) => r.licenseNumber,
            sortable: true,
            monospace: true,
            width: '140px',
        },
        {
            id: 'licenseCategories',
            header: 'Категории',
            cell: (r) => (
                <div className="flex gap-1 flex-wrap">
                    {r.licenseCategories.map(c => (
                        <span key={c} className="px-1.5 py-0.5 bg-neutral-100 rounded text-xs font-medium text-neutral-600">
                            {c}
                        </span>
                    ))}
                </div>
            ),
            accessor: (r) => r.licenseCategories.join(','),
            width: '160px',
        },
        {
            id: 'licenseExpiry',
            header: 'Срок ВУ',
            accessor: (r) => r.licenseExpiry,
            cell: (r) => <span className={expiryColor(r.licenseExpiry)}>{formatDate(r.licenseExpiry)}</span>,
            sortable: true,
            width: '120px',
            align: 'right',
            monospace: true,
        },
        {
            id: 'medCertificateExpiry',
            header: 'Медсправка',
            accessor: (r) => r.medCertificateExpiry,
            cell: (r) => <span className={expiryColor(r.medCertificateExpiry)}>{formatDate(r.medCertificateExpiry)}</span>,
            sortable: true,
            width: '120px',
            align: 'right',
            monospace: true,
        },
        {
            id: 'hos',
            header: 'РТО',
            cell: (r) => r.isActive
                ? <HosBadge status={hosMap[r.id] ?? null} loading={hosLoading && !(r.id in hosMap)} />
                : <span className="text-xs text-neutral-300">—</span>,
            width: '90px',
        },
        {
            id: 'isActive',
            header: 'Статус',
            accessor: (r) => (r.isActive ? 1 : 0),
            cell: (r) => (
                <Pill tone={r.isActive ? 'success' : 'neutral'}>
                    {r.isActive ? 'Активен' : 'Неактивен'}
                </Pill>
            ),
            sortable: true,
            width: '110px',
        },
    ];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                    <div className="shrink-0 w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center">
                        <Users className="w-5 h-5" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-semibold text-neutral-900">Водители</h1>
                        <p className="text-sm text-neutral-500 mt-0.5">
                            Реестр водителей, документы, режим труда и отдыха
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        leftIcon={<Download className="w-4 h-4" />}
                        onClick={() => exportDriversCSV(filtered)}
                        disabled={filtered.length === 0}
                        title={filtered.length === 0 ? 'Нет данных для экспорта' : `Экспортировать ${filtered.length} записей`}
                    >
                        Экспорт CSV
                    </Button>
                    <Button variant="brand" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setShowCreateModal(true)}>
                        Добавить водителя
                    </Button>
                </div>
            </div>

            {/* Stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Stat label="Всего" value={drivers.length} icon={Users} tone="neutral" />
                <Stat label="Активные" value={activeCount} icon={UserCheck} tone="success" hint={inactiveCount ? `${inactiveCount} неактивных` : undefined} />
                <Stat label="ВУ — истекают" value={licenseExpiringSoon} icon={ShieldCheck} tone={licenseExpiringSoon > 0 ? 'warning' : 'neutral'} hint="в течение 30 дней" />
                <Stat label="Медсправки — истекают" value={medExpiringSoon} icon={HeartPulse} tone={medExpiringSoon > 0 ? 'warning' : 'neutral'} hint="в течение 30 дней" />
            </div>

            <DataTable<Driver>
                tableId="drivers"
                data={filtered}
                columns={columns}
                keyField="id"
                loading={loading}
                searchPlaceholder="Поиск по ФИО, номеру ВУ..."
                searchKeys={['fullName', 'licenseNumber', 'phone']}
                filters={[
                    {
                        id: 'status',
                        label: 'Статус',
                        value: statusFilter,
                        onChange: setStatusFilter,
                        options: [
                            { value: 'active', label: 'Активные' },
                            { value: 'archived', label: 'Неактивные' },
                        ],
                    },
                ]}
                bulkActions={(rows) => (
                    <Button
                        size="sm"
                        variant="outline"
                        leftIcon={<UserX className="w-3.5 h-3.5" />}
                        onClick={() => deactivateSelected(rows)}
                    >
                        Деактивировать ({rows.length})
                    </Button>
                )}
                rowActions={(row) => [
                    {
                        id: 'edit',
                        label: 'Редактировать',
                        icon: <Pencil className="w-4 h-4" />,
                        onClick: () => setEditingDriver(row),
                    },
                    {
                        id: 'hos',
                        label: 'Показать РТО',
                        icon: <Timer className="w-4 h-4" />,
                        onClick: () => setHosDriver(row),
                    },
                    {
                        id: 'toggle',
                        label: row.isActive ? 'Деактивировать' : 'Активировать',
                        icon: <UserX className="w-4 h-4" />,
                        onClick: async () => {
                            try {
                                await api.put(`/fleet/drivers/${row.id}`, { isActive: !row.isActive });
                                toast({ variant: 'success', title: row.isActive ? 'Деактивирован' : 'Активирован' });
                                void loadDrivers();
                            } catch (err: any) {
                                toast({ variant: 'error', title: 'Ошибка', description: err?.message });
                            }
                        },
                        tone: row.isActive ? 'danger' : 'default',
                    },
                ]}
                onRowClick={(row) => setHosDriver(row)}
                emptyState={
                    <EmptyState
                        icon={Users}
                        title="Пока нет водителей"
                        description="Добавьте первого водителя, чтобы начать."
                        tone="brand"
                        action={
                            <Button variant="brand" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setShowCreateModal(true)}>
                                Добавить водителя
                            </Button>
                        }
                    />
                }
                pageSize={50}
            />

            {showCreateModal && (
                <CreateDriverModal
                    onClose={() => setShowCreateModal(false)}
                    onCreated={() => { setShowCreateModal(false); void loadDrivers(); }}
                />
            )}

            {editingDriver && (
                <CreateDriverModal
                    key={editingDriver.id}
                    editingItem={editingDriver}
                    onClose={() => setEditingDriver(null)}
                    onCreated={() => { setEditingDriver(null); void loadDrivers(); }}
                />
            )}

            {hosDriver && (
                <HoursChartDialog driver={hosDriver} onClose={() => setHosDriver(null)} />
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
        </div>
    );
}
