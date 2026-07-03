'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Map as MapIcon,
    Loader2,
    Info,
    Truck,
    User,
    MapPin,
    Search,
    AlertTriangle,
    CheckCircle2,
    X,
    FileDown,
    Wifi,
    PanelLeftClose,
    PanelRightClose,
    PanelLeftOpen,
    PanelRightOpen,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { CockpitTopBar, type CockpitFilter } from './components/CockpitTopBar';
import { CockpitLeftRail, type LiveTrip } from './components/CockpitLeftRail';
import { CockpitRightPanel } from './components/CockpitRightPanel';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Combobox } from '@/components/ui/Combobox';
import {
    localizeExceptionTitle as localizeExceptionTitleImpl,
    localizeExceptionMessage as localizeExceptionMessageImpl,
} from './exception-localization';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { downloadFromApi } from '@/lib/download';
import { useVehiclePositions } from '@/hooks/useVehiclePositions';
import { useWialonPositions, type ActiveVehicleSubscription } from '@/hooks/useWialonPositions';
import { useUser } from '@/lib/user-context';
import { userCanUseCopilot } from '@tms/shared';
import { CopilotFab } from '@/components/CopilotFab';
import { OnboardingTour, type TourStep } from '@/components/OnboardingTour';
import type { RoutePoint } from './components/TripRouteLayer';
import type { LiveGpsMarker } from './components/DispatcherMap';

