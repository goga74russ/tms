'use client';

// ============================================================
// Round 2A — Compliance dashboard.
//   Tab 1: ОСАГО — таблица ТС, цвет по сроку, "Перепроверить все"
//   Tab 2: Тахограф — журнал загрузок + аплоад .DDD
//   Tab 3: Маркировка — последние проверки и сводка по категориям
//   Tab 4: ADR — переключатель строгого режима
// ============================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { ShieldCheck, Upload, RefreshCw, AlertTriangle, CheckCircle2, BarChart3, Database, ScanLine } from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { PageHeader } from '@/components/ui/page-header';
import { SkeletonTable } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import {
    classifyOsagoExpiry,
    type OsagoStatusRow,
    type TachographUploadRow,
    type TachographUploadResponse,
    type MarkingVerificationRow,
    type MarkingCategorySummary,
    type AdrStrictModeStatus,
} from '@tms/shared';

type ApiResp<T> = { success: boolean; data?: T; error?: string };

export default function CompliancePage() {
    return (
        <div className="space-y-6">
            <PageHeader
                icon={ShieldCheck}
                iconTone="emerald"
                title="Контроль соответствия"
                description="ОСАГО, тахограф, маркировка, ADR. Контроль обязательной отчётности РФ. Все интеграции работают в mock-режиме до получения реальных ключей API."
            />

            <Tabs defaultValue="osago">
                <TabsList>
                    <TabsTrigger value="osago">ОСАГО</TabsTrigger>
                    <TabsTrigger value="tachograph">Тахограф</TabsTrigger>
                    <TabsTrigger value="marking">Маркировка</TabsTrigger>
                    <TabsTrigger value="adr">ADR</TabsTrigger>
                </TabsList>

                <TabsContent value="osago"><OsagoTab /></TabsContent>
                <TabsContent value="tachograph"><TachographTab /></TabsContent>
                <TabsContent value="marking"><MarkingTab /></TabsContent>
                <TabsContent value="adr"><AdrTab /></TabsContent>
            </Tabs>
        </div>
    );
}

// ----------------- OSAGO -----------------

