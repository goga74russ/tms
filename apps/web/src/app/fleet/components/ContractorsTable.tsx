'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Search, Plus, Building2 } from 'lucide-react';

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

export function ContractorsTable() {
    const [contractors, setContractors] = useState<Contractor[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

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
            <div className="p-4 border-b border-slate-200 flex items-center gap-4">
                <div className="relative flex-1 max-w-sm">
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
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {contractors.map(c => (
                                <tr key={c.id} className={`hover:bg-slate-50 ${c.isArchived ? 'opacity-50' : ''}`}>
                                    <td className="px-4 py-3">
                                        <span className="font-medium text-slate-900">{c.name}</span>
                                        {c.isArchived && (
                                            <span className="ml-2 px-1.5 py-0.5 bg-slate-100 text-slate-400 rounded text-xs">
                                                Архив
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 font-mono text-slate-600">{c.inn}</td>
                                    <td className="px-4 py-3 font-mono text-slate-500 text-xs">{c.kpp || '—'}</td>
                                    <td className="px-4 py-3 text-slate-600 max-w-xs truncate">{c.legalAddress}</td>
                                    <td className="px-4 py-3 text-slate-600">{c.phone || '—'}</td>
                                    <td className="px-4 py-3 text-slate-600">{c.email || '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
