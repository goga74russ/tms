'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { api } from '@/lib/api';

interface AddVehicleModalProps {
    onClose: () => void;
    onCreated: () => void;
}

const BODY_TYPES = ['тент', 'борт', 'рефрижератор', 'фургон', 'цистерна', 'контейнеровоз', 'самосвал'];

export function AddVehicleModal({ onClose, onCreated }: AddVehicleModalProps) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [form, setForm] = useState({
        plateNumber: '',
        vin: '',
        make: '',
        model: '',
        year: new Date().getFullYear(),
        bodyType: 'тент',
        payloadCapacityKg: 5000,
        payloadVolumeM3: 20,
        fuelTankLiters: 120,
        fuelNormPer100Km: 18,
    });

    function updateField(field: string, value: any) {
        setForm(prev => ({ ...prev, [field]: value }));
        setError('');
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!form.plateNumber || !form.vin || !form.make || !form.model) {
            setError('Заполните обязательные поля');
            return;
        }
        if (form.vin.length !== 17) {
            setError('VIN должен содержать 17 символов');
            return;
        }

        setLoading(true);
        try {
            await api.post('/fleet/vehicles', form);
            onCreated();
        } catch (err: any) {
            setError(err?.message || 'Ошибка создания ТС');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-slate-200">
                    <h2 className="text-lg font-bold text-slate-900">Добавить ТС</h2>
                    <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 transition-colors">
                        <X className="w-5 h-5 text-slate-400" />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    {error && (
                        <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200">
                            {error}
                        </div>
                    )}

                    {/* Row 1: Госномер + VIN */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Госномер *</label>
                            <input
                                type="text"
                                placeholder="А123БВ77"
                                value={form.plateNumber}
                                onChange={e => updateField('plateNumber', e.target.value.toUpperCase())}
                                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono
                                    focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">VIN *</label>
                            <input
                                type="text"
                                placeholder="17 символов"
                                maxLength={17}
                                value={form.vin}
                                onChange={e => updateField('vin', e.target.value.toUpperCase())}
                                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono
                                    focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                            />
                        </div>
                    </div>

                    {/* Row 2: Марка + Модель + Год */}
                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Марка *</label>
                            <input
                                type="text"
                                placeholder="ГАЗ"
                                value={form.make}
                                onChange={e => updateField('make', e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm
                                    focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Модель *</label>
                            <input
                                type="text"
                                placeholder="ГАЗон NEXT"
                                value={form.model}
                                onChange={e => updateField('model', e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm
                                    focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Год</label>
                            <input
                                type="number"
                                min={2000}
                                max={2030}
                                value={form.year}
                                onChange={e => updateField('year', parseInt(e.target.value))}
                                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm
                                    focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                            />
                        </div>
                    </div>

                    {/* Row 3: Тип кузова */}
                    <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Тип кузова</label>
                        <select
                            value={form.bodyType}
                            onChange={e => updateField('bodyType', e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm
                                focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        >
                            {BODY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>

                    {/* Row 4: Грузоподъёмность + Объём */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Грузоподъёмность, кг</label>
                            <input
                                type="number"
                                min={0}
                                value={form.payloadCapacityKg}
                                onChange={e => updateField('payloadCapacityKg', parseInt(e.target.value))}
                                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm
                                    focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Объём, м³</label>
                            <input
                                type="number"
                                min={0}
                                value={form.payloadVolumeM3}
                                onChange={e => updateField('payloadVolumeM3', parseInt(e.target.value))}
                                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm
                                    focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                            />
                        </div>
                    </div>

                    {/* Row 5: Бак + Норма расхода */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Бак, литров</label>
                            <input
                                type="number"
                                min={0}
                                value={form.fuelTankLiters}
                                onChange={e => updateField('fuelTankLiters', parseInt(e.target.value))}
                                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm
                                    focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Расход, л/100км</label>
                            <input
                                type="number"
                                min={0}
                                step={0.1}
                                value={form.fuelNormPer100Km}
                                onChange={e => updateField('fuelNormPer100Km', parseFloat(e.target.value))}
                                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm
                                    focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                            />
                        </div>
                    </div>

                    {/* Submit */}
                    <div className="flex items-center justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                        >
                            Отмена
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg
                                hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                        >
                            {loading ? 'Создание...' : 'Создать ТС'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
