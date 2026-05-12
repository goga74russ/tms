'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { AlertTriangle, Plus, X, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Stat } from '@/components/ui/stat';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { DataTable, type Column, Pill, type PillTone } from '@/components/ui/data-table';

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
    resolved: 'Решён',
    dismissed: 'Отклонён',
};

const severityTones: Record<string, PillTone> = {
    low: 'neutral',
    medium: 'warning',
    critical: 'danger',
};

const severityOrder: Record<string, number> = {
    low: 0,
    medium: 1,
    critical: 2,
};

const statusTones: Record<string, PillTone> = {
    open: 'danger',
    investigating: 'info',
    resolved: 'success',
    dismissed: 'neutral',
};

function normalize(value: string | null | undefined): string {
    return String(value ?? '').trim().toLowerCase();
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
    const [severity, setSeverity] = useState('');
    const [status, setStatus] = useState('');
    const [showCreate, setShowCreate] = useState(false);

    const loadIncidents = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            params.set('limit', '100');
            if (severity) params.set('severity', severity);
            if (status) params.set('status', status);
            const result = await api.get<any>(`/incidents?${params.toString()}`);
            const rows = result.data || [];
            setIncidents(rows);
        } catch (err) {
            console.error('Failed to load incidents:', err);
        } finally {
            setLoading(false);
        }
    }, [severity, status]);

    useEffect(() => {
        loadIncidents();
    }, [loadIncidents]);

    const openCount = incidents.filter(i => i.status === 'open').length;
    const criticalCount = incidents.filter(i => i.severity === 'critical').length;
    const blockingCount = incidents.filter(i => i.blocksRelease).length;

    const columns: Column<Incident>[] = [
        {
            id: 'description',
            header: 'Описание',
            accessor: (r) => r.description,
            cell: (r) => <span className="font-medium text-slate-900">{r.description}</span>,
            sticky: 'left',
            minWidth: '260px',
        },
        {
            id: 'type',
            header: 'Тип',
            accessor: (r) => typeLabels[normalize(r.type)] ?? r.type,
            width: '130px',
        },
        {
            id: 'severity',
            header: 'Критичность',
            accessor: (r) => severityOrder[normalize(r.severity)] ?? 0,
            cell: (r) => {
                const key = normalize(r.severity);
                return <Pill tone={severityTones[key] ?? 'neutral'}>{severityLabels[key] ?? r.severity}</Pill>;
            },
            sortable: true,
            width: '140px',
        },
        {
            id: 'status',
            header: 'Статус',
            accessor: (r) => statusLabels[normalize(r.status)] ?? r.status,
            cell: (r) => {
                const key = normalize(r.status);
                return <Pill tone={statusTones[key] ?? 'neutral'}>{statusLabels[key] ?? r.status}</Pill>;
            },
            width: '130px',
        },
        {
            id: 'blocksRelease',
            header: 'Выпуск',
            accessor: (r) => (r.blocksRelease ? 1 : 0),
            cell: (r) => r.blocksRelease
                ? <Pill tone="danger">Блокирует</Pill>
                : <span className="text-xs text-slate-500">Не блокирует</span>,
            width: '130px',
        },
        {
            id: 'createdAt',
            header: 'Создан',
            accessor: (r) => r.createdAt,
            cell: (r) => <span className="text-xs text-slate-500">{new Date(r.createdAt).toLocaleString('ru-RU')}</span>,
            sortable: true,
            width: '160px',
        },
    ];

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

            <DataTable<Incident>
                tableId="incidents"
                data={incidents}
                columns={columns}
                keyField="id"
                loading={loading}
                searchPlaceholder="Поиск по описанию…"
                searchKeys={['description']}
                filters={[
                    {
                        id: 'severity',
                        label: 'Критичность',
                        value: severity,
                        onChange: setSeverity,
                        options: [
                            { value: 'low', label: 'Низкая' },
                            { value: 'medium', label: 'Средняя' },
                            { value: 'critical', label: 'Критичная' },
                        ],
                    },
                    {
                        id: 'status',
                        label: 'Статус',
                        value: status,
                        onChange: setStatus,
                        options: [
                            { value: 'open', label: 'Открыт' },
                            { value: 'investigating', label: 'На разборе' },
                            { value: 'resolved', label: 'Решён' },
                            { value: 'dismissed', label: 'Отклонён' },
                        ],
                    },
                ]}
                defaultSort={{ columnId: 'createdAt', direction: 'desc' }}
                emptyState={
                    <EmptyState
                        icon={AlertTriangle}
                        title={severity || status ? 'Инциденты не найдены' : 'Пока нет инцидентов'}
                        description={severity || status ? 'Попробуйте сбросить фильтры.' : 'Здесь появятся зарегистрированные инциденты.'}
                        tone="brand"
                        action={!severity && !status ? (
                            <Button variant="brand" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setShowCreate(true)}>
                                Новый инцидент
                            </Button>
                        ) : undefined}
                    />
                }
                pageSize={50}
            />

            {showCreate && <CreateIncidentModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); loadIncidents(); }} />}
        </div>
    );
}
