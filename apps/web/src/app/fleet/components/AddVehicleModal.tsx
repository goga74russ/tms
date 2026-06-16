'use client';

import { useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { getVehicleProfile, getVehicleWaybillCue, VEHICLE_BODY_OPTIONS } from './vehicleProfile';
import { Dialog } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { FormField } from '@/components/ui/form-field';
import { useToast } from '@/components/ui/toast';

export interface EditableVehicle {
    id: string;
    plateNumber: string;
    vin: string;
    make: string;
    model: string;
    year: number;
    bodyType: string;
    payloadCapacityKg: number;
    payloadVolumeM3?: number | null;
    fuelTankLiters?: number | null;
    fuelNormPer100Km?: number | null;
    adrEquipped?: boolean | null;
}

interface AddVehicleModalProps {
    onClose: () => void;
    onCreated: () => void;
    editingVehicle?: EditableVehicle | null;
}

const BASIC_ERROR_FIELDS = ['plateNumber', 'vin', 'make', 'model', 'year', 'bodyType', 'payloadCapacityKg'] as const;
const ADVANCED_ERROR_FIELDS = ['payloadVolumeM3', 'fuelTankLiters', 'fuelNormPer100Km'] as const;

export function AddVehicleModal({ onClose, onCreated, editingVehicle }: AddVehicleModalProps) {
    const { toast } = useToast();
    const isEdit = !!editingVehicle;
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [form, setForm] = useState({
        plateNumber: editingVehicle?.plateNumber ?? '',
        vin: editingVehicle?.vin ?? '',
        make: editingVehicle?.make ?? '',
        model: editingVehicle?.model ?? '',
        year: editingVehicle?.year ?? new Date().getFullYear(),
        bodyType: editingVehicle?.bodyType ?? 'тент',
        payloadCapacityKg: editingVehicle?.payloadCapacityKg ?? 5000,
        payloadVolumeM3: editingVehicle?.payloadVolumeM3 ?? 20,
        fuelTankLiters: editingVehicle?.fuelTankLiters ?? 120,
        fuelNormPer100Km: editingVehicle?.fuelNormPer100Km ?? 18,
        adrEquipped: editingVehicle?.adrEquipped ?? false,
    });
    const vehicleProfile = getVehicleProfile(form.bodyType, form.payloadCapacityKg);
    const waybillCue = getVehicleWaybillCue(form.bodyType, form.payloadCapacityKg);

    function updateField(field: string, value: any) {
        setForm(prev => ({ ...prev, [field]: value }));
        setError('');
        if (fieldErrors[field]) {
            setFieldErrors(prev => {
                const next = { ...prev };
                delete next[field];
                return next;
            });
        }
    }

    function validate() {
        const errs: Record<string, string> = {};
        if (!form.plateNumber) errs.plateNumber = 'Укажите госномер';
        if (!form.vin) {
            errs.vin = 'Укажите VIN';
        } else if (form.vin.length !== 17) {
            errs.vin = 'VIN должен содержать 17 символов';
        }
        if (!form.make) errs.make = 'Укажите марку';
        if (!form.model) errs.model = 'Укажите модель';
        setFieldErrors(errs);
        return errs;
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        const errs = validate();
        if (Object.keys(errs).length > 0) {
            setError('Заполните обязательные поля');
            return;
        }

        setLoading(true);
        try {
            if (isEdit && editingVehicle) {
                await api.put(`/fleet/vehicles/${editingVehicle.id}`, form);
                toast({ variant: 'success', title: 'ТС обновлено' });
            } else {
                await api.post('/fleet/vehicles', form);
                toast({ variant: 'success', title: 'Транспорт добавлен' });
            }
            onCreated();
        } catch (err: any) {
            setError(err?.message || (isEdit ? 'Ошибка обновления ТС' : 'Ошибка создания ТС'));
        } finally {
            setLoading(false);
        }
    }

    const basicErrorCount = useMemo(
        () => BASIC_ERROR_FIELDS.reduce((acc, key) => acc + (fieldErrors[key] ? 1 : 0), 0),
        [fieldErrors],
    );
    const advancedErrorCount = useMemo(
        () => ADVANCED_ERROR_FIELDS.reduce((acc, key) => acc + (fieldErrors[key] ? 1 : 0), 0),
        [fieldErrors],
    );

    const TabBadge = ({ count }: { count: number }) =>
        count > 0 ? (
            <span
                className="ml-1.5 inline-flex h-1.5 w-1.5 rounded-full bg-red-500"
                aria-label={`${count} ошибок на вкладке`}
            />
        ) : null;

    const inputClass = (field?: string) =>
        `w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 transition-colors ${
            field && fieldErrors[field]
                ? 'border-red-300 focus:ring-red-500/20 focus:border-red-500'
                : 'border-neutral-200 focus:ring-brand-500/20 focus:border-brand-500'
        }`;

    return (
        <Dialog open={true} onClose={onClose} title={isEdit ? 'Редактировать ТС' : 'Добавить ТС'} size="md">
            <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                    <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200">
                        {error}
                    </div>
                )}

                <Tabs defaultValue="basic" className="space-y-4">
                    <TabsList>
                        <TabsTrigger value="basic">
                            <span className="inline-flex items-center">
                                Основное
                                <TabBadge count={basicErrorCount} />
                            </span>
                        </TabsTrigger>
                        <TabsTrigger value="advanced">
                            <span className="inline-flex items-center">
                                Расширенное
                                <TabBadge count={advancedErrorCount} />
                            </span>
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="basic" className="space-y-4">
                        {/* Row 1: Госномер + VIN */}
                        <div className="grid grid-cols-2 gap-4">
                            <FormField
                                format="plate"
                                label="Госномер"
                                required
                                value={form.plateNumber}
                                onChange={e => updateField('plateNumber', e.target.value.toUpperCase())}
                                className="font-mono"
                                customError={fieldErrors.plateNumber}
                            />
                            <FormField
                                format="vin"
                                label="VIN"
                                required
                                maxLength={17}
                                value={form.vin}
                                onChange={e => updateField('vin', e.target.value.toUpperCase())}
                                className="font-mono"
                                customError={fieldErrors.vin}
                            />
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
                                    className={inputClass('make')}
                                />
                                {fieldErrors.make && <p className="text-xs text-red-500 mt-1">{fieldErrors.make}</p>}
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-neutral-600 mb-1">Модель *</label>
                                <input
                                    type="text"
                                    placeholder="ГАЗон NEXT"
                                    value={form.model}
                                    onChange={e => updateField('model', e.target.value)}
                                    className={inputClass('model')}
                                />
                                {fieldErrors.model && <p className="text-xs text-red-500 mt-1">{fieldErrors.model}</p>}
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-neutral-600 mb-1">Год</label>
                                <input
                                    type="number"
                                    min={2000}
                                    max={2030}
                                    value={form.year}
                                    onChange={e => updateField('year', parseInt(e.target.value))}
                                    className={inputClass('year')}
                                />
                            </div>
                        </div>

                        {/* Row 3: Тип кузова */}
                        <div>
                            <label className="block text-xs font-medium text-neutral-600 mb-1">Тип кузова</label>
                            <select
                                value={form.bodyType}
                                onChange={e => updateField('bodyType', e.target.value)}
                                className={inputClass('bodyType')}
                            >
                                {VEHICLE_BODY_OPTIONS.map(option => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                            </select>
                            <div className="mt-2 rounded-lg border border-brand-100 bg-brand-50/60 px-3 py-2">
                                <p className="text-xs font-medium text-brand-600">Вид для ПЛ</p>
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
                                        {waybillCue.tone === 'ready' ? 'готов' : waybillCue.tone === 'attention' ? 'проверить' : 'блок'}
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

                        {/* Row 4: Грузоподъёмность */}
                        <div>
                            <label className="block text-xs font-medium text-neutral-600 mb-1">Грузоподъёмность, кг</label>
                            <input
                                type="number"
                                min={0}
                                value={form.payloadCapacityKg}
                                onChange={e => updateField('payloadCapacityKg', parseInt(e.target.value))}
                                className={inputClass('payloadCapacityKg')}
                            />
                        </div>
                    </TabsContent>

                    <TabsContent value="advanced" className="space-y-4">
                        {/* Row 1: Объём кузова */}
                        <div>
                            <label className="block text-xs font-medium text-neutral-600 mb-1">Объём кузова, м³</label>
                            <input
                                type="number"
                                min={0}
                                value={form.payloadVolumeM3}
                                onChange={e => updateField('payloadVolumeM3', parseInt(e.target.value))}
                                className={inputClass('payloadVolumeM3')}
                            />
                        </div>

                        {/* Row 2: Бак + Норма расхода */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-neutral-600 mb-1">Объём топливного бака, л</label>
                                <input
                                    type="number"
                                    min={0}
                                    value={form.fuelTankLiters}
                                    onChange={e => updateField('fuelTankLiters', parseInt(e.target.value))}
                                    className={inputClass('fuelTankLiters')}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-neutral-600 mb-1">Норма расхода, л/100км</label>
                                <input
                                    type="number"
                                    min={0}
                                    step={0.1}
                                    value={form.fuelNormPer100Km}
                                    onChange={e => updateField('fuelNormPer100Km', parseFloat(e.target.value))}
                                    className={inputClass('fuelNormPer100Km')}
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
                    </TabsContent>
                </Tabs>

                {/* Submit — общий для обоих табов */}
                <div className="flex items-center justify-end gap-3 pt-2 border-t border-neutral-100">
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
                        className="px-5 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg
                            hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                    >
                        {loading ? (isEdit ? 'Сохранение...' : 'Создание...') : (isEdit ? 'Сохранить' : 'Создать ТС')}
                    </button>
                </div>
            </form>
        </Dialog>
    );
}
