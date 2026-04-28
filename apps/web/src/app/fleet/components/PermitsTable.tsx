'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Plus, ShieldCheck } from 'lucide-react';

interface Permit {
    id: string;
    vehicleId: string;
    zoneType: string;
    zoneName: string;
    permitNumber: string;
    validFrom: string;
    validUntil: string;
    isActive: boolean;
}

function formatDate(d: string) {
    return new Date(d).toLocaleDateString('ru-RU');
}

function daysUntil(d: string) {
    return Math.ceil((new Date(d).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

const zoneLabels: Record<string, string> = {
    mkad: 'МКАД',
    ttk: 'ТТК',
    city: 'Городская зона',
};

export function PermitsTable() {
    const [permits, setPermits] = useState<Permit[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => { loadPermits(); }, []);

    async function loadPermits() {
        setLoading(true);
        try {
            const result = await api.get<any>('/fleet/permits?limit=50');
            setPermits(result.data || []);
        } catch (err) {
            console.error('Failed to load permits:', err);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div>
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
                <h3 className="text-sm font-medium text-slate-700">Пропуска ({permits.length})</h3>
                <button className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg
                    text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm">
                    <Plus className="w-4 h-4" />
                    Добавить пропуск
                </button>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                </div>
            ) : permits.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                    <ShieldCheck className="w-12 h-12 mb-3" />
                    <p className="text-sm">Пропуска не найдены</p>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-slate-50 text-slate-500 text-left">
                                <th className="px-4 py-3 font-medium">Зона</th>
                                <th className="px-4 py-3 font-medium">Номер пропуска</th>
                                <th className="px-4 py-3 font-medium">Действует с</th>
                                <th className="px-4 py-3 font-medium">Действует до</th>
                                <th className="px-4 py-3 font-medium">Осталось</th>
                                <th className="px-4 py-3 font-medium">Статус</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {permits.map(p => {
                                const days = daysUntil(p.validUntil);
                                const urgency = days < 0 ? 'text-red-700 font-bold' :
                                    days < 7 ? 'text-red-600' :
                                        days <= 30 ? 'text-amber-600' : 'text-emerald-600';
                                return (
                                    <tr key={p.id} className="hover:bg-slate-50">
                                        <td className="px-4 py-3">
                                            <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded text-xs font-medium">
                                                {zoneLabels[p.zoneType] || p.zoneType}
                                            </span>
                                            <span className="ml-2 text-slate-600">{p.zoneName}</span>
                                        </td>
                                        <td className="px-4 py-3 font-mono text-slate-700">{p.permitNumber}</td>
                                        <td className="px-4 py-3 text-slate-600">{formatDate(p.validFrom)}</td>
                                        <td className="px-4 py-3 text-slate-600">{formatDate(p.validUntil)}</td>
                                        <td className={`px-4 py-3 font-medium ${urgency}`}>
                                            {days < 0 ? `Просрочен ${Math.abs(days)} д.` : `${days} д.`}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium
                                                ${p.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                                {p.isActive ? 'Действует' : 'Неактивен'}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
