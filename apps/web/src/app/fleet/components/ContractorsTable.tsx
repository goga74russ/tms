'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Search, Plus, Building2, MapPin, Edit3, Trash2 } from 'lucide-react';
import { Dialog, ConfirmDialog } from '@/components/ui/dialog';

interface Contractor {
    id: string;
    name: string;
    inn: string;
    kpp?: string;
    legalAddress: string;
    phone?: string;
    email?: string;
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
                                    className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                />
                                <div className="grid grid-cols-2 gap-3">
                                    <input
                                        value={form.lat}
                                        onChange={(e) => setForm((current) => ({ ...current, lat: e.target.value }))}
                                        placeholder="Широта"
                                        type="number"
                                        step="0.000001"
                                        className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                    />
                                    <input
                                        value={form.lon}
                                        onChange={(e) => setForm((current) => ({ ...current, lon: e.target.value }))}
                                        placeholder="Долгота"
                                        type="number"
                                        step="0.000001"
                                        className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
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
                                    className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                >
                                    <option value="loading">Погрузка</option>
                                    <option value="unloading">Выгрузка</option>
                                </select>
                                <input
                                    value={form.fiasId}
                                    onChange={(e) => setForm((current) => ({ ...current, fiasId: e.target.value }))}
                                    placeholder="FIAS ID (необязательно)"
                                    className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                />
                                <button
                                    type="button"
                                    onClick={submitAddress}
                                    disabled={submitting}
                                    className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {submitting
                                        ? 'Сохранение...'
                                        : editingAddressId
                                            ? 'Сохранить адрес'
                                            : 'Добавить адрес'}
                                </button>
                                {error && <p className="text-sm text-red-600">{error}</p>}
                            </div>
                        </div>

                        <div className="rounded-2xl border border-dashed border-neutral-200 bg-white p-4 text-sm text-neutral-500">
                            <div className="flex items-start gap-3">
                                <MapPin className="mt-0.5 w-4 h-4 text-indigo-500" />
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
                            <span className="text-xs px-2 py-1 rounded-full bg-indigo-50 text-indigo-700">
                                {addresses.length}
                            </span>
                        </div>

                        {loading ? (
                            <div className="flex items-center justify-center py-20">
                                <div className="w-8 h-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
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
                                                            : 'bg-emerald-50 text-emerald-700'
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
                                                    className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 px-3 py-2 text-xs font-medium text-neutral-600 hover:border-indigo-300 hover:text-indigo-700"
                                                >
                                                    <Edit3 className="w-3.5 h-3.5" />
                                                    Изменить
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => removeAddress(address)}
                                                    className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-3 py-2 text-xs font-medium text-rose-600 hover:border-rose-300 hover:bg-rose-50"
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
    const [contractors, setContractors] = useState<Contractor[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [activeContractor, setActiveContractor] = useState<Contractor | null>(null);

    useEffect(() => {
        const timer = setTimeout(() => {
            loadContractors();
        }, 300);
        return () => clearTimeout(timer);
    }, [search]);

    async function loadContractors() {
        setLoading(true);
        try {
            const result = await api.get<any>(`/fleet/contractors?search=${search}&limit=50`);
            setContractors(result.data || []);
        } catch (err) {
            console.error('Failed to load contractors:', err);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div>
            <div className="p-4 border-b border-neutral-200 flex items-center gap-4">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                    <input
                        type="text"
                        placeholder="Поиск по названию, ИНН..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 rounded-lg border border-neutral-200 text-sm
                            focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                </div>
                <button className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg
                    text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm">
                    <Plus className="w-4 h-4" />
                    Добавить контрагента
                </button>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                </div>
            ) : contractors.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-neutral-400">
                    <Building2 className="w-12 h-12 mb-3" />
                    <p className="text-sm">Контрагенты не найдены</p>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-neutral-50 text-neutral-500 text-left">
                                <th className="px-4 py-3 font-medium">Наименование</th>
                                <th className="px-4 py-3 font-medium">ИНН</th>
                                <th className="px-4 py-3 font-medium">КПП</th>
                                <th className="px-4 py-3 font-medium">Адрес</th>
                                <th className="px-4 py-3 font-medium">Телефон</th>
                                <th className="px-4 py-3 font-medium">Email</th>
                                <th className="px-4 py-3 font-medium text-right">Действия</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100">
                            {contractors.map((contractor) => (
                                <tr key={contractor.id} className={`hover:bg-neutral-50 ${contractor.isArchived ? 'opacity-50' : ''}`}>
                                    <td className="px-4 py-3">
                                        <span className="font-medium text-neutral-900">{contractor.name}</span>
                                        {contractor.isArchived && (
                                            <span className="ml-2 px-1.5 py-0.5 bg-neutral-100 text-neutral-400 rounded text-xs">
                                                Архив
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 font-mono text-neutral-600">{contractor.inn}</td>
                                    <td className="px-4 py-3 font-mono text-neutral-500 text-xs">{contractor.kpp || '—'}</td>
                                    <td className="px-4 py-3 text-neutral-600 max-w-xs truncate">{contractor.legalAddress}</td>
                                    <td className="px-4 py-3 text-neutral-600">{contractor.phone || '—'}</td>
                                    <td className="px-4 py-3 text-neutral-600">{contractor.email || '—'}</td>
                                    <td className="px-4 py-3 text-right">
                                        <button
                                            type="button"
                                            onClick={() => setActiveContractor(contractor)}
                                            className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 px-3 py-2 text-xs font-medium text-indigo-700 hover:bg-indigo-50"
                                        >
                                            <MapPin className="w-3.5 h-3.5" />
                                            Адреса
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {activeContractor && (
                <ContractorAddressesModal contractor={activeContractor} onClose={() => setActiveContractor(null)} />
            )}
        </div>
    );
}
