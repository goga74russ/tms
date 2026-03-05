'use client';

import { useState, useEffect } from 'react';
import { X, Package, MapPin, Clock, User, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import type { Order } from '../page';

interface CreateOrderModalProps {
    onClose: () => void;
    onCreate: (order: Order) => void;
}

export function CreateOrderModal({ onClose, onCreate }: CreateOrderModalProps) {
    const [contractors, setContractors] = useState<any[]>([]);
    const [form, setForm] = useState({
        contractorId: '',
        cargoDescription: '',
        cargoWeightKg: '',
        loadingAddress: '',
        unloadingAddress: '',
        loadingWindowStart: '',
        loadingWindowEnd: '',
        unloadingWindowStart: '',
        unloadingWindowEnd: '',
        vehicleRequirements: '',
        notes: '',
    });

    useEffect(() => {
        api.get<any>('/fleet/contractors?limit=100').then(r => setContractors(r.data || [])).catch(() => { });
    }, []);

    const [errors, setErrors] = useState<Record<string, string>>({});
    const [submitting, setSubmitting] = useState(false);

    const validate = () => {
        const e: Record<string, string> = {};
        if (!form.contractorId) e.contractorId = 'Выберите контрагента';
        if (!form.cargoDescription) e.cargoDescription = 'Опишите груз';
        if (!form.cargoWeightKg || parseFloat(form.cargoWeightKg) <= 0) e.cargoWeightKg = 'Укажите вес';
        if (!form.loadingAddress) e.loadingAddress = 'Укажите адрес погрузки';
        if (!form.unloadingAddress) e.unloadingAddress = 'Укажите адрес выгрузки';
        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const handleSubmit = async () => {
        if (!validate()) return;
        setSubmitting(true);

        try {
            const now = new Date().toISOString();
            const payload = {
                contractorId: form.contractorId,
                cargoDescription: form.cargoDescription,
                cargoWeightKg: parseFloat(form.cargoWeightKg),
                loadingAddress: form.loadingAddress,
                unloadingAddress: form.unloadingAddress,
                loadingWindowStart: form.loadingWindowStart || undefined,
                loadingWindowEnd: form.loadingWindowEnd || undefined,
                unloadingWindowStart: form.unloadingWindowStart || undefined,
                unloadingWindowEnd: form.unloadingWindowEnd || undefined,
                notes: form.notes || undefined,
            };

            const result = await api.post<any>('/orders', payload);
            if (result.success && result.data) {
                onCreate(result.data);
            } else {
                throw new Error(result.error || 'Ошибка создания заявки');
            }
        } catch (err) {
            console.error('Failed to create order:', err);
            setErrors({ _general: err instanceof Error ? err.message : 'Ошибка сервера' });
        } finally {
            setSubmitting(false);
        }
    };

    const inputClass = (field: string) =>
        `w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 transition-colors ${errors[field]
            ? 'border-red-300 focus:ring-red-500'
            : 'border-slate-200 focus:ring-indigo-500'
        }`;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto mx-4">
                {/* Header */}
                <div className="sticky top-0 bg-white px-6 py-4 border-b border-slate-100 flex items-center justify-between rounded-t-2xl">
                    <h2 className="text-lg font-bold text-slate-900">Новая заявка</h2>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="px-6 py-5 space-y-5">
                    {/* Client */}
                    <div>
                        <label className="flex items-center gap-1.5 text-sm font-medium text-slate-700 mb-1.5">
                            <User className="w-4 h-4 text-slate-400" />
                            Контрагент
                        </label>
                        <select
                            value={form.contractorId}
                            onChange={(e) => setForm(f => ({ ...f, contractorId: e.target.value }))}
                            className={inputClass('contractorId')}
                        >
                            <option value="">Выберите контрагента</option>
                            {contractors.map(c => (
                                <option key={c.id} value={c.id}>{c.name} (ИНН: {c.inn})</option>
                            ))}
                        </select>
                        {errors.contractorId && (
                            <p className="text-xs text-red-500 mt-1">{errors.contractorId}</p>
                        )}
                    </div>

                    {/* Cargo */}
                    <div className="grid grid-cols-3 gap-3">
                        <div className="col-span-2">
                            <label className="flex items-center gap-1.5 text-sm font-medium text-slate-700 mb-1.5">
                                <Package className="w-4 h-4 text-slate-400" />
                                Груз
                            </label>
                            <input
                                type="text"
                                value={form.cargoDescription}
                                onChange={(e) => setForm(f => ({ ...f, cargoDescription: e.target.value }))}
                                className={inputClass('cargoDescription')}
                                placeholder="Описание груза"
                            />
                            {errors.cargoDescription && (
                                <p className="text-xs text-red-500 mt-1">{errors.cargoDescription}</p>
                            )}
                        </div>
                        <div>
                            <label className="text-sm font-medium text-slate-700 mb-1.5 block">
                                Вес (кг)
                            </label>
                            <input
                                type="number"
                                value={form.cargoWeightKg}
                                onChange={(e) => setForm(f => ({ ...f, cargoWeightKg: e.target.value }))}
                                className={inputClass('cargoWeightKg')}
                                placeholder="0"
                                min="0"
                            />
                            {errors.cargoWeightKg && (
                                <p className="text-xs text-red-500 mt-1">{errors.cargoWeightKg}</p>
                            )}
                        </div>
                    </div>

                    {/* Loading */}
                    <div>
                        <label className="flex items-center gap-1.5 text-sm font-medium text-slate-700 mb-1.5">
                            <MapPin className="w-4 h-4 text-green-500" />
                            Адрес погрузки
                        </label>
                        <input
                            type="text"
                            value={form.loadingAddress}
                            onChange={(e) => setForm(f => ({ ...f, loadingAddress: e.target.value }))}
                            className={inputClass('loadingAddress')}
                            placeholder="Город, улица, строение"
                        />
                        {errors.loadingAddress && (
                            <p className="text-xs text-red-500 mt-1">{errors.loadingAddress}</p>
                        )}
                        <div className="grid grid-cols-2 gap-2 mt-2">
                            <div>
                                <label className="text-xs text-slate-500 mb-1 block">Окно: от</label>
                                <input
                                    type="datetime-local"
                                    value={form.loadingWindowStart}
                                    onChange={(e) => setForm(f => ({ ...f, loadingWindowStart: e.target.value }))}
                                    className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-slate-500 mb-1 block">Окно: до</label>
                                <input
                                    type="datetime-local"
                                    value={form.loadingWindowEnd}
                                    onChange={(e) => setForm(f => ({ ...f, loadingWindowEnd: e.target.value }))}
                                    className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Unloading */}
                    <div>
                        <label className="flex items-center gap-1.5 text-sm font-medium text-slate-700 mb-1.5">
                            <MapPin className="w-4 h-4 text-red-500" />
                            Адрес выгрузки
                        </label>
                        <input
                            type="text"
                            value={form.unloadingAddress}
                            onChange={(e) => setForm(f => ({ ...f, unloadingAddress: e.target.value }))}
                            className={inputClass('unloadingAddress')}
                            placeholder="Город, улица, строение"
                        />
                        {errors.unloadingAddress && (
                            <p className="text-xs text-red-500 mt-1">{errors.unloadingAddress}</p>
                        )}
                        <div className="grid grid-cols-2 gap-2 mt-2">
                            <div>
                                <label className="text-xs text-slate-500 mb-1 block">Окно: от</label>
                                <input
                                    type="datetime-local"
                                    value={form.unloadingWindowStart}
                                    onChange={(e) => setForm(f => ({ ...f, unloadingWindowStart: e.target.value }))}
                                    className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-slate-500 mb-1 block">Окно: до</label>
                                <input
                                    type="datetime-local"
                                    value={form.unloadingWindowEnd}
                                    onChange={(e) => setForm(f => ({ ...f, unloadingWindowEnd: e.target.value }))}
                                    className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Notes */}
                    <div>
                        <label className="text-sm font-medium text-slate-700 mb-1.5 block">
                            Примечания
                        </label>
                        <textarea
                            value={form.notes}
                            onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                            rows={2}
                            placeholder="Дополнительная информация..."
                        />
                    </div>
                </div>

                {/* Error banner */}
                {errors._general && (
                    <div className="mx-6 mb-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                        {errors._general}
                    </div>
                )}

                {/* Footer */}
                <div className="sticky bottom-0 bg-white px-6 py-4 border-t border-slate-100 flex gap-3 justify-end rounded-b-2xl">
                    <button
                        onClick={onClose}
                        disabled={submitting}
                        className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50"
                    >
                        Отмена
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={submitting}
                        className="px-5 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/25 hover:shadow-xl transition-all disabled:opacity-50 flex items-center gap-2"
                    >
                        {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                        {submitting ? 'Создание...' : 'Создать заявку'}
                    </button>
                </div>
            </div>
        </div>
    );
}
