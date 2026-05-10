'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Map as MapIcon, ArrowLeftRight, Clock, Loader2, Info, Truck, User, MapPin, Wifi, WifiOff, Search, AlertTriangle, CheckCircle2, X, FileDown, Thermometer } from 'lucide-react';
import dynamic from 'next/dynamic';
import { AssignmentPanel } from './components/AssignmentPanel';
import { VehicleTimeline } from './components/VehicleTimeline';
import { Card, CardContent } from '@/components/ui/card';
import { Combobox } from '@/components/ui/Combobox';
import { api } from '@/lib/api';
import { downloadFromApi } from '@/lib/download';
import { useVehiclePositions } from '@/hooks/useVehiclePositions';
import { useWialonPositions, type ActiveVehicleSubscription } from '@/hooks/useWialonPositions';
import { useUser } from '@/lib/user-context';
import { userCanUseCopilot } from '@tms/shared';
import { CopilotChat } from '@/components/CopilotChat';
import { OnboardingTour, type TourStep } from '@/components/OnboardingTour';
import type { RoutePoint } from './components/TripRouteLayer';
import type { LiveGpsMarker } from './components/DispatcherMap';

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
    adrClass?: string | null;
    adrUnNumber?: string | null;
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
    waybillId?: string;
    routePoints: RoutePoint[];
    totalPoints: number;
    completedPoints: number;
    deliveryConfirmation?: {
        recipientName: string;
        cargoCondition: string;
        confirmedAt: string;
        forcedByDispatcher: boolean;
        forcedReason?: string;
    } | null;
};

type OperationException = {
    id: string;
    type: string;
    severity: 'info' | 'warning' | 'blocking' | string;
    title: string;
    message?: string | null;
    status?: string;
    tripId?: string | null;
    tripNumber?: string | null;
    createdAt?: string;
    data?: Record<string, unknown>;
};

type OperationExceptionsPayload = {
    summary?: {
        blocking?: number;
        warning?: number;
        info?: number;
    };
    exceptions?: OperationException[];
};

