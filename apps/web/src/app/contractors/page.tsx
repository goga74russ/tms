'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Search, Plus, Building2, X, Loader2 } from 'lucide-react';

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

function CreateContractorModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
    const [name, setName] = useState('');
    const [inn, setInn] = useState('');
    const [kpp, setKpp] = useState('');
    const [legalAddress, setLegalAddress] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [contactPerson, setContactPerson] = useState('');
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
            const result = await api.post<any>('/fleet/contractors', {
                name, inn, kpp: kpp || undefined,
                legalAddress, phone: phone || undefined,
                email: email || undefined, contactPerson: contactPerson || undefined,
            });
            if (result.success) {
                onCreated();
            } else {
                throw new Error(result.error || 'Ошибка');
            }
        } catch (err: any) {
            setError(err.message || 'Ошибка сервера');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                    <h2 className="text-lg font-bold text-slate-900">Новый контрагент</h2>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X className="w-5 h-5" /></button>
                </div>
                <div className="px-6 py-5 space-y-4">
                    <div>
                        <label className="text-sm font-medium text-slate-700 mb-1.5 block">Наименование *</label>
                        <input type="text" value={name} onChange={e => setName(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            placeholder="ООО Логистика" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-sm font-medium text-slate-700 mb-1.5 block">ИНН *</label>
                            <input type="text" value={inn} onChange={e => setInn(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                placeholder="7701234567" />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-slate-700 mb-1.5 block">КПП</label>
                            <input type="text" value={kpp} onChange={e => setKpp(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                placeholder="770101001" />
                        </div>
                    </div>
                    <div>
                        <label className="text-sm font-medium text-slate-700 mb-1.5 block">Юридический адрес *</label>
                        <input type="text" value={legalAddress} onChange={e => setLegalAddress(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            placeholder="г. Москва, ул. Примерная, 1" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-sm font-medium text-slate-700 mb-1.5 block">Телефон</label>
                            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                placeholder="+7 (495) 123-45-67" />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-slate-700 mb-1.5 block">Email</label>
                            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                placeholder="info@company.ru" />
                        </div>
                    </div>
                    <div>
                        <label className="text-sm font-medium text-slate-700 mb-1.5 block">Контактное лицо</label>
                        <input type="text" value={contactPerson} onChange={e => setContactPerson(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            placeholder="Иванов И.И." />
                    </div>
                    {error && <p className="text-sm text-red-600">{error}</p>}
                </div>
                <div className="px-6 py-4 border-t border-slate-100 flex gap-3 justify-end">
                    <button onClick={onClose} disabled={submitting} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100">Отмена</button>
                    <button onClick={handleSubmit} disabled={submitting}
                        className="px-5 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
                        {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                        {submitting ? 'Создание...' : 'Создать'}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function ContractorsPage() {
    const [contractors, setContractors] = useState<Contractor[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [showCreateModal, setShowCreateModal] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(search), 300);
        return () => clearTimeout(timer);
    }, [search]);

    useEffect(() => {
        loadContractors();
    }, [debouncedSearch]);

    async function loadContractors() {
        setLoading(true);
        try {
            const result = await api.get<any>(`/fleet/contractors?search=${debouncedSearch}&limit=100`);
            setContractors(result.data || []);
        } catch (err) {
            console.error('Failed to load contractors:', err);
        } finally {
            setLoading(false);
        }
    }

    const activeCount = contractors.filter(c => !c.isArchived).length;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Контрагенты</h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Реестр контрагентов • {activeCount} активных из {contractors.length}
                    </p>
                </div>
                <button
                    onClick={() => setShowCreateModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg
                    text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm">
                    <Plus className="w-4 h-4" />
                    Добавить контрагента
                </button>
            </div>

            {/* Content Card */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200">
                {/* Search */}
                <div className="p-4 border-b border-slate-200">
                    <div className="relative max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Поиск по названию, ИНН..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 text-sm
                                focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        />
                    </div>
                </div>

                {/* Table */}
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                    </div>
                ) : contractors.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                        <Building2 className="w-12 h-12 mb-3" />
                        <p className="text-sm">Контрагенты не найдены</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50 text-slate-500 text-left">
                                    <th className="px-4 py-3 font-medium">Наименование</th>
                                    <th className="px-4 py-3 font-medium">ИНН</th>
                                    <th className="px-4 py-3 font-medium">КПП</th>
                                    <th className="px-4 py-3 font-medium">Адрес</th>
                                    <th className="px-4 py-3 font-medium">Телефон</th>
                                    <th className="px-4 py-3 font-medium">Email</th>
                                    <th className="px-4 py-3 font-medium">Статус</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {contractors.map(c => (
                                    <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-4 py-3 font-medium text-slate-900">{c.name}</td>
                                        <td className="px-4 py-3 font-mono text-slate-600">{c.inn}</td>
                                        <td className="px-4 py-3 text-slate-500">{c.kpp || '—'}</td>
                                        <td className="px-4 py-3 text-slate-500 max-w-xs truncate">{c.legalAddress}</td>
                                        <td className="px-4 py-3 text-slate-500">{c.phone || '—'}</td>
                                        <td className="px-4 py-3 text-slate-500">{c.email || '—'}</td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium
                                                ${!c.isArchived ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                                {!c.isArchived ? 'Активный' : 'Архив'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {showCreateModal && (
                <CreateContractorModal
                    onClose={() => setShowCreateModal(false)}
                    onCreated={() => { setShowCreateModal(false); loadContractors(); }}
                />
            )}
        </div>
    );
}
