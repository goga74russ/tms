'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import {
    AlertTriangle, TrendingUp, Wrench, ShieldCheck,
    Activity, Gauge, Loader2, RefreshCw, Droplets, TimerReset, BarChart3,
} from 'lucide-react';

// ================================================================
// Types
// ================================================================
interface MaintenanceAlert {
    vehicleId: string;
    plateNumber: string;
    make: string;
    model: string;
    type: string;
    severity: 'critical' | 'warning';
    message: string;
    daysLeft?: number;
    kmLeft?: number;
}

interface TripProfit {
    tripId: string;
    tripNumber: string;
    vehiclePlate: string;
    driverName: string;
    revenue: number;
    cost: number;
    margin: number;
    marginPercent: number;
}

interface ProfitSummary {
    totalTrips: number;
    totalRevenue: number;
    totalCost: number;
    totalMargin: number;
    avgMarginPercent: number;
}

interface ProfitabilityResponse {
    trips: TripProfit[];
    summary: ProfitSummary | null;
}

interface FleetHealthResponse {
    fleetActive: number;
    fleetReady: number;
    fleetUnavailable: number;
    ktgPercent: number;
    ktgLight: 'green' | 'yellow' | 'red';
    byStatus: Record<string, number>;
    readiness?: FleetReadinessSnapshot;
    historical?: FleetKtgRow[];
    historicalSummary?: FleetKtgSummary | null;
}

interface FuelConsumptionRow {
    vehicleId: string;
    plateNumber: string;
    totalLiters: number;
    totalCost: number;
    fillCount: number;
    distanceKm: number | null;
    consumptionPer100km: number | null;
    norm: number | null;
    deviation: number | null;
}

interface FleetKtgRow {
    vehicleId: string;
    plateNumber: string;
    totalPeriodHours: number;
    downtimeHours: number;
    workingHours: number;
    ktg: number | null;
    ktgPercent: number | null;
}

interface FleetKtgSummary {
    avgKtg: number | null;
    avgKtgPercent: number | null;
    totalDowntimeHours: number;
    totalWorkingHours: number;
}

interface FleetReadinessIssue {
    key: string;
    label: string;
    severity: 'critical' | 'warning';
    count: number;
}

interface FleetReadinessVehicle {
    vehicleId: string;
    plateNumber: string;
    severity: 'critical' | 'warning' | 'ready';
    reasons: FleetReadinessIssue[];
}

interface FleetReadinessSnapshot {
    readyCount: number;
    attentionCount: number;
    blockedCount: number;
    totalCount: number;
    issues: FleetReadinessIssue[];
    vehicles: FleetReadinessVehicle[];
}

type ApiResponse<T> = {
    success: boolean;
    data: T;
};

// ================================================================
// Helpers
// ================================================================
function fmt(n: number) {
    return n.toLocaleString('ru-RU', { maximumFractionDigits: 0 });
}
function fmtPct(n: number) {
    return n.toFixed(1) + '%';
}
function severityBadge(s: 'critical' | 'warning') {
    return s === 'critical'
        ? 'bg-red-100 text-red-700 border-red-200'
        : 'bg-amber-100 text-amber-700 border-amber-200';
}
function typeName(t: string) {
    const map: Record<string, string> = {
        maintenance: 'ТО', osago: 'ОСАГО', tech_inspection: 'Техосмотр',
        tachograph: 'Тахограф', odometer: 'Пробег',
    };
    return map[t] || t;
}
function marginColor(pct: number) {
    if (pct < 0) return 'text-red-600';
    if (pct < 15) return 'text-amber-600';
    return 'text-emerald-600';
}
function formatDateInput(date: Date) {
    return date.toISOString().slice(0, 10);
}
function buildRollingPeriod(days: number) {
    const to = new Date();
    const from = new Date(to);
    from.setDate(from.getDate() - days);
    return { dateFrom: formatDateInput(from), dateTo: formatDateInput(to) };
}

