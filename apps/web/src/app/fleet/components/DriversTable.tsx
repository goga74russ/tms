'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Search, Plus, Users } from 'lucide-react';

interface Driver {
    id: string;
    fullName: string;
    licenseNumber: string;
    licenseCategories: string[];
    licenseExpiry: string;
    medCertificateExpiry?: string;
    isActive: boolean;
    createdAt: string;
}

function formatDate(d?: string) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('ru-RU');
}

function expiryColor(d?: string) {
    if (!d) return '';
    const diff = (new Date(d).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    if (diff < 0) return 'text-red-700 font-bold';
    if (diff < 7) return 'text-red-600';
    if (diff <= 30) return 'text-amber-600';
    return 'text-emerald-600';
}

export function DriversTable() {
    const [drivers, setDrivers] = useState<Driver[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');

    // M-22 FIX: Debounce search input (300ms)
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(search), 300);
        return () => clearTimeout(timer);
    }, [search]);

    useEffect(() => {
        loadDrivers();
    }, [debouncedSearch]);

    async function loadDrivers() {
        setLoading(true);
        try {
            const result = await api.get<any>(`/fleet/drivers?search=${debouncedSearch}&limit=50`);
            setDrivers(result.data || []);
        } catch (err) {
            console.error('Failed to load drivers:', err);
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
                        placeholder="Поиск по ФИО, номеру ВУ..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 text-sm
                            focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                </div>
                <button className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg
                    text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm">
                    <Plus className="w-4 h-4" />
                    Добавить водителя
                </button>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                </div>
            ) : drivers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                    <Users className="w-12 h-12 mb-3" />
                    <p className="text-sm">Водители не найдены</p>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-slate-50 text-slate-500 text-left">
                                <th className="px-4 py-3 font-medium">ФИО</th>
                                <th className="px-4 py-3 font-medium">Номер ВУ</th>
                                <th className="px-4 py-3 font-medium">Категории</th>
                                <th className="px-4 py-3 font-medium">Срок ВУ</th>
                                <th className="px-4 py-3 font-medium">Медсправка</th>
                                <th className="px-4 py-3 font-medium">Статус</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {drivers.map(d => (
                                <tr key={d.id} className="hover:bg-slate-50">
                                    <td className="px-4 py-3 font-medium text-slate-900">{d.fullName}</td>
                                    <td className="px-4 py-3 font-mono text-slate-600">{d.licenseNumber}</td>
                                    <td className="px-4 py-3">
                                        <div className="flex gap-1">
                                            {d.licenseCategories.map(c => (
                                                <span key={c} className="px-1.5 py-0.5 bg-slate-100 rounded text-xs font-medium text-slate-600">
                                                    {c}
                                                </span>
                                            ))}
                                        </div>
                                    </td>
                                    <td className={`px-4 py-3 text-sm ${expiryColor(d.licenseExpiry)}`}>
                                        {formatDate(d.licenseExpiry)}
                                    </td>
                                    <td className={`px-4 py-3 text-sm ${expiryColor(d.medCertificateExpiry)}`}>
                                        {formatDate(d.medCertificateExpiry)}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium
                                            ${d.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                            {d.isActive ? 'Активен' : 'Неактивен'}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
