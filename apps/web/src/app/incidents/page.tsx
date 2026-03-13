'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { AlertTriangle, Plus, Search, X } from 'lucide-react';

interface Incident {
    id: string;
    type: string;
    severity: string;
    status: string;
    description: string;
    blocksRelease: boolean;
    createdAt: string;
}

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

function CreateIncidentModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
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
            onCreated();
        } catch (err: any) {
            setError(err.message || 'Не удалось создать инцидент');
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
                    <button onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium">Отмена</button>
                    <button onClick={handleSubmit} disabled={submitting} className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                        {submitting ? 'Сохраняю...' : 'Создать инцидент'}
                    </button>
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
            const result = await api.get<any>(`/incidents?${params.toString()}`);
            let rows = result.data || [];
            if (search.trim()) {
                const q = search.toLowerCase();
                rows = rows.filter((item: Incident) => item.description.toLowerCase().includes(q) || item.type.toLowerCase().includes(q));
            }
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

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Инциденты</h1>
                    <p className="text-sm text-slate-500 mt-1">Sprint 9: инциденты по осмотрам, дороге и грузу</p>
                </div>
                <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm">
                    <Plus className="w-4 h-4" />
                    Новый инцидент
                </button>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
                <div className="p-4 border-b border-slate-200 flex flex-wrap gap-3">
                    <div className="relative flex-1 min-w-[220px] max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск по описанию" className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 text-sm" />
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
                    <div className="flex items-center justify-center py-20">
                        <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                    </div>
                ) : incidents.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                        <AlertTriangle className="w-12 h-12 mb-3" />
                        <p className="text-sm">Инциденты не найдены</p>
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
                                        <td className="px-4 py-3 text-slate-700">{incident.type}</td>
                                        <td className="px-4 py-3 text-slate-800 font-medium">{incident.description}</td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${severityStyles[incident.severity] || severityStyles.low}`}>{incident.severity}</span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusStyles[incident.status] || statusStyles.open}`}>{incident.status}</span>
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