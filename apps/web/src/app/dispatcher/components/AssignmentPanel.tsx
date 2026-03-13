'use client';

import { useState, useCallback } from 'react';
import { Package, Truck, ArrowRight, Check, MapPin, User, Weight, X } from 'lucide-react';
import { Combobox } from '@/components/ui/Combobox';
import { api } from '@/lib/api';
import type { Vehicle, UnassignedOrder } from '../page';

interface VehicleSearchResult {
    id: string;
    plateNumber: string;
    make: string;
    model: string;
    status: string;
    payloadCapacityKg: number;
    driverName?: string | null;
}

interface AddressSuggestion {
    value: string;
    city: string;
    fiasId: string;
}

interface AssignmentPanelProps {
    orders: UnassignedOrder[];
    vehicles: Vehicle[];
    onAssign?: (orderId: string, vehicleId: string) => Promise<void>;
}

export function AssignmentPanel({ orders, vehicles, onAssign }: AssignmentPanelProps) {
    const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
    const [selectedVehicle, setSelectedVehicle] = useState<VehicleSearchResult | null>(null);
    const [assignSuccess, setAssignSuccess] = useState<string | null>(null);
    const [isAssigning, setIsAssigning] = useState(false);
    const [cityFilter, setCityFilter] = useState<string | null>(null);

    // Search vehicles via API
    const searchVehicles = useCallback(async (query: string): Promise<VehicleSearchResult[]> => {
        try {
            const result = await api.get<any>(`/fleet/vehicles?search=${encodeURIComponent(query)}&status=available&limit=10`);
            return result.data || [];
        } catch {
            return [];
        }
    }, []);

    // Search cities via DaData suggest
    const searchCities = useCallback(async (query: string): Promise<AddressSuggestion[]> => {
        try {
            const result = await api.get<any>(`/integrations/dadata/suggest-address?query=${encodeURIComponent(query)}`);
            return result.data || [];
        } catch {
            return [];
        }
    }, []);

    // Filter orders by city
    const filteredOrders = cityFilter
        ? orders.filter(o =>
            o.loadingAddress.toLowerCase().includes(cityFilter.toLowerCase()) ||
            o.unloadingAddress.toLowerCase().includes(cityFilter.toLowerCase())
        )
        : orders;

    const handleAssign = async () => {
        if (!selectedOrder || !selectedVehicle || isAssigning) return;

        const order = orders.find(o => o.id === selectedOrder);

        if (order && order.cargoWeightKg > selectedVehicle.payloadCapacityKg) {
            alert(`Перевес! Груз: ${order.cargoWeightKg}кг > Грузоподъёмность: ${selectedVehicle.payloadCapacityKg}кг`);
            return;
        }

        setIsAssigning(true);
        try {
            if (onAssign) {
                await onAssign(selectedOrder, selectedVehicle.id);
            }
            setAssignSuccess(`${order?.number} → ${selectedVehicle.plateNumber}`);
            setSelectedOrder(null);
            setSelectedVehicle(null);
            setTimeout(() => setAssignSuccess(null), 3000);
        } catch (error: any) {
            alert(`Ошибка назначения: ${error.message || 'Неизвестная ошибка'}`);
        } finally {
            setIsAssigning(false);
        }
    };

    return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col" style={{ minHeight: '500px' }}>
            {/* Header */}
            <div className="px-4 py-3 border-b border-slate-100">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <ArrowRight className="w-4 h-4 text-emerald-500" />
                    Назначение
                </h3>
            </div>

            {assignSuccess && (
                <div className="mx-3 mt-3 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs text-emerald-700 font-medium">{assignSuccess}</span>
                </div>
            )}

            <div className="flex-1 overflow-y-auto p-3 space-y-4">
                {/* ============= Vehicle Search ============= */}
                <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Truck className="w-3.5 h-3.5" />
                        Поиск ТС
                    </p>
                    <Combobox<VehicleSearchResult>
                        placeholder="Госномер, марка, модель..."
                        icon={<Truck className="w-4 h-4" />}
                        onSearch={searchVehicles}
                        onSelect={(v) => setSelectedVehicle(v)}
                        selected={selectedVehicle}
                        getKey={(v) => v.id}
                        getLabel={(v) => v.plateNumber}
                        emptyMessage="Нет свободных ТС"
                        renderOption={(v) => (
                            <div>
                                <div className="flex justify-between items-center mb-0.5">
                                    <span className="font-bold text-slate-800">{v.plateNumber}</span>
                                    <span className="text-xs font-medium text-emerald-600">
                                        {(v.payloadCapacityKg / 1000).toFixed(0)}т
                                    </span>
                                </div>
                                <div className="text-xs text-slate-500">
                                    {v.make} {v.model}
                                    {v.driverName && (
                                        <span className="ml-1.5 text-slate-400">• {v.driverName}</span>
                                    )}
                                </div>
                            </div>
                        )}
                    />

                    {/* Selected vehicle card */}
                    {selectedVehicle && (
                        <div className="mt-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                            <div className="flex items-center justify-between mb-1.5">
                                <span className="text-sm font-bold text-slate-800">{selectedVehicle.plateNumber}</span>
                                <div className="flex items-center gap-1">
                                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                    <span className="text-xs text-emerald-600 font-medium">Свободен</span>
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
                                <span className="flex items-center gap-1">
                                    <Truck className="w-3 h-3 text-slate-400" />
                                    {selectedVehicle.make} {selectedVehicle.model}
                                </span>
                                <span className="flex items-center gap-1">
                                    <Weight className="w-3 h-3 text-slate-400" />
                                    {(selectedVehicle.payloadCapacityKg / 1000).toFixed(0)}т
                                </span>
                                {selectedVehicle.driverName && (
                                    <span className="flex items-center gap-1">
                                        <User className="w-3 h-3 text-slate-400" />
                                        {selectedVehicle.driverName}
                                    </span>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* ============= City Filter ============= */}
                <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5" />
                        Фильтр по городу
                    </p>
                    <Combobox<AddressSuggestion>
                        placeholder="Город или адрес..."
                        icon={<MapPin className="w-4 h-4" />}
                        onSearch={searchCities}
                        onSelect={(s) => setCityFilter(s ? s.city : null)}
                        getKey={(s) => s.fiasId}
                        getLabel={(s) => s.city}
                        emptyMessage="Города не найдены"
                        minChars={3}
                        renderOption={(s) => (
                            <div className="flex items-center gap-2">
                                <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                                <span>{s.value}</span>
                            </div>
                        )}
                    />
                    {cityFilter && (
                        <div className="mt-1.5 flex items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-700 font-medium">
                                <MapPin className="w-3 h-3" />
                                {cityFilter}
                                <button
                                    onClick={() => setCityFilter(null)}
                                    className="ml-0.5 p-0.5 rounded hover:bg-blue-100"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </span>
                        </div>
                    )}
                </div>

                {/* ============= Orders ============= */}
                <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Package className="w-3.5 h-3.5" />
                        Заявки ({filteredOrders.length}
                        {cityFilter && orders.length !== filteredOrders.length
                            ? ` из ${orders.length}`
                            : ''
                        })
                    </p>
                    <div className="space-y-1.5">
                        {filteredOrders.length === 0 ? (
                            <div className="text-center py-6 text-xs text-slate-400">
                                {cityFilter
                                    ? `Нет заявок для «${cityFilter}»`
                                    : 'Нет подтверждённых заявок'
                                }
                            </div>
                        ) : (
                            filteredOrders.map(order => (
                                <button
                                    key={order.id}
                                    onClick={() => setSelectedOrder(
                                        selectedOrder === order.id ? null : order.id,
                                    )}
                                    className={`w-full text-left px-3 py-2.5 rounded-lg text-xs transition-all ${selectedOrder === order.id
                                        ? 'bg-indigo-50 border border-indigo-200 ring-1 ring-indigo-300'
                                        : 'bg-slate-50 border border-transparent hover:bg-slate-100'
                                        }`}
                                >
                                    <div className="flex justify-between items-center mb-0.5">
                                        <span className="font-bold text-indigo-600 font-mono">
                                            {order.number}
                                        </span>
                                        <span className="font-semibold text-slate-600">
                                            {order.cargoWeightKg >= 1000
                                                ? `${(order.cargoWeightKg / 1000).toFixed(1)}т`
                                                : `${order.cargoWeightKg}кг`}
                                        </span>
                                    </div>
                                    <div className="text-slate-500 truncate">{order.contractorName}</div>
                                    <div className="text-slate-400 truncate mt-0.5">
                                        {order.loadingAddress} → {order.unloadingAddress}
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* Assign button */}
            <div className="p-3 border-t border-slate-100">
                <button
                    onClick={handleAssign}
                    disabled={!selectedOrder || !selectedVehicle || isAssigning}
                    className={`w-full py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${selectedOrder && selectedVehicle
                        ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/25 hover:shadow-xl'
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                        }`}
                >
                    <ArrowRight className="w-4 h-4" />
                    {isAssigning ? 'Назначаю...' : 'Назначить'}
                </button>
            </div>
        </div>
    );
}