// ================================================================
// Page
// ================================================================
export default function AnalyticsPage() {
    const [alerts, setAlerts] = useState<MaintenanceAlert[]>([]);
    const [trips, setTrips] = useState<TripProfit[]>([]);
    const [summary, setSummary] = useState<ProfitSummary | null>(null);
    const [fleetHealth, setFleetHealth] = useState<FleetHealthResponse | null>(null);
    const [fuelRows, setFuelRows] = useState<FuelConsumptionRow[]>([]);
    const [ktgRows, setKtgRows] = useState<FleetKtgRow[]>([]);
    const [ktgSummary, setKtgSummary] = useState<FleetKtgSummary | null>(null);
    const [loadingAlerts, setLoadingAlerts] = useState(true);
    const [loadingProfit, setLoadingProfit] = useState(true);
    const [loadingFleetHealth, setLoadingFleetHealth] = useState(true);
    const [loadingFuel, setLoadingFuel] = useState(true);
    const [loadingKtg, setLoadingKtg] = useState(true);
    const rollingPeriod = buildRollingPeriod(30);

    async function loadAlerts() {
        setLoadingAlerts(true);
        try {
            const res = await api.get<any>('/analytics/maintenance-alerts');
            setAlerts(res.data || []);
        } catch (err) {
            console.error('Failed to load alerts:', err);
        } finally {
            setLoadingAlerts(false);
        }
    }

    async function loadProfitability() {
        setLoadingProfit(true);
        try {
            const res = await api.get<ApiResponse<ProfitabilityResponse>>('/analytics/profitability');
            setTrips(res.data?.trips || []);
            setSummary(res.data?.summary || null);
        } catch (err) {
            console.error('Failed to load profitability:', err);
        } finally {
            setLoadingProfit(false);
        }
    }

    async function loadFleetHealth() {
        setLoadingFleetHealth(true);
        try {
            const res = await api.get<ApiResponse<FleetHealthResponse>>('/analytics/fleet-health');
            setFleetHealth(res.data || null);
        } catch (err) {
            console.error('Failed to load fleet health:', err);
        } finally {
            setLoadingFleetHealth(false);
        }
    }

    async function loadFuelConsumption() {
        setLoadingFuel(true);
        try {
            const res = await api.get<ApiResponse<FuelConsumptionRow[]>>(
                `/analytics/fuel-consumption?dateFrom=${rollingPeriod.dateFrom}&dateTo=${rollingPeriod.dateTo}`,
            );
            setFuelRows(res.data || []);
        } catch (err) {
            console.error('Failed to load fuel analytics:', err);
        } finally {
            setLoadingFuel(false);
        }
    }

    async function loadFleetKtg() {
        setLoadingKtg(true);
        try {
            const res = await api.get<ApiResponse<FleetHealthResponse>>(
                `/analytics/fleet-ktg?dateFrom=${rollingPeriod.dateFrom}&dateTo=${rollingPeriod.dateTo}`,
            );
            setKtgRows(res.data?.historical || []);
            setKtgSummary(res.data?.historicalSummary || null);
        } catch (err) {
            console.error('Failed to load fleet ktg:', err);
        } finally {
            setLoadingKtg(false);
        }
    }

    useEffect(() => {
        loadAlerts();
        loadProfitability();
        loadFleetHealth();
        loadFuelConsumption();
        loadFleetKtg();
    }, []);

    const criticalCount = alerts.filter(a => a.severity === 'critical').length;
    const warningCount = alerts.filter(a => a.severity === 'warning').length;
    const fuelSummary = fuelRows.reduce((acc, row) => {
        acc.totalLiters += row.totalLiters || 0;
        acc.totalCost += row.totalCost || 0;
        acc.fillCount += row.fillCount || 0;
        acc.deviationSum += row.deviation || 0;
        acc.deviationCount += row.deviation !== null ? 1 : 0;
        return acc;
    }, {
        totalLiters: 0,
        totalCost: 0,
        fillCount: 0,
        deviationSum: 0,
        deviationCount: 0,
    });

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                    <div className="shrink-0 w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center">
                        <BarChart3 className="w-5 h-5" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-semibold text-slate-900">Аналитика</h1>
                        <p className="text-sm text-slate-500 mt-0.5">
                            Предиктивное ТО и маржинальность рейсов
                        </p>
                    </div>
                </div>
                <Button variant="outline" leftIcon={<RefreshCw className="w-4 h-4" />} onClick={() => { loadAlerts(); loadProfitability(); loadFleetHealth(); }}>
                    Обновить
                </Button>
            </div>

            {/* Stat Cards */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
                <StatCard
                    icon={<AlertTriangle className="w-5 h-5 text-red-500" />}
                    label="Критические"
                    value={criticalCount}
                    color="red"
                />
                <StatCard
                    icon={<ShieldCheck className="w-5 h-5 text-amber-500" />}
                    label="Предупреждения"
                    value={warningCount}
                    color="amber"
                />
                <StatCard
                    icon={<TrendingUp className="w-5 h-5 text-emerald-500" />}
                    label="Ср. маржа"
                    value={summary ? fmtPct(summary.avgMarginPercent) : '—'}
                    color="emerald"
                />
                <StatCard
                    icon={<Activity className="w-5 h-5 text-indigo-500" />}
                    label="Рейсов"
                    value={summary?.totalTrips ?? 0}
                    color="indigo"
                />
                <StatCard
                    icon={<Gauge className="w-5 h-5 text-emerald-500" />}
                    label="КТГ"
                    value={fleetHealth ? `${fleetHealth.ktgPercent.toFixed(1)}%` : '—'}
                    subtitle={fleetHealth ? `Готовы к выпуску: ${fleetHealth.fleetReady} / ${fleetHealth.fleetActive}${fleetHealth.fleetUnavailable > 0 ? `, недоступны: ${fleetHealth.fleetUnavailable}` : ''}` : 'Готовность парка'}
                    color={fleetHealth?.ktgLight === 'yellow' ? 'amber' : fleetHealth?.ktgLight === 'red' ? 'red' : 'emerald'}
                />
            </div>

            {fleetHealth?.readiness && (
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Fleet readiness</p>
                            <p className="text-sm font-medium text-slate-800">
                                Готовность парка по известным ограничениям
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <span className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                                Готовы: {fleetHealth.readiness.readyCount}
                            </span>
                            <span className="inline-flex rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                                Зона внимания: {fleetHealth.readiness.attentionCount}
                            </span>
                            <span className="inline-flex rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
                                Блокировки: {fleetHealth.readiness.blockedCount}
                            </span>
                        </div>
                    </div>
                    {fleetHealth.readiness.issues.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                            {fleetHealth.readiness.issues.slice(0, 5).map((issue) => (
                                <span
                                    key={issue.key}
                                    className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
                                        issue.severity === 'critical'
                                            ? 'bg-red-50 text-red-700'
                                            : 'bg-amber-50 text-amber-700'
                                    }`}
                                >
                                    {issue.label}: {issue.count}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Tabs */}
            <Tabs defaultValue="maintenance" className="w-full">
                <TabsList className="mb-4">
                    <TabsTrigger value="maintenance" className="gap-2">
                        <Wrench className="w-4 h-4" />
                        ТО-алерты
                    </TabsTrigger>
                    <TabsTrigger value="profitability" className="gap-2">
                        <Gauge className="w-4 h-4" />
                        Маржинальность
                    </TabsTrigger>
                    <TabsTrigger value="fuel" className="gap-2">
                        <Droplets className="w-4 h-4" />
                        Топливо
                    </TabsTrigger>
                    <TabsTrigger value="ktg" className="gap-2">
                        <BarChart3 className="w-4 h-4" />
                        КТГ тренд
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="maintenance" className="m-0">
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
                        {loadingAlerts ? (
                            <div className="flex items-center justify-center py-20">
                                <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                            </div>
                        ) : alerts.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                                <ShieldCheck className="w-12 h-12 mb-3 text-emerald-400" />
                                <p className="text-sm font-medium text-emerald-600">Все ТС в норме</p>
                                <p className="text-xs text-slate-400 mt-1">Нет предупреждений о ТО</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-slate-50 text-slate-500 text-left">
                                            <th className="px-4 py-3 font-medium">Госномер</th>
                                            <th className="px-4 py-3 font-medium">Марка / Модель</th>
                                            <th className="px-4 py-3 font-medium">Тип</th>
                                            <th className="px-4 py-3 font-medium">Важность</th>
                                            <th className="px-4 py-3 font-medium">Сообщение</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {alerts.map((a, i) => (
                                            <tr key={i} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-4 py-3 font-mono font-medium text-slate-900">
                                                    {a.plateNumber}
                                                </td>
                                                <td className="px-4 py-3 text-slate-600">
                                                    {a.make} {a.model}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">
                                                        {typeName(a.type)}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${severityBadge(a.severity)}`}>
                                                        {a.severity === 'critical' ? '🔴 Критично' : '🟡 Внимание'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-slate-600 max-w-xs truncate">
                                                    {a.message}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </TabsContent>

                <TabsContent value="profitability" className="m-0">
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
                        {/* Summary bar */}
                        {summary && (
                            <div className="grid grid-cols-4 gap-4 p-4 border-b border-slate-200 bg-slate-50/50 rounded-t-xl">
                                <MiniStat label="Выручка" value={`${fmt(summary.totalRevenue)} ₽`} />
                                <MiniStat label="Себестоимость" value={`${fmt(summary.totalCost)} ₽`} />
                                <MiniStat label="Маржа" value={`${fmt(summary.totalMargin)} ₽`} />
                                <MiniStat label="Ср. маржа, %" value={fmtPct(summary.avgMarginPercent)} />
                            </div>
                        )}

                        {loadingProfit ? (
                            <div className="flex items-center justify-center py-20">
                                <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                            </div>
                        ) : trips.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                                <Gauge className="w-12 h-12 mb-3" />
                                <p className="text-sm">Нет завершённых рейсов</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-slate-50 text-slate-500 text-left">
                                            <th className="px-4 py-3 font-medium">Рейс</th>
                                            <th className="px-4 py-3 font-medium">ТС</th>
                                            <th className="px-4 py-3 font-medium">Водитель</th>
                                            <th className="px-4 py-3 font-medium text-right">Выручка</th>
                                            <th className="px-4 py-3 font-medium text-right">Себестоимость</th>
                                            <th className="px-4 py-3 font-medium text-right">Маржа</th>
                                            <th className="px-4 py-3 font-medium text-right">%</th>
                                            <th className="px-4 py-3 font-medium w-32">Визуал</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {trips.map(t => (
                                            <tr key={t.tripId} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-4 py-3 font-mono text-sm text-slate-700">
                                                    {t.tripNumber}
                                                </td>
                                                <td className="px-4 py-3 font-mono text-slate-600">
                                                    {t.vehiclePlate}
                                                </td>
                                                <td className="px-4 py-3 text-slate-600">
                                                    {t.driverName || '—'}
                                                </td>
                                                <td className="px-4 py-3 text-right font-medium text-slate-900">
                                                    {fmt(t.revenue)} ₽
                                                </td>
                                                <td className="px-4 py-3 text-right text-slate-600">
                                                    {fmt(t.cost)} ₽
                                                </td>
                                                <td className={`px-4 py-3 text-right font-semibold ${marginColor(t.marginPercent)}`}>
                                                    {fmt(t.margin)} ₽
                                                </td>
                                                <td className={`px-4 py-3 text-right font-semibold ${marginColor(t.marginPercent)}`}>
                                                    {fmtPct(t.marginPercent)}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="w-full bg-slate-100 rounded-full h-2">
                                                        <div
                                                            className={`h-2 rounded-full transition-all ${t.marginPercent >= 15 ? 'bg-emerald-500'
                                                                : t.marginPercent >= 0 ? 'bg-amber-500'
                                                                    : 'bg-red-500'
                                                                }`}
                                                            style={{ width: `${Math.min(Math.max(t.marginPercent, 0), 100)}%` }}
                                                        />
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </TabsContent>

                <TabsContent value="fuel" className="m-0">
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
                        <div className="grid grid-cols-1 gap-4 border-b border-slate-200 bg-slate-50/60 p-4 md:grid-cols-4">
                            <MiniStat label="Заправок" value={String(fuelSummary.fillCount)} />
                            <MiniStat label="Топливо, л" value={`${fmt(fuelSummary.totalLiters)} л`} />
                            <MiniStat label="Топливо, ₽" value={`${fmt(fuelSummary.totalCost)} ₽`} />
                            <MiniStat
                                label="Сред. отклонение"
                                value={fuelSummary.deviationCount > 0 ? `${(fuelSummary.deviationSum / fuelSummary.deviationCount).toFixed(1)} л/100` : '—'}
                            />
                        </div>

                        {loadingFuel ? (
                            <div className="flex items-center justify-center py-20">
                                <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                            </div>
                        ) : fuelRows.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                                <Droplets className="w-12 h-12 mb-3" />
                                <p className="text-sm">Нет данных по топливу за период</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-slate-50 text-slate-500 text-left">
                                            <th className="px-4 py-3 font-medium">ТС</th>
                                            <th className="px-4 py-3 font-medium text-right">Литры</th>
                                            <th className="px-4 py-3 font-medium text-right">Стоимость</th>
                                            <th className="px-4 py-3 font-medium text-right">Заправок</th>
                                            <th className="px-4 py-3 font-medium text-right">Расход</th>
                                            <th className="px-4 py-3 font-medium text-right">Норма</th>
                                            <th className="px-4 py-3 font-medium text-right">Отклонение</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {[...fuelRows].sort((a, b) => Math.abs((b.deviation ?? 0)) - Math.abs((a.deviation ?? 0))).map((row) => (
                                            <tr key={row.vehicleId} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-4 py-3 font-mono font-medium text-slate-900">{row.plateNumber}</td>
                                                <td className="px-4 py-3 text-right text-slate-700">{fmt(row.totalLiters)}</td>
                                                <td className="px-4 py-3 text-right text-slate-700">{fmt(row.totalCost)} ₽</td>
                                                <td className="px-4 py-3 text-right text-slate-600">{row.fillCount}</td>
                                                <td className="px-4 py-3 text-right font-medium text-slate-900">
                                                    {row.consumptionPer100km !== null ? `${row.consumptionPer100km.toFixed(1)} л/100` : '—'}
                                                </td>
                                                <td className="px-4 py-3 text-right text-slate-600">
                                                    {row.norm !== null ? `${row.norm.toFixed(1)} л/100` : '—'}
                                                </td>
                                                <td className={`px-4 py-3 text-right font-semibold ${row.deviation && row.deviation > 0 ? 'text-red-600' : row.deviation && row.deviation < 0 ? 'text-emerald-600' : 'text-slate-600'}`}>
                                                    {row.deviation !== null ? `${row.deviation > 0 ? '+' : ''}${row.deviation.toFixed(1)} л/100` : '—'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </TabsContent>

                <TabsContent value="ktg" className="m-0">
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
                        {ktgSummary && (
                            <div className="grid grid-cols-1 gap-4 border-b border-slate-200 bg-slate-50/60 p-4 md:grid-cols-4">
                                <MiniStat label="Сред. КТГ" value={ktgSummary.avgKtgPercent !== null ? `${ktgSummary.avgKtgPercent.toFixed(1)}%` : '—'} />
                                <MiniStat label="Простой, ч" value={`${fmt(ktgSummary.totalDowntimeHours)} ч`} />
                                <MiniStat label="Работа, ч" value={`${fmt(ktgSummary.totalWorkingHours)} ч`} />
                                <MiniStat label="Машин" value={String(ktgRows.length)} />
                            </div>
                        )}

                        {loadingKtg ? (
                            <div className="flex items-center justify-center py-20">
                                <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                            </div>
                        ) : ktgRows.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                                <TimerReset className="w-12 h-12 mb-3" />
                                <p className="text-sm">Нет данных КТГ за период</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-slate-50 text-slate-500 text-left">
                                            <th className="px-4 py-3 font-medium">ТС</th>
                                            <th className="px-4 py-3 font-medium text-right">КТГ</th>
                                            <th className="px-4 py-3 font-medium text-right">Работа, ч</th>
                                            <th className="px-4 py-3 font-medium text-right">Простой, ч</th>
                                            <th className="px-4 py-3 font-medium text-right">Период, ч</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {[...ktgRows].sort((a, b) => (a.ktgPercent ?? 0) - (b.ktgPercent ?? 0)).map((row) => (
                                            <tr key={row.vehicleId} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-4 py-3 font-mono font-medium text-slate-900">{row.plateNumber}</td>
                                                <td className={`px-4 py-3 text-right font-semibold ${row.ktgPercent !== null && row.ktgPercent < 75 ? 'text-red-600' : row.ktgPercent !== null && row.ktgPercent < 90 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                                    {row.ktgPercent !== null ? `${row.ktgPercent.toFixed(1)}%` : '—'}
                                                </td>
                                                <td className="px-4 py-3 text-right text-slate-700">{row.workingHours.toFixed(1)}</td>
                                                <td className="px-4 py-3 text-right text-slate-700">{row.downtimeHours.toFixed(1)}</td>
                                                <td className="px-4 py-3 text-right text-slate-500">{row.totalPeriodHours.toFixed(1)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}

// ================================================================
// Sub-components
// ================================================================
function StatCard({ icon, label, value, color, subtitle }: {
    icon: React.ReactNode; label: string; value: string | number; color: string; subtitle?: string;
}) {
    const bgMap: Record<string, string> = {
        red: 'bg-red-50 border-red-100',
        amber: 'bg-amber-50 border-amber-100',
        emerald: 'bg-emerald-50 border-emerald-100',
        indigo: 'bg-indigo-50 border-indigo-100',
    };
    return (
        <div className={`rounded-xl border p-4 ${bgMap[color] || 'bg-slate-50 border-slate-100'}`}>
            <div className="flex items-center gap-3">
                {icon}
                <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wider">{label}</p>
                    <p className="text-xl font-bold text-slate-900 mt-0.5">{value}</p>
                    {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
                </div>
            </div>
        </div>
    );
}

function MiniStat({ label, value }: { label: string; value: string }) {
    return (
        <div className="text-center">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="text-sm font-semibold text-slate-800 mt-0.5">{value}</p>
        </div>
    );
}