function OsagoTab() {
    const [rows, setRows] = useState<OsagoStatusRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get<ApiResp<OsagoStatusRow[]>>('/compliance/osago/status');
            setRows(res.data ?? []);
            setError(null);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { refresh(); }, [refresh]);

    const syncAll = async () => {
        setSyncing(true);
        try {
            await api.post('/compliance/osago/sync', {});
            await refresh();
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setSyncing(false);
        }
    };

    const validCount = rows.filter(r => r.valid === true).length;
    const expiredCount = rows.filter(r => r.valid === false).length;
    const unknownCount = rows.filter(r => r.valid === null).length;

    return (
        <Card className="p-5 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2 text-sm">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Действителен: <span className="text-emerald-900">{validCount}</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-red-300 bg-red-50 px-3 py-1 text-xs font-semibold text-red-800">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Истёк: <span className="text-red-900">{expiredCount}</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                        Не проверено: <span className="text-slate-900">{unknownCount}</span>
                    </span>
                </div>
                <Button onClick={syncAll} disabled={syncing}>
                    <RefreshCw className={`w-4 h-4 mr-1 ${syncing ? 'animate-spin' : ''}`} />
                    Перепроверить все
                </Button>
            </div>
            {error && <ErrorBox message={error} />}
            {loading ? <Loading /> : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-xs uppercase text-slate-500 border-b border-slate-200">
                                <th className="py-2 px-2">Статус</th>
                                <th className="py-2 px-2">Гос. номер</th>
                                <th className="py-2 px-2">VIN</th>
                                <th className="py-2 px-2">Страховщик</th>
                                <th className="py-2 px-2">Полис</th>
                                <th className="py-2 px-2">Действует до</th>
                                <th className="py-2 px-2">Проверено</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && (
                                <tr><td colSpan={7}>
                                    <div className="p-6">
                                        <EmptyState icon={ShieldCheck} title="ТС пока нет" description="Полисы ОСАГО появятся после добавления ТС в автопарк." />
                                    </div>
                                </td></tr>
                            )}
                            {rows.map(r => {
                                const band = classifyOsagoExpiry(r.valid, r.expiresAt);
                                return (
                                    <tr key={r.vehicleId} className="border-b border-slate-100">
                                        <td className="py-2 px-2"><OsagoBandPill band={band} /></td>
                                        <td className="py-2 px-2 font-medium">{r.plate}</td>
                                        <td className="py-2 px-2 font-mono text-xs">{r.vin}</td>
                                        <td className="py-2 px-2">{r.insurer ?? '—'}</td>
                                        <td className="py-2 px-2">{r.policyNumber ?? '—'}</td>
                                        <td className="py-2 px-2">{formatDate(r.expiresAt)}</td>
                                        <td className="py-2 px-2 text-slate-500">{formatDate(r.checkedAt)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </Card>
    );
}

function OsagoBandPill({ band }: { band: 'green' | 'yellow' | 'red' | 'unknown' }) {
    const map = {
        green: { label: 'OK', cls: 'bg-green-100 text-green-700' },
        yellow: { label: '<30 дней', cls: 'bg-amber-100 text-amber-700' },
        red: { label: 'Просрочен', cls: 'bg-red-100 text-red-700' },
        unknown: { label: 'Не проверен', cls: 'bg-slate-100 text-slate-600' },
    } as const;
    const m = map[band];
    return <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${m.cls}`}>{m.label}</span>;
}

// ----------------- Tachograph -----------------

function TachographTab() {
    const [rows, setRows] = useState<TachographUploadRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [info, setInfo] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get<ApiResp<TachographUploadRow[]>>('/compliance/tachograph/uploads');
            setRows(res.data ?? []);
            setError(null);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => { refresh(); }, [refresh]);

    const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        setError(null); setInfo(null);
        try {
            const fd = new FormData();
            fd.append('file', file);
            const res = await api.post<ApiResp<TachographUploadResponse>>(
                '/compliance/tachograph/upload',
                fd,
            );
            const d = res.data;
            if (d) {
                setInfo(`Загружено: записей ${d.recordsInserted}, водитель ${d.driverId ?? 'не привязан'}, часов вождения ${d.totalDrivingHours}`);
            }
            await refresh();
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    return (
        <Card className="p-5 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="text-sm text-slate-500">
                    Принимаются файлы .DDD / .ESM (СКЗИ-тахографы РФ).
                    Парсер работает в режиме best-effort — критичные поля парсятся,
                    полная верификация подписи появится после интеграции аккредитованного ридера.
                </div>
                <div>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".ddd,.esm,.DDD,.ESM"
                        onChange={onFile}
                        className="hidden"
                    />
                    <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                        <Upload className="w-4 h-4 mr-1" />
                        {uploading ? 'Загружаем…' : 'Загрузить .DDD'}
                    </Button>
                </div>
            </div>
            {info && <div className="bg-green-50 text-green-700 p-2 rounded text-sm border border-green-100">{info}</div>}
            {error && <ErrorBox message={error} />}

            {loading ? <Loading /> : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-xs uppercase text-slate-500 border-b border-slate-200">
                                <th className="py-2 px-2">Загружено</th>
                                <th className="py-2 px-2">Водитель</th>
                                <th className="py-2 px-2">Карта</th>
                                <th className="py-2 px-2">VIN</th>
                                <th className="py-2 px-2">Период</th>
                                <th className="py-2 px-2">Часов вождения</th>
                                <th className="py-2 px-2">Записей</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && (
                                <tr><td colSpan={7}>
                                    <div className="p-6">
                                        <EmptyState icon={Database} title="Загрузок ещё нет" description="Загрузите .DDD/.ESM, чтобы увидеть журнал." />
                                    </div>
                                </td></tr>
                            )}
                            {rows.map(r => (
                                <tr key={r.id} className="border-b border-slate-100">
                                    <td className="py-2 px-2 text-slate-500">{formatDateTime(r.uploadedAt)}</td>
                                    <td className="py-2 px-2">{r.driverFullName ?? <span className="text-amber-600">не привязан</span>}</td>
                                    <td className="py-2 px-2 font-mono text-xs">{r.driverCardNumber ?? '—'}</td>
                                    <td className="py-2 px-2 font-mono text-xs">{r.vehicleVin ?? '—'}</td>
                                    <td className="py-2 px-2 text-xs">{formatDate(r.periodFrom)} — {formatDate(r.periodTo)}</td>
                                    <td className="py-2 px-2">{(r.totalDrivingMinutes / 60).toFixed(1)}</td>
                                    <td className="py-2 px-2">{r.recordsInserted}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </Card>
    );
}

// ----------------- Marking -----------------

function MarkingTab() {
    const [rows, setRows] = useState<MarkingVerificationRow[]>([]);
    const [cats, setCats] = useState<MarkingCategorySummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const [r, c] = await Promise.all([
                api.get<ApiResp<MarkingVerificationRow[]>>('/compliance/marking/recent'),
                api.get<ApiResp<MarkingCategorySummary[]>>('/compliance/marking/categories'),
            ]);
            setRows(r.data ?? []);
            setCats(c.data ?? []);
            setError(null);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => { refresh(); }, [refresh]);

    const totalVerified = cats.reduce((s, c) => s + c.total, 0);
    const totalValid = cats.reduce((s, c) => s + c.valid, 0);
    const successRate = totalVerified > 0 ? Math.round((totalValid / totalVerified) * 100) : 0;

    return (
        <Card className="p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <StatCard label="Проверено всего" value={totalVerified.toString()} icon={<BarChart3 className="w-5 h-5" />} />
                <StatCard label="Валидных" value={totalValid.toString()} icon={<CheckCircle2 className="w-5 h-5 text-green-600" />} />
                <StatCard label="Успех" value={`${successRate}%`} icon={<ShieldCheck className="w-5 h-5 text-indigo-600" />} />
            </div>

            {error && <ErrorBox message={error} />}

            <div>
                <div className="font-medium text-slate-700 text-sm mb-2">По категориям</div>
                {cats.length === 0 ? (
                    <div className="text-slate-400 text-sm">Нет данных</div>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-xs uppercase text-slate-500 border-b border-slate-200">
                                <th className="py-2 px-2">Категория</th>
                                <th className="py-2 px-2">Всего</th>
                                <th className="py-2 px-2">Валидных</th>
                                <th className="py-2 px-2">Невалидных</th>
                            </tr>
                        </thead>
                        <tbody>
                            {cats.map(c => (
                                <tr key={c.category} className="border-b border-slate-100">
                                    <td className="py-2 px-2 font-medium">{c.category}</td>
                                    <td className="py-2 px-2">{c.total}</td>
                                    <td className="py-2 px-2 text-green-700">{c.valid}</td>
                                    <td className="py-2 px-2 text-red-700">{c.invalid}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            <div>
                <div className="font-medium text-slate-700 text-sm mb-2">Последние проверки</div>
                {loading ? <Loading /> : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-xs uppercase text-slate-500 border-b border-slate-200">
                                <th className="py-2 px-2">Когда</th>
                                <th className="py-2 px-2">Код</th>
                                <th className="py-2 px-2">Категория</th>
                                <th className="py-2 px-2">Товар</th>
                                <th className="py-2 px-2">Статус</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && (
                                <tr><td colSpan={5}>
                                    <div className="p-6">
                                        <EmptyState icon={ScanLine} title="Проверок ещё нет" description="Здесь появятся результаты валидации кодов маркировки." />
                                    </div>
                                </td></tr>
                            )}
                            {rows.slice(0, 50).map(r => (
                                <tr key={r.id} className="border-b border-slate-100">
                                    <td className="py-2 px-2 text-slate-500">{formatDateTime(r.verifiedAt)}</td>
                                    <td className="py-2 px-2 font-mono text-xs truncate max-w-xs">{r.code}</td>
                                    <td className="py-2 px-2">{r.category ?? '—'}</td>
                                    <td className="py-2 px-2">{r.productName ?? '—'}</td>
                                    <td className="py-2 px-2">
                                        {r.valid
                                            ? <span className="text-green-700 text-xs">валиден</span>
                                            : <span className="text-red-700 text-xs">невалиден</span>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </Card>
    );
}

// ----------------- ADR -----------------

function AdrTab() {
    const [enabled, setEnabled] = useState<boolean | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        (async () => {
            try {
                const res = await api.get<ApiResp<AdrStrictModeStatus>>('/compliance/adr/strict-mode');
                setEnabled(res.data?.enabled ?? false);
            } catch (err) {
                setError((err as Error).message);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const toggle = async () => {
        if (enabled === null) return;
        setSaving(true);
        try {
            const next = !enabled;
            const res = await api.post<ApiResp<AdrStrictModeStatus>>(
                '/compliance/adr/strict-mode',
                { enabled: next },
            );
            setEnabled(res.data?.enabled ?? next);
            setError(null);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card className="p-5 space-y-4">
            {error && <ErrorBox message={error} />}
            {loading ? <Loading /> : (
                <div className="flex items-start gap-4 flex-wrap">
                    <div className="flex-1 min-w-[280px]">
                        <div className="font-medium text-slate-900 mb-1">Строгий режим ADR</div>
                        <div className="text-sm text-slate-500">
                            Когда режим включён, ошибки ADR-валидации (просроченное свидетельство водителя, ТС не оборудовано) <b>блокируют</b> назначение рейса вместо предупреждения. Используется компаниями, регулярно перевозящими опасные грузы.
                        </div>
                        {!enabled && (
                            <div className="mt-2 text-xs text-amber-700 inline-flex items-center gap-1">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                Сейчас ошибки ADR только показываются как предупреждения.
                            </div>
                        )}
                    </div>
                    <Button onClick={toggle} disabled={saving} variant={enabled ? 'destructive' : 'default'}>
                        {saving ? 'Сохраняем…' : enabled ? 'Выключить' : 'Включить строгий режим'}
                    </Button>
                </div>
            )}
        </Card>
    );
}

// ----------------- helpers -----------------

function StatCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
    return (
        <div className="rounded-lg border border-slate-200 bg-white p-4 flex items-center gap-3">
            <div className="text-slate-400">{icon}</div>
            <div>
                <div className="text-xs text-slate-500">{label}</div>
                <div className="text-xl font-semibold text-slate-900">{value}</div>
            </div>
        </div>
    );
}

function ErrorBox({ message }: { message: string }) {
    return (
        <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm border border-red-100 inline-flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            {message}
        </div>
    );
}

function Loading({ columns = 4 }: { columns?: number }) {
    return <SkeletonTable rows={5} columns={columns} />;
}

function formatDate(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('ru-RU');
}

function formatDateTime(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('ru-RU');
}
