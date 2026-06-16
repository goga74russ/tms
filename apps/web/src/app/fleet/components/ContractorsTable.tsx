'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Plus, Building2, MapPin, Edit3, Trash2, Pencil, Archive } from 'lucide-react';
import { Dialog, ConfirmDialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { DataTable, type Column, Pill } from '@/components/ui/data-table';
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
}

interface ContractorAddress {
    id: string;
    addressString: string;
    lat: number;
    lon: number;
    type: 'loading' | 'unloading';
    contractorId: string | null;
    fiasId?: string | null;
    createdAt?: string;
}

type AddressForm = {
    addressString: string;
    lat: string;
    lon: string;
    type: 'loading' | 'unloading';
    fiasId: string;
};

const emptyAddressForm = (): AddressForm => ({
    addressString: '',
    lat: '',
    lon: '',
    type: 'loading',
    fiasId: '',
});

const addressTypeLabels: Record<ContractorAddress['type'], string> = {
    loading: 'Погрузка',
    unloading: 'Выгрузка',
};

function CreateContractorModal({
    onClose,
    onSaved,
    editingItem,
}: {
    onClose: () => void;
    onSaved: () => void;
    editingItem?: Contractor | null;
}) {
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
                onSaved();
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
                    <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                        placeholder="ООО Логистика" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <FormField
                        format="inn"
                        label="ИНН"
                        required
                        value={inn}
                        onChange={(e) => setInn(e.target.value)}
                    />
                    <FormField
                        format="kpp"
                        label="КПП"
                        value={kpp}
                        onChange={(e) => setKpp(e.target.value)}
                    />
                </div>
                <div>
                    <label className="text-sm font-medium text-neutral-700 mb-1.5 block">Юридический адрес *</label>
                    <input type="text" value={legalAddress} onChange={(e) => setLegalAddress(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                        placeholder="г. Москва, ул. Примерная, 1" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <FormField
                        format="phone"
                        label="Телефон"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                    />
                    <FormField
                        format="email"
                        label="Email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                    />
                </div>
                <div>
                    <label className="text-sm font-medium text-neutral-700 mb-1.5 block">Контактное лицо</label>
                    <input type="text" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                        placeholder="Иванов И.И." />
                </div>
                {error && <p className="text-sm text-danger-600">{error}</p>}
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

function ContractorAddressesModal({
    contractor,
    onClose,
}: {
    contractor: Contractor;
    onClose: () => void;
}) {
    const [addresses, setAddresses] = useState<ContractorAddress[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
    const [form, setForm] = useState<AddressForm>(emptyAddressForm());
    const [error, setError] = useState('');
    const [confirmAction, setConfirmAction] = useState<null | { run: () => Promise<void> | void; title: string; description?: string; destructive?: boolean; confirmLabel?: string }>(null);

    async function loadAddresses() {
        setLoading(true);
        try {
            const result = await api.get<any>(`/fleet/contractors/${contractor.id}/addresses`);
            const nextAddresses = Array.isArray(result.data) ? result.data : [];
            nextAddresses.sort((left: ContractorAddress, right: ContractorAddress) => {
                if (left.type !== right.type) {
                    return left.type === 'loading' ? -1 : 1;
                }
                return left.addressString.localeCompare(right.addressString, 'ru');
            });
            setAddresses(nextAddresses);
        } catch (err) {
            console.error('Failed to load contractor addresses:', err);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadAddresses();
    }, [contractor.id]);

    const resetForm = () => {
        setEditingAddressId(null);
        setForm(emptyAddressForm());
        setError('');
    };

    const startEdit = (address: ContractorAddress) => {
        setEditingAddressId(address.id);
        setForm({
            addressString: address.addressString,
            lat: String(address.lat),
            lon: String(address.lon),
            type: address.type,
            fiasId: address.fiasId || '',
        });
        setError('');
    };

    const submitAddress = async () => {
        if (!form.addressString.trim()) {
            setError('Укажите адрес');
            return;
        }

        const lat = Number(form.lat);
        const lon = Number(form.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            setError('Укажите координаты');
            return;
        }

        setSubmitting(true);
        setError('');
        try {
            const payload = {
                addressString: form.addressString.trim(),
                lat,
                lon,
                type: form.type,
                fiasId: form.fiasId.trim() ? form.fiasId.trim() : undefined,
            };

            if (editingAddressId) {
                await api.put(`/fleet/contractors/${contractor.id}/addresses/${editingAddressId}`, payload);
            } else {
                await api.post(`/fleet/contractors/${contractor.id}/addresses`, payload);
            }

            resetForm();
            await loadAddresses();
        } catch (err: any) {
            setError(err?.message || 'Не удалось сохранить адрес');
        } finally {
            setSubmitting(false);
        }
    };

    const removeAddress = async (address: ContractorAddress) => {
        setConfirmAction({
            run: async () => {
                setSubmitting(true);
                setError('');
                try {
                    await api.delete(`/fleet/contractors/${contractor.id}/addresses/${address.id}`);
                    if (editingAddressId === address.id) {
                        resetForm();
                    }
                    await loadAddresses();
                } catch (err: any) {
                    setError(err?.message || 'Не удалось удалить адрес');
                } finally {
                    setSubmitting(false);
                }
            },
            title: `Удалить адрес "${address.addressString}"?`,
            destructive: true,
            confirmLabel: 'Удалить',
        });
    };

    return (
        <Dialog
            open={true}
            onClose={onClose}
            title="Адреса контрагента"
            description={`${contractor.name} · часто используемые адреса для заявок`}
            size="xl"
        >
            <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
                    <div className="space-y-4">
                        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                            <div className="flex items-center justify-between gap-2 mb-4">
                                <div>
                                    <h4 className="text-sm font-semibold text-neutral-900">
                                        {editingAddressId ? 'Редактировать адрес' : 'Новый адрес'}
                                    </h4>
                                    <p className="text-xs text-neutral-500">
                                        Используется в заявках как типовой адрес
                                    </p>
                                </div>
                                {editingAddressId && (
                                    <button
                                        type="button"
                                        onClick={resetForm}
                                        className="text-xs font-medium text-neutral-500 hover:text-neutral-700"
                                    >
                                        Сбросить
                                    </button>
                                )}
                            </div>

                            <div className="space-y-3">
                                <input
                                    value={form.addressString}
                                    onChange={(e) => setForm((current) => ({ ...current, addressString: e.target.value }))}
                                    placeholder="Адрес"
                                    className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                                />
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <input
                                        value={form.lat}
                                        onChange={(e) => setForm((current) => ({ ...current, lat: e.target.value }))}
                                        placeholder="Широта"
                                        type="number"
                                        step="0.000001"
                                        className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                                    />
                                    <input
                                        value={form.lon}
                                        onChange={(e) => setForm((current) => ({ ...current, lon: e.target.value }))}
                                        placeholder="Долгота"
                                        type="number"
                                        step="0.000001"
                                        className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                                    />
                                </div>
                                <select
                                    value={form.type}
                                    onChange={(e) =>
                                        setForm((current) => ({
                                            ...current,
                                            type: e.target.value as AddressForm['type'],
                                        }))
                                    }
                                    className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                                >
                                    <option value="loading">Погрузка</option>
                                    <option value="unloading">Выгрузка</option>
                                </select>
                                <input
                                    value={form.fiasId}
                                    onChange={(e) => setForm((current) => ({ ...current, fiasId: e.target.value }))}
                                    placeholder="FIAS ID (необязательно)"
                                    className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                                />
                                <button
                                    type="button"
                                    onClick={submitAddress}
                                    disabled={submitting}
                                    className="w-full rounded-xl bg-brand-600 px-4 py-3 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {submitting
                                        ? 'Сохранение...'
                                        : editingAddressId
                                            ? 'Сохранить адрес'
                                            : 'Добавить адрес'}
                                </button>
                                {error && <p className="text-sm text-danger-600">{error}</p>}
                            </div>
                        </div>

                        <div className="rounded-2xl border border-dashed border-neutral-200 bg-white p-4 text-sm text-neutral-500">
                            <div className="flex items-start gap-3">
                                <MapPin className="mt-0.5 w-4 h-4 text-brand-500" />
                                <p>
                                    Выбранные здесь адреса будут доступны в создании заявки как частые адреса
                                    погрузки и выгрузки.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-neutral-200 overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100 bg-neutral-50">
                            <div className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
                                <Building2 className="w-4 h-4 text-neutral-400" />
                                Список адресов
                            </div>
                            <span className="text-xs px-2 py-1 rounded-full bg-brand-50 text-brand-700">
                                {addresses.length}
                            </span>
                        </div>

                        {loading ? (
                            <div className="flex items-center justify-center py-20">
                                <div className="w-8 h-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
                            </div>
                        ) : addresses.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 text-neutral-400">
                                <MapPin className="mb-3 w-10 h-10" />
                                <p className="text-sm">У контрагента пока нет типовых адресов</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-neutral-100">
                                {addresses.map((address) => (
                                    <div key={address.id} className="p-4 hover:bg-neutral-50">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="min-w-0">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="font-medium text-neutral-900 break-words">
                                                        {address.addressString}
                                                    </span>
                                                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                                        address.type === 'loading'
                                                            ? 'bg-sky-50 text-sky-700'
                                                            : 'bg-success-50 text-success-700'
                                                    }`}>
                                                        {addressTypeLabels[address.type]}
                                                    </span>
                                                </div>
                                                <div className="mt-1 text-xs text-neutral-500">
                                                    Координаты: {address.lat}, {address.lon}
                                                    {address.fiasId ? ` · FIAS: ${address.fiasId}` : ''}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => startEdit(address)}
                                                    className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 px-3 py-2 text-xs font-medium text-neutral-600 hover:border-brand-300 hover:text-brand-700"
                                                >
                                                    <Edit3 className="w-3.5 h-3.5" />
                                                    Изменить
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => removeAddress(address)}
                                                    className="inline-flex items-center gap-1 rounded-lg border border-danger-200 px-3 py-2 text-xs font-medium text-danger-600 hover:border-danger-300 hover:bg-danger-50"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                    Удалить
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
            </div>

            <ConfirmDialog
                open={!!confirmAction}
                onClose={() => setConfirmAction(null)}
                onConfirm={async () => { await confirmAction?.run(); setConfirmAction(null); }}
                title={confirmAction?.title ?? ''}
                description={confirmAction?.description}
                destructive={confirmAction?.destructive}
                confirmLabel={confirmAction?.confirmLabel}
            />
        </Dialog>
    );
}

export function ContractorsTable() {
    const { toast } = useToast();
    const [contractors, setContractors] = useState<Contractor[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeContractor, setActiveContractor] = useState<Contractor | null>(null);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [editingContractor, setEditingContractor] = useState<Contractor | null>(null);
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
            console.error('Failed to load contractors:', err);
        } finally {
            setLoading(false);
        }
    }

    const columns: Column<Contractor>[] = [
        {
            id: 'name',
            header: 'Наименование',
            accessor: (r) => r.name,
            cell: (r) => (
                <span>
                    <span className="font-medium text-neutral-900">{r.name}</span>
                    {r.isArchived && (
                        <span className="ml-2 px-1.5 py-0.5 bg-neutral-100 text-neutral-400 rounded text-xs">
                            Архив
                        </span>
                    )}
                </span>
            ),
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
            cell: (r) => (
                <span className="text-neutral-600 truncate block max-w-xs" title={r.legalAddress}>
                    {r.legalAddress}
                </span>
            ),
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

    async function toggleArchive(row: Contractor) {
        try {
            await api.put(`/fleet/contractors/${row.id}`, { isArchived: !row.isArchived });
            toast({ variant: 'success', title: row.isArchived ? 'Восстановлено' : 'Архивировано' });
            void loadContractors();
        } catch (err: any) {
            toast({ variant: 'error', title: 'Ошибка', description: err?.message ?? 'Не удалось обновить' });
        }
    }

    return (
        <div>
            <DataTable<Contractor>
                tableId="fleet-contractors"
                data={contractors}
                columns={columns}
                keyField="id"
                loading={loading}
                searchPlaceholder="Поиск по названию, ИНН…"
                searchKeys={['name', 'inn', 'legalAddress', 'email', 'phone']}
                toolbar={
                    <Button
                        variant="brand"
                        leftIcon={<Plus className="w-4 h-4" />}
                        onClick={() => setShowCreateModal(true)}
                    >
                        Добавить контрагента
                    </Button>
                }
                rowClassName={(row) => (row.isArchived ? 'opacity-60' : '')}
                rowActions={(row) => [
                    {
                        id: 'edit',
                        label: 'Редактировать',
                        icon: <Pencil className="w-4 h-4" />,
                        onClick: () => setEditingContractor(row),
                    },
                    {
                        id: 'addresses',
                        label: 'Адреса',
                        icon: <MapPin className="w-4 h-4" />,
                        onClick: () => setActiveContractor(row),
                    },
                    {
                        id: 'toggle-archive',
                        label: row.isArchived ? 'Восстановить' : 'В архив',
                        icon: <Archive className="w-4 h-4" />,
                        onClick: () => {
                            if (row.isArchived) {
                                void toggleArchive(row);
                                return;
                            }
                            setConfirmAction({
                                run: () => toggleArchive(row),
                                title: `Архивировать "${row.name}"?`,
                                confirmLabel: 'Архивировать',
                            });
                        },
                    },
                ]}
                emptyState={
                    <EmptyState
                        icon={Building2}
                        title="Пока нет контрагентов"
                        description="Добавьте первого контрагента, чтобы привязывать к нему рейсы и адреса."
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

            {activeContractor && (
                <ContractorAddressesModal contractor={activeContractor} onClose={() => setActiveContractor(null)} />
            )}

            {showCreateModal && (
                <CreateContractorModal
                    onClose={() => setShowCreateModal(false)}
                    onSaved={() => { setShowCreateModal(false); void loadContractors(); }}
                />
            )}

            {editingContractor && (
                <CreateContractorModal
                    key={editingContractor.id}
                    editingItem={editingContractor}
                    onClose={() => setEditingContractor(null)}
                    onSaved={() => { setEditingContractor(null); void loadContractors(); }}
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
