'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { Stat } from '@/components/ui/stat';
import { DataTable, type Column, Pill, type PillTone } from '@/components/ui/data-table';
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

const TYPE_LABELS: Record<string, string> = {
    tech: 'Техосмотр',
    med: 'Медосмотр',
};

const TYPE_TONES: Record<string, PillTone> = {
    tech: 'warning',
    med: 'danger',
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
    const { toast: toastFn } = useToast();
    const setToast = useCallback((message: string | null) => {
        if (!message) return;
        toastFn({ variant: 'success', title: 'Готово', description: message });
    }, [toastFn]);
    const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
    const [loading, setLoading] = useState(true);
    const [typeFilter, setTypeFilter] = useState('');
    const [modal, setModal] = useState<{ mode: 'create' | 'edit'; template: ChecklistTemplate | null } | null>(null);

    const load = useCallback(async () => {
        try {
            setLoading(true);
            const result = await api.get<{ success: boolean; data: ChecklistTemplate[] }>('/auth/checklist-templates');
            if (result.success) setTemplates(result.data);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    const activeCount = templates.filter(t => t.isActive).length;
    const techCount = templates.filter(t => t.type === 'tech').length;
    const medCount = templates.filter(t => t.type === 'med').length;
    const filtered = typeFilter ? templates.filter(t => t.type === typeFilter) : templates;

    const columns: Column<ChecklistTemplate>[] = [
        {
            id: 'name',
            header: 'Название',
            accessor: (r) => r.name,
            cell: (r) => <span className="font-medium text-slate-900">{r.name}</span>,
            sortable: true,
            sticky: 'left',
            minWidth: '260px',
        },
        {
            id: 'type',
            header: 'Тип',
            accessor: (r) => TYPE_LABELS[r.type] ?? r.type,
            cell: (r) => <Pill tone={TYPE_TONES[r.type] ?? 'neutral'}>{TYPE_LABELS[r.type] ?? r.type}</Pill>,
            width: '140px',
        },
        {
            id: 'version',
            header: 'Версия',
            accessor: (r) => r.version,
            cell: (r) => <span className="font-mono text-xs text-slate-600">v{r.version}</span>,
            width: '100px',
        },
        {
            id: 'items',
            header: 'Пункты',
            accessor: (r) => r.items.length,
            cell: (r) => <span className="text-slate-700">{r.items.length}</span>,
            sortable: true,
            align: 'right',
            width: '100px',
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
            width: '120px',
        },
        {
            id: 'createdAt',
            header: 'Создан',
            accessor: (r) => r.createdAt,
            cell: (r) => (
                <span className="text-xs text-slate-500">
                    {r.createdAt ? new Date(r.createdAt).toLocaleDateString('ru-RU') : '—'}
                </span>
            ),
            sortable: true,
            width: '120px',
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                    <div className="shrink-0 w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center">
                        <ClipboardCheck className="w-5 h-5" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-semibold text-slate-900">Шаблоны чек-листов</h1>
                        <p className="text-sm text-slate-500 mt-0.5">Шаблоны мед- и техосмотра</p>
                    </div>
                </div>
                <Button variant="brand" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setModal({ mode: 'create', template: null })}>
                    Добавить
                </Button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Stat label="Всего" value={templates.length} icon={ClipboardCheck} tone="neutral" />
                <Stat label="Активные" value={activeCount} icon={ClipboardCheck} tone="success" />
                <Stat label="Техосмотр" value={techCount} icon={ClipboardCheck} tone="warning" />
                <Stat label="Медосмотр" value={medCount} icon={ClipboardCheck} tone="danger" />
            </div>

            <DataTable<ChecklistTemplate>
                tableId="admin-checklists"
                data={filtered}
                columns={columns}
                keyField="id"
                loading={loading}
                searchPlaceholder="Поиск шаблона…"
                searchKeys={['name', 'version']}
                filters={[
                    {
                        id: 'type',
                        label: 'Тип',
                        value: typeFilter,
                        onChange: setTypeFilter,
                        options: Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label })),
                    },
                ]}
                onRowClick={(row) => setModal({ mode: 'edit', template: row })}
                rowActions={(row) => [
                    {
                        id: 'edit',
                        label: 'Редактировать',
                        icon: <Edit2 className="w-4 h-4" />,
                        onClick: () => setModal({ mode: 'edit', template: row }),
                    },
                ]}
                emptyState={
                    <EmptyState
                        icon={ClipboardCheck}
                        title="Шаблонов пока нет"
                        description="Создайте первый шаблон чек-листа."
                        tone="brand"
                        action={<Button variant="brand" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setModal({ mode: 'create', template: null })}>Добавить</Button>}
                    />
                }
                pageSize={50}
            />

            {modal && (
                <ChecklistFormModal
                    template={modal.template}
                    onClose={() => setModal(null)}
                    onSuccess={() => {
                        setToast(modal.mode === 'create' ? 'Шаблон создан' : 'Шаблон обновлён');
                        setModal(null);
                        load();
                    }}
                />
            )}
        </div>
    );
}
