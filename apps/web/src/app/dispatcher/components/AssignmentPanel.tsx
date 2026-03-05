'use client';

import { useState } from 'react';
import { Package, Truck, ArrowRight, Check, AlertTriangle } from 'lucide-react';
import type { Vehicle, UnassignedOrder } from '../page';

interface AssignmentPanelProps {
    orders: UnassignedOrder[];
    vehicles: Vehicle[];
    onAssign?: (orderId: string, vehicleId: string) => Promise<void>;
}

export function AssignmentPanel({ orders, vehicles, onAssign }: AssignmentPanelProps) {
    const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
    const [selectedVehicle, setSelectedVehicle] = useState<string | null>(null);
    const [assignSuccess, setAssignSuccess] = useState<string | null>(null);
    const [isAssigning, setIsAssigning] = useState(false);

    const handleAssign = async () => {
        if (!selectedOrder || !selectedVehicle || isAssigning) return;

        const order = orders.find(o => o.id === selectedOrder);
        const vehicle = vehicles.find(v => v.id === selectedVehicle);

        if (order && vehicle && order.cargoWeightKg > vehicle.payloadCapacityKg) {
            alert(`Перевес! Груз: ${order.cargoWeightKg}кг > Грузоподъёмность: ${vehicle.payloadCapacityKg}кг`);
            return;
        }

        setIsAssigning(true);
        try {
            if (onAssign) {
                await onAssign(selectedOrder, selectedVehicle);
            }
            setAssignSuccess(`${order?.number} → ${vehicle?.plateNumber}`);
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
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm h-[500px] flex flex-col">
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
                {/* Orders section */}
                <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Package className="w-3.5 h-3.5" />
                        Заявки ({orders.length})
                    </p>
                    <div className="space-y-1.5">
                        {orders.map(order => (
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
                        ))}
                    </div>
                </div>

                {/* Vehicles section */}
                <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Truck className="w-3.5 h-3.5" />
                        Свободные ТС ({vehicles.length})
                    </p>
                    <div className="space-y-1.5">
                        {vehicles.map(vehicle => (
                            <button
                                key={vehicle.id}
                                onClick={() => setSelectedVehicle(
                                    selectedVehicle === vehicle.id ? null : vehicle.id,
                                )}
                                className={`w-full text-left px-3 py-2.5 rounded-lg text-xs transition-all ${selectedVehicle === vehicle.id
                                    ? 'bg-emerald-50 border border-emerald-200 ring-1 ring-emerald-300'
                                    : 'bg-slate-50 border border-transparent hover:bg-slate-100'
                                    }`}
                            >
                                <div className="flex justify-between items-center mb-0.5">
                                    <span className="font-bold text-slate-800">
                                        {vehicle.plateNumber}
                                    </span>
                                    <div className="flex items-center gap-1">
                                        <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                        <span className="text-emerald-600 font-medium">Свободен</span>
                                    </div>
                                </div>
                                <div className="text-slate-500">
                                    {vehicle.make} {vehicle.model} • {(vehicle.payloadCapacityKg / 1000).toFixed(0)}т
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Assign button */}
            <div className="p-3 border-t border-slate-100">
                <button
                    onClick={handleAssign}
                    disabled={!selectedOrder || !selectedVehicle}
                    className={`w-full py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${selectedOrder && selectedVehicle
                        ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/25 hover:shadow-xl'
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                        }`}
                >
                    <ArrowRight className="w-4 h-4" />
                    Назначить
                </button>
            </div>
        </div>
    );
}
