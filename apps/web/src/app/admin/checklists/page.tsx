'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { Stat } from '@/components/ui/stat';
import { DataTable, type Column, Pill, type PillTone } from '@/components/ui/data-table';
import { PageHeader } from '@/components/ui/page-header';
import { Dialog } from '@/components/ui/dialog';
import { ClipboardCheck, Plus, Edit2, Trash2 } from 'lucide-react';

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
    open,
    onClose,
    onSuccess,
}: {
    template: ChecklistTemplate | null;
    open: boolean;
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
        <Dialog
            open={open}
            onClose={onClose}
            title={isEdit ? 'Редактирование шаблона' : 'Новый шаблон чек-листа'}
            size="lg"
        >
            <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-neutral-700 mb-1.5">
                            Тип <span className="text-red-500 ml-0.5">*</span>
                        </label>
                        <Select
                            value={form.type}
                            onChange={e => setForm(prev => ({ ...prev, type: e.target.value }))}
                            options={[
                                { value: 'tech', label: 'Техосмотр' },
                                { value: 'med', label: 'Медосмотр' },
                            ]}
                        />
                    </div>
                    <Input
                        type="text"
                        label="Версия"
                        required
                        value={form.version}
                        onChange={e => setForm(prev => ({ ...prev, version: e.target.value }))}
                        placeholder="1.0"
                    />
                    <div className="flex items-end pb-1">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={form.isActive}
                                onChange={e => setForm(prev => ({ ...prev, isActive: e.target.checked }))}
                                className="rounded border-neutral-300"
                            />
                            <span className="text-sm text-neutral-700">Активен</span>
                        </label>
                    </div>
                </div>

                <Input
                    type="text"
                    label="Название"
                    required
                    value={form.name}
                    onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Предрейсовый техосмотр v1.0"
                />

                {/* Items */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <label className="block text-sm font-medium text-neutral-700">
                            Пункты проверки ({items.length})
                        </label>
                        <Button variant="outline" size="sm" onClick={addItem}>
                            <Plus className="w-3 h-3 mr-1" /> Пункт
                        </Button>
                    </div>

                    <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
                        {items.map((item, idx) => (
                            <div key={idx} className="flex gap-2 items-start p-3 bg-neutral-50 rounded-lg">
                                <span className="text-xs text-neutral-400 mt-2.5 min-w-[20px]">{idx + 1}.</span>
                                <div className="flex-1 space-y-2">
                                    <Input
                                        type="text"
                                        value={item.name}
                                        onChange={e => updateItem(idx, 'name', e.target.value)}
                                        placeholder="Название пункта"
                                    />
                                    <div className="flex gap-3 items-center">
                                        <div className="w-auto">
                                            <Select
                                                value={item.responseType}
                                                onChange={e => updateItem(idx, 'responseType', e.target.value)}
                                                options={Object.entries(RESPONSE_LABELS).map(([k, v]) => ({ value: k, label: v }))}
                                            />
                                        </div>
                                        <label className="flex items-center gap-1.5 cursor-pointer text-xs text-neutral-600">
                                            <input
                                                type="checkbox"
                                                checked={item.required}
                                                onChange={e => updateItem(idx, 'required', e.target.checked)}
                                                className="rounded border-neutral-300"
                                            />
                                            Обязательный
                                        </label>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => removeItem(idx)}
                                    className="p-1 rounded hover:bg-red-50 text-neutral-300 hover:text-red-500 mt-1"
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
                    <Button variant="brand" className="flex-1" onClick={handleSubmit} disabled={submitting}>
                        {submitting ? 'Сохраняю...' : isEdit ? 'Сохранить' : 'Создать'}
                    </Button>
                </div>
            </div>
        </Dialog>
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
            cell: (r) => <span className="font-medium text-neutral-900">{r.name}</span>,
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
            cell: (r) => <span className="font-mono text-xs text-neutral-600">v{r.version}</span>,
            width: '100px',
        },
        {
            id: 'items',
            header: 'Пункты',
            accessor: (r) => r.items.length,
            cell: (r) => <span className="text-neutral-700">{r.items.length}</span>,
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
                <span className="text-xs text-neutral-500">
                    {r.createdAt ? new Date(r.createdAt).toLocaleDateString('ru-RU') : '—'}
                </span>
            ),
            sortable: true,
            width: '120px',
        },
    ];

    return (
        <div className="space-y-6">
            <PageHeader
                icon={ClipboardCheck}
                iconTone="brand"
                title="Шаблоны чек-листов"
                description="Шаблоны мед- и техосмотра"
                actions={
                    <Button variant="brand" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setModal({ mode: 'create', template: null })}>
                        Добавить
                    </Button>
                }
            />

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
                    key={modal.template?.id ?? 'new'}
                    template={modal.template}
                    open={true}
                    onClose={() => setModal(null)}
                    onSuccess={() => {
                        const created = modal.mode === 'create';
                        setToast(created ? 'Шаблон создан' : 'Шаблон обновлён');
                        setModal(null);
                        load();
                    }}
                />
            )}
        </div>
    );
}
