'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Plus, Building2, Archive, Mail, Pencil, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Stat } from '@/components/ui/stat';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { DataTable, type Column, Pill } from '@/components/ui/data-table';
import { Dialog, ConfirmDialog } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';

interface Contractor {
    id: string;
    name: string;
    inn: string;
    kpp?: string;
    legalAddress: string;
    phone?: string;
    email?: string;
    contactPerson?: string;
    isArchived: boolean;
    createdAt: string;
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

function exportContractorsCSV(rows: Contractor[]) {
    const headers = ['Наименование', 'ИНН', 'КПП', 'Адрес', 'Телефон', 'Email', 'Контактное лицо', 'Статус'];
    const lines = [
        headers.map(csvCell).join(','),
        ...rows.map(r => [
            r.name,
            r.inn,
            r.kpp ?? '',
            r.legalAddress,
            r.phone ?? '',
            r.email ?? '',
            r.contactPerson ?? '',
            r.isArchived ? 'архив' : 'активный',
        ].map(csvCell).join(',')),
    ];
    downloadCSV(`contractors-${new Date().toISOString().split('T')[0]}.csv`, lines);
}

function CreateContractorModal({ onClose, onCreated, editingItem }: { onClose: () => void; onCreated: () => void; editingItem?: Contractor | null }) {
    const { toast } = useToast();
    const isEdit = !!editingItem;
    const [name, setName] = useState(editingItem?.name ?? '');
    const [inn, setInn] = useState(editingItem?.inn ?? '');
    const [kpp, setKpp] = useState(editingItem?.kpp ?? '');
    const [legalAddress, setLegalAddress] = useState(editingItem?.legalAddress ?? '');
    const [phone, setPhone] = useState(editingItem?.phone ?? '');
    const [email, setEmail] = useState(editingItem?.email ?? '');
    const [contactPerson, setContactPerson] = useState(editingItem?.contactPerson ?? '');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    async function handleSubmit() {
        if (!name || !inn || !legalAddress) {
            setError('Укажите название, ИНН и адрес');
            return;
        }
        setSubmitting(true);
        setError('');
        try {
            const payload = {
                name, inn, kpp: kpp || undefined,
                legalAddress, phone: phone || undefined,
                email: email || undefined, contactPerson: contactPerson || undefined,
            };
            const result = isEdit
                ? await api.put<any>(`/fleet/contractors/${editingItem!.id}`, payload)
                : await api.post<any>('/fleet/contractors', payload);
            if (result.success) {
                toast({ variant: 'success', title: isEdit ? 'Контрагент обновлён' : 'Контрагент создан' });
                onCreated();
            } else {
                throw new Error(result.error || 'Ошибка');
            }
        } catch (err: any) {
            const msg = err.message || 'Ошибка сервера';
            setError(msg);
            toast({ variant: 'error', title: 'Ошибка', description: msg });
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <Dialog open={true} onClose={onClose} title={isEdit ? 'Редактировать контрагента' : 'Новый контрагент'} size="md">
            <div className="space-y-4">
                <div>
                    <label className="text-sm font-medium text-neutral-700 mb-1.5 block">Наименование *</label>
                    <input type="text" value={name} onChange={e => setName(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                        placeholder="ООО Логистика" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <FormField
                        format="inn"
                        label="ИНН"
                        required
                        value={inn}
                        onChange={e => setInn(e.target.value)}
                    />
                    <FormField
                        format="kpp"
                        label="КПП"
                        value={kpp}
                        onChange={e => setKpp(e.target.value)}
                    />
                </div>
                <div>
                    <label className="text-sm font-medium text-neutral-700 mb-1.5 block">Юридический адрес *</label>
                    <input type="text" value={legalAddress} onChange={e => setLegalAddress(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                        placeholder="г. Москва, ул. Примерная, 1" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <FormField
                        format="phone"
                        label="Телефон"
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                    />
                    <FormField
                        format="email"
                        label="Email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                    />
                </div>
                <div>
                    <label className="text-sm font-medium text-neutral-700 mb-1.5 block">Контактное лицо</label>
                    <input type="text" value={contactPerson} onChange={e => setContactPerson(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                        placeholder="Иванов И.И." />
                </div>
                {error && <p className="text-sm text-red-600">{error}</p>}
                <div className="flex gap-3 justify-end pt-2">
                    <Button variant="outline" onClick={onClose} disabled={submitting}>Отмена</Button>
                    <Button variant="brand" isLoading={submitting} onClick={handleSubmit}>
                        {isEdit ? 'Сохранить' : 'Создать'}
                    </Button>
                </div>
            </div>
        </Dialog>
    );
}

export default function ContractorsPage() {
    const { toast } = useToast();
    const [contractors, setContractors] = useState<Contractor[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [editingContractor, setEditingContractor] = useState<Contractor | null>(null);
    const [statusFilter, setStatusFilter] = useState('');
    const [confirmAction, setConfirmAction] = useState<null | { run: () => Promise<void> | void; title: string; description?: string; destructive?: boolean; confirmLabel?: string }>(null);

    useEffect(() => {
        loadContractors();
    }, []);

    async function loadContractors() {
        setLoading(true);
        try {
            const result = await api.get<any>(`/fleet/contractors?limit=200`);
            setContractors(result.data || []);
        } catch (err) {
            // C9: ошибка загрузки больше не молчит (была пустая таблица без причины).
            console.error('Failed to load contractors:', err);
            toast({ variant: 'error', title: 'Ошибка загрузки контрагентов', description: (err as Error)?.message });
        } finally {
            setLoading(false);
        }
    }

    const filtered = statusFilter === 'active'
        ? contractors.filter(c => !c.isArchived)
        : statusFilter === 'archived'
            ? contractors.filter(c => c.isArchived)
            : contractors;

    const activeCount = contractors.filter(c => !c.isArchived).length;

    const columns: Column<Contractor>[] = [
        {
            id: 'name',
            header: 'Наименование',
            accessor: (r) => r.name,
            cell: (r) => <span className="font-medium text-neutral-900">{r.name}</span>,
            sortable: true,
            sticky: 'left',
            minWidth: '220px',
        },
        {
            id: 'inn',
            header: 'ИНН',
            accessor: (r) => r.inn,
            sortable: true,
            monospace: true,
            width: '130px',
        },
        {
            id: 'kpp',
            header: 'КПП',
            accessor: (r) => r.kpp || '',
            cell: (r) => r.kpp || <span className="text-neutral-400">—</span>,
            sortable: true,
            monospace: true,
            width: '120px',
        },
        {
            id: 'legalAddress',
            header: 'Адрес',
            accessor: (r) => r.legalAddress,
            cell: (r) => <span className="text-neutral-600 truncate block max-w-xs" title={r.legalAddress}>{r.legalAddress}</span>,
            sortable: true,
            minWidth: '240px',
        },
        {
            id: 'phone',
            header: 'Телефон',
            accessor: (r) => r.phone || '',
            cell: (r) => r.phone || <span className="text-neutral-400">—</span>,
            width: '160px',
        },
        {
            id: 'email',
            header: 'Email',
            accessor: (r) => r.email || '',
            cell: (r) => r.email || <span className="text-neutral-400">—</span>,
            width: '180px',
        },
        {
            id: 'isArchived',
            header: 'Статус',
            accessor: (r) => (r.isArchived ? 1 : 0),
            cell: (r) => (
                <Pill tone={r.isArchived ? 'neutral' : 'success'}>
                    {r.isArchived ? 'Архив' : 'Активный'}
                </Pill>
            ),
            sortable: true,
            width: '110px',
        },
    ];

    async function archiveSelected(rows: Contractor[]) {
        const active = rows.filter(r => !r.isArchived);
        if (active.length === 0) return;
        setConfirmAction({
            run: async () => {
                try {
                    await Promise.all(active.map(r => api.put(`/fleet/contractors/${r.id}`, { isArchived: true })));
                    toast({ variant: 'success', title: `Архивировано: ${active.length}` });
                    void loadContractors();
                } catch (err: any) {
                    toast({ variant: 'error', title: 'Ошибка', description: err?.message || 'Не удалось обновить' });
                }
            },
            title: `Архивировать ${active.length} контрагент(ов)?`,
            confirmLabel: 'Архивировать',
        });
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                    <div className="shrink-0 w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center">
                        <Building2 className="w-5 h-5" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-semibold text-neutral-900">Контрагенты</h1>
                        <p className="text-sm text-neutral-500 mt-0.5">Реестр клиентов, перевозчиков и поставщиков</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        leftIcon={<Download className="w-4 h-4" />}
                        onClick={() => exportContractorsCSV(filtered)}
                        disabled={filtered.length === 0}
                        title={filtered.length === 0 ? 'Нет данных для экспорта' : `Экспортировать ${filtered.length} записей`}
                    >
                        Экспорт CSV
                    </Button>
                    <Button variant="brand" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setShowCreateModal(true)}>
                        Добавить контрагента
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <Stat label="Всего" value={contractors.length} icon={Building2} tone="neutral" />
                <Stat label="Активные" value={activeCount} icon={Building2} tone="success" />
                <Stat label="Архив" value={contractors.length - activeCount} icon={Building2} tone="neutral" />
            </div>

            <DataTable<Contractor>
                tableId="contractors"
                data={filtered}
                columns={columns}
                keyField="id"
                loading={loading}
                searchPlaceholder="Поиск по названию, ИНН..."
                searchKeys={['name', 'inn', 'legalAddress', 'email', 'phone']}
                filters={[
                    {
                        id: 'status',
                        label: 'Статус',
                        value: statusFilter,
                        onChange: setStatusFilter,
                        options: [
                            { value: 'active', label: 'Активные' },
                            { value: 'archived', label: 'Архив' },
                        ],
                    },
                ]}
                bulkActions={(rows) => (
                    <>
                        <Button size="sm" variant="outline" leftIcon={<Archive className="w-3.5 h-3.5" />} onClick={() => archiveSelected(rows)}>
                            В архив ({rows.length})
                        </Button>
                        <Button size="sm" variant="outline" leftIcon={<Mail className="w-3.5 h-3.5" />} onClick={() => {
                            const emails = rows.map(r => r.email).filter(Boolean).join(',');
                            if (emails) window.location.href = `mailto:${emails}`;
                        }}>
                            Письмо ({rows.length})
                        </Button>
                    </>
                )}
                rowActions={(row) => [
                    {
                        id: 'edit',
                        label: 'Редактировать',
                        icon: <Pencil className="w-4 h-4" />,
                        onClick: () => setEditingContractor(row),
                    },
                    {
                        id: 'archive',
                        label: row.isArchived ? 'Восстановить' : 'В архив',
                        icon: <Archive className="w-4 h-4" />,
                        onClick: async () => {
                            try {
                                await api.put(`/fleet/contractors/${row.id}`, { isArchived: !row.isArchived });
                                toast({ variant: 'success', title: row.isArchived ? 'Восстановлено' : 'Архивировано' });
                                void loadContractors();
                            } catch (err: any) {
                                toast({ variant: 'error', title: 'Ошибка', description: err?.message });
                            }
                        },
                    },
                ]}
                emptyState={
                    <EmptyState
                        icon={Building2}
                        title="Пока нет контрагентов"
                        description="Добавьте первого контрагента, чтобы начать."
                        tone="brand"
                        action={
                            <Button variant="brand" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setShowCreateModal(true)}>
                                Добавить контрагента
                            </Button>
                        }
                    />
                }
                pageSize={50}
            />

            {showCreateModal && (
                <CreateContractorModal
                    onClose={() => setShowCreateModal(false)}
                    onCreated={() => { setShowCreateModal(false); loadContractors(); }}
                />
            )}

            {editingContractor && (
                <CreateContractorModal
                    key={editingContractor.id}
                    editingItem={editingContractor}
                    onClose={() => setEditingContractor(null)}
                    onCreated={() => { setEditingContractor(null); loadContractors(); }}
                />
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
