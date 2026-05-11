'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { AlertTriangle, Plus, Search, X, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Stat } from '@/components/ui/stat';
import { SkeletonTable } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';

interface Incident {
    id: string;
    type: string;
    severity: string;
    status: string;
    description: string;
    blocksRelease: boolean;
    createdAt: string;
}

const typeLabels: Record<string, string> = {
    med_inspection: 'Медосмотр',
    tech_inspection: 'Техосмотр',
    road: 'Дорожный',
    cargo: 'Грузовой',
    other: 'Прочее',
};

const severityLabels: Record<string, string> = {
    low: 'Низкая',
    medium: 'Средняя',
    critical: 'Критичная',
};

const statusLabels: Record<string, string> = {
    open: 'Открыт',
    investigating: 'На разборе',
    resolved: 'Решен',
    dismissed: 'Отклонен',
};
const severityStyles: Record<string, string> = {
    low: 'bg-slate-100 text-slate-600',
    medium: 'bg-amber-100 text-amber-700',
    critical: 'bg-red-100 text-red-700',
};

const statusStyles: Record<string, string> = {
    open: 'bg-red-100 text-red-700',
    investigating: 'bg-blue-100 text-blue-700',
    resolved: 'bg-emerald-100 text-emerald-700',
    dismissed: 'bg-slate-100 text-slate-500',
};

function normalizeIncidentValue(value: string | null | undefined): string {
    return String(value ?? '').trim().toLowerCase();
}

function getIncidentLabel(
    value: string | null | undefined,
    labels: Record<string, string>,
): string {
    const normalizedValue = normalizeIncidentValue(value);
    return labels[normalizedValue] ?? String(value ?? '-');
}

function getIncidentBadgeClass(
    value: string | null | undefined,
    styles: Record<string, string>,
    fallbackClass: string,
): string {
    const normalizedValue = normalizeIncidentValue(value);
    return styles[normalizedValue] ?? fallbackClass;
}
function CreateIncidentModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
    const { toast } = useToast();
    const [form, setForm] = useState({
        type: 'road',
        severity: 'medium',
        status: 'open',
        description: '',
        blocksRelease: false,
    });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    async function handleSubmit() {
        if (!form.description.trim()) {
            setError('Опишите инцидент');
            return;
        }

        try {
            setSubmitting(true);
            setError('');
            await api.post('/incidents', {
                ...form,
                description: form.description.trim(),
            });
            toast({ variant: 'success', title: 'Инцидент создан' });
            onCreated();
        } catch (err: any) {
            const msg = err.message || 'Не удалось создать инцидент';
            setError(msg);
            toast({ variant: 'error', title: 'Ошибка', description: msg });
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl border border-slate-200">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                    <div>
                        <h3 className="text-lg font-bold text-slate-900">Новый инцидент</h3>
                        <p className="text-sm text-slate-500">Sprint 9: мед / тех / дорожные и грузовые инциденты</p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100">
                        <X className="w-4 h-4 text-slate-500" />
                    </button>
                </div>
                <div className="p-6 grid grid-cols-2 gap-4">
                    <select value={form.type} onChange={(e) => setForm(f => ({ ...f, type: e.target.value }))} className="px-4 py-3 rounded-xl border border-slate-200 text-sm">
                        <option value="med_inspection">Медосмотр</option>
                        <option value="tech_inspection">Техосмотр</option>
                        <option value="road">Дорожный</option>
                        <option value="cargo">Грузовой</option>
                        <option value="other">Другое</option>
                    </select>
                    <select value={form.severity} onChange={(e) => setForm(f => ({ ...f, severity: e.target.value }))} className="px-4 py-3 rounded-xl border border-slate-200 text-sm">
                        <option value="low">Низкая</option>
                        <option value="medium">Средняя</option>
                        <option value="critical">Критичная</option>
                    </select>
                    <select value={form.status} onChange={(e) => setForm(f => ({ ...f, status: e.target.value }))} className="px-4 py-3 rounded-xl border border-slate-200 text-sm">
                        <option value="open">Открыт</option>
                        <option value="investigating">На разборе</option>
                        <option value="resolved">Решён</option>
                        <option value="dismissed">Отклонён</option>
                    </select>
                    <label className="flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-200 text-sm text-slate-700">
                        <input type="checkbox" checked={form.blocksRelease} onChange={(e) => setForm(f => ({ ...f, blocksRelease: e.target.checked }))} />
                        Блокирует выпуск на линию
                    </label>
                    <textarea value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Описание инцидента" className="col-span-2 min-h-32 px-4 py-3 rounded-xl border border-slate-200 text-sm resize-none" />
                </div>
                {error && <p className="px-6 pb-2 text-sm text-red-600">{error}</p>}
                <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
                    <Button variant="outline" onClick={onClose}>Отмена</Button>
                    <Button variant="brand" isLoading={submitting} onClick={handleSubmit}>
                        Создать инцидент
                    </Button>
                </div>
            </div>
        </div>
    );
}

