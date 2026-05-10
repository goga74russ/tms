'use client';

import { useEffect, useState } from 'react';
import { X, Package, MapPin, Clock, User, Loader2, Thermometer, Layers, Truck, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';
import type { Order } from '../page';

interface CreateOrderModalProps {
    onClose: () => void;
    onCreate: (order: Order) => void;
}

interface ContractorAddress {
    id: string;
    addressString: string;
    lat: number;
    lon: number;
    type: 'loading' | 'unloading';
    contractorId: string | null;
    fiasId?: string | null;
}

type AddressKind = 'loading' | 'unloading';
type ConfirmationMode = 'none' | 'optional' | 'required';

const ADR_CLASSES = ['1', '2', '3', '4.1', '4.2', '4.3', '5.1', '5.2', '6.1', '6.2', '7', '8', '9'];
const ADR_UN_REGEX = /^UN\d{4}$/;

function sortContractorAddresses(addresses: ContractorAddress[]) {
    return [...addresses].sort((left, right) => {
        if (left.type !== right.type) {
            return left.type === 'loading' ? -1 : 1;
        }

        return left.addressString.localeCompare(right.addressString, 'ru');
    });
}

export function CreateOrderModal({ onClose, onCreate }: CreateOrderModalProps) {
    const [contractors, setContractors] = useState<any[]>([]);
    const [contractorAddresses, setContractorAddresses] = useState<ContractorAddress[]>([]);
    const [loadingAddressId, setLoadingAddressId] = useState('');
    const [unloadingAddressId, setUnloadingAddressId] = useState('');
    const [form, setForm] = useState({
        contractorId: '',
        cargoDescription: '',
        cargoWeightKg: '',
        cargoVolumeM3: '',
        cargoPlaces: '',
        multiTierAllowed: false,
        maxTiers: '1',
        coldChainRequired: false,
        temperatureMin: '',
        temperatureMax: '',
        loadingType: '',
        hydraulicLiftRequired: false,
        loadingAddress: '',
        loadingLat: '',
        loadingLon: '',
        loadingDate: '',
        unloadingAddress: '',
        unloadingLat: '',
        unloadingLon: '',
        unloadingDate: '',
        vehicleRequirements: '',
        notes: '',
        confirmationMode: 'none' as ConfirmationMode,
        adrEnabled: false,
        adrClass: '',
        adrUnNumber: '',
    });

    const [errors, setErrors] = useState<Record<string, string>>({});
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        api.get<any>('/fleet/contractors?limit=100').then((r) => setContractors(r.data || [])).catch(() => { });
    }, []);

    useEffect(() => {
        if (!form.contractorId) {
            setContractorAddresses([]);
            return;
        }

        let cancelled = false;

        api.get<any>(`/fleet/contractors/${form.contractorId}/addresses`)
            .then((r) => {
                if (cancelled) return;
                setContractorAddresses(sortContractorAddresses(Array.isArray(r.data) ? r.data : []));
            })
            .catch(() => {
                if (!cancelled) {
                    setContractorAddresses([]);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [form.contractorId]);

    const loadingAddresses = contractorAddresses.filter((address) => address.type === 'loading');
    const unloadingAddresses = contractorAddresses.filter((address) => address.type === 'unloading');

    const resetAddressSelection = (kind: AddressKind) => {
        if (kind === 'loading') {
            setLoadingAddressId('');
            setForm((current) => ({
                ...current,
                loadingLat: '',
                loadingLon: '',
            }));
            return;
        }

        setUnloadingAddressId('');
        setForm((current) => ({
            ...current,
            unloadingLat: '',
            unloadingLon: '',
        }));
    };

    const applyAddress = (kind: AddressKind, addressId: string) => {
        if (!addressId) {
            resetAddressSelection(kind);
            return;
        }

        const address = contractorAddresses.find((item) => item.id === addressId);

        if (kind === 'loading') {
            setLoadingAddressId(addressId);
            setForm((current) => ({
                ...current,
                loadingAddress: address?.addressString || '',
                loadingLat: address ? String(address.lat) : '',
                loadingLon: address ? String(address.lon) : '',
            }));
            return;
        }

        setUnloadingAddressId(addressId);
        setForm((current) => ({
            ...current,
            unloadingAddress: address?.addressString || '',
            unloadingLat: address ? String(address.lat) : '',
            unloadingLon: address ? String(address.lon) : '',
        }));
    };

    const validate = () => {
        const nextErrors: Record<string, string> = {};
        if (!form.contractorId) nextErrors.contractorId = 'Выберите контрагента';
        if (!form.cargoDescription) nextErrors.cargoDescription = 'Опишите груз';
        if (!form.cargoWeightKg || parseFloat(form.cargoWeightKg) <= 0) nextErrors.cargoWeightKg = 'Укажите вес';
        if (!form.loadingAddress) nextErrors.loadingAddress = 'Укажите адрес погрузки';
        if (!form.unloadingAddress) nextErrors.unloadingAddress = 'Укажите адрес выгрузки';
        if (form.coldChainRequired) {
            const min = parseFloat(form.temperatureMin);
            const max = parseFloat(form.temperatureMax);
            if (!form.temperatureMin || !Number.isFinite(min)) {
                nextErrors.temperatureMin = 'Укажите мин. температуру';
            } else if (min < -50 || min > 50) {
                nextErrors.temperatureMin = 'Допустимо от -50 до 50';
            }
            if (!form.temperatureMax || !Number.isFinite(max)) {
                nextErrors.temperatureMax = 'Укажите макс. температуру';
            } else if (max < -50 || max > 50) {
                nextErrors.temperatureMax = 'Допустимо от -50 до 50';
            }
            if (
                Number.isFinite(min) &&
                Number.isFinite(max) &&
                min > max
            ) {
                nextErrors.temperatureMin = 'Мин. > макс.';
            }
        } else if (
            form.temperatureMin &&
            form.temperatureMax &&
            parseFloat(form.temperatureMin) > parseFloat(form.temperatureMax)
        ) {
            nextErrors.temperatureMin = 'Мин. > макс.';
        }
        if (form.adrEnabled) {
            if (!form.adrClass) nextErrors.adrClass = 'Выберите класс ADR';
            if (!form.adrUnNumber) {
                nextErrors.adrUnNumber = 'Укажите UN-номер';
            } else if (!ADR_UN_REGEX.test(form.adrUnNumber)) {
                nextErrors.adrUnNumber = 'Формат: UN1234';
            }
        }
        setErrors(nextErrors);
        return Object.keys(nextErrors).length === 0;
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
                multiTierAllowed: form.multiTierAllowed,
                maxTiers: form.multiTierAllowed ? parseInt(form.maxTiers, 10) : 1,
                coldChainRequired: form.coldChainRequired,
                temperatureMinC: form.coldChainRequired && form.temperatureMin ? parseFloat(form.temperatureMin) : undefined,
                temperatureMaxC: form.coldChainRequired && form.temperatureMax ? parseFloat(form.temperatureMax) : undefined,
                // legacy field names — kept for backwards compatibility
                temperatureMin: form.coldChainRequired && form.temperatureMin ? parseFloat(form.temperatureMin) : undefined,
                temperatureMax: form.coldChainRequired && form.temperatureMax ? parseFloat(form.temperatureMax) : undefined,
                loadingType: form.loadingType || undefined,
                hydraulicLiftRequired: form.hydraulicLiftRequired,
                loadingAddress: form.loadingAddress,
                loadingLat: form.loadingLat ? parseFloat(form.loadingLat) : undefined,
                loadingLon: form.loadingLon ? parseFloat(form.loadingLon) : undefined,
                loadingDate: form.loadingDate ? new Date(form.loadingDate).toISOString() : undefined,
                unloadingAddress: form.unloadingAddress,
                unloadingLat: form.unloadingLat ? parseFloat(form.unloadingLat) : undefined,
                unloadingLon: form.unloadingLon ? parseFloat(form.unloadingLon) : undefined,
                unloadingDate: form.unloadingDate ? new Date(form.unloadingDate).toISOString() : undefined,
                vehicleRequirements: form.vehicleRequirements || undefined,
                notes: form.notes || undefined,
                confirmationMode: form.confirmationMode,
                adrClass: form.adrEnabled ? form.adrClass : undefined,
                adrUnNumber: form.adrEnabled ? form.adrUnNumber : undefined,
            };

            const result = await api.post<any>('/orders', payload);
            if (result.success && result.data) {
                onCreate(result.data);
                return;
            }

            throw new Error(result.error || 'Ошибка создания заявки');
        } catch (err) {
            console.error('Failed to create order:', err);
            setErrors({ _general: err instanceof Error ? err.message : 'Ошибка сервера' });
        } finally {
            setSubmitting(false);
        }
    };

    const fieldClass = (field?: string) =>
        `w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 transition-colors ${
            field && errors[field]
                ? 'border-red-300 focus:ring-red-500'
                : 'border-slate-200 focus:ring-indigo-500'
        }`;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto mx-4">
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
                    <div>
                        <label className="flex items-center gap-1.5 text-sm font-medium text-slate-700 mb-1.5">
                            <User className="w-4 h-4 text-slate-400" />
                            Контрагент
                        </label>
                        <select
                            value={form.contractorId}
                            onChange={(e) => {
                                const contractorId = e.target.value;
                                setContractorAddresses([]);
                                setForm((current) => ({
                                    ...current,
                                    contractorId,
                                    loadingAddress: '',
                                    loadingLat: '',
                                    loadingLon: '',
                                    unloadingAddress: '',
                                    unloadingLat: '',
                                    unloadingLon: '',
                                }));
                                setLoadingAddressId('');
                                setUnloadingAddressId('');
                            }}
                            className={fieldClass('contractorId')}
                        >
                            <option value="">Выберите контрагента</option>
                            {contractors.map((contractor) => (
                                <option key={contractor.id} value={contractor.id}>
                                    {contractor.name} (ИНН: {contractor.inn})
                                </option>
                            ))}
                        </select>
                        {errors.contractorId && <p className="text-xs text-red-500 mt-1">{errors.contractorId}</p>}
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                        <div className="col-span-2">
                            <label className="flex items-center gap-1.5 text-sm font-medium text-slate-700 mb-1.5">
                                <Package className="w-4 h-4 text-slate-400" />
                                Груз
                            </label>
                            <input
                                type="text"
                                value={form.cargoDescription}
                                onChange={(e) => setForm((current) => ({ ...current, cargoDescription: e.target.value }))}
                                className={fieldClass('cargoDescription')}
                                placeholder="Описание груза"
                            />
                            {errors.cargoDescription && <p className="text-xs text-red-500 mt-1">{errors.cargoDescription}</p>}
                        </div>
                        <div>
                            <label className="text-sm font-medium text-slate-700 mb-1.5 block">Вес (кг)</label>
                            <input
                                type="number"
                                value={form.cargoWeightKg}
                                onChange={(e) => setForm((current) => ({ ...current, cargoWeightKg: e.target.value }))}
                                className={fieldClass('cargoWeightKg')}
                                placeholder="0"
                                min="0"
                            />
                            {errors.cargoWeightKg && <p className="text-xs text-red-500 mt-1">{errors.cargoWeightKg}</p>}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-sm font-medium text-slate-700 mb-1.5 block">Объем (м3)</label>
                            <input
                                type="number"
                                value={form.cargoVolumeM3}
                                onChange={(e) => setForm((current) => ({ ...current, cargoVolumeM3: e.target.value }))}
                                className={fieldClass()}
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
                                onChange={(e) => setForm((current) => ({ ...current, cargoPlaces: e.target.value }))}
                                className={fieldClass()}
                                placeholder="0"
                                min="0"
                            />
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={form.multiTierAllowed}
                                onChange={(e) => setForm((current) => ({ ...current, multiTierAllowed: e.target.checked }))}
                                className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <Layers className="w-4 h-4 text-slate-400" />
                            Разрешить негабаритную загрузку
                        </label>
                        {form.multiTierAllowed && (
                            <select
                                value={form.maxTiers}
                                onChange={(e) => setForm((current) => ({ ...current, maxTiers: e.target.value }))}
                                className="px-2 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                                <option value="2">2 яруса</option>
                                <option value="3">3 яруса</option>
                            </select>
                        )}
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
                        <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={form.coldChainRequired}
                                onChange={(e) => setForm((current) => ({
                                    ...current,
                                    coldChainRequired: e.target.checked,
                                    temperatureMin: e.target.checked ? current.temperatureMin : '',
                                    temperatureMax: e.target.checked ? current.temperatureMax : '',
                                }))}
                                className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <Thermometer className="w-4 h-4 text-blue-500" />
                            Требуется температурный контроль
                        </label>
                        {form.coldChainRequired && (
                            <div className="mt-3">
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs text-slate-500 mb-1 block">Мин. °C <span className="text-red-500">*</span></label>
                                        <input
                                            type="number"
                                            min={-50}
                                            max={50}
                                            step="0.1"
                                            value={form.temperatureMin}
                                            onChange={(e) => setForm((current) => ({ ...current, temperatureMin: e.target.value }))}
                                            className={fieldClass('temperatureMin')}
                                            placeholder="например, 2"
                                        />
                                        {errors.temperatureMin && <p className="text-xs text-red-500 mt-1">{errors.temperatureMin}</p>}
                                    </div>
                                    <div>
                                        <label className="text-xs text-slate-500 mb-1 block">Макс. °C <span className="text-red-500">*</span></label>
                                        <input
                                            type="number"
                                            min={-50}
                                            max={50}
                                            step="0.1"
                                            value={form.temperatureMax}
                                            onChange={(e) => setForm((current) => ({ ...current, temperatureMax: e.target.value }))}
                                            className={fieldClass('temperatureMax')}
                                            placeholder="например, 8"
                                        />
                                        {errors.temperatureMax && <p className="text-xs text-red-500 mt-1">{errors.temperatureMax}</p>}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
                        <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={form.adrEnabled}
                                onChange={(e) => setForm((current) => ({
                                    ...current,
                                    adrEnabled: e.target.checked,
                                    adrClass: e.target.checked ? current.adrClass : '',
                                    adrUnNumber: e.target.checked ? current.adrUnNumber : '',
                                }))}
                                className="w-4 h-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
                            />
                            <AlertTriangle className="w-4 h-4 text-red-500" />
                            Опасный груз (ADR)
                        </label>
                        {form.adrEnabled && (
                            <div className="mt-3 grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs text-slate-500 mb-1 block">Класс ADR <span className="text-red-500">*</span></label>
                                    <select
                                        value={form.adrClass}
                                        onChange={(e) => setForm((current) => ({ ...current, adrClass: e.target.value }))}
                                        className={fieldClass('adrClass')}
                                    >
                                        <option value="">Выберите класс</option>
                                        {ADR_CLASSES.map((cls) => (
                                            <option key={cls} value={cls}>Класс {cls}</option>
                                        ))}
                                    </select>
                                    {errors.adrClass && <p className="text-xs text-red-500 mt-1">{errors.adrClass}</p>}
                                </div>
                                <div>
                                    <label className="text-xs text-slate-500 mb-1 block">UN-номер <span className="text-red-500">*</span></label>
                                    <input
                                        type="text"
                                        value={form.adrUnNumber}
                                        onChange={(e) => setForm((current) => ({ ...current, adrUnNumber: e.target.value.toUpperCase() }))}
                                        className={fieldClass('adrUnNumber')}
                                        placeholder="UN1234"
                                        maxLength={6}
                                    />
                                    {errors.adrUnNumber && <p className="text-xs text-red-500 mt-1">{errors.adrUnNumber}</p>}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="flex items-center gap-1.5 text-sm font-medium text-slate-700 mb-1.5">
                                <Truck className="w-4 h-4 text-slate-400" />
                                Тип загрузки
                            </label>
                            <select
                                value={form.loadingType}
                                onChange={(e) => setForm((current) => ({ ...current, loadingType: e.target.value }))}
                                className={fieldClass()}
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
                                    onChange={(e) => setForm((current) => ({ ...current, hydraulicLiftRequired: e.target.checked }))}
                                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                />
                                Нужен гидроборт
                            </label>
                        </div>
                    </div>

                    <div>
                        <label className="flex items-center gap-1.5 text-sm font-medium text-slate-700 mb-1.5">
                            <MapPin className="w-4 h-4 text-green-500" />
                            Погрузка
                        </label>
                        <div className="mb-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2 block">
                                Частые адреса погрузки
                            </label>
                            <select
                                value={loadingAddressId}
                                onChange={(e) => applyAddress('loading', e.target.value)}
                                className={fieldClass()}
                                disabled={!form.contractorId}
                            >
                                <option value="">Выберите частый адрес</option>
                                {loadingAddresses.length === 0 ? (
                                    <option value="" disabled>Нет сохраненных адресов погрузки</option>
                                ) : (
                                    loadingAddresses.map((address) => (
                                        <option key={address.id} value={address.id}>
                                            {address.addressString}
                                        </option>
                                    ))
                                )}
                            </select>
                            <p className="mt-2 text-xs text-slate-400">Можно выбрать частый адрес или ввести вручную ниже.</p>
                        </div>
                        <input
                            type="text"
                            value={form.loadingAddress}
                            onChange={(e) => {
                                resetAddressSelection('loading');
                                setForm((current) => ({ ...current, loadingAddress: e.target.value }));
                            }}
                            className={fieldClass('loadingAddress')}
                            placeholder="Адрес погрузки"
                        />
                        {errors.loadingAddress && <p className="text-xs text-red-500 mt-1">{errors.loadingAddress}</p>}
                        <div className="mt-2">
                            <label className="text-xs text-slate-500 mb-1 block">
                                <Clock className="w-3 h-3 inline mr-1" />
                                Дата погрузки
                            </label>
                            <input
                                type="date"
                                value={form.loadingDate}
                                onChange={(e) => setForm((current) => ({ ...current, loadingDate: e.target.value }))}
                                className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="flex items-center gap-1.5 text-sm font-medium text-slate-700 mb-1.5">
                            <MapPin className="w-4 h-4 text-red-500" />
                            Выгрузка
                        </label>
                        <div className="mb-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2 block">
                                Частые адреса выгрузки
                            </label>
                            <select
                                value={unloadingAddressId}
                                onChange={(e) => applyAddress('unloading', e.target.value)}
                                className={fieldClass()}
                                disabled={!form.contractorId}
                            >
                                <option value="">Выберите частый адрес</option>
                                {unloadingAddresses.length === 0 ? (
                                    <option value="" disabled>Нет сохраненных адресов выгрузки</option>
                                ) : (
                                    unloadingAddresses.map((address) => (
                                        <option key={address.id} value={address.id}>
                                            {address.addressString}
                                        </option>
                                    ))
                                )}
                            </select>
                            <p className="mt-2 text-xs text-slate-400">Можно выбрать частый адрес или ввести вручную ниже.</p>
                        </div>
                        <input
                            type="text"
                            value={form.unloadingAddress}
                            onChange={(e) => {
                                resetAddressSelection('unloading');
                                setForm((current) => ({ ...current, unloadingAddress: e.target.value }));
                            }}
                            className={fieldClass('unloadingAddress')}
                            placeholder="Адрес выгрузки"
                        />
                        {errors.unloadingAddress && <p className="text-xs text-red-500 mt-1">{errors.unloadingAddress}</p>}
                        <div className="mt-2">
                            <label className="text-xs text-slate-500 mb-1 block">
                                <Clock className="w-3 h-3 inline mr-1" />
                                Дата выгрузки
                            </label>
                            <input
                                type="date"
                                value={form.unloadingDate}
                                onChange={(e) => setForm((current) => ({ ...current, unloadingDate: e.target.value }))}
                                className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="text-sm font-medium text-slate-700 mb-1.5 block">Требования к транспорту</label>
                        <textarea
                            value={form.vehicleRequirements}
                            onChange={(e) => setForm((current) => ({ ...current, vehicleRequirements: e.target.value }))}
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                            rows={2}
                            placeholder="Например: рефрижератор, гидроборт, грузоподъемность..."
                        />
                    </div>

                    <div>
                        <label className="text-sm font-medium text-slate-700 mb-1.5 block">Подтверждение доставки</label>
                        <select
                            value={form.confirmationMode}
                            onChange={(e) => setForm((current) => ({ ...current, confirmationMode: e.target.value as ConfirmationMode }))}
                            className={fieldClass()}
                        >
                            <option value="none">Не требуется</option>
                            <option value="optional">Желательно</option>
                            <option value="required">Обязательно</option>
                        </select>
                    </div>

                    <div>
                        <label className="text-sm font-medium text-slate-700 mb-1.5 block">Примечание</label>
                        <textarea
                            value={form.notes}
                            onChange={(e) => setForm((current) => ({ ...current, notes: e.target.value }))}
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                            rows={3}
                            placeholder="Дополнительная информация..."
                        />
                    </div>
                </div>

                {errors._general && (
                    <div className="mx-6 mb-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                        {errors._general}
                    </div>
                )}

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
