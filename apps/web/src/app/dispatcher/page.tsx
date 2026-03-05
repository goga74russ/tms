'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Map as MapIcon, ArrowLeftRight, Clock, Loader2, Info, Truck, User, MapPin, Wifi, WifiOff } from 'lucide-react';
import dynamic from 'next/dynamic';
import { AssignmentPanel } from './components/AssignmentPanel';
import { VehicleTimeline } from './components/VehicleTimeline';
import { Card, CardContent } from '@/components/ui/card';
import { api } from '@/lib/api';
import { useVehiclePositions } from '@/hooks/useVehiclePositions';
import type { RoutePoint } from './components/TripRouteLayer';

// Leaflet must be loaded client-side only
const DispatcherMap = dynamic(
    () => import('./components/DispatcherMap').then(mod => mod.DispatcherMap),
    {
        ssr: false, loading: () => (
            <div className="h-[500px] bg-slate-100 rounded-xl flex items-center justify-center">
                <div className="text-slate-400 flex items-center gap-2">
                    <MapIcon className="w-5 h-5 animate-pulse" />
                    <span className="text-sm">Загрузка карты...</span>
                </div>
            </div>
        )
    },
);

export type Vehicle = {
    id: string;
    plateNumber: string;
    make: string;
    model: string;
    status: string;
    lat?: number;
    lon?: number;
    payloadCapacityKg: number;
    driverName: string | null;
};

export type UnassignedOrder = {
    id: string;
    number: string;
    contractorName?: string;
    cargoDescription: string;
    cargoWeightKg: number;
    loadingAddress: string;
    unloadingAddress: string;
};

type TripForTimeline = {
    id: string;
    number: string;
    status: string;
    vehicleId: string;
    driverId?: string;
    driverName?: string;
    plannedDepartureAt?: string;
    completedAt?: string;
    createdAt: string;
    vehicle?: { plateNumber: string };
};

type ActiveTripDetails = {
    id: string;
    number: string;
    status: string;
    driverName?: string;
    vehiclePlate?: string;
    routePoints: RoutePoint[];
    totalPoints: number;
    completedPoints: number;
};

// Build timeline rows from real trip data
function buildTimelineData(vehicles: Vehicle[], trips: TripForTimeline[]) {
    return vehicles.slice(0, 15).map(v => {
        const vehicleTrips = trips.filter(t => t.vehicleId === v.id);
        const segments = vehicleTrips.map(trip => {
            const startDate = trip.plannedDepartureAt ? new Date(trip.plannedDepartureAt) : new Date(trip.createdAt);
            const endDate = trip.completedAt ? new Date(trip.completedAt) : new Date(Date.now() + 4 * 3600000);

            return {
                start: startDate.getHours() + startDate.getMinutes() / 60,
                end: Math.min(endDate.getHours() + endDate.getMinutes() / 60, 24),
                type: trip.status === 'cancelled' ? 'broken' : 'trip',
            };
        });

        // Add maintenance/broken segments for non-available vehicles with no trips
        if (segments.length === 0) {
            if (v.status === 'broken') segments.push({ start: 0, end: 24, type: 'broken' });
            if (v.status === 'maintenance') segments.push({ start: 0, end: 24, type: 'maintenance' });
        }

        return { vehicleId: v.id, plateNumber: v.plateNumber, segments };
    });
}

