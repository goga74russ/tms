'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Plus, X, Edit2, Search } from 'lucide-react';

// ================================================================
// Types
// ================================================================
interface Tariff {
    id: string;
    contractId: string;
    type: string;
    ratePerKm: number | null;
    ratePerTon: number | null;
    ratePerHour: number | null;
    fixedRate: number | null;
    nightCoefficient: number;
    urgentCoefficient: number;
    weekendCoefficient: number;
    minTripCost: number;
    vatIncluded: boolean;
    vatRate: number;
    createdAt: string;
}

const TYPE_LABELS: Record<string, string> = {
    fixed: 'Фиксированный',
    per_km: 'За км',
    per_hour: 'За час',
    per_ton: 'За тонну',
    combined: 'Комбинированный',
};

// ================================================================
// Tariff Form Modal
// ================================================================
function TariffFormModal({
    tariff,
    onClose,
    onSuccess,
}: {
    tariff: Tariff | null;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const isEdit = !!tariff;
    const [form, setForm] = useState({
        contractId: tariff?.contractId || '',
        type: tariff?.type || 'fixed',
        ratePerKm: tariff?.ratePerKm?.toString() || '',
        ratePerHour: tariff?.ratePerHour?.toString() || '',
        fixedRate: tariff?.fixedRate?.toString() || '',
        nightCoefficient: tariff?.nightCoefficient?.toString() || '1',
        urgentCoefficient: tariff?.urgentCoefficient?.toString() || '1',
        weekendCoefficient: tariff?.weekendCoefficient?.toString() || '1',
        minTripCost: tariff?.minTripCost?.toString() || '0',
        vatIncluded: tariff?.vatIncluded ?? true,
        vatRate: tariff?.vatRate?.toString() || '20',
    });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async () => {
        if (!form.contractId || !form.type) {
            setError('Укажите контракт и тип тарифа');
            return;
        }

        const body: Record<string, unknown> = {
            contractId: form.contractId,
            type: form.type,
            ratePerKm: form.ratePerKm ? parseFloat(form.ratePerKm) : null,
            ratePerHour: form.ratePerHour ? parseFloat(form.ratePerHour) : null,
            fixedRate: form.fixedRate ? parseFloat(form.fixedRate) : null,
            nightCoefficient: parseFloat(form.nightCoefficient) || 1,
            urgentCoefficient: parseFloat(form.urgentCoefficient) || 1,
            weekendCoefficient: parseFloat(form.weekendCoefficient) || 1,
            minTripCost: parseFloat(form.minTripCost) || 0,
            vatIncluded: form.vatIncluded,
            vatRate: parseFloat(form.vatRate) || 20,
        };

        try {
            setSubmitting(true);
            setError('');
            if (isEdit) {
                await api.put(`/auth/tariffs/${tariff!.id}`, body);
            } else {
                await api.post('/auth/tariffs', body);
            }
            onSuccess();
        } catch (err: any) {
            setError(err.message || 'Ошибка');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <Card className="w-full max-w-lg mx-4 shadow-xl max-h-[90vh] overflow-y-auto">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle>{isEdit ? 'Редактирование тарифа' : 'Новый тариф'}</CardTitle>
                        <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100">
                            <X className="w-5 h-5 text-slate-400" />
                        </button>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-slate-700">ID контракта *</label>
                            <input
                                type="text"
                                value={form.contractId}
                                onChange={e => setForm(prev => ({ ...prev, contractId: e.target.value }))}
                                className="w-full px-3 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                placeholder="UUID контракта"
                                disabled={isEdit}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-slate-700">Тип *</label>
                            <select
                                value={form.type}
                                onChange={e => setForm(prev => ({ ...prev, type: e.target.value }))}
                                className="w-full px-3 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
                            >
                                {Object.entries(TYPE_LABELS).map(([k, v]) => (
                                    <option key={k} value={k}>{v}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-slate-700">₽/км</label>
                            <input type="number" step="0.01" value={form.ratePerKm}
                                onChange={e => setForm(prev => ({ ...prev, ratePerKm: e.target.value }))}
                                className="w-full px-3 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                        </div>
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-slate-700">₽/час</label>
                            <input type="number" step="0.01" value={form.ratePerHour}
                                onChange={e => setForm(prev => ({ ...prev, ratePerHour: e.target.value }))}
                                className="w-full px-3 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                        </div>
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-slate-700">Фикс ₽</label>
                            <input type="number" step="0.01" value={form.fixedRate}
                                onChange={e => setForm(prev => ({ ...prev, fixedRate: e.target.value }))}
                                className="w-full px-3 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-slate-700">Ночь ×</label>
                            <input type="number" step="0.1" value={form.nightCoefficient}
                                onChange={e => setForm(prev => ({ ...prev, nightCoefficient: e.target.value }))}
                                className="w-full px-3 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                        </div>
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-slate-700">Срочный ×</label>
                            <input type="number" step="0.1" value={form.urgentCoefficient}
                                onChange={e => setForm(prev => ({ ...prev, urgentCoefficient: e.target.value }))}
                                className="w-full px-3 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                        </div>
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-slate-700">Выходной ×</label>
                            <input type="number" step="0.1" value={form.weekendCoefficient}
                                onChange={e => setForm(prev => ({ ...prev, weekendCoefficient: e.target.value }))}
                                className="w-full px-3 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-slate-700">Мин. стоимость</label>
                            <input type="number" step="0.01" value={form.minTripCost}
                                onChange={e => setForm(prev => ({ ...prev, minTripCost: e.target.value }))}
                                className="w-full px-3 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                        </div>
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-slate-700">НДС %</label>
                            <input type="number" step="0.1" value={form.vatRate}
                                onChange={e => setForm(prev => ({ ...prev, vatRate: e.target.value }))}
                                className="w-full px-3 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                        </div>
                        <div className="flex items-end pb-1">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" checked={form.vatIncluded}
                                    onChange={e => setForm(prev => ({ ...prev, vatIncluded: e.target.checked }))}
                                    className="rounded border-slate-300" />
                                <span className="text-sm text-slate-700">С НДС</span>
                            </label>
                        </div>
                    </div>

                    {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{error}</p>}

                    <div className="flex gap-3 pt-2">
                        <Button variant="outline" className="flex-1" onClick={onClose}>Отмена</Button>
                        <Button className="flex-1" onClick={handleSubmit} disabled={submitting}>
                            {submitting ? 'Сохраняю...' : isEdit ? 'Сохранить' : 'Создать'}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

// ================================================================
// Main Page
// ================================================================
export default function AdminTariffsPage() {
    const [tariffs, setTariffs] = useState<Tariff[]>([]);
    const [loading, setLoading] = useState(true);
    const [modal, setModal] = useState<{ mode: 'create' | 'edit'; tariff: Tariff | null } | null>(null);
    const [toast, setToast] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            setLoading(true);
            const result = await api.get<{ success: boolean; data: Tariff[] }>('/auth/tariffs');
            if (result.success) setTariffs(result.data);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);
    useEffect(() => {
        if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }
    }, [toast]);

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                        <FileText className="w-6 h-6 text-indigo-600" />
                        Тарифы
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">{tariffs.length} тарифов</p>
                </div>
                <Button onClick={() => setModal({ mode: 'create', tariff: null })}>
                    <Plus className="w-4 h-4 mr-1.5" />
                    Добавить
                </Button>
            </div>

            {toast && (
                <div className="fixed top-4 right-4 z-50 px-5 py-3 rounded-xl shadow-lg bg-emerald-600 text-white text-sm font-medium">
                    {toast}
                </div>
            )}

            <Card>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-100 bg-slate-50">
                                <th className="text-left px-4 py-3 font-semibold text-slate-600">Тип</th>
                                <th className="text-left px-4 py-3 font-semibold text-slate-600">₽/км</th>
                                <th className="text-left px-4 py-3 font-semibold text-slate-600">₽/час</th>
                                <th className="text-left px-4 py-3 font-semibold text-slate-600">Фикс</th>
                                <th className="text-left px-4 py-3 font-semibold text-slate-600">Модификаторы</th>
                                <th className="text-left px-4 py-3 font-semibold text-slate-600">НДС</th>
                                <th className="text-left px-4 py-3 font-semibold text-slate-600 w-10"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={7} className="text-center py-16">
                                    <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto" />
                                </td></tr>
                            ) : tariffs.length === 0 ? (
                                <tr><td colSpan={7} className="text-center py-16 text-slate-400">Нет тарифов</td></tr>
                            ) : (
                                tariffs.map(t => (
                                    <tr key={t.id} className="border-b border-slate-50 hover:bg-slate-50">
                                        <td className="px-4 py-3">
                                            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
                                                {TYPE_LABELS[t.type] || t.type}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-slate-700">{t.ratePerKm ?? '—'}</td>
                                        <td className="px-4 py-3 text-slate-700">{t.ratePerHour ?? '—'}</td>
                                        <td className="px-4 py-3 text-slate-700">{t.fixedRate ?? '—'}</td>
                                        <td className="px-4 py-3 text-xs text-slate-500">
                                            Н: ×{t.nightCoefficient} | С: ×{t.urgentCoefficient} | В: ×{t.weekendCoefficient}
                                        </td>
                                        <td className="px-4 py-3 text-slate-700 text-xs">
                                            {t.vatIncluded ? `${t.vatRate}%` : 'Без НДС'}
                                        </td>
                                        <td className="px-4 py-3">
                                            <button
                                                onClick={() => setModal({ mode: 'edit', tariff: t })}
                                                className="p-1.5 rounded-lg hover:bg-indigo-50 text-slate-400 hover:text-indigo-600"
                                            >
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            {modal && (
                <TariffFormModal
                    tariff={modal.tariff}
                    onClose={() => setModal(null)}
                    onSuccess={() => {
                        setModal(null);
                        setToast(modal.mode === 'create' ? '✅ Тариф создан' : '✅ Тариф обновлён');
                        load();
                    }}
                />
            )}
        </div>
    );
}
