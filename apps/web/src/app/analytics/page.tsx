'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
    AlertTriangle, TrendingUp, Wrench, ShieldCheck,
    Activity, Gauge, Loader2, RefreshCw,
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

// ================================================================
// Page
// ================================================================
export default function AnalyticsPage() {
    const [alerts, setAlerts] = useState<MaintenanceAlert[]>([]);
    const [trips, setTrips] = useState<TripProfit[]>([]);
    const [summary, setSummary] = useState<ProfitSummary | null>(null);
    const [loadingAlerts, setLoadingAlerts] = useState(true);
    const [loadingProfit, setLoadingProfit] = useState(true);

    async function loadAlerts() {
        setLoadingAlerts(true);
        try {
            const res = await api.get<any>('/analytics/maintenance-alerts');
            setAlerts(res.alerts || []);
        } catch (err) {
            console.error('Failed to load alerts:', err);
        } finally {
            setLoadingAlerts(false);
        }
    }

    async function loadProfitability() {
        setLoadingProfit(true);
        try {
            const res = await api.get<any>('/analytics/profitability');
            setTrips(res.trips || []);
            setSummary(res.summary || null);
        } catch (err) {
            console.error('Failed to load profitability:', err);
        } finally {
            setLoadingProfit(false);
        }
    }

    useEffect(() => {
        loadAlerts();
        loadProfitability();
    }, []);

    const criticalCount = alerts.filter(a => a.severity === 'critical').length;
    const warningCount = alerts.filter(a => a.severity === 'warning').length;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Аналитика</h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Предиктивное ТО и маржинальность рейсов
                    </p>
                </div>
                <button
                    onClick={() => { loadAlerts(); loadProfitability(); }}
                    className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600
                        bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                >
                    <RefreshCw className="w-4 h-4" />
                    Обновить
                </button>
            </div>

            {/* Stat Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
            </div>

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
            </Tabs>
        </div>
    );
}

// ================================================================
// Sub-components
// ================================================================
function StatCard({ icon, label, value, color }: {
    icon: React.ReactNode; label: string; value: string | number; color: string;
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
