'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Plus, AlertTriangle } from 'lucide-react';

interface Fine {
    id: string;
    vehicleId: string;
    driverId?: string;
    status: string;
    violationDate: string;
    violationType: string;
    amount: number | string;
    resolutionNumber?: string;
    paidAt?: string;
}

function formatDate(d: string) {
    return new Date(d).toLocaleDateString('ru-RU');
}

function formatMoney(value: number | string) {
    const amount = typeof value === 'number' ? value : Number(value);
    return amount.toLocaleString('ru-RU') + ' ₽';
}

const statusConfig: Record<string, { label: string; color: string }> = {
    new: { label: 'Новый', color: 'bg-amber-100 text-amber-700' },
    confirmed: { label: 'Подтверждён', color: 'bg-blue-100 text-blue-700' },
    paid: { label: 'Оплачен', color: 'bg-emerald-100 text-emerald-700' },
    appealed: { label: 'Обжалован', color: 'bg-purple-100 text-purple-700' },
};

export function FinesTable() {
    const [fines, setFines] = useState<Fine[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('');

    useEffect(() => { loadFines(); }, [statusFilter]);

    async function loadFines() {
        setLoading(true);
        try {
            const q = statusFilter ? `&status=${statusFilter}` : '';
            const result = await api.get<any>(`/fleet/fines?limit=50${q}`);
            setFines(result.data || []);
        } catch (err) {
            console.error('Failed to load fines:', err);
        } finally {
            setLoading(false);
        }
    }

    const totalAmount = fines.reduce((sum, fine) => sum + Number(fine.amount), 0);
    const unpaidCount = fines.filter(f => f.status !== 'paid').length;

    return (
        <div>
            <div className="p-4 border-b border-neutral-200 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <h3 className="text-sm font-medium text-neutral-700">Штрафы ГИБДД</h3>
                    <div className="flex items-center gap-2 text-xs">
                        <span className="px-2 py-1 rounded bg-neutral-100 text-neutral-600">
                            Всего: {formatMoney(totalAmount)}
                        </span>
                        {unpaidCount > 0 && (
                            <span className="px-2 py-1 rounded bg-amber-100 text-amber-700">
                                Неоплач.: {unpaidCount}
                            </span>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <select
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value)}
                        className="px-3 py-2 rounded-lg border border-neutral-200 text-sm
                            focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    >
                        <option value="">Все статусы</option>
                        <option value="new">Новый</option>
                        <option value="confirmed">Подтверждён</option>
                        <option value="paid">Оплачен</option>
                        <option value="appealed">Обжалован</option>
                    </select>
                    <button className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg
                        text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm">
                        <Plus className="w-4 h-4" />
                        Добавить штраф
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                </div>
            ) : fines.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-neutral-400">
                    <AlertTriangle className="w-12 h-12 mb-3" />
                    <p className="text-sm">Штрафы не найдены</p>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-neutral-50 text-neutral-500 text-left">
                                <th className="px-4 py-3 font-medium">Дата нарушения</th>
                                <th className="px-4 py-3 font-medium">Тип нарушения</th>
                                <th className="px-4 py-3 font-medium">Номер постановления</th>
                                <th className="px-4 py-3 font-medium text-right">Сумма</th>
                                <th className="px-4 py-3 font-medium">Статус</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100">
                            {fines.map(f => {
                                const st = statusConfig[f.status] || { label: f.status, color: '' };
                                return (
                                    <tr key={f.id} className="hover:bg-neutral-50">
                                        <td className="px-4 py-3 text-neutral-600">{formatDate(f.violationDate)}</td>
                                        <td className="px-4 py-3 font-medium text-neutral-800">{f.violationType}</td>
                                        <td className="px-4 py-3 font-mono text-neutral-500 text-xs">
                                            {f.resolutionNumber || '—'}
                                        </td>
                                        <td className="px-4 py-3 text-right font-semibold text-neutral-900">
                                            {formatMoney(f.amount)}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${st.color}`}>
                                                {st.label}
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
