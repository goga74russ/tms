'use client';

import { useState, useEffect } from 'react';
import { X, Package, MapPin, Clock, User, Loader2, Thermometer, Layers, Truck } from 'lucide-react';
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
        cargoVolumeM3: '',
        cargoPlaces: '',
        // Sprint 9: ярусность
        multiTierAllowed: false,
        maxTiers: '1',
        // Sprint 9: температурный режим
        temperatureMin: '',
        temperatureMax: '',
        // Sprint 9: тип загрузки
        loadingType: '',
        hydraulicLiftRequired: false,
        // Адреса
        loadingAddress: '',
        loadingDate: '',
        unloadingAddress: '',
        unloadingDate: '',
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
        if (form.temperatureMin && form.temperatureMax && parseFloat(form.temperatureMin) > parseFloat(form.temperatureMax)) {
            e.temperatureMin = 'Мин. > Макс.';
        }
        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const handleSubmit = async () => {
        if (!validate()) return;
        setSubmitting(true);

        try {
            const payload = {
                contractorId: form.contractorId,
                cargoDescription: form.cargoDescription,
                cargoWeightKg: parseFloat(form.cargoWeightKg),
                cargoVolumeM3: form.cargoVolumeM3 ? parseFloat(form.cargoVolumeM3) : undefined,
                cargoPlaces: form.cargoPlaces ? parseInt(form.cargoPlaces, 10) : undefined,
                // Sprint 9
                multiTierAllowed: form.multiTierAllowed,
                maxTiers: form.multiTierAllowed ? parseInt(form.maxTiers, 10) : 1,
                temperatureMin: form.temperatureMin ? parseFloat(form.temperatureMin) : undefined,
                temperatureMax: form.temperatureMax ? parseFloat(form.temperatureMax) : undefined,
                loadingType: form.loadingType || undefined,
                hydraulicLiftRequired: form.hydraulicLiftRequired,
                // Addresses
                loadingAddress: form.loadingAddress,
                loadingDate: form.loadingDate ? new Date(form.loadingDate).toISOString() : undefined,
                unloadingAddress: form.unloadingAddress,
                unloadingDate: form.unloadingDate ? new Date(form.unloadingDate).toISOString() : undefined,
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
                    <div className="space-y-3">
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

                        {/* Volume + Places */}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-sm font-medium text-slate-700 mb-1.5 block">Объём (м³)</label>
                                <input
                                    type="number"
                                    value={form.cargoVolumeM3}
                                    onChange={(e) => setForm(f => ({ ...f, cargoVolumeM3: e.target.value }))}
                                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    placeholder="0"
                                    min="0"
                                    step="0.1"
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium text-slate-700 mb-1.5 block">Кол-во мест</label>
                                <input
                                    type="number"
                                    value={form.cargoPlaces}
                                    onChange={(e) => setForm(f => ({ ...f, cargoPlaces: e.target.value }))}
                                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    placeholder="0"
                                    min="0"
                                />
                            </div>
                        </div>

                        {/* Multi-tier */}
                        <div className="flex items-center gap-4">
                            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={form.multiTierAllowed}
                                    onChange={(e) => setForm(f => ({ ...f, multiTierAllowed: e.target.checked }))}
                                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                />
                                <Layers className="w-4 h-4 text-slate-400" />
                                Разрешить ярусную загрузку
                            </label>
                            {form.multiTierAllowed && (
                                <select
                                    value={form.maxTiers}
                                    onChange={(e) => setForm(f => ({ ...f, maxTiers: e.target.value }))}
                                    className="px-2 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                >
                                    <option value="2">2 яруса</option>
                                    <option value="3">3 яруса</option>
                                </select>
                            )}
                        </div>
                    </div>

                    {/* Temperature regime */}
                    <div>
                        <label className="flex items-center gap-1.5 text-sm font-medium text-slate-700 mb-1.5">
                            <Thermometer className="w-4 h-4 text-blue-500" />
                            Температурный режим (°C)
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <input
                                    type="number"
                                    value={form.temperatureMin}
                                    onChange={(e) => setForm(f => ({ ...f, temperatureMin: e.target.value }))}
                                    className={inputClass('temperatureMin')}
                                    placeholder="Мин, напр. -18"
                                />
                                {errors.temperatureMin && (
                                    <p className="text-xs text-red-500 mt-1">{errors.temperatureMin}</p>
                                )}
                            </div>
                            <div>
                                <input
                                    type="number"
                                    value={form.temperatureMax}
                                    onChange={(e) => setForm(f => ({ ...f, temperatureMax: e.target.value }))}
                                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    placeholder="Макс, напр. -15"
                                />
                            </div>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">Оставьте пустым, если не требуется</p>
                    </div>

                    {/* Loading type + hydraulic lift */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="flex items-center gap-1.5 text-sm font-medium text-slate-700 mb-1.5">
                                <Truck className="w-4 h-4 text-slate-400" />
                                Тип загрузки
                            </label>
                            <select
                                value={form.loadingType}
                                onChange={(e) => setForm(f => ({ ...f, loadingType: e.target.value }))}
                                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                                <option value="">Любой</option>
                                <option value="rear">Задняя</option>
                                <option value="side">Боковая</option>
                                <option value="top">Верхняя</option>
                            </select>
                        </div>
                        <div className="flex items-end pb-1">
                            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={form.hydraulicLiftRequired}
                                    onChange={(e) => setForm(f => ({ ...f, hydraulicLiftRequired: e.target.checked }))}
                                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                />
                                Нужен гидроборт
                            </label>
                        </div>
                    </div>

                    {/* Loading */}
                    <div>
                        <label className="flex items-center gap-1.5 text-sm font-medium text-slate-700 mb-1.5">
                            <MapPin className="w-4 h-4 text-green-500" />
                            Погрузка
                        </label>
                        <input
                            type="text"
                            value={form.loadingAddress}
                            onChange={(e) => setForm(f => ({ ...f, loadingAddress: e.target.value }))}
                            className={inputClass('loadingAddress')}
                            placeholder="Адрес погрузки"
                        />
                        {errors.loadingAddress && (
                            <p className="text-xs text-red-500 mt-1">{errors.loadingAddress}</p>
                        )}
                        <div className="mt-2">
                            <label className="text-xs text-slate-500 mb-1 block">
                                <Clock className="w-3 h-3 inline mr-1" />
                                Дата погрузки
                            </label>
                            <input
                                type="date"
                                value={form.loadingDate}
                                onChange={(e) => setForm(f => ({ ...f, loadingDate: e.target.value }))}
                                className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                    </div>

                    {/* Unloading */}
                    <div>
                        <label className="flex items-center gap-1.5 text-sm font-medium text-slate-700 mb-1.5">
                            <MapPin className="w-4 h-4 text-red-500" />
                            Выгрузка
                        </label>
                        <input
                            type="text"
                            value={form.unloadingAddress}
                            onChange={(e) => setForm(f => ({ ...f, unloadingAddress: e.target.value }))}
                            className={inputClass('unloadingAddress')}
                            placeholder="Адрес выгрузки"
                        />
                        {errors.unloadingAddress && (
                            <p className="text-xs text-red-500 mt-1">{errors.unloadingAddress}</p>
                        )}
                        <div className="mt-2">
                            <label className="text-xs text-slate-500 mb-1 block">
                                <Clock className="w-3 h-3 inline mr-1" />
                                Дата выгрузки
                            </label>
                            <input
                                type="date"
                                value={form.unloadingDate}
                                onChange={(e) => setForm(f => ({ ...f, unloadingDate: e.target.value }))}
                                className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
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
