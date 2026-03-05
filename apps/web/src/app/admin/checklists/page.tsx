'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ClipboardCheck, Plus, X, Edit2, Trash2 } from 'lucide-react';

// ================================================================
// Types
// ================================================================
interface ChecklistItem {
    name: string;
    responseType: 'ok_fault' | 'number' | 'text' | 'boolean';
    required: boolean;
}

interface ChecklistTemplate {
    id: string;
    type: string;
    version: string;
    name: string;
    items: ChecklistItem[];
    isActive: boolean;
    createdAt: string;
}

const RESPONSE_LABELS: Record<string, string> = {
    ok_fault: 'ОК / Неисправность',
    number: 'Число',
    text: 'Текст',
    boolean: 'Да / Нет',
};

// ================================================================
// Checklist Form Modal
// ================================================================
function ChecklistFormModal({
    template,
    onClose,
    onSuccess,
}: {
    template: ChecklistTemplate | null;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const isEdit = !!template;
    const [form, setForm] = useState({
        type: template?.type || 'tech',
        version: template?.version || '1.0',
        name: template?.name || '',
        isActive: template?.isActive ?? true,
    });
    const [items, setItems] = useState<ChecklistItem[]>(
        template?.items || [{ name: '', responseType: 'ok_fault', required: true }]
    );
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const addItem = () => {
        setItems(prev => [...prev, { name: '', responseType: 'ok_fault', required: true }]);
    };

    const removeItem = (idx: number) => {
        setItems(prev => prev.filter((_, i) => i !== idx));
    };

    const updateItem = (idx: number, field: keyof ChecklistItem, value: string | boolean) => {
        setItems(prev => prev.map((item, i) =>
            i === idx ? { ...item, [field]: value } : item
        ));
    };

    const handleSubmit = async () => {
        const validItems = items.filter(i => i.name.trim());
        if (!form.name || !form.version || validItems.length === 0) {
            setError('Укажите название, версию и хотя бы один пункт');
            return;
        }

        try {
            setSubmitting(true);
            setError('');
            const body = { ...form, items: validItems };

            if (isEdit) {
                await api.put(`/auth/checklist-templates/${template!.id}`, body);
            } else {
                await api.post('/auth/checklist-templates', body);
            }
            onSuccess();
        } catch (err: any) {
            setError(err.message || 'Ошибка');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <Card className="w-full max-w-2xl mx-4 shadow-xl max-h-[90vh] overflow-y-auto">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle>{isEdit ? 'Редактирование шаблона' : 'Новый шаблон чек-листа'}</CardTitle>
                        <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100">
                            <X className="w-5 h-5 text-slate-400" />
                        </button>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-slate-700">Тип *</label>
                            <select
                                value={form.type}
                                onChange={e => setForm(prev => ({ ...prev, type: e.target.value }))}
                                className="w-full px-3 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
                            >
                                <option value="tech">Техосмотр</option>
                                <option value="med">Медосмотр</option>
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-slate-700">Версия *</label>
                            <input
                                type="text"
                                value={form.version}
                                onChange={e => setForm(prev => ({ ...prev, version: e.target.value }))}
                                className="w-full px-3 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                placeholder="1.0"
                            />
                        </div>
                        <div className="flex items-end pb-1">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" checked={form.isActive}
                                    onChange={e => setForm(prev => ({ ...prev, isActive: e.target.checked }))}
                                    className="rounded border-slate-300" />
                                <span className="text-sm text-slate-700">Активен</span>
                            </label>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-slate-700">Название *</label>
                        <input
                            type="text"
                            value={form.name}
                            onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                            className="w-full px-3 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                            placeholder="Предрейсовый техосмотр v1.0"
                        />
                    </div>

                    {/* Items */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <label className="block text-sm font-medium text-slate-700">
                                Пункты проверки ({items.length})
                            </label>
                            <Button variant="outline" size="sm" onClick={addItem}>
                                <Plus className="w-3 h-3 mr-1" /> Пункт
                            </Button>
                        </div>

                        <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
                            {items.map((item, idx) => (
                                <div key={idx} className="flex gap-2 items-start p-3 bg-slate-50 rounded-lg">
                                    <span className="text-xs text-slate-400 mt-2.5 min-w-[20px]">{idx + 1}.</span>
                                    <div className="flex-1 space-y-2">
                                        <input
                                            type="text"
                                            value={item.name}
                                            onChange={e => updateItem(idx, 'name', e.target.value)}
                                            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                            placeholder="Название пункта"
                                        />
                                        <div className="flex gap-3 items-center">
                                            <select
                                                value={item.responseType}
                                                onChange={e => updateItem(idx, 'responseType', e.target.value)}
                                                className="px-2 py-1.5 rounded-lg border border-slate-200 text-xs bg-white"
                                            >
                                                {Object.entries(RESPONSE_LABELS).map(([k, v]) => (
                                                    <option key={k} value={k}>{v}</option>
                                                ))}
                                            </select>
                                            <label className="flex items-center gap-1.5 cursor-pointer text-xs text-slate-600">
                                                <input
                                                    type="checkbox"
                                                    checked={item.required}
                                                    onChange={e => updateItem(idx, 'required', e.target.checked)}
                                                    className="rounded border-slate-300"
                                                />
                                                Обязательный
                                            </label>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => removeItem(idx)}
                                        className="p-1 rounded hover:bg-red-50 text-slate-300 hover:text-red-500 mt-1"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{error}</p>}

                    <div className="flex gap-3 pt-2">
                        <Button variant="outline" className="flex-1" onClick={onClose}>Отмена</Button>
                        <Button className="flex-1" onClick={handleSubmit} disabled={submitting}>
                            {submitting ? 'Сохраняю...' : isEdit ? 'Сохранить' : 'Создать'}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

// ================================================================
// Main Page
// ================================================================
export default function AdminChecklistsPage() {
    const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
    const [loading, setLoading] = useState(true);
    const [modal, setModal] = useState<{ mode: 'create' | 'edit'; template: ChecklistTemplate | null } | null>(null);
    const [toast, setToast] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            setLoading(true);
            const result = await api.get<{ success: boolean; data: ChecklistTemplate[] }>('/auth/checklist-templates');
            if (result.success) setTemplates(result.data);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);
    useEffect(() => {
        if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }
    }, [toast]);

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                        <ClipboardCheck className="w-6 h-6 text-indigo-600" />
                        Шаблоны чек-листов
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">{templates.length} шаблонов</p>
                </div>
                <Button onClick={() => setModal({ mode: 'create', template: null })}>
                    <Plus className="w-4 h-4 mr-1.5" />
                    Добавить
                </Button>
            </div>

            {toast && (
                <div className="fixed top-4 right-4 z-50 px-5 py-3 rounded-xl shadow-lg bg-emerald-600 text-white text-sm font-medium">
                    {toast}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {loading ? (
                    <div className="col-span-3 text-center py-16">
                        <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto" />
                    </div>
                ) : templates.length === 0 ? (
                    <div className="col-span-3 text-center py-16 text-slate-400">Нет шаблонов</div>
                ) : (
                    templates.map(tmpl => (
                        <Card key={tmpl.id} className="hover:shadow-md transition">
                            <CardContent className="p-5">
                                <div className="flex items-center justify-between mb-3">
                                    <div>
                                        <h3 className="font-semibold text-slate-900">{tmpl.name}</h3>
                                        <div className="flex gap-2 mt-1">
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${tmpl.type === 'tech'
                                                    ? 'bg-orange-100 text-orange-700'
                                                    : 'bg-rose-100 text-rose-700'
                                                }`}>
                                                {tmpl.type === 'tech' ? 'Техосмотр' : 'Медосмотр'}
                                            </span>
                                            <span className="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-600">
                                                v{tmpl.version}
                                            </span>
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${tmpl.isActive
                                                    ? 'bg-emerald-100 text-emerald-700'
                                                    : 'bg-slate-100 text-slate-400'
                                                }`}>
                                                {tmpl.isActive ? 'Активен' : 'Неактивен'}
                                            </span>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setModal({ mode: 'edit', template: tmpl })}
                                        className="p-1.5 rounded-lg hover:bg-indigo-50 text-slate-400 hover:text-indigo-600"
                                    >
                                        <Edit2 className="w-4 h-4" />
                                    </button>
                                </div>

                                <div className="space-y-1 mt-3 pt-3 border-t border-slate-100">
                                    {tmpl.items.slice(0, 5).map((item, idx) => (
                                        <div key={idx} className="flex items-center gap-2 text-xs text-slate-600">
                                            <span className="text-slate-400">{idx + 1}.</span>
                                            <span className="flex-1 truncate">{item.name}</span>
                                            <span className="text-slate-400">{RESPONSE_LABELS[item.responseType]}</span>
                                        </div>
                                    ))}
                                    {tmpl.items.length > 5 && (
                                        <p className="text-xs text-slate-400 mt-1">
                                            ... и ещё {tmpl.items.length - 5} пунктов
                                        </p>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>

            {modal && (
                <ChecklistFormModal
                    template={modal.template}
                    onClose={() => setModal(null)}
                    onSuccess={() => {
                        setModal(null);
                        setToast(modal.mode === 'create' ? '✅ Шаблон создан' : '✅ Шаблон обновлён');
                        load();
                    }}
                />
            )}
        </div>
    );
}