// Leaflet must be loaded client-side only
const DispatcherMap = dynamic(
    () => import('./components/DispatcherMap').then(mod => mod.DispatcherMap),
    {
        ssr: false, loading: () => (
            <div className="h-full w-full bg-neutral-100 flex items-center justify-center">
                <div className="text-neutral-400 flex items-center gap-2">
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
    fromCity?: string;
    toCity?: string;
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

// D9: dispatcher onboarding tour steps. Each `targetSelector` points to an
// element with a matching `data-tour="..."` attribute on this page.
const DISPATCHER_TOUR_STEPS: TourStep[] = [
    {
        targetSelector: '[data-tour="dispatcher-stats"]',
        title: 'Статус операций',
        description: 'Здесь видно сколько блокеров, рисков и нормальных событий. Клик по пилюле фильтрует левый список.',
        position: 'bottom',
    },
    {
        targetSelector: '[data-tour="dispatcher-map"]',
        title: 'Это карта рейсов',
        description: 'Машины движутся в реальном времени. Кликните маркер или строку в левом списке, чтобы открыть детали рейса.',
        position: 'top',
    },
    {
        targetSelector: '[data-tour="dispatcher-orders"]',
        title: 'Активные заказы',
        description: 'Список нераспределённых заявок справа. Перетащите заявку на ТС, чтобы назначить рейс.',
        position: 'left',
    },
    {
        targetSelector: '[data-tour-secondary="dispatcher-new-order"]',
        title: 'Создать новый заказ',
        description: 'Откроется мастер заявки: контрагент, груз, точки погрузки/выгрузки, требования.',
        position: 'left',
    },
    {
        targetSelector: '[data-tour="copilot-fab"]',
        title: 'AI-копилот',
        description: 'Нажмите плавающую кнопку внизу справа. Спросите текстом: «Сколько свободных тентовиков?», «Покажи рейсы с риском срыва».',
        position: 'left',
    },
];

export default function DispatcherPage() {
    const [selectedVehicle, setSelectedVehicle] = useState<string | null>(null);

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
    const [topbarSearch, setTopbarSearch] = useState('');
    const [activeFilter, setActiveFilter] = useState<CockpitFilter>('all');
    const [darkMode, setDarkMode] = useState(false);

    // Responsive panel toggles
    const [leftRailOpen, setLeftRailOpen] = useState(true);
    const [rightPanelOpen, setRightPanelOpen] = useState(true);

    const { toast } = useToast();

    const showToast = useCallback((message: string, type: 'success' | 'error' = 'error') => {
        toast({
            variant: type === 'success' ? 'success' : 'error',
            title: type === 'success' ? 'Готово' : 'Ошибка',
            description: message,
        });
    }, [toast]);

    // Dark mode toggle — control-tower theme
    useEffect(() => {
        const root = document.documentElement;
        if (darkMode) root.classList.add('dark');
        else root.classList.remove('dark');
        return () => root.classList.remove('dark');
    }, [darkMode]);

    // Adapt to narrow viewports
    useEffect(() => {
        const update = () => {
            const w = window.innerWidth;
            if (w < 1024) {
                setLeftRailOpen(false);
                setRightPanelOpen(false);
            } else if (w < 1280) {
                setLeftRailOpen(true);
                setRightPanelOpen(false);
            } else {
                setLeftRailOpen(true);
                setRightPanelOpen(true);
            }
        };
        update();
        window.addEventListener('resize', update);
        return () => window.removeEventListener('resize', update);
    }, []);

    // Real-time vehicle positions via WebSocket
    const { positions: wsPositions, isConnected: wsConnected } = useVehiclePositions();

    const { user } = useUser();
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
            type ListResponse<T> = { success: boolean; data: T[] };
            type ExceptionsResponse = { success: boolean; data: OperationExceptionsPayload };
            const [vehiclesResult, ordersResult, tripsResult, exceptionsResult] = await Promise.allSettled([
                api.get<ListResponse<Vehicle>>('/fleet/vehicles?limit=100'),
                api.get<ListResponse<UnassignedOrder>>('/orders?status=confirmed&limit=50'),
                api.get<ListResponse<TripForTimeline>>('/trips?limit=100'),
                api.get<ExceptionsResponse>('/operations/exceptions?limit=50&includeInfo=true'),
            ]);

            if (vehiclesResult.status === 'fulfilled' && vehiclesResult.value.success) {
                setVehicles(Array.isArray(vehiclesResult.value.data) ? vehiclesResult.value.data : []);
            } else if (vehiclesResult.status === 'rejected') {
                console.error('Failed to load vehicles for dispatcher', vehiclesResult.reason);
            }

            if (ordersResult.status === 'fulfilled' && ordersResult.value.success) {
                setOrders(Array.isArray(ordersResult.value.data) ? ordersResult.value.data : []);
            } else if (ordersResult.status === 'rejected') {
                console.error('Failed to load orders for dispatcher', ordersResult.reason);
            }

            if (tripsResult.status === 'fulfilled' && tripsResult.value.success) {
                setTrips(Array.isArray(tripsResult.value.data) ? tripsResult.value.data : []);
            } else if (tripsResult.status === 'rejected') {
                console.error('Failed to load trips for dispatcher', tripsResult.reason);
            }

            if (exceptionsResult.status === 'fulfilled' && exceptionsResult.value.success) {
                const payload = exceptionsResult.value.data;
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
        const intervalId = setInterval(() => {
            // A-P1-15: don't drain battery / metered data on background tabs
            if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
            loadData();
        }, 30000); // reduced frequency since WS handles positions
        return () => clearInterval(intervalId);
    }, [loadData]);

    // Cold-chain breach poller (every 60s)
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
        const id = setInterval(() => {
            // A-P1-15: pause cold-chain polling on background tabs
            if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
            loadColdChainBreaches();
        }, 60000);
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
                    type DeliveryConfirmation = {
                        recipientName: string;
                        cargoCondition: string;
                        confirmedAt: string;
                        forcedByDispatcher: boolean;
                        forcedReason?: string;
                    };
                    const confData = await api.get<{ success: boolean; data: DeliveryConfirmation }>(`/trips/${trip.id}/delivery-confirmation`).catch(() => null);
                    const confirmation = confData?.success ? confData.data : null;

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

    // Vehicles with coordinates (visible on map) — also respects topbar search
    const vehiclesOnMap = useMemo(() => {
        let list = enrichedVehicles.filter(v => v.lat && v.lon);
        if (vehicleStatusFilter) list = list.filter(v => v.status === vehicleStatusFilter);
        const q = (vehicleSearch || topbarSearch).trim().toLowerCase();
        if (q) {
            list = list.filter(v =>
                v.plateNumber.toLowerCase().includes(q) ||
                (v.driverName && v.driverName.toLowerCase().includes(q)) ||
                `${v.make} ${v.model}`.toLowerCase().includes(q)
            );
        }
        return list;
    }, [enrichedVehicles, vehicleSearch, vehicleStatusFilter, topbarSearch]);

    // Counts
    const exceptionStats = {
        blocking: exceptions.filter(e => e.severity === 'blocking').length,
        warning: exceptions.filter(e => e.severity === 'warning').length,
        info: exceptions.filter(e => e.severity === 'info').length,
    };

    // B-4 / B-22: exception localization maps + helpers live in
    // ./exception-localization.ts. Memoize stable callbacks here so prop
    // identity stays consistent for downstream components.
    const localizeExceptionTitle = useCallback(
        (item: OperationException) => localizeExceptionTitleImpl(item),
        [],
    );
    const localizeExceptionMessage = useCallback(
        (s: string | null | undefined) => localizeExceptionMessageImpl(s),
        [],
    );

    const isMojibake = useCallback((s: string | null | undefined): boolean => {
        if (!s) return true;
        const trimmed = s.trim();
        if (!trimmed) return true;
        return /^[\s?¿!.,;:\-_*#]+$/.test(trimmed);
    }, []);

    // Live trips fed to the left rail
    const liveTrips: LiveTrip[] = useMemo(() => {
        const activeStatuses = new Set(['in_transit', 'loading', 'waybill_issued']);
        const q = topbarSearch.trim().toLowerCase();
        return trips
            .filter(t => activeStatuses.has(t.status))
            .filter(t => {
                if (!q) return true;
                return (
                    t.number.toLowerCase().includes(q) ||
                    t.vehicle?.plateNumber?.toLowerCase().includes(q) ||
                    (t.driverName?.toLowerCase().includes(q))
                );
            })
            .map(t => ({
                id: t.id,
                number: t.number,
                status: t.status,
                vehiclePlate: t.vehicle?.plateNumber,
                fromCity: t.fromCity,
                toCity: t.toCity,
            }));
    }, [trips, topbarSearch]);

    const handleSelectTrip = useCallback((trip: LiveTrip) => {
        // C9: искали в БАЗОВОМ `vehicles` (без live WS-координат) → при активных
        // WS-позициях lat/lon отсутствовали и фокус карты молча не срабатывал.
        // enrichedVehicles мерджит wsPositions — берём координаты оттуда.
        const v = enrichedVehicles.find(x => x.plateNumber === trip.vehiclePlate);
        if (v && v.lat && v.lon) {
            setSelectedVehicle(v.id);
            if (mapInstance) {
                mapInstance.flyTo([v.lat, v.lon], 13, { duration: 1 });
            }
        }
    }, [enrichedVehicles, mapInstance]);

    // P3 (код-аудит 2026-06-14): клик по блокеру/риску в левом рейле был мёртвым
    // (onSelectException не пробрасывался). Фокусируем связанный рейс на карте.
    const handleSelectException = useCallback((item: OperationException) => {
        if (!item.tripId) return;
        const lt = liveTrips.find(t => t.id === item.tripId);
        if (lt) handleSelectTrip(lt);
    }, [liveTrips, handleSelectTrip]);

    const handleSelectVehicle = useCallback((vehicleId: string) => {
        setSelectedVehicle(vehicleId);
        const v = vehicles.find(x => x.id === vehicleId);
        if (v && v.lat && v.lon && mapInstance) {
            mapInstance.flyTo([v.lat, v.lon], 14, { duration: 1 });
        }
    }, [vehicles, mapInstance]);

    const handleAssign = useCallback(async (orderId: string, vehicleId: string, driverId: string, windows?: {
        loadingFrom?: string | null;
        loadingTo?: string | null;
        unloadingFrom?: string | null;
        unloadingTo?: string | null;
    }) => {
        const order = orders.find(o => o.id === orderId);
        if (!order) return;
        // F-11: раньше панель слала POST /trips без водителя — рейс застревал в
        // planning (тупик: ни осмотров, ни ПЛ, ни старта; UI-перехода
        // planning→assigned в досье нет). Теперь create + assign (vehicleId +
        // driverId) — как в CreateTripModal логиста; оба пути дают assigned.
        let createdTrip: { id: string; number?: string } | null = null;
        try {
            const created = await api.post<{ success: boolean; data: { id: string; number?: string } }>('/trips', {
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
            createdTrip = created?.data ?? null;
        } catch (e: any) {
            showToast(e?.message || 'Не удалось создать рейс', 'error');
            loadData();
            return;
        }
        try {
            if (!createdTrip?.id) throw new Error('Сервер не вернул id созданного рейса');
            await api.post(`/trips/${createdTrip.id}/assign`, { vehicleId, driverId });
            showToast(`Рейс ${createdTrip.number || ''} по заявке ${order.number} создан и назначен`.replace('  ', ' '), 'success');
        } catch (e: any) {
            // Рейс уже создан (planning) — не маскируем: показываем, что именно
            // отбило назначение (техосмотр/медосмотр/объём) и в каком он статусе.
            showToast(
                `Рейс создан (${createdTrip?.number || 'planning'}), но назначение отклонено: ${e?.message || 'неизвестная ошибка'}`,
                'error',
            );
        }
        loadData();
    }, [orders, loadData, showToast]);

    return (
        // Negative margins escape the LayoutShell's max-w-[1600px] padded wrapper
        // so the cockpit fills the full main viewport.
        <div className="-m-4 sm:-m-6 flex flex-col h-[calc(100vh-1rem)] bg-neutral-50" data-tour="dispatcher-root">
            <OnboardingTour
                storageKey="tms_tour_completed_dispatcher_v2"
                steps={DISPATCHER_TOUR_STEPS}
            />

            <CockpitTopBar
                wsConnected={wsConnected}
                loading={loading}
                onRefresh={loadData}
                blockingCount={exceptionStats.blocking}
                warningCount={exceptionStats.warning}
                okCount={exceptionStats.info}
                activeFilter={activeFilter}
                onFilterChange={setActiveFilter}
                search={topbarSearch}
                onSearchChange={setTopbarSearch}
                darkMode={darkMode}
                onToggleDarkMode={() => setDarkMode(d => !d)}
            />

            {/* T-39 (W3.5): GPS-данные сейчас идут с /integrations/wialon-mock
                endpoint'а — это эмулятор. Реальный Wialon-провайдер ещё в stub'е
                (T-28/T-31 backlog). Баннер чтобы пилотные пользователи не путали
                эмуляцию с боевыми треками. */}
            {liveWialonMarkers && Object.keys(liveWialonMarkers).length > 0 && (
                <div className="flex items-center gap-2 px-4 py-1.5 bg-warning-50 border-b border-warning-200 text-[11px] text-warning-900">
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-warning-200 text-warning-900 font-semibold uppercase tracking-wider text-[10px]">
                        Demo data
                    </span>
                    <span>
                        GPS-треки эмулируются (Wialon real-provider в backlog). Для пилота
                        с реальной телематикой — подключите Wialon credentials в
                        /admin/integrations.
                    </span>
                </div>
            )}

            <ErrorBoundary scope="dispatcher-panels">
            <div className="flex-1 flex min-h-0 relative">
                {/* Left rail */}
                {leftRailOpen ? (
                    <div className="relative">
                        <CockpitLeftRail
                            exceptions={exceptions}
                            liveTrips={liveTrips}
                            activeFilter={activeFilter}
                            onSelectTrip={handleSelectTrip}
                            onSelectException={handleSelectException}
                            localizeTitle={localizeExceptionTitle}
                            localizeMessage={localizeExceptionMessage}
                            isMojibake={isMojibake}
                        />
                        <button
                            type="button"
                            onClick={() => setLeftRailOpen(false)}
                            className="absolute top-2 -right-3 w-6 h-6 rounded-full bg-white border border-neutral-200 shadow-sm flex items-center justify-center text-neutral-400 hover:text-neutral-700 z-10"
                            title="Скрыть боковую панель"
                            aria-label="Скрыть боковую панель"
                        >
                            <PanelLeftClose className="w-3 h-3" />
                        </button>
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={() => setLeftRailOpen(true)}
                        className="self-start mt-2 ml-1 w-7 h-7 rounded-md bg-white border border-neutral-200 shadow-sm flex items-center justify-center text-neutral-500 hover:text-neutral-900"
                        title="Показать боковую панель"
                        aria-label="Показать боковую панель"
                    >
                        <PanelLeftOpen className="w-3.5 h-3.5" />
                    </button>
                )}

                {/* Map area — dominant */}
                <div className="flex-1 min-w-0 flex flex-col relative">
                    {/* Map controls row */}
                    <div className="absolute top-3 left-3 z-[1000] flex items-center gap-2">
                        <div className="w-full sm:w-64">
                            <Combobox<CitySearchResult>
                                placeholder="Перейти к городу..."
                                icon={<Search className="w-4 h-4" />}
                                className="w-full"
                                minChars={3}
                                // Nominatim has a strict usage policy + rate
                                // limits — keep keystrokes throttled so we
                                // only fire after the user pauses typing.
                                debounceMs={400}
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
                                onSelect={(item) => setSelectedCity(item)}
                                getKey={(s) => s.fiasId}
                                getLabel={(s) => s.city}
                                emptyMessage="Город не найден"
                                renderOption={(s) => (
                                    <div className="flex items-center gap-2">
                                        <MapPin className="w-3.5 h-3.5 text-neutral-400 flex-shrink-0" />
                                        <span>{s.value}</span>
                                    </div>
                                )}
                            />
                        </div>
                        {tripRoutePoints.length > 0 && (
                            <div className="bg-info-50/95 border border-info-200 rounded-md px-2.5 h-9 flex items-center gap-1.5 text-xs text-info-700 shadow-sm">
                                <Wifi className="w-3.5 h-3.5" />
                                <span>Маршрут: {tripRoutePoints.length} точек</span>
                            </div>
                        )}
                    </div>

                    {/* Right-panel toggle (when closed) */}
                    {!rightPanelOpen && (
                        <button
                            type="button"
                            onClick={() => setRightPanelOpen(true)}
                            className="absolute top-3 right-3 z-[1000] w-8 h-8 rounded-md bg-white border border-neutral-200 shadow-sm flex items-center justify-center text-neutral-500 hover:text-neutral-900"
                            title="Показать панель назначений"
                            aria-label="Показать панель назначений"
                        >
                            <PanelRightOpen className="w-4 h-4" />
                        </button>
                    )}

                    {/* Map */}
                    <div className="flex-1 min-h-0" data-tour="dispatcher-map">
                        <DispatcherMap
                            vehicles={enrichedVehicles}
                            selectedVehicle={selectedVehicle}
                            onSelectVehicle={setSelectedVehicle}
                            tripRoutePoints={tripRoutePoints}
                            onMapReady={setMapInstance}
                            liveMarkers={liveMarkersList}
                        />
                    </div>

                    {/* Trip details — floating bottom-left card when a vehicle is selected */}
                    {activeTripDetails && (
                        <div className="absolute bottom-3 left-3 right-3 lg:right-auto lg:max-w-[520px] z-[1000] pointer-events-none">
                            <Card className="shadow-xl pointer-events-auto">
                                <CardContent className="p-3">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Info className="w-4 h-4 text-info-500" />
                                        <h3 className="text-sm font-semibold text-neutral-900">Детали рейса</h3>
                                        <button
                                            type="button"
                                            onClick={() => { setActiveTripDetails(null); setSelectedVehicle(null); }}
                                            className="ml-auto text-neutral-400 hover:text-neutral-700"
                                            aria-label="Закрыть"
                                        >
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6 text-xs">
                                        <div>
                                            <p className="text-xs uppercase tracking-wide text-neutral-500 mb-0.5">Номер</p>
                                            <p className="text-sm font-semibold text-brand-600 font-mono">{activeTripDetails.number}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs uppercase tracking-wide text-neutral-500 mb-0.5">Статус</p>
                                            <div className="flex items-center gap-1.5">
                                                <div className="w-1.5 h-1.5 rounded-full bg-info-500 animate-pulse" />
                                                <p className="text-xs font-medium text-neutral-700">{activeTripDetails.status === 'in_transit' ? 'В пути' : activeTripDetails.status}</p>
                                            </div>
                                        </div>
                                        <div>
                                            <p className="text-xs uppercase tracking-wide text-neutral-500 mb-0.5">Прогресс</p>
                                            <div className="flex items-center gap-2">
                                                <div className="flex-1 bg-neutral-100 rounded-full h-1.5">
                                                    <div
                                                        className="bg-success-500 h-1.5 rounded-full transition-all"
                                                        style={{
                                                            width: activeTripDetails.totalPoints > 0
                                                                ? `${(activeTripDetails.completedPoints / activeTripDetails.totalPoints) * 100}%`
                                                                : '0%',
                                                        }}
                                                    />
                                                </div>
                                                <span className="text-[10px] font-medium tabular-nums text-neutral-600">
                                                    {activeTripDetails.completedPoints}/{activeTripDetails.totalPoints}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    {(activeTripDetails.driverName || activeTripDetails.vehiclePlate) && (
                                        <div className="flex items-center gap-3 mt-2 pt-2 border-t border-neutral-100">
                                            {activeTripDetails.vehiclePlate && (
                                                <div className="flex items-center gap-1 text-[11px] text-neutral-500">
                                                    <Truck className="w-3 h-3" />
                                                    <span className="font-mono">{activeTripDetails.vehiclePlate}</span>
                                                </div>
                                            )}
                                            {activeTripDetails.driverName && (
                                                <div className="flex items-center gap-1 text-[11px] text-neutral-500">
                                                    <User className="w-3 h-3" />
                                                    <span>{activeTripDetails.driverName}</span>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    {activeTripDetails.routePoints.length > 0 && (
                                        <div className="mt-2 pt-2 border-t border-neutral-100 space-y-1 max-h-32 overflow-y-auto">
                                            {activeTripDetails.routePoints.map((rp) => (
                                                <div key={`${rp.sequenceNumber}:${rp.type}`} className="flex items-center gap-2 text-[11px]">
                                                    <MapPin className={`w-3 h-3 flex-shrink-0 ${rp.status === 'completed' ? 'text-success-500'
                                                        : rp.status === 'arrived' ? 'text-info-500'
                                                            : 'text-neutral-300'
                                                        }`} />
                                                    <span className={`truncate ${rp.status === 'completed' ? 'text-neutral-400 line-through' : 'text-neutral-600'}`} title={rp.address || undefined}>
                                                        {rp.address || `Точка ${rp.sequenceNumber}`}
                                                    </span>
                                                    <span className={`ml-auto text-[10px] font-medium ${rp.type === 'loading' ? 'text-success-600' : 'text-brand-600'
                                                        }`}>
                                                        {rp.type === 'loading' ? 'Погрузка' : 'Выгрузка'}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {activeTripDetails.deliveryConfirmation && (
                                        <div className="mt-2 pt-2 border-t border-neutral-100">
                                            <div className="flex items-start gap-2 bg-success-50 border border-success-200 rounded-md p-2">
                                                <CheckCircle2 className="w-3.5 h-3.5 text-success-600 mt-0.5 flex-shrink-0" />
                                                <div className="text-[11px] space-y-0.5">
                                                    <p className="font-semibold text-success-800">
                                                        Доставка подтверждена
                                                        {activeTripDetails.deliveryConfirmation.forcedByDispatcher && (
                                                            <span className="ml-1.5 text-warning-700 font-normal">(принудительно)</span>
                                                        )}
                                                    </p>
                                                    <p className="text-success-700">Получатель: {activeTripDetails.deliveryConfirmation.recipientName}</p>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    <div className="flex gap-2 mt-2">
                                        {activeTripDetails.waybillId && (
                                            <button
                                                onClick={async () => {
                                                    try {
                                                        await downloadFromApi(`/api/waybills/${activeTripDetails.waybillId}/etrn`, `etrn_${activeTripDetails.number}.xml`, (m) => showToast(m));
                                                    } catch (e: any) {
                                                        showToast(e?.message || 'Ошибка загрузки ЭТрН');
                                                    }
                                                }}
                                                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md border border-brand-200 bg-brand-50 text-brand-700 text-[11px] font-semibold hover:bg-brand-100 transition-colors"
                                            >
                                                <FileDown className="w-3 h-3" />
                                                ЭТрН (XML)
                                            </button>
                                        )}
                                        {activeTripDetails.status === 'in_transit' && !activeTripDetails.deliveryConfirmation && (
                                            <button
                                                onClick={() => setForceCloseOpen(true)}
                                                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md border border-danger-200 bg-danger-50 text-danger-700 text-[11px] font-semibold hover:bg-danger-100 transition-colors"
                                            >
                                                <AlertTriangle className="w-3 h-3" />
                                                Завершить
                                            </button>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    )}
                </div>

                {/* Right panel */}
                {rightPanelOpen ? (
                    <div className="relative">
                        <CockpitRightPanel
                            orders={orders}
                            availableVehicles={enrichedVehicles.filter(v => v.status === 'available')}
                            vehiclesOnMap={vehiclesOnMap}
                            selectedVehicle={selectedVehicle}
                            onSelectVehicle={handleSelectVehicle}
                            vehicleSearch={vehicleSearch}
                            onVehicleSearchChange={setVehicleSearch}
                            vehicleStatusFilter={vehicleStatusFilter}
                            onVehicleStatusFilterChange={setVehicleStatusFilter}
                            coldChainBreaches={coldChainBreaches}
                            onAssign={handleAssign}
                        />
                        <button
                            type="button"
                            onClick={() => setRightPanelOpen(false)}
                            className="absolute top-2 -left-3 w-6 h-6 rounded-full bg-white border border-neutral-200 shadow-sm flex items-center justify-center text-neutral-400 hover:text-neutral-700 z-10"
                            title="Скрыть панель"
                            aria-label="Скрыть панель"
                        >
                            <PanelRightClose className="w-3 h-3" />
                        </button>
                    </div>
                ) : null}
            </div>
            </ErrorBoundary>

            {/* AI Co-pilot FAB */}
            <CopilotFab enabled={showCopilot} />

            {/* Force-close modal */}
            <Dialog
                open={!!(forceCloseOpen && activeTripDetails)}
                onClose={() => setForceCloseOpen(false)}
                title="Принудительное завершение"
                size="md"
            >
                {activeTripDetails && (
                    <div>
                        <p className="text-sm text-neutral-500 mb-4">
                            Рейс <span className="font-mono font-semibold text-neutral-700">{activeTripDetails.number}</span> будет завершён без подтверждения от водителя. Укажите причину.
                        </p>

                        <label className="block text-xs font-semibold text-neutral-600 mb-1.5">Причина *</label>
                        <select
                            value={forceReason}
                            onChange={e => setForceReason(e.target.value)}
                            className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm mb-3 bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-danger-300"
                        >
                            <option value="no_mobile">Нет мобильного устройства</option>
                            <option value="no_internet">Нет интернета</option>
                            <option value="recipient_refused">Получатель отказался подписывать</option>
                            <option value="other">Другое</option>
                        </select>

                        <label className="block text-xs font-semibold text-neutral-600 mb-1.5">
                            Комментарий {forceReason === 'other' && <span className="text-danger-500">*</span>}
                        </label>
                        <textarea
                            value={forceNote}
                            onChange={e => setForceNote(e.target.value)}
                            rows={3}
                            placeholder="Подробности..."
                            className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm mb-4 bg-neutral-50 resize-none focus:outline-none focus:ring-2 focus:ring-danger-300"
                        />

                        <div className="flex gap-3">
                            <button
                                onClick={() => setForceCloseOpen(false)}
                                disabled={forceLoading}
                                className="flex-1 py-2 rounded-lg border border-neutral-200 text-sm font-medium text-neutral-600 hover:bg-neutral-50 transition-colors disabled:opacity-50"
                            >
                                Отмена
                            </button>
                            <button
                                onClick={handleForceClose}
                                disabled={forceLoading || (forceReason === 'other' && !forceNote.trim())}
                                className="flex-1 py-2 rounded-lg bg-danger-600 text-white text-sm font-semibold hover:bg-danger-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {forceLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                Завершить рейс
                            </button>
                        </div>
                    </div>
                )}
            </Dialog>
        </div>
    );
}