type CitySearchResult = {
    value: string;
    city: string;
    fiasId: string;
    lat: number;
    lon: number;
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

// D9: dispatcher onboarding tour steps. Each `targetSelector` points to an
// element with a matching `data-tour="..."` attribute on this page.
const DISPATCHER_TOUR_STEPS: TourStep[] = [
    {
        targetSelector: '[data-tour="dispatcher-stats"]',
        title: 'Статус автопарка',
        description: 'Здесь видно, сколько ТС свободно, назначено, в рейсе и сколько с проблемами. Цифры обновляются в реальном времени.',
        position: 'bottom',
    },
    {
        targetSelector: '[data-tour="dispatcher-map"]',
        title: 'Это карта рейсов',
        description: 'Машины движутся в реальном времени. Кликните маркер, чтобы открыть детали рейса и плановый маршрут.',
        position: 'top',
    },
    {
        targetSelector: '[data-tour="dispatcher-orders"]',
        title: 'Активные заказы',
        description: 'Список нераспределённых заявок. Перетащите заявку на ТС, чтобы назначить рейс.',
        position: 'left',
    },
    {
        targetSelector: '[data-tour-secondary="dispatcher-new-order"]',
        title: 'Создать новый заказ',
        description: 'Откроется мастер заявки: контрагент, груз, точки погрузки/выгрузки, требования.',
        position: 'left',
    },
    {
        targetSelector: '[data-tour="dispatcher-copilot"]',
        title: 'AI-копилот',
        description: 'Спросите его текстом: «Сколько свободных тентовиков?», «Покажи рейсы с риском срыва». Копилот сам ходит в данные и отвечает.',
        position: 'left',
    },
    {
        targetSelector: '[data-tour="dispatcher-timeline"]',
        title: 'Тайм-лайн машин',
        description: 'Переключитесь сюда, чтобы увидеть загрузку каждой машины по часам — удобно для планирования следующего дня.',
        position: 'top',
    },
];

export default function DispatcherPage() {
    const [selectedVehicle, setSelectedVehicle] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'map' | 'timeline'>('map');

    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [orders, setOrders] = useState<UnassignedOrder[]>([]);
    const [trips, setTrips] = useState<TripForTimeline[]>([]);
    const [exceptions, setExceptions] = useState<OperationException[]>([]);
    const [coldChainBreaches, setColdChainBreaches] = useState<Array<{
        tripId: string;
        tripNumber: string;
        breachCount: number;
        minC: number | null;
        maxC: number | null;
        lastAt: string | null;
    }>>([]);
    const [coldChainOpen, setColdChainOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [tripRoutePoints, setTripRoutePoints] = useState<RoutePoint[]>([]);
    const [activeTripDetails, setActiveTripDetails] = useState<ActiveTripDetails | null>(null);
    const [mapInstance, setMapInstance] = useState<any>(null);

    // Force-close modal state
    const [forceCloseOpen, setForceCloseOpen] = useState(false);
    const [forceReason, setForceReason] = useState('no_mobile');
    const [forceNote, setForceNote] = useState('');
    const [forceLoading, setForceLoading] = useState(false);

    const [selectedCity, setSelectedCity] = useState<CitySearchResult | null>(null);
    const [vehicleSearch, setVehicleSearch] = useState('');
    const [vehicleStatusFilter, setVehicleStatusFilter] = useState('');
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    const showToast = useCallback((message: string, type: 'success' | 'error' = 'error') => {
        setToast({ message, type });
        if (toastTimer.current) clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToast(null), 4000);
    }, []);
    // Real-time vehicle positions via WebSocket
    const { positions: wsPositions, isConnected: wsConnected } = useVehiclePositions();

    const { user } = useUser();
    const isAdmin = !!user?.roles?.includes('admin');
    const showCopilot = userCanUseCopilot(user?.roles);

    // Derive list of active-trip vehicles for live GPS subscription
    const activeTripSubs = useMemo<ActiveVehicleSubscription[]>(() => {
        const activeStatuses = new Set(['in_transit', 'loading', 'waybill_issued']);
        const seen = new Map<string, ActiveVehicleSubscription>();
        for (const t of trips) {
            if (!t.vehicleId || !activeStatuses.has(t.status)) continue;
            if (seen.has(t.vehicleId)) continue;
            const v = vehicles.find(x => x.id === t.vehicleId);
            seen.set(t.vehicleId, { vehicleId: t.vehicleId, plateNumber: v?.plateNumber || t.vehicle?.plateNumber });
        }
        return Array.from(seen.values());
    }, [trips, vehicles]);

    const liveWialonMarkers = useWialonPositions(activeTripSubs);

    const liveMarkersList = useMemo<LiveGpsMarker[]>(() => {
        return Object.values(liveWialonMarkers).map(m => ({
            vehicleId: m.vehicleId,
            plateNumber: m.plateNumber,
            latitude: m.position.latitude,
            longitude: m.position.longitude,
            speedKmh: m.position.speedKmh,
            headingDeg: m.position.headingDeg,
            recordedAt: m.position.recordedAt,
        }));
    }, [liveWialonMarkers]);

    // Mock simulator state (admin-only)
    const [simulatorOpen, setSimulatorOpen] = useState(false);
    const [runningSims, setRunningSims] = useState<Record<string, boolean>>({});
    const [simBusy, setSimBusy] = useState<Record<string, boolean>>({});

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

    // Load vehicles, orders, trips, and operational exceptions
    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [vehiclesResult, ordersResult, tripsResult, exceptionsResult] = await Promise.allSettled([
                api.get('/fleet/vehicles?limit=100'),
                api.get('/orders?status=confirmed&limit=50'),
                api.get('/trips?limit=100'),
                api.get('/operations/exceptions?limit=50&includeInfo=true'),
            ]);

            if (vehiclesResult.status === 'fulfilled' && (vehiclesResult.value as any).success) {
                setVehicles(Array.isArray((vehiclesResult.value as any).data) ? (vehiclesResult.value as any).data : []);
            } else if (vehiclesResult.status === 'rejected') {
                console.error('Failed to load vehicles for dispatcher', vehiclesResult.reason);
            }

            if (ordersResult.status === 'fulfilled' && (ordersResult.value as any).success) {
                setOrders(Array.isArray((ordersResult.value as any).data) ? (ordersResult.value as any).data : []);
            } else if (ordersResult.status === 'rejected') {
                console.error('Failed to load orders for dispatcher', ordersResult.reason);
            }

            if (tripsResult.status === 'fulfilled' && (tripsResult.value as any).success) {
                setTrips(Array.isArray((tripsResult.value as any).data) ? (tripsResult.value as any).data : []);
            } else if (tripsResult.status === 'rejected') {
                console.error('Failed to load trips for dispatcher', tripsResult.reason);
            }

            if (exceptionsResult.status === 'fulfilled' && (exceptionsResult.value as any).success) {
                const payload = (exceptionsResult.value as any).data as OperationExceptionsPayload;
                setExceptions(Array.isArray(payload?.exceptions) ? payload.exceptions : []);
            } else if (exceptionsResult.status === 'rejected') {
                console.error('Failed to load operations exceptions for dispatcher', exceptionsResult.reason);
            }
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
        const intervalId = setInterval(loadData, 30000); // reduced frequency since WS handles positions
        return () => clearInterval(intervalId);
    }, [loadData]);

    // Cold-chain breach poller (every 60s) — iterates active trips and counts breaches in last 24h
    const loadColdChainBreaches = useCallback(async () => {
        try {
            const activeTrips = trips.filter(t =>
                t.status === 'in_transit' || t.status === 'loading' || t.status === 'waybill_issued',
            );
            if (activeTrips.length === 0) {
                setColdChainBreaches([]);
                return;
            }
            const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
            const results = await Promise.allSettled(
                activeTrips.slice(0, 30).map(async (trip) => {
                    const sumRes = await api.get<{ success: boolean; data: any }>(
                        `/trips/${trip.id}/temperature-summary`,
                    );
                    if (!sumRes.success || !sumRes.data) return null;
                    const s = sumRes.data;
                    const breachCount = Number(s?.breachCount || 0);
                    const lastAt = s?.lastAt ? String(s.lastAt) : null;
                    if (breachCount <= 0) return null;
                    if (lastAt && new Date(lastAt).getTime() < new Date(since).getTime()) {
                        return null;
                    }
                    return {
                        tripId: trip.id,
                        tripNumber: trip.number,
                        breachCount,
                        minC: s?.minC === null || s?.minC === undefined ? null : Number(s.minC),
                        maxC: s?.maxC === null || s?.maxC === undefined ? null : Number(s.maxC),
                        lastAt,
                    };
                }),
            );
            const next: typeof coldChainBreaches = [];
            for (const r of results) {
                if (r.status === 'fulfilled' && r.value) next.push(r.value);
            }
            setColdChainBreaches(next);
        } catch {
            // silent
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [trips]);

    useEffect(() => {
        loadColdChainBreaches();
        const id = setInterval(loadColdChainBreaches, 60000);
        return () => clearInterval(id);
    }, [loadColdChainBreaches]);

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
                    const confData = await api.get(`/trips/${trip.id}/delivery-confirmation`).catch(() => null);
                    const confirmation = (confData as any)?.success ? (confData as any).data : null;

                    setActiveTripDetails({
                        id: trip.id,
                        number: trip.number,
                        status: trip.status,
                        driverName: trip.driverName || trip.driver?.fullName,
                        vehiclePlate: trip.vehicle?.plateNumber || vehicles.find(v => v.id === trip.vehicleId)?.plateNumber,
                        waybillId: trip.waybillId || undefined,
                        routePoints: points,
                        totalPoints: points.length,
                        completedPoints: points.filter((p: RoutePoint) => p.status === 'completed').length,
                        deliveryConfirmation: confirmation,
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


    useEffect(() => {
        if (!selectedCity || !mapInstance) return;

        mapInstance.invalidateSize?.();
        mapInstance.flyTo([selectedCity.lat, selectedCity.lon], 12, { duration: 1.5 });
    }, [selectedCity, mapInstance]);

    const handleForceClose = async () => {
        if (!activeTripDetails) return;
        setForceLoading(true);
        try {
            await api.post(`/trips/${activeTripDetails.id}/delivery-confirmation`, {
                recipientName: 'Принудительное закрытие диспетчером',
                cargoCondition: 'intact',
                forcedByDispatcher: true,
                forcedReason: forceReason,
                forcedReasonNote: forceNote || undefined,
            });
            await api.post(`/trips/${activeTripDetails.id}/status`, { status: 'completed' });
            setForceCloseOpen(false);
            setForceNote('');
            setForceReason('no_mobile');
            setActiveTripDetails(null);
            setSelectedVehicle(null);
            loadData();
        } catch (e: any) {
            showToast(e?.message || 'Не удалось завершить рейс');
        } finally {
            setForceLoading(false);
        }
    };

    // Build timeline from real data
    const timelineData = buildTimelineData(vehicles, trips);

    // Vehicles with coordinates (visible on map)
    const vehiclesOnMap = useMemo(() => {
        let list = enrichedVehicles.filter(v => v.lat && v.lon);
        if (vehicleStatusFilter) list = list.filter(v => v.status === vehicleStatusFilter);
        if (vehicleSearch.trim()) {
            const q = vehicleSearch.toLowerCase();
            list = list.filter(v =>
                v.plateNumber.toLowerCase().includes(q) ||
                (v.driverName && v.driverName.toLowerCase().includes(q)) ||
                `${v.make} ${v.model}`.toLowerCase().includes(q)
            );
        }
        return list;
    }, [enrichedVehicles, vehicleSearch, vehicleStatusFilter]);

    // Stats
    const vehicleStats = {
        available: enrichedVehicles.filter(v => v.status === 'available').length,
        assigned: enrichedVehicles.filter(v => v.status === 'assigned').length,
        inTrip: enrichedVehicles.filter(v => v.status === 'in_trip').length,
        problem: enrichedVehicles.filter(v => ['broken', 'maintenance'].includes(v.status)).length,
    };

    const exceptionStats = {
        blocking: exceptions.filter(e => e.severity === 'blocking').length,
        warning: exceptions.filter(e => e.severity === 'warning').length,
        info: exceptions.filter(e => e.severity === 'info').length,
    };

    const exceptionSeverityClass = (severity: string) => {
        if (severity === 'blocking') return 'border-red-200 bg-red-50 text-red-700';
        if (severity === 'warning') return 'border-amber-200 bg-amber-50 text-amber-700';
        return 'border-blue-200 bg-blue-50 text-blue-700';
    };

    const exceptionSeverityLabel = (severity: string) => {
        if (severity === 'blocking') return 'Блокер';
        if (severity === 'warning') return 'Риск';
        return 'Инфо';
    };

    return (
        <div className="space-y-6" data-tour="dispatcher-root">
            {/* D9 Onboarding tour for first-time dispatcher visit */}
            <OnboardingTour
                storageKey="tms_tour_completed_dispatcher_v1"
                steps={DISPATCHER_TOUR_STEPS}
            />
            {/* Toast */}
            {toast && (
                <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-xl shadow-lg text-white font-medium text-sm ${toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'}`}>
                    {toast.message}
                </div>
            )}

            {/* Header */}
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
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
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-tour="dispatcher-stats">
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

            {/* Operational cockpit */}
            <Card className="border-slate-200">
                <CardContent className="p-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between mb-4">
                        <div>
                            <div className="flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4 text-amber-500" />
                                <h2 className="text-sm font-semibold text-slate-900">Операционный cockpit</h2>
                            </div>
                            <p className="text-xs text-slate-500 mt-1">Разделение заявок, перегруз, замены, простои, возврат машины, отдых экипажа и ЭТРН-блокеры</p>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center w-full lg:w-auto">
                            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2">
                                <div className="text-lg font-bold text-red-700">{exceptionStats.blocking}</div>
                                <div className="text-[11px] font-medium text-red-600">Блокеры</div>
                            </div>
                            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                                <div className="text-lg font-bold text-amber-700">{exceptionStats.warning}</div>
                                <div className="text-[11px] font-medium text-amber-600">Риски</div>
                            </div>
                            <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2">
                                <div className="text-lg font-bold text-blue-700">{exceptionStats.info}</div>
                                <div className="text-[11px] font-medium text-blue-600">Инфо</div>
                            </div>
                        </div>
                    </div>

                    {exceptions.length === 0 ? (
                        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                            <CheckCircle2 className="w-4 h-4" />
                            Нет открытых операционных исключений
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                            {exceptions.slice(0, 6).map(item => (
                                <div key={item.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${exceptionSeverityClass(item.severity)}`}>
                                                    {exceptionSeverityLabel(item.severity)}
                                                </span>
                                                {item.tripNumber && (
                                                    <span className="text-[11px] font-medium text-slate-500 truncate">Рейс {item.tripNumber}</span>
                                                )}
                                            </div>
                                            <div className="text-sm font-semibold text-slate-900 truncate">{item.title}</div>
                                            {item.message && <div className="text-xs text-slate-500 line-clamp-2 mt-0.5">{item.message}</div>}
                                        </div>
                                        <span className="text-[11px] text-slate-400 shrink-0">{item.type}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Cold-chain alerts widget */}
            <Card className={coldChainBreaches.length > 0 ? 'border-rose-300' : 'border-slate-200'}>
                <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-2">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                                coldChainBreaches.length > 0
                                    ? 'bg-rose-100 text-rose-700'
                                    : 'bg-blue-50 text-blue-600'
                            }`}>
                                <Thermometer className="w-5 h-5" />
                            </div>
                            <div>
                                <h2 className="text-sm font-semibold text-slate-900">Холодовая цепь</h2>
                                <p className="text-xs text-slate-500">Активные нарушения SLA за 24ч</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className={`text-2xl font-bold ${
                                coldChainBreaches.length > 0 ? 'text-rose-700' : 'text-slate-900'
                            }`}>
                                {coldChainBreaches.length}
                            </div>
                            {coldChainBreaches.length > 0 && (
                                <button
                                    type="button"
                                    onClick={() => setColdChainOpen(v => !v)}
                                    className="text-xs font-semibold text-rose-700 hover:underline"
                                >
                                    {coldChainOpen ? 'Скрыть' : 'Показать'} рейсы
                                </button>
                            )}
                        </div>
                    </div>
                    {coldChainBreaches.length === 0 ? (
                        <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                            <CheckCircle2 className="w-4 h-4" />
                            Нарушений температурного режима не зафиксировано
                        </div>
                    ) : coldChainOpen ? (
                        <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-2">
                            {coldChainBreaches.map(item => (
                                <a
                                    key={item.tripId}
                                    href={`/trips?focus=${item.tripId}`}
                                    onClick={(e) => {
                                        e.preventDefault();
                                        window.location.href = `/trips`;
                                    }}
                                    className="rounded-lg border border-rose-200 bg-rose-50/60 px-3 py-2 hover:bg-rose-100 transition-colors"
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-sm font-semibold text-rose-800">
                                            Рейс {item.tripNumber}
                                        </span>
                                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-200 px-2 py-0.5 text-[11px] font-semibold text-rose-800">
                                            <AlertTriangle className="w-3 h-3" />
                                            {item.breachCount}
                                        </span>
                                    </div>
                                    <div className="text-xs text-rose-700 mt-1">
                                        Мин {item.minC !== null ? `${item.minC.toFixed(1)}°` : '—'} / макс {item.maxC !== null ? `${item.maxC.toFixed(1)}°` : '—'}
                                    </div>
                                </a>
                            ))}
                        </div>
                    ) : null}
                </CardContent>
            </Card>

            {/* Tab switcher + map search */}
            <div className="flex items-center gap-3">
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

                {activeTab === 'map' && (
                    <Combobox<CitySearchResult>
                        placeholder="Перейти к городу..."
                        icon={<Search className="w-4 h-4" />}
                        className="w-64"
                        minChars={3}
                        onSearch={async (q) => {
                            try {
                                const res = await fetch(
                                    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&accept-language=ru&countrycodes=ru`,
                                    { headers: { 'User-Agent': 'TMS-Dispatcher/1.0' } }
                                );
                                if (!res.ok) return [];
                                const data = await res.json();
                                return data.map((item: any) => ({
                                    value: item.display_name,
                                    city: item.display_name.split(',')[0],
                                    fiasId: String(item.place_id),
                                    lat: parseFloat(item.lat),
                                    lon: parseFloat(item.lon),
                                }));
                            } catch (err) {
                                console.warn('Nominatim search failed:', err);
                                showToast('Ошибка поиска города. Проверьте подключение к интернету.', 'error');
                                return [];
                            }
                        }}
                        onSelect={(item) => {
                            setSelectedCity(item);
                        }}
                        getKey={(s) => s.fiasId}
                        getLabel={(s) => s.city}
                        emptyMessage="Город не найден"
                        renderOption={(s) => (
                            <div className="flex items-center gap-2">
                                <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                                <span>{s.value}</span>
                            </div>
                        )}
                    />
                )}
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
                        <div data-tour="dispatcher-map">
                            <DispatcherMap
                                vehicles={enrichedVehicles}
                                selectedVehicle={selectedVehicle}
                                onSelectVehicle={setSelectedVehicle}
                                tripRoutePoints={tripRoutePoints}
                                onMapReady={setMapInstance}
                                liveMarkers={liveMarkersList}
                            />
                        </div>
                    ) : (
                        <div data-tour="dispatcher-timeline">
                            <VehicleTimeline data={timelineData} />
                        </div>
                    )}

                    {/* Trip Details Panel */}
                    {activeTripDetails && (
                        <>
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

                                {/* Delivery confirmation badge */}
                                {activeTripDetails.deliveryConfirmation && (
                                    <div className="mt-3 pt-3 border-t border-slate-100">
                                        <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                                            <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                                            <div className="text-xs space-y-0.5">
                                                <p className="font-semibold text-emerald-800">
                                                    Доставка подтверждена
                                                    {activeTripDetails.deliveryConfirmation.forcedByDispatcher && (
                                                        <span className="ml-1.5 text-amber-700 font-normal">(принудительно)</span>
                                                    )}
                                                </p>
                                                <p className="text-emerald-700">Получатель: {activeTripDetails.deliveryConfirmation.recipientName}</p>
                                                <p className="text-emerald-600">
                                                    Груз: {activeTripDetails.deliveryConfirmation.cargoCondition === 'intact' ? 'целый'
                                                        : activeTripDetails.deliveryConfirmation.cargoCondition === 'damaged' ? 'повреждён' : 'частичная недостача'}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* ЭТрН download button (Sprint 14) */}
                                {activeTripDetails.waybillId && (
                                    <div className="mt-3 pt-3 border-t border-slate-100">
                                        <button
                                            onClick={async () => {
                                                try {
                                                    await downloadFromApi(`/api/waybills/${activeTripDetails.waybillId}/etrn`, `etrn_${activeTripDetails.number}.xml`);
                                                } catch (e: any) {
                                                    showToast(e?.message || 'Ошибка загрузки ЭТрН');
                                                }
                                            }}
                                            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 text-xs font-semibold hover:bg-indigo-100 transition-colors"
                                        >
                                            <FileDown className="w-3.5 h-3.5" />
                                            Скачать ЭТрН (XML)
                                        </button>
                                    </div>
                                )}

                                {/* Force-close button for in_transit trips without confirmation */}
                                {activeTripDetails.status === 'in_transit' && !activeTripDetails.deliveryConfirmation && (
                                    <div className="mt-3 pt-3 border-t border-slate-100">
                                        <button
                                            onClick={() => setForceCloseOpen(true)}
                                            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg border border-red-200 bg-red-50 text-red-700 text-xs font-semibold hover:bg-red-100 transition-colors"
                                        >
                                            <AlertTriangle className="w-3.5 h-3.5" />
                                            Принудительно завершить рейс
                                        </button>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Force-close modal */}
                        {forceCloseOpen && activeTripDetails && (
                            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                                <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-2">
                                            <AlertTriangle className="w-5 h-5 text-red-600" />
                                            <h3 className="text-base font-bold text-slate-900">Принудительное завершение</h3>
                                        </div>
                                        <button onClick={() => setForceCloseOpen(false)} className="text-slate-400 hover:text-slate-600">
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                    <p className="text-sm text-slate-500 mb-4">
                                        Рейс <span className="font-mono font-semibold text-slate-700">{activeTripDetails.number}</span> будет завершён без подтверждения от водителя. Укажите причину.
                                    </p>

                                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Причина *</label>
                                    <select
                                        value={forceReason}
                                        onChange={e => setForceReason(e.target.value)}
                                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mb-3 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-red-300"
                                    >
                                        <option value="no_mobile">Нет мобильного устройства</option>
                                        <option value="no_internet">Нет интернета</option>
                                        <option value="recipient_refused">Получатель отказался подписывать</option>
                                        <option value="other">Другое</option>
                                    </select>

                                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                                        Комментарий {forceReason === 'other' && <span className="text-red-500">*</span>}
                                    </label>
                                    <textarea
                                        value={forceNote}
                                        onChange={e => setForceNote(e.target.value)}
                                        rows={3}
                                        placeholder="Подробности..."
                                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mb-4 bg-slate-50 resize-none focus:outline-none focus:ring-2 focus:ring-red-300"
                                    />

                                    <div className="flex gap-3">
                                        <button
                                            onClick={() => setForceCloseOpen(false)}
                                            disabled={forceLoading}
                                            className="flex-1 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
                                        >
                                            Отмена
                                        </button>
                                        <button
                                            onClick={handleForceClose}
                                            disabled={forceLoading || (forceReason === 'other' && !forceNote.trim())}
                                            className="flex-1 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                                        >
                                            {forceLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                            Завершить рейс
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                        </>
                    )}
                </div>

                <div className="col-span-1 space-y-4">
                    {/* Vehicle list panel */}
                    <Card>
                        <CardContent className="p-4">
                            <div className="flex items-center gap-2 mb-3">
                                <Truck className="w-4 h-4 text-emerald-600" />
                                <h3 className="text-sm font-bold text-slate-800">Транспорт на карте</h3>
                                <span className="ml-auto text-xs text-slate-400">{vehiclesOnMap.length}</span>
                            </div>
                            <div className="flex gap-2 mb-3">
                                <div className="relative flex-1">
                                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                                    <input
                                        type="text"
                                        value={vehicleSearch}
                                        onChange={e => setVehicleSearch(e.target.value)}
                                        placeholder="Номер, водитель..."
                                        className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-300"
                                    />
                                </div>
                                <select
                                    value={vehicleStatusFilter}
                                    onChange={e => setVehicleStatusFilter(e.target.value)}
                                    className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-300"
                                >
                                    <option value="">Все</option>
                                    <option value="available">Свободны</option>
                                    <option value="assigned">Назначены</option>
                                    <option value="in_trip">В рейсе</option>
                                    <option value="broken">Неисправны</option>
                                </select>
                            </div>
                            <div className="space-y-1 max-h-[320px] overflow-y-auto">
                                {vehiclesOnMap.length === 0 && (
                                    <p className="text-xs text-slate-400 text-center py-4">Нет ТС с координатами</p>
                                )}
                                {vehiclesOnMap.map(v => {
                                    const statusColors: Record<string, string> = {
                                        available: 'bg-emerald-500',
                                        assigned: 'bg-amber-500',
                                        in_trip: 'bg-blue-500',
                                        broken: 'bg-red-500',
                                        maintenance: 'bg-slate-400',
                                    };
                                    return (
                                        <button
                                            key={v.id}
                                            onClick={() => {
                                                setSelectedVehicle(v.id);
                                                if (mapInstance && v.lat && v.lon) {
                                                    mapInstance.flyTo([v.lat, v.lon], 14, { duration: 1 });
                                                }
                                            }}
                                            className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors ${
                                                selectedVehicle === v.id
                                                    ? 'bg-emerald-50 border border-emerald-200'
                                                    : 'hover:bg-slate-50 border border-transparent'
                                            }`}
                                        >
                                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${statusColors[v.status] || 'bg-slate-400'}`} />
                                            <div className="min-w-0 flex-1">
                                                <p className="text-xs font-semibold text-slate-800 truncate">{v.plateNumber}</p>
                                                <p className="text-[10px] text-slate-400 truncate">{v.driverName || `${v.make} ${v.model}`}</p>
                                            </div>
                                            <MapPin className="w-3 h-3 text-slate-300 flex-shrink-0" />
                                        </button>
                                    );
                                })}
                            </div>
                        </CardContent>
                    </Card>
                    {isAdmin && (
                        <Card>
                            <CardContent className="p-4">
                                <div className="flex items-center gap-2 mb-3">
                                    <Wifi className="w-4 h-4 text-purple-500" />
                                    <h3 className="text-sm font-bold text-slate-800">Симулятор GPS</h3>
                                    <span className="ml-auto text-xs text-slate-400">{activeTripSubs.length} активных</span>
                                    <button
                                        type="button"
                                        onClick={() => setSimulatorOpen(o => !o)}
                                        className="text-xs font-semibold text-purple-700 hover:underline"
                                    >
                                        {simulatorOpen ? 'Скрыть' : 'Показать'}
                                    </button>
                                </div>
                                {simulatorOpen && (
                                    <div className="space-y-1.5 max-h-[260px] overflow-y-auto">
                                        {trips
                                            .filter(t => t.vehicleId && (t.status === 'in_transit' || t.status === 'loading' || t.status === 'waybill_issued'))
                                            .map(trip => {
                                                const v = vehicles.find(x => x.id === trip.vehicleId);
                                                const plate = v?.plateNumber || trip.vehicle?.plateNumber || trip.vehicleId;
                                                const running = !!runningSims[trip.vehicleId!];
                                                const busy = !!simBusy[trip.vehicleId!];
                                                return (
                                                    <div key={trip.id} className="flex items-center gap-2 px-2.5 py-2 rounded-lg border border-slate-100 bg-slate-50">
                                                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${running ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
                                                        <div className="min-w-0 flex-1">
                                                            <p className="text-xs font-semibold text-slate-800 truncate">{plate}</p>
                                                            <p className="text-[10px] text-slate-400 truncate">Рейс {trip.number}</p>
                                                        </div>
                                                        {running ? (
                                                            <button
                                                                disabled={busy}
                                                                onClick={async () => {
                                                                    if (!trip.vehicleId) return;
                                                                    setSimBusy(s => ({ ...s, [trip.vehicleId!]: true }));
                                                                    try {
                                                                        await api.post('/integrations/wialon-mock/stop', { vehicleId: trip.vehicleId });
                                                                        setRunningSims(s => ({ ...s, [trip.vehicleId!]: false }));
                                                                        showToast('Симуляция остановлена', 'success');
                                                                    } catch (e: any) {
                                                                        showToast(e?.message || 'Ошибка остановки');
                                                                    } finally {
                                                                        setSimBusy(s => ({ ...s, [trip.vehicleId!]: false }));
                                                                    }
                                                                }}
                                                                className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-rose-100 text-rose-700 hover:bg-rose-200 disabled:opacity-50"
                                                            >
                                                                {busy ? '…' : '⏹ Стоп'}
                                                            </button>
                                                        ) : (
                                                            <button
                                                                disabled={busy}
                                                                onClick={async () => {
                                                                    if (!trip.vehicleId) return;
                                                                    setSimBusy(s => ({ ...s, [trip.vehicleId!]: true }));
                                                                    try {
                                                                        await api.post('/integrations/wialon-mock/start', { vehicleId: trip.vehicleId, tripId: trip.id });
                                                                        setRunningSims(s => ({ ...s, [trip.vehicleId!]: true }));
                                                                        showToast('Симуляция запущена', 'success');
                                                                    } catch (e: any) {
                                                                        showToast(e?.message || 'Ошибка запуска');
                                                                    } finally {
                                                                        setSimBusy(s => ({ ...s, [trip.vehicleId!]: false }));
                                                                    }
                                                                }}
                                                                className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-emerald-100 text-emerald-700 hover:bg-emerald-200 disabled:opacity-50"
                                                            >
                                                                {busy ? '…' : '▶ Старт'}
                                                            </button>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        {activeTripSubs.length === 0 && (
                                            <p className="text-xs text-slate-400 text-center py-3">Нет активных рейсов</p>
                                        )}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )}
                    <div data-tour="dispatcher-orders" data-tour-secondary="dispatcher-new-order" id="dispatcher-orders-anchor">
                    <AssignmentPanel
                        orders={orders}
                        vehicles={enrichedVehicles.filter(v => v.status === 'available')}
                        onAssign={async (orderId, vehicleId, windows) => {
                            const order = orders.find(o => o.id === orderId);
                            if (!order) return;

                            await api.post('/trips', {
                                vehicleId,
                                orderIds: [orderId],
                                routePoints: [
                                    {
                                        type: 'loading',
                                        address: order.loadingAddress,
                                        sequenceNumber: 1,
                                        windowFrom: windows?.loadingFrom || undefined,
                                        windowTo: windows?.loadingTo || undefined,
                                    },
                                    {
                                        type: 'unloading',
                                        address: order.unloadingAddress,
                                        sequenceNumber: 2,
                                        windowFrom: windows?.unloadingFrom || undefined,
                                        windowTo: windows?.unloadingTo || undefined,
                                    },
                                ],
                            });

                            loadData();
                        }}
                    />
                    </div>
                </div>
            </div>
            <div data-tour="dispatcher-copilot">
                {showCopilot && <CopilotChat />}
            </div>
        </div>
    );
}
