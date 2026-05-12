'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { api } from '@/lib/api';
import { getVehicleProfile, getVehicleWaybillCue, VEHICLE_BODY_OPTIONS } from './vehicleProfile';

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
        adrEquipped: false,
    });
    const vehicleProfile = getVehicleProfile(form.bodyType, form.payloadCapacityKg);
    const waybillCue = getVehicleWaybillCue(form.bodyType, form.payloadCapacityKg);

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
                <div className="flex items-center justify-between p-5 border-b border-neutral-200">
                    <h2 className="text-lg font-bold text-neutral-900">Добавить ТС</h2>
                    <button onClick={onClose} className="p-1 rounded-lg hover:bg-neutral-100 transition-colors">
                        <X className="w-5 h-5 text-neutral-400" />
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
                            <label className="block text-xs font-medium text-neutral-600 mb-1">Госномер *</label>
                            <input
                                type="text"
                                placeholder="А123БВ77"
                                value={form.plateNumber}
                                onChange={e => updateField('plateNumber', e.target.value.toUpperCase())}
                                className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm font-mono
                                    focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-neutral-600 mb-1">VIN *</label>
                            <input
                                type="text"
                                placeholder="17 символов"
                                maxLength={17}
                                value={form.vin}
                                onChange={e => updateField('vin', e.target.value.toUpperCase())}
                                className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm font-mono
                                    focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                            />
                        </div>
                    </div>

                    {/* Row 2: Марка + Модель + Год */}
                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-neutral-600 mb-1">Марка *</label>
                            <input
                                type="text"
                                placeholder="ГАЗ"
                                value={form.make}
                                onChange={e => updateField('make', e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm
                                    focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-neutral-600 mb-1">Модель *</label>
                            <input
                                type="text"
                                placeholder="ГАЗон NEXT"
                                value={form.model}
                                onChange={e => updateField('model', e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm
                                    focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-neutral-600 mb-1">Год</label>
                            <input
                                type="number"
                                min={2000}
                                max={2030}
                                value={form.year}
                                onChange={e => updateField('year', parseInt(e.target.value))}
                                className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm
                                    focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                            />
                        </div>
                    </div>

                    {/* Row 3: Тип кузова */}
                    <div>
                        <label className="block text-xs font-medium text-neutral-600 mb-1">Тип кузова</label>
                        <select
                            value={form.bodyType}
                            onChange={e => updateField('bodyType', e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm
                                focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        >
                            {VEHICLE_BODY_OPTIONS.map(option => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                        <div className="mt-2 rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2">
                            <p className="text-xs font-medium text-indigo-600">Вид для ПЛ</p>
                            <p className="text-sm font-semibold text-neutral-800">{vehicleProfile.displayLabel}</p>
                            <p className="mt-1 text-[11px] text-neutral-500">{waybillCue.profileLabel}</p>
                        </div>
                        <div className={`mt-3 rounded-xl border px-3 py-3 ${
                            waybillCue.tone === 'warning'
                                ? 'border-rose-200 bg-rose-50/80'
                                : waybillCue.tone === 'attention'
                                    ? 'border-amber-200 bg-amber-50/80'
                                    : 'border-emerald-100 bg-emerald-50/80'
                        }`}>
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className={`text-xs font-semibold uppercase tracking-wide ${
                                        waybillCue.tone === 'warning'
                                            ? 'text-rose-600'
                                            : waybillCue.tone === 'attention'
                                                ? 'text-amber-600'
                                                : 'text-emerald-600'
                                    }`}>
                                        Готовность ПЛ
                                    </p>
                                    <p className="text-sm font-semibold text-neutral-900">{waybillCue.title}</p>
                                </div>
                                <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-neutral-600 shadow-sm">
                                    {waybillCue.tone === 'ready' ? 'ready' : waybillCue.tone === 'attention' ? 'check' : 'block'}
                                </span>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2">
                                <span className="inline-flex rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-neutral-700 shadow-sm">
                                    {waybillCue.modeLabel}
                                </span>
                                <span className="inline-flex rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-neutral-700 shadow-sm">
                                    {waybillCue.profileLabel}
                                </span>
                            </div>
                            <p className="mt-2 text-xs leading-5 text-neutral-600">{waybillCue.description}</p>
                            <div className="mt-3 flex flex-wrap gap-2">
                                {waybillCue.markers.map((marker) => (
                                    <span
                                        key={marker}
                                        className="inline-flex rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-neutral-600 shadow-sm"
                                    >
                                        {marker}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Row 4: Грузоподъёмность + Объём */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-neutral-600 mb-1">Грузоподъёмность, кг</label>
                            <input
                                type="number"
                                min={0}
                                value={form.payloadCapacityKg}
                                onChange={e => updateField('payloadCapacityKg', parseInt(e.target.value))}
                                className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm
                                    focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-neutral-600 mb-1">Объём, м³</label>
                            <input
                                type="number"
                                min={0}
                                value={form.payloadVolumeM3}
                                onChange={e => updateField('payloadVolumeM3', parseInt(e.target.value))}
                                className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm
                                    focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                            />
                        </div>
                    </div>

                    {/* Row 5: Бак + Норма расхода */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-neutral-600 mb-1">Бак, литров</label>
                            <input
                                type="number"
                                min={0}
                                value={form.fuelTankLiters}
                                onChange={e => updateField('fuelTankLiters', parseInt(e.target.value))}
                                className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm
                                    focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-neutral-600 mb-1">Расход, л/100км</label>
                            <input
                                type="number"
                                min={0}
                                step={0.1}
                                value={form.fuelNormPer100Km}
                                onChange={e => updateField('fuelNormPer100Km', parseFloat(e.target.value))}
                                className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm
                                    focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                            />
                        </div>
                    </div>

                    {/* ADR */}
                    <div className="rounded-xl border border-neutral-200 bg-neutral-50/60 px-3 py-3">
                        <label className="flex items-center gap-2 text-sm font-medium text-neutral-700 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={form.adrEquipped}
                                onChange={e => updateField('adrEquipped', e.target.checked)}
                                className="w-4 h-4 rounded border-neutral-300 text-red-600 focus:ring-red-500"
                            />
                            Оборудовано для ADR
                        </label>
                        <p className="mt-1 text-xs text-neutral-500">ТС соответствует требованиям перевозки опасных грузов.</p>
                    </div>

                    {/* Submit */}
                    <div className="flex items-center justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors"
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