export default function IncidentsPage() {
    const [incidents, setIncidents] = useState<Incident[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [severity, setSeverity] = useState('');
    const [status, setStatus] = useState('');
    const [showCreate, setShowCreate] = useState(false);

    async function loadIncidents() {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            params.set('limit', '100');
            if (severity) params.set('severity', severity);
            if (status) params.set('status', status);
            if (search.trim()) params.set('search', search.trim());
            const result = await api.get<any>(`/incidents?${params.toString()}`);
            const rows = result.data || [];
            setIncidents(rows);
        } catch (err) {
            console.error('Failed to load incidents:', err);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadIncidents();
    }, [severity, status]);

    useEffect(() => {
        const timer = setTimeout(loadIncidents, 250);
        return () => clearTimeout(timer);
    }, [search]);

    const openCount = incidents.filter(i => i.status === 'open').length;
    const criticalCount = incidents.filter(i => i.severity === 'critical').length;
    const blockingCount = incidents.filter(i => i.blocksRelease).length;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                    <div className="shrink-0 w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center">
                        <ShieldAlert className="w-5 h-5" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-semibold text-slate-900">Инциденты</h1>
                        <p className="text-sm text-slate-500 mt-0.5">Инциденты по осмотрам, дороге и грузу</p>
                    </div>
                </div>
                <Button variant="brand" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setShowCreate(true)}>
                    Новый инцидент
                </Button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Stat label="Всего" value={incidents.length} icon={AlertTriangle} tone="neutral" />
                <Stat label="Открыто" value={openCount} icon={AlertTriangle} tone={openCount > 0 ? 'warning' : 'neutral'} />
                <Stat label="Критичные" value={criticalCount} icon={ShieldAlert} tone={criticalCount > 0 ? 'danger' : 'neutral'} />
                <Stat label="Блокируют выпуск" value={blockingCount} icon={ShieldAlert} tone={blockingCount > 0 ? 'danger' : 'neutral'} />
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-soft">
                <div className="p-4 border-b border-slate-200 flex flex-wrap gap-3">
                    <div className="flex-1 min-w-[220px] max-w-sm">
                        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск по описанию" leftAddon={<Search className="w-4 h-4" />} />
                    </div>
                    <select value={severity} onChange={(e) => setSeverity(e.target.value)} className="px-4 py-2 rounded-lg border border-slate-200 text-sm">
                        <option value="">Все приоритеты</option>
                        <option value="low">Низкая</option>
                        <option value="medium">Средняя</option>
                        <option value="critical">Критичная</option>
                    </select>
                    <select value={status} onChange={(e) => setStatus(e.target.value)} className="px-4 py-2 rounded-lg border border-slate-200 text-sm">
                        <option value="">Все статусы</option>
                        <option value="open">Открыт</option>
                        <option value="investigating">На разборе</option>
                        <option value="resolved">Решён</option>
                        <option value="dismissed">Отклонён</option>
                    </select>
                </div>

                {loading ? (
                    <div className="p-4"><SkeletonTable rows={6} columns={6} /></div>
                ) : incidents.length === 0 ? (
                    <div className="p-6">
                        <EmptyState
                            icon={AlertTriangle}
                            title={search || status || severity ? 'Инциденты не найдены' : 'Пока нет инцидентов'}
                            description={search || status || severity ? 'Попробуйте сбросить фильтры.' : 'Здесь появятся зарегистрированные инциденты.'}
                            tone="brand"
                            action={!search && !status && !severity ? (
                                <Button variant="brand" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setShowCreate(true)}>
                                    Новый инцидент
                                </Button>
                            ) : undefined}
                        />
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50 text-slate-500 text-left">
                                    <th className="px-4 py-3 font-medium">Тип</th>
                                    <th className="px-4 py-3 font-medium">Описание</th>
                                    <th className="px-4 py-3 font-medium">Критичность</th>
                                    <th className="px-4 py-3 font-medium">Статус</th>
                                    <th className="px-4 py-3 font-medium">Выпуск</th>
                                    <th className="px-4 py-3 font-medium">Создан</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {incidents.map((incident) => (
                                    <tr key={incident.id} className="hover:bg-slate-50">
                                        <td className="px-4 py-3 text-slate-700">{getIncidentLabel(incident.type, typeLabels)}</td>
                                        <td className="px-4 py-3 text-slate-800 font-medium">{incident.description}</td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${getIncidentBadgeClass(incident.severity, severityStyles, severityStyles.low)}`}>{getIncidentLabel(incident.severity, severityLabels)}</span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${getIncidentBadgeClass(incident.status, statusStyles, statusStyles.open)}`}>{getIncidentLabel(incident.status, statusLabels)}</span>
                                        </td>
                                        <td className="px-4 py-3 text-slate-600">{incident.blocksRelease ? 'Блокирует' : 'Не блокирует'}</td>
                                        <td className="px-4 py-3 text-slate-500">{new Date(incident.createdAt).toLocaleString('ru-RU')}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {showCreate && <CreateIncidentModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); loadIncidents(); }} />}
        </div>
    );
}
