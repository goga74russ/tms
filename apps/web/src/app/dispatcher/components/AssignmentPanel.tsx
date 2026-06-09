'use client';

import { useState, useCallback, useEffect } from 'react';
import { Package, Truck, ArrowRight, Check, MapPin, User, Weight, X, AlertTriangle } from 'lucide-react';
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

// F-11: рейс из панели должен сразу получать водителя — POST /trips без
// driverId оставлял planning (тупик: ни осмотров, ни ПЛ, ни старта).
interface DriverSearchResult {
    id: string;
    fullName: string;
    licenseNumber?: string | null;
    phone?: string | null;
}

export interface AssignmentWindows {
    loadingFrom?: string | null;
    loadingTo?: string | null;
    unloadingFrom?: string | null;
    unloadingTo?: string | null;
}

interface AssignmentPanelProps {
    orders: UnassignedOrder[];
    vehicles: Vehicle[];
    onAssign?: (orderId: string, vehicleId: string, driverId: string, windows?: AssignmentWindows) => Promise<void>;
}

function localToIso(value: string): string | null {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
}

export function AssignmentPanel({ orders, vehicles, onAssign }: AssignmentPanelProps) {
    const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
    const [selectedVehicle, setSelectedVehicle] = useState<VehicleSearchResult | null>(null);
    const [selectedDriver, setSelectedDriver] = useState<DriverSearchResult | null>(null);
    const [assignSuccess, setAssignSuccess] = useState<string | null>(null);
    const [isAssigning, setIsAssigning] = useState(false);
    const [cityFilter, setCityFilter] = useState<string | null>(null);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [loadingFrom, setLoadingFrom] = useState('');
    const [loadingTo, setLoadingTo] = useState('');
    const [unloadingFrom, setUnloadingFrom] = useState('');
    const [unloadingTo, setUnloadingTo] = useState('');
    const [adrWarnings, setAdrWarnings] = useState<string[]>([]);
    const [volumeCheck, setVolumeCheck] = useState<{
        capacityVolumeM3: number | null;
        requiredVolumeM3: number;
        overflow: boolean;
        overflowAmount: number;
        skipReason: 'no_vehicle' | 'no_capacity_data' | null;
        ordersChecked: number;
        ordersSkipped: number;
    } | null>(null);

    // I5 — volume preview (кубы): при выборе ТС+заявки запрашиваем расчёт.
    // Endpoint /api/trips/volume-preview — без побочных эффектов, чисто для индикатора.
    useEffect(() => {
        if (!selectedOrder || !selectedVehicle?.id) {
            setVolumeCheck(null);
            return;
        }
        const params = new URLSearchParams();
        params.set('vehicleId', selectedVehicle.id);
        params.set('orderIds', selectedOrder);
        let cancelled = false;
        api.get<{ success: boolean; data: typeof volumeCheck }>(
            `/trips/volume-preview?${params.toString()}`,
        )
            .then((res) => { if (!cancelled) setVolumeCheck(res?.data ?? null); })
            .catch(() => { if (!cancelled) setVolumeCheck(null); });
        return () => { cancelled = true; };
    }, [selectedOrder, selectedVehicle?.id]);

    // ADR validation: when both order and vehicle/driver picked, fetch warnings
    useEffect(() => {
        if (!selectedOrder || !selectedVehicle) {
            setAdrWarnings([]);
            return;
        }
        const params = new URLSearchParams();
        if (selectedVehicle.id) params.set('vehicleId', selectedVehicle.id);
        // driverId — best-effort: we don't have it directly here, but vehicles often carry one
        const orderObj: any = orders.find(o => o.id === selectedOrder);
        if (!orderObj?.adrClass) {
            setAdrWarnings([]);
            return;
        }
        let cancelled = false;
        api.get<{ success: boolean; data: { ok: boolean; errors: string[] } }>(
            `/orders/${selectedOrder}/adr-validation?${params.toString()}`,
        )
            .then(res => {
                if (cancelled) return;
                if (res?.data && Array.isArray(res.data.errors)) {
                    setAdrWarnings(res.data.errors);
                } else {
                    setAdrWarnings([]);
                }
            })
            .catch(() => { if (!cancelled) setAdrWarnings([]); });
        return () => { cancelled = true; };
    }, [selectedOrder, selectedVehicle, orders]);

    // Search vehicles via API
    const searchVehicles = useCallback(async (query: string): Promise<VehicleSearchResult[]> => {
        try {
            const result = await api.get<any>(`/fleet/vehicles?search=${encodeURIComponent(query)}&status=available&limit=10`);
            return result.data || [];
        } catch {
            return [];
        }
    }, []);

    // F-11: поиск водителей. Эндпоинт available-drivers без серверного search —
    // список орг-водителей мал, фильтруем на клиенте по ФИО/ВУ.
    const searchDrivers = useCallback(async (query: string): Promise<DriverSearchResult[]> => {
        try {
            const result = await api.get<any>('/trips/available-drivers');
            const all: DriverSearchResult[] = result.data || [];
            const q = query.trim().toLowerCase();
            if (!q) return all.slice(0, 10);
            return all
                .filter(d =>
                    d.fullName.toLowerCase().includes(q) ||
                    (d.licenseNumber || '').toLowerCase().includes(q))
                .slice(0, 10);
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
        if (!selectedOrder || !selectedVehicle || !selectedDriver || isAssigning) return;

        const order = orders.find(o => o.id === selectedOrder);

        if (order && order.cargoWeightKg > selectedVehicle.payloadCapacityKg) {
            setToast({ message: `Перевес! Груз: ${order.cargoWeightKg}кг > Грузоподъемность: ${selectedVehicle.payloadCapacityKg}кг`, type: 'error' });
            setTimeout(() => setToast(null), 4000);
            return;
        }

        setIsAssigning(true);
        try {
            if (onAssign) {
                await onAssign(selectedOrder, selectedVehicle.id, selectedDriver.id, {
                    loadingFrom: localToIso(loadingFrom),
                    loadingTo: localToIso(loadingTo),
                    unloadingFrom: localToIso(unloadingFrom),
                    unloadingTo: localToIso(unloadingTo),
                });
            }
            setAssignSuccess(`${order?.number} → ${selectedVehicle.plateNumber} · ${selectedDriver.fullName}`);
            setSelectedOrder(null);
            setSelectedVehicle(null);
            setSelectedDriver(null);
            setLoadingFrom('');
            setLoadingTo('');
            setUnloadingFrom('');
            setUnloadingTo('');
            setTimeout(() => setAssignSuccess(null), 3000);
        } catch (error: any) {
            setToast({ message: `Ошибка назначения: ${error.message || 'Неизвестная ошибка'}`, type: 'error' });
            setTimeout(() => setToast(null), 4000);
        } finally {
            setIsAssigning(false);
        }
    };

    return (
        <div className="bg-white rounded-xl border border-neutral-200 shadow-sm flex flex-col" style={{ minHeight: '500px' }}>
            {/* Toast */}
            {toast && (
                <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-xl shadow-lg text-white font-medium text-sm ${toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'}`}>
                    {toast.message}
                </div>
            )}

            {/* Header */}
            <div className="px-4 py-3 border-b border-neutral-100">
                <h3 className="text-sm font-bold text-neutral-800 flex items-center gap-2">
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
                {/* ============= Volume capacity indicator (I5) ============= */}
                {volumeCheck && (() => {
                    const { capacityVolumeM3: cap, requiredVolumeM3: req, overflow, overflowAmount, skipReason } = volumeCheck;
                    if (skipReason === 'no_capacity_data') {
                        return (
                            <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-500">
                                Объём не проверен — у ТС не указана вместимость.
                            </div>
                        );
                    }
                    if (cap == null) return null;
                    const pct = cap > 0 ? Math.round((req / cap) * 100) : 0;
                    let tone: 'green' | 'yellow' | 'red' = 'green';
                    if (overflow) tone = 'red';
                    else if (pct >= 90) tone = 'yellow';
                    const toneClass = {
                        green: 'border-emerald-200 bg-emerald-50 text-emerald-800',
                        yellow: 'border-amber-200 bg-amber-50 text-amber-800',
                        red: 'border-red-200 bg-red-50 text-red-800',
                    }[tone];
                    return (
                        <div className={`rounded-xl border px-3 py-2 ${toneClass}`}>
                            <div className="flex items-center justify-between text-xs font-semibold">
                                <span>Загрузка по объёму</span>
                                <span>{req} / {cap} м³ ({pct}%)</span>
                            </div>
                            {overflow && (
                                <p className="mt-1 text-[11px] font-medium">
                                    Перегруз: +{overflowAmount} м³. Назначение будет заблокировано.
                                </p>
                            )}
                            {volumeCheck.ordersSkipped > 0 && (
                                <p className="mt-1 text-[10px] opacity-75">
                                    Заявок без указанного объёма: {volumeCheck.ordersSkipped} — не учтены.
                                </p>
                            )}
                        </div>
                    );
                })()}

                {/* ============= ADR validation warnings ============= */}
                {adrWarnings.length > 0 && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
                        <div className="flex items-start gap-2">
                            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                            <div className="min-w-0 flex-1">
                                <p className="text-[11px] font-bold uppercase tracking-wide text-amber-700">ADR — внимание</p>
                                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-amber-800">
                                    {adrWarnings.map((err, i) => (
                                        // adrWarnings is a list of plain strings; combine index + content for stability
                                        <li key={`${i}:${err}`}>{err}</li>
                                    ))}
                                </ul>
                                <p className="mt-1.5 text-[10px] text-amber-600">Назначение не блокируется — проверьте перед подтверждением.</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* ============= Vehicle Search ============= */}
                <div>
                    <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
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
                                    <span className="font-bold text-neutral-800">{v.plateNumber}</span>
                                    <span className="text-xs font-medium text-emerald-600">
                                        {(v.payloadCapacityKg / 1000).toFixed(0)}т
                                    </span>
                                </div>
                                <div className="text-xs text-neutral-500">
                                    {v.make} {v.model}
                                    {v.driverName && (
                                        <span className="ml-1.5 text-neutral-400">• {v.driverName}</span>
                                    )}
                                </div>
                            </div>
                        )}
                    />

                    {/* Selected vehicle card */}
                    {selectedVehicle && (
                        <div className="mt-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                            <div className="flex items-center justify-between mb-1.5">
                                <span className="text-sm font-bold text-neutral-800">{selectedVehicle.plateNumber}</span>
                                <div className="flex items-center gap-1">
                                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                    <span className="text-xs text-emerald-600 font-medium">Свободен</span>
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-neutral-600">
                                <span className="flex items-center gap-1">
                                    <Truck className="w-3 h-3 text-neutral-400" />
                                    {selectedVehicle.make} {selectedVehicle.model}
                                </span>
                                <span className="flex items-center gap-1">
                                    <Weight className="w-3 h-3 text-neutral-400" />
                                    {(selectedVehicle.payloadCapacityKg / 1000).toFixed(0)}т
                                </span>
                                {selectedVehicle.driverName && (
                                    <span className="flex items-center gap-1">
                                        <User className="w-3 h-3 text-neutral-400" />
                                        {selectedVehicle.driverName}
                                    </span>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* ============= Driver Search (F-11) ============= */}
                <div>
                    <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5" />
                        Водитель
                    </p>
                    <Combobox<DriverSearchResult>
                        placeholder="ФИО или № ВУ..."
                        icon={<User className="w-4 h-4" />}
                        onSearch={searchDrivers}
                        onSelect={(d) => setSelectedDriver(d)}
                        selected={selectedDriver}
                        getKey={(d) => d.id}
                        getLabel={(d) => d.fullName}
                        emptyMessage="Нет доступных водителей"
                        renderOption={(d) => (
                            <div>
                                <div className="font-bold text-neutral-800">{d.fullName}</div>
                                <div className="text-xs text-neutral-500">
                                    {d.licenseNumber ? `ВУ ${d.licenseNumber}` : 'ВУ не указано'}
                                    {d.phone && <span className="ml-1.5 text-neutral-400">• {d.phone}</span>}
                                </div>
                            </div>
                        )}
                    />
                    {selectedDriver && (
                        <div className="mt-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-bold text-neutral-800 flex items-center gap-1.5">
                                    <User className="w-3.5 h-3.5 text-neutral-400" />
                                    {selectedDriver.fullName}
                                </span>
                                {selectedDriver.licenseNumber && (
                                    <span className="text-xs text-neutral-500">ВУ {selectedDriver.licenseNumber}</span>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* ============= City Filter ============= */}
                <div>
                    <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
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
                                <MapPin className="w-3.5 h-3.5 text-neutral-400 flex-shrink-0" />
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

                {/* ============= Time Windows ============= */}
                <div>
                    <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5" />
                        Окна доставки
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="text-[10px] font-medium text-neutral-500 mb-1 block">Погрузка с</label>
                            <input
                                type="datetime-local"
                                value={loadingFrom}
                                onChange={e => setLoadingFrom(e.target.value)}
                                className="w-full px-2 py-1.5 text-xs border border-neutral-200 rounded-lg bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-emerald-300"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-medium text-neutral-500 mb-1 block">Погрузка до</label>
                            <input
                                type="datetime-local"
                                value={loadingTo}
                                onChange={e => setLoadingTo(e.target.value)}
                                className="w-full px-2 py-1.5 text-xs border border-neutral-200 rounded-lg bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-emerald-300"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-medium text-neutral-500 mb-1 block">Выгрузка с</label>
                            <input
                                type="datetime-local"
                                value={unloadingFrom}
                                onChange={e => setUnloadingFrom(e.target.value)}
                                className="w-full px-2 py-1.5 text-xs border border-neutral-200 rounded-lg bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-emerald-300"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-medium text-neutral-500 mb-1 block">Выгрузка до</label>
                            <input
                                type="datetime-local"
                                value={unloadingTo}
                                onChange={e => setUnloadingTo(e.target.value)}
                                className="w-full px-2 py-1.5 text-xs border border-neutral-200 rounded-lg bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-emerald-300"
                            />
                        </div>
                    </div>
                </div>

                {/* ============= Orders ============= */}
                <div>
                    <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Package className="w-3.5 h-3.5" />
                        Заявки ({filteredOrders.length}
                        {cityFilter && orders.length !== filteredOrders.length
                            ? ` из ${orders.length}`
                            : ''
                        })
                    </p>
                    <div className="space-y-1.5">
                        {filteredOrders.length === 0 ? (
                            <div className="text-center py-6 text-xs text-neutral-400">
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
                                        : 'bg-neutral-50 border border-transparent hover:bg-neutral-100'
                                        }`}
                                >
                                    <div className="flex justify-between items-center mb-0.5">
                                        <span className="font-bold text-indigo-600 font-mono inline-flex items-center gap-1.5">
                                            {order.number}
                                            {order.adrClass && (
                                                <span
                                                    className="inline-flex items-center gap-0.5 rounded border border-red-200 bg-red-100 px-1 py-0 text-[9px] font-bold text-red-700"
                                                    title={`ADR класс ${order.adrClass}${order.adrUnNumber ? ` · ${order.adrUnNumber}` : ''}`}
                                                >
                                                    <AlertTriangle className="w-2 h-2" />
                                                    ADR-{order.adrClass}
                                                </span>
                                            )}
                                        </span>
                                        <span className="font-semibold text-neutral-600">
                                            {order.cargoWeightKg >= 1000
                                                ? `${(order.cargoWeightKg / 1000).toFixed(1)}т`
                                                : `${order.cargoWeightKg}кг`}
                                        </span>
                                    </div>
                                    <div className="text-neutral-500 truncate">{order.contractorName}</div>
                                    <div className="text-neutral-400 truncate mt-0.5">
                                        {order.loadingAddress} → {order.unloadingAddress}
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* Assign button */}
            <div className="p-3 border-t border-neutral-100">
                <button
                    type="button"
                    onClick={handleAssign}
                    disabled={!selectedOrder || !selectedVehicle || !selectedDriver || isAssigning || !!volumeCheck?.overflow}
                    title={(() => {
                        const missing = [
                            !selectedOrder ? 'заказ' : null,
                            !selectedVehicle ? 'автомобиль' : null,
                            !selectedDriver ? 'водителя' : null,
                        ].filter(Boolean);
                        return missing.length ? `Выберите ${missing.join(', ')}, чтобы назначить` : undefined;
                    })()}
                    className={`w-full py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${selectedOrder && selectedVehicle && selectedDriver
                        ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/25 hover:shadow-xl'
                        : 'bg-neutral-100 text-neutral-400 cursor-not-allowed'
                        }`}
                >
                    <ArrowRight className="w-4 h-4" />
                    {isAssigning ? 'Назначаю...' : 'Назначить'}
                </button>
            </div>
        </div>
    );
}