export default function DispatcherPage() {
    const [selectedVehicle, setSelectedVehicle] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'map' | 'timeline'>('map');

    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [orders, setOrders] = useState<UnassignedOrder[]>([]);
    const [trips, setTrips] = useState<TripForTimeline[]>([]);
    const [loading, setLoading] = useState(true);
    const [tripRoutePoints, setTripRoutePoints] = useState<RoutePoint[]>([]);
    const [activeTripDetails, setActiveTripDetails] = useState<ActiveTripDetails | null>(null);

    // Real-time vehicle positions via WebSocket
    const { positions: wsPositions, isConnected: wsConnected } = useVehiclePositions();

    // Merge WS positions into vehicles for the map
    const enrichedVehicles = useMemo(() => {
        if (wsPositions.length === 0) return vehicles;
        return vehicles.map(v => {
            const pos = wsPositions.find(p => p.vehicleId === v.id);
            if (pos) {
                return { ...v, lat: pos.lat, lon: pos.lon };
            }
            return v;
        });
    }, [vehicles, wsPositions]);

    // Load vehicles, orders, and trips
    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [vehiclesData, ordersData, tripsData] = await Promise.all([
                api.get('/fleet/vehicles?limit=100'),
                api.get('/orders?status=confirmed&limit=50'),
                api.get('/trips?limit=100'),
            ]);

            if ((vehiclesData as any).success) setVehicles((vehiclesData as any).data ?? []);
            if ((ordersData as any).success) setOrders((ordersData as any).data ?? []);
            if ((tripsData as any).success) setTrips((tripsData as any).data ?? []);
        } catch (error) {
            console.error('Failed to load dispatcher data', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
        const intervalId = setInterval(loadData, 30000); // reduced frequency since WS handles positions
        return () => clearInterval(intervalId);
    }, [loadData]);

    // Fetch route points + trip details for selected vehicle
    useEffect(() => {
        if (!selectedVehicle) {
            setTripRoutePoints([]);
            setActiveTripDetails(null);
            return;
        }

        async function loadRoutePoints() {
            try {
                const data = await api.get(`/trips?vehicleId=${selectedVehicle}&status=in_transit&limit=1`);

                if (data.success && data.data?.length > 0) {
                    const trip = data.data[0];

                    const rpData = await api.get(`/trips/${trip.id}/points`);

                    const points: RoutePoint[] = (rpData.success && rpData.data) ? rpData.data.map((rp: any) => ({
                        lat: rp.lat,
                        lon: rp.lon,
                        address: rp.address,
                        type: rp.type,
                        status: rp.status,
                        sequenceNumber: rp.sequenceNumber,
                    })) : [];

                    setTripRoutePoints(points);
                    setActiveTripDetails({
                        id: trip.id,
                        number: trip.number,
                        status: trip.status,
                        driverName: trip.driverName || trip.driver?.fullName,
                        vehiclePlate: trip.vehicle?.plateNumber || vehicles.find(v => v.id === trip.vehicleId)?.plateNumber,
                        routePoints: points,
                        totalPoints: points.length,
                        completedPoints: points.filter((p: RoutePoint) => p.status === 'completed').length,
                    });
                    return;
                }

                setTripRoutePoints([]);
                setActiveTripDetails(null);
            } catch {
                setTripRoutePoints([]);
                setActiveTripDetails(null);
            }
        }

        loadRoutePoints();
    }, [selectedVehicle, vehicles]);

    // Build timeline from real data
    const timelineData = buildTimelineData(vehicles, trips);

    // Stats
    const vehicleStats = {
        available: enrichedVehicles.filter(v => v.status === 'available').length,
        assigned: enrichedVehicles.filter(v => v.status === 'assigned').length,
        inTrip: enrichedVehicles.filter(v => v.status === 'in_trip').length,
        problem: enrichedVehicles.filter(v => ['broken', 'maintenance'].includes(v.status)).length,
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/25">
                        <MapIcon className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">Диспетчерская</h1>
                        <p className="text-sm text-slate-500">Управление рейсами и транспортом</p>
                    </div>
                </div>
                {loading && (
                    <div className="flex items-center gap-2 text-slate-400 text-sm">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Синхронизация...</span>
                    </div>
                )}
                <div className="flex items-center gap-2 text-xs">
                    {wsConnected ? (
                        <><Wifi className="w-3.5 h-3.5 text-emerald-500" /><span className="text-emerald-600">Live</span></>
                    ) : (
                        <><WifiOff className="w-3.5 h-3.5 text-slate-400" /><span className="text-slate-400">Offline</span></>
                    )}
                </div>
            </div>

            {/* Vehicle stats */}
            <div className="grid grid-cols-4 gap-3">
                <Card className="hover:border-slate-300 transition-colors">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-1">
                            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                            <span className="text-xs font-medium text-slate-500">Свободны</span>
                        </div>
                        <span className="text-2xl font-bold text-slate-900">{vehicleStats.available}</span>
                    </CardContent>
                </Card>
                <Card className="hover:border-slate-300 transition-colors">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-1">
                            <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                            <span className="text-xs font-medium text-slate-500">Назначены</span>
                        </div>
                        <span className="text-2xl font-bold text-slate-900">{vehicleStats.assigned}</span>
                    </CardContent>
                </Card>
                <Card className="hover:border-slate-300 transition-colors">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-1">
                            <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                            <span className="text-xs font-medium text-slate-500">В рейсе</span>
                        </div>
                        <span className="text-2xl font-bold text-slate-900">{vehicleStats.inTrip}</span>
                    </CardContent>
                </Card>
                <Card className="hover:border-slate-300 transition-colors">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-1">
                            <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                            <span className="text-xs font-medium text-slate-500">Проблемы</span>
                        </div>
                        <span className="text-2xl font-bold text-slate-900">{vehicleStats.problem}</span>
                    </CardContent>
                </Card>
            </div>

            {/* Tab switcher */}
            <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
                <button
                    onClick={() => setActiveTab('map')}
                    className={`px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2 transition-all ${activeTab === 'map'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                        }`}
                >
                    <MapIcon className="w-4 h-4" />
                    Карта
                </button>
                <button
                    onClick={() => setActiveTab('timeline')}
                    className={`px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2 transition-all ${activeTab === 'timeline'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                        }`}
                >
                    <Clock className="w-4 h-4" />
                    Таймлайн
                </button>
            </div>

            {/* Route info banner */}
            {tripRoutePoints.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 flex items-center gap-2 text-sm text-blue-700">
                    <ArrowLeftRight className="w-4 h-4" />
                    <span>Маршрут рейса: {tripRoutePoints.length} точек</span>
                </div>
            )}

            {/* Main content */}
            <div className="grid grid-cols-3 gap-6">
                {/* Map / Timeline area (2/3) */}
                <div className="col-span-2 space-y-4">
                    {activeTab === 'map' ? (
                        <DispatcherMap
                            vehicles={enrichedVehicles}
                            selectedVehicle={selectedVehicle}
                            onSelectVehicle={setSelectedVehicle}
                            tripRoutePoints={tripRoutePoints}
                        />
                    ) : (
                        <VehicleTimeline data={timelineData} />
                    )}

                    {/* Trip Details Panel */}
                    {activeTripDetails && (
                        <Card>
                            <CardContent className="p-4">
                                <div className="flex items-center gap-2 mb-3">
                                    <Info className="w-4 h-4 text-blue-500" />
                                    <h3 className="text-sm font-bold text-slate-800">Детали рейса</h3>
                                </div>
                                <div className="grid grid-cols-3 gap-4">
                                    <div>
                                        <p className="text-xs text-slate-500 mb-0.5">Номер</p>
                                        <p className="text-sm font-bold text-indigo-600 font-mono">{activeTripDetails.number}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-slate-500 mb-0.5">Статус</p>
                                        <div className="flex items-center gap-1.5">
                                            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                                            <p className="text-sm font-medium text-slate-700">{activeTripDetails.status === 'in_transit' ? 'В пути' : activeTripDetails.status}</p>
                                        </div>
                                    </div>
                                    <div>
                                        <p className="text-xs text-slate-500 mb-0.5">Прогресс</p>
                                        <div className="flex items-center gap-2">
                                            <div className="flex-1 bg-slate-100 rounded-full h-2">
                                                <div
                                                    className="bg-emerald-500 h-2 rounded-full transition-all"
                                                    style={{
                                                        width: activeTripDetails.totalPoints > 0
                                                            ? `${(activeTripDetails.completedPoints / activeTripDetails.totalPoints) * 100}%`
                                                            : '0%',
                                                    }}
                                                />
                                            </div>
                                            <span className="text-xs font-medium text-slate-600">
                                                {activeTripDetails.completedPoints}/{activeTripDetails.totalPoints}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                {(activeTripDetails.driverName || activeTripDetails.vehiclePlate) && (
                                    <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-100">
                                        {activeTripDetails.vehiclePlate && (
                                            <div className="flex items-center gap-1.5 text-xs text-slate-500">
                                                <Truck className="w-3.5 h-3.5" />
                                                <span>{activeTripDetails.vehiclePlate}</span>
                                            </div>
                                        )}
                                        {activeTripDetails.driverName && (
                                            <div className="flex items-center gap-1.5 text-xs text-slate-500">
                                                <User className="w-3.5 h-3.5" />
                                                <span>{activeTripDetails.driverName}</span>
                                            </div>
                                        )}
                                    </div>
                                )}
                                {/* Route points mini list */}
                                {activeTripDetails.routePoints.length > 0 && (
                                    <div className="mt-3 pt-3 border-t border-slate-100 space-y-1.5">
                                        {activeTripDetails.routePoints.map((rp, i) => (
                                            <div key={i} className="flex items-center gap-2 text-xs">
                                                <MapPin className={`w-3.5 h-3.5 flex-shrink-0 ${rp.status === 'completed' ? 'text-emerald-500'
                                                    : rp.status === 'arrived' ? 'text-blue-500'
                                                        : 'text-slate-300'
                                                    }`} />
                                                <span className={`truncate ${rp.status === 'completed' ? 'text-slate-400 line-through' : 'text-slate-600'}`}>
                                                    {rp.address || `Точка ${rp.sequenceNumber}`}
                                                </span>
                                                <span className={`ml-auto text-[10px] font-medium ${rp.type === 'loading' ? 'text-green-600' : 'text-orange-600'
                                                    }`}>
                                                    {rp.type === 'loading' ? 'Погрузка' : 'Выгрузка'}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )}
                </div>

                <div className="col-span-1">
                    <AssignmentPanel
                        orders={orders}
                        vehicles={enrichedVehicles.filter(v => v.status === 'available')}
                        onAssign={async (orderId, vehicleId) => {
                            const order = orders.find(o => o.id === orderId);
                            if (!order) return;

                            await api.post('/trips', {
                                vehicleId,
                                // Send minimal required to form a trip out of an order
                                orders: [orderId],
                                routePoints: [
                                    { type: 'loading', address: order.loadingAddress, sequenceNumber: 1 },
                                    { type: 'unloading', address: order.unloadingAddress, sequenceNumber: 2 }
                                ]
                            });

                            // refresh dashboard
                            loadData();
                        }}
                    />
                </div>
            </div>
        </div>
    );
}
