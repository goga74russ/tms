'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Search, Plus, Building2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Stat } from '@/components/ui/stat';
import { SkeletonTable } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';

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
    const { toast } = useToast();
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
                toast({ variant: 'success', title: 'Контрагент создан' });
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
                    <Button variant="outline" onClick={onClose} disabled={submitting}>Отмена</Button>
                    <Button variant="brand" isLoading={submitting} onClick={handleSubmit}>Создать</Button>
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
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                    <div className="shrink-0 w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center">
                        <Building2 className="w-5 h-5" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-semibold text-slate-900">Контрагенты</h1>
                        <p className="text-sm text-slate-500 mt-0.5">Реестр клиентов, перевозчиков и поставщиков</p>
                    </div>
                </div>
                <Button variant="brand" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setShowCreateModal(true)}>
                    Добавить контрагента
                </Button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <Stat label="Всего" value={contractors.length} icon={Building2} tone="neutral" />
                <Stat label="Активные" value={activeCount} icon={Building2} tone="success" />
                <Stat label="Архив" value={contractors.length - activeCount} icon={Building2} tone="neutral" />
            </div>

            {/* Content Card */}
            <div className="bg-white rounded-xl shadow-soft border border-slate-200">
                {/* Search */}
                <div className="p-4 border-b border-slate-200">
                    <div className="max-w-sm">
                        <Input
                            type="text"
                            placeholder="Поиск по названию, ИНН..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            leftAddon={<Search className="w-4 h-4" />}
                        />
                    </div>
                </div>

                {/* Table */}
                {loading ? (
                    <div className="p-4"><SkeletonTable rows={6} columns={7} /></div>
                ) : contractors.length === 0 ? (
                    <div className="p-6">
                        <EmptyState
                            icon={Building2}
                            title={search ? 'Контрагенты не найдены' : 'Пока нет контрагентов'}
                            description={search ? 'Попробуйте изменить запрос.' : 'Добавьте первого контрагента.'}
                            tone="brand"
                            action={!search ? (
                                <Button variant="brand" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setShowCreateModal(true)}>
                                    Добавить контрагента
                                </Button>
                            ) : undefined}
                        />
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
