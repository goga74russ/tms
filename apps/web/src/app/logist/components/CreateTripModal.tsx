'use client';

import { useState, useEffect } from 'react';
import { Truck, User, Package, Loader2, AlertTriangle, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { api } from '@/lib/api';

interface AvailableVehicle {
    id: string;
    plateNumber: string;
    make: string;
    model: string;
    payloadCapacityKg: number;
}

interface AvailableDriver {
    id: string;
    fullName: string;
    licenseNumber: string;
    phone?: string;
}

interface ConfirmedOrder {
    id: string;
    number: string;
    contractorName: string;
    cargoDescription: string;
    cargoWeightKg: number;
    loadingAddress: string;
    unloadingAddress: string;
}

interface CreateTripModalProps {
    onClose: () => void;
    onCreated: () => void;
}

export function CreateTripModal({ onClose, onCreated }: CreateTripModalProps) {
    const [vehicles, setVehicles] = useState<AvailableVehicle[]>([]);
    const [drivers, setDrivers] = useState<AvailableDriver[]>([]);
    const [orders, setOrders] = useState<ConfirmedOrder[]>([]);
    const [loadingData, setLoadingData] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [splittingOrderId, setSplittingOrderId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [warnings, setWarnings] = useState<string[]>([]);

    // Form state
    const [selectedVehicle, setSelectedVehicle] = useState('');
    const [selectedDriver, setSelectedDriver] = useState('');
    const [selectedOrders, setSelectedOrders] = useState<string[]>([]);

    // Load available vehicles, drivers, and confirmed orders
    useEffect(() => {
        async function loadData() {
            setLoadingData(true);
            try {
                const [vehiclesData, driversData, ordersData] = await Promise.all([
                    api.get('/trips/available-vehicles'),
                    api.get('/trips/available-drivers'),
                    api.get('/orders?status=confirmed&limit=50'),
                ]);

                if (vehiclesData.success) setVehicles(vehiclesData.data ?? []);
                if (driversData.success) setDrivers(driversData.data ?? []);
                if (ordersData.success) setOrders(ordersData.data ?? []);
            } catch {
                setError('Не удалось загрузить данные');
            } finally {
                setLoadingData(false);
            }
        }
        loadData();
    }, []);

    const toggleOrder = (orderId: string) => {
        setSelectedOrders(prev =>
            prev.includes(orderId)
                ? prev.filter(id => id !== orderId)
                : [...prev, orderId],
        );
    };

    // Compute total cargo weight of selected orders
    const totalWeight = selectedOrders.reduce((sum, id) => {
        const order = orders.find(o => o.id === id);
        return sum + (order?.cargoWeightKg ?? 0);
    }, 0);

    const selectedVehicleData = vehicles.find(v => v.id === selectedVehicle);
    const isOverweight = selectedVehicleData && totalWeight > selectedVehicleData.payloadCapacityKg;
    const capacityKg = selectedVehicleData?.payloadCapacityKg ?? 0;

    const estimateTripCount = (weightKg: number) => {
        if (!capacityKg || capacityKg <= 0) return null;
        return Math.max(1, Math.ceil(weightKg / capacityKg));
    };

    const splitOrderBySelectedVehicle = async (order: ConfirmedOrder) => {
        if (!selectedVehicleData) {
            setError('Сначала выберите ТС, чтобы рассчитать партии по грузоподъемности.');
            return;
        }

        setSplittingOrderId(order.id);
        setError(null);
        try {
            const result = await api.post(`/orders/${order.id}/lots/split`, {
                maxWeightKg: selectedVehicleData.payloadCapacityKg,
            });
            if (!result.success) {
                throw new Error(result.error || 'Не удалось разбить заявку на партии');
            }
            const count = Array.isArray(result.data) ? result.data.length : estimateTripCount(order.cargoWeightKg);
            setWarnings([
                `Заявка ${order.number} разбита на ${count} партий по ${(selectedVehicleData.payloadCapacityKg / 1000).toFixed(1)} т.`,
            ]);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Не удалось разбить заявку на партии');
        } finally {
            setSplittingOrderId(null);
        }
    };

    const handleSubmit = async () => {
        if (!selectedVehicle || !selectedDriver || selectedOrders.length === 0) return;

        setSubmitting(true);
        setError(null);
        setWarnings([]);

        try {
            // 1. Create trip with linked orders
            const createData = await api.post('/trips', { orderIds: selectedOrders });
            if (!createData.success) {
                throw new Error(createData.error || 'Ошибка создания рейса');
            }

            const tripId = createData.data.id;

            // 2. Assign vehicle + driver
            // api wrapper doesn't expose raw response status easily if it throws, 
            // but we can check if it returns an error object, or if our wrapper throws on 409
            const assignData: any = await api.post(`/trips/${tripId}/assign`, {
                vehicleId: selectedVehicle,
                driverId: selectedDriver
            });

            if (!assignData.success && assignData.error === 'Назначение заблокировано') {
                // Hard block — assignment rejected
                throw new Error(assignData.data?.warnings?.join(', ') || 'Назначение невозможно');
            } else if (!assignData.success) {
                // Fallback for other errors
                throw new Error(assignData.error || 'Ошибка назначения');
            }

            if (assignData.warnings?.length > 0) {
                setWarnings(assignData.warnings);
                // Still succeed — just with warnings
                setTimeout(onCreated, 2000);
            } else {
                onCreated();
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Ошибка');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={true} onClose={onClose} title="Создать рейс" size="lg">
            <div className="space-y-5">
                    {loadingData && (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
                            <span className="ml-2 text-sm text-neutral-500">Загрузка...</span>
                        </div>
                    )}

                    {!loadingData && (
                        <>
                            {/* Vehicle selection */}
                            <div>
                                <label className="text-sm font-semibold text-neutral-700 flex items-center gap-2 mb-2">
                                    <Truck className="w-4 h-4 text-emerald-500" />
                                    Транспортное средство
                                </label>
                                <select
                                    value={selectedVehicle}
                                    onChange={e => setSelectedVehicle(e.target.value)}
                                    className="w-full px-3 py-2.5 rounded-lg border border-neutral-200 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                >
                                    <option value="">Выберите ТС...</option>
                                    {vehicles.map(v => (
                                        <option key={v.id} value={v.id}>
                                            {v.plateNumber} — {v.make} {v.model} ({(v.payloadCapacityKg / 1000).toFixed(0)}т)
                                        </option>
                                    ))}
                                </select>
                                {vehicles.length === 0 && (
                                    <p className="text-xs text-amber-600 mt-1">Нет свободных ТС</p>
                                )}
                            </div>

                            {/* Driver selection */}
                            <div>
                                <label className="text-sm font-semibold text-neutral-700 flex items-center gap-2 mb-2">
                                    <User className="w-4 h-4 text-blue-500" />
                                    Водитель
                                </label>
                                <select
                                    value={selectedDriver}
                                    onChange={e => setSelectedDriver(e.target.value)}
                                    className="w-full px-3 py-2.5 rounded-lg border border-neutral-200 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                >
                                    <option value="">Выберите водителя...</option>
                                    {drivers.map(d => (
                                        <option key={d.id} value={d.id}>
                                            {d.fullName} (ВУ: {d.licenseNumber})
                                        </option>
                                    ))}
                                </select>
                                {drivers.length === 0 && (
                                    <p className="text-xs text-amber-600 mt-1">Нет активных водителей</p>
                                )}
                            </div>

                            {/* Orders selection */}
                            <div>
                                <label className="text-sm font-semibold text-neutral-700 flex items-center gap-2 mb-2">
                                    <Package className="w-4 h-4 text-indigo-500" />
                                    Заявки ({selectedOrders.length} выбрано
                                    {totalWeight > 0 && ` • ${(totalWeight / 1000).toFixed(1)}т`})
                                </label>

                                {isOverweight && (
                                    <div className="flex items-center gap-2 mb-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200">
                                        <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                                        <span className="text-xs text-red-700">
                                            Перевес! Груз {(totalWeight / 1000).toFixed(1)}т {'>'} Грузоподъёмность {(selectedVehicleData!.payloadCapacityKg / 1000).toFixed(0)}т
                                        </span>
                                    </div>
                                )}

                                <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                                    {orders.map(order => {
                                        const tripsNeeded = estimateTripCount(order.cargoWeightKg);
                                        const needsSplit = Boolean(selectedVehicleData && tripsNeeded && tripsNeeded > 1);

                                        return (
                                        <label
                                            key={order.id}
                                            className={`flex items-start gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all ${selectedOrders.includes(order.id)
                                                ? 'bg-indigo-50 border border-indigo-200'
                                                : 'bg-neutral-50 border border-transparent hover:bg-neutral-100'
                                                }`}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={selectedOrders.includes(order.id)}
                                                onChange={() => toggleOrder(order.id)}
                                                className="mt-0.5 rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500"
                                            />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs font-bold text-indigo-600 font-mono">{order.number}</span>
                                                    <span className="text-xs text-neutral-500">
                                                        {order.cargoWeightKg >= 1000
                                                            ? `${(order.cargoWeightKg / 1000).toFixed(1)}т`
                                                            : `${order.cargoWeightKg}кг`}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-neutral-500 truncate">{order.cargoDescription}</p>
                                                <p className="text-xs text-neutral-400 truncate">
                                                    {order.loadingAddress} → {order.unloadingAddress}
                                                </p>
                                                {selectedVehicleData && (
                                                    <div className={`mt-2 rounded-md px-2 py-1 text-[11px] ${needsSplit
                                                        ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                                        : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                                        }`}>
                                                        {needsSplit
                                                            ? `Нужно рейсов/партий: ${tripsNeeded}. Выбранное ТС не заберет всю заявку.`
                                                            : 'Заявка помещается в выбранное ТС.'}
                                                    </div>
                                                )}
                                                {needsSplit && (
                                                    <button
                                                        type="button"
                                                        disabled={splittingOrderId === order.id}
                                                        onClick={(event) => {
                                                            event.preventDefault();
                                                            event.stopPropagation();
                                                            void splitOrderBySelectedVehicle(order);
                                                        }}
                                                        className="mt-2 rounded-md border border-amber-300 bg-white px-2 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                                                    >
                                                        {splittingOrderId === order.id ? 'Разбиваем...' : 'Разбить на партии'}
                                                    </button>
                                                )}
                                            </div>
                                        </label>
                                        );
                                    })}
                                    {orders.length === 0 && (
                                        <p className="text-xs text-neutral-400 text-center py-4">
                                            Нет подтверждённых заявок
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Warnings */}
                            {warnings.length > 0 && (
                                <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 space-y-1">
                                    <p className="text-xs font-semibold text-amber-700">⚠️ Рейс создан с предупреждениями:</p>
                                    {warnings.map((w) => (
                                        <p key={w} className="text-xs text-amber-600">• {w}</p>
                                    ))}
                                </div>
                            )}

                            {/* Error */}
                            {error && (
                                <div className="rounded-lg bg-red-50 border border-red-200 p-3">
                                    <p className="text-xs text-red-700">{error}</p>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="border-t border-neutral-100 pt-4 flex items-center justify-end gap-3">
                    <Button variant="outline" onClick={onClose} disabled={submitting}>
                        Отмена
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={
                            !selectedVehicle || !selectedDriver || selectedOrders.length === 0
                            || submitting || loadingData
                        }
                        className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 shadow-lg shadow-emerald-500/25 gap-2"
                    >
                        {submitting ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Check className="w-4 h-4" />
                        )}
                        Создать рейс
                    </Button>
                </div>
        </Dialog>
    );
}
