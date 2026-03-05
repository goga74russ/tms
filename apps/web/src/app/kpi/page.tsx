"use client";

import { useState, useEffect, useCallback } from "react";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { ru } from "date-fns/locale";
import { api } from "@/lib/api";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend,
    LineChart, Line, AreaChart, Area, PieChart, Pie, Cell
} from 'recharts';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ——— Types ———
interface KpiData {
    revenue: number;
    cost: number;
    margin: number;
    marginPercent: number;
    finesAmount: number;
    repairsAmount: number;
    tripsCompleted: number;
    overdueDebt: number;
    debtorLight: 'green' | 'yellow' | 'red';
    finesLight: 'green' | 'yellow' | 'red';
    topDrivers: { name: string, trips: number, eco: string, score: string }[];
}

interface FuelRow {
    vehicleId: string;
    vehicle: string;
    totalDistanceKm: number;
    fuelUsedLiters: number;
    expectedFuelLiters: number;
    differenceLiters: number;
    variancePercent: number;
    status: string;
}

type ApiResponse<T> = { success: boolean; data: T };

// ——— Sub-components ———
const MetricCard = ({ title, value, trend, trendUp, subtitle }: any) => (
    <Card className="flex flex-col justify-between">
        <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">{title}</CardTitle>
        </CardHeader>
        <CardContent>
            <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-slate-900 tracking-tight">{value}</span>
                {trend && (
                    <span className={`text-sm font-medium ${trendUp ? 'text-emerald-500' : 'text-red-500'}`}>
                        {trend}
                    </span>
                )}
            </div>
            {subtitle && <p className="text-xs text-slate-400 mt-2">{subtitle}</p>}
        </CardContent>
    </Card>
);

const TrafficLight = ({ label, status, amount }: { label: string; status: 'green' | 'yellow' | 'red'; amount: string }) => {
    const colors = {
        green: { bg: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-500', text: 'text-emerald-700' },
        yellow: { bg: 'bg-amber-50', border: 'border-amber-200', dot: 'bg-amber-500', text: 'text-amber-700' },
        red: { bg: 'bg-red-50', border: 'border-red-200', dot: 'bg-red-500', text: 'text-red-700' },
    };
    const c = colors[status];
    return (
        <div className={`${c.bg} ${c.border} border rounded-xl p-4 flex items-center gap-3`}>
            <div className={`w-4 h-4 rounded-full ${c.dot} animate-pulse`} />
            <div>
                <p className="text-sm font-medium text-slate-700">{label}</p>
                <p className={`text-lg font-bold ${c.text}`}>{amount}</p>
            </div>
        </div>
    );
};

const fmtMoney = (n: number) => {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M ₽';
    if (n >= 1_000) return (n / 1_000).toFixed(0) + 'K ₽';
    return n.toLocaleString('ru-RU') + ' ₽';
};

// Fallback data for charts that don't have dedicated API yet
const costBreakdownFallback = [
    { name: 'Топливо', value: 45 },
    { name: 'Зарплата', value: 30 },
    { name: 'Ремонты', value: 15 },
    { name: 'Штрафы/Прочее', value: 10 },
];
const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'];

// Driver ranking (static until API exists)
const driversFallback = [
    { name: 'Смирнов А.В.', trips: 24, eco: '98%', score: '5.0' },
    { name: 'Козлов И.Д.', trips: 22, eco: '95%', score: '4.8' },
    { name: 'Петров В.С.', trips: 26, eco: '91%', score: '4.6' },
    { name: 'Иванов П.А.', trips: 18, eco: '88%', score: '4.2' },
];

// ================================================================
export default function KPIDashboard() {
    const [mounted, setMounted] = useState(false);
    const [kpi, setKpi] = useState<KpiData | null>(null);
    const [fuelData, setFuelData] = useState<FuelRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Date range
    const now = new Date();
    const [startDate, setStartDate] = useState(format(startOfMonth(subMonths(now, 1)), 'yyyy-MM-dd'));
    const [endDate, setEndDate] = useState(format(endOfMonth(now), 'yyyy-MM-dd'));

    useEffect(() => { setMounted(true); }, []);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [kpiRes, fuelRes] = await Promise.all([
                api.get<ApiResponse<KpiData>>(`/finance/kpi?startDate=${startDate}&endDate=${endDate}`),
                api.get<ApiResponse<FuelRow[]>>(`/finance/fuel-analysis?startDate=${startDate}&endDate=${endDate}`),
            ]);
            setKpi(kpiRes.data);
            setFuelData(fuelRes.data || []);
        } catch (err: any) {
            setError(err.message || 'Failed to load KPI data');
        } finally {
            setLoading(false);
        }
    }, [startDate, endDate]);

    useEffect(() => { if (mounted) fetchData(); }, [mounted, fetchData]);

    if (!mounted) return null;

    // Compute cost breakdown from KPI if available
    const costBreakdown = kpi ? [
        { name: 'Ремонты', value: kpi.repairsAmount || 0 },
        { name: 'Штрафы', value: kpi.finesAmount || 0 },
        { name: 'Прочие', value: Math.max(0, kpi.cost - (kpi.repairsAmount || 0) - (kpi.finesAmount || 0)) },
    ] : costBreakdownFallback;

    // Transform fuel data for chart
    const fuelChartData = fuelData.map(f => ({
        vehicle: f.vehicle.split('(')[0].trim(),
        actual: f.fuelUsedLiters,
        norm: f.expectedFuelLiters,
    }));

    return (
        <div className="p-8 space-y-8 bg-slate-50 min-h-screen text-slate-900 font-sans">
            {/* Header + Date Range */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-2">Дашборд Руководителя</h1>
                    <p className="text-slate-500">Ключевые показатели эффективности (KPI) и аналитика.</p>
                </div>
                <div className="flex items-center gap-3">
                    <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-40" />
                    <span className="text-slate-400">—</span>
                    <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-40" />
                    <Button variant="outline" onClick={fetchData} disabled={loading}>
                        {loading ? '...' : 'Обновить'}
                    </Button>
                </div>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                    {error}
                </div>
            )}

            {/* Metric Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <MetricCard
                    title="Выручка"
                    value={kpi ? fmtMoney(kpi.revenue) : '—'}
                    trend={kpi && kpi.revenue > 0 ? '+' : undefined}
                    trendUp={true}
                    subtitle={`Период: ${startDate} — ${endDate}`}
                />
                <MetricCard
                    title="Маржинальность"
                    value={kpi ? `${kpi.marginPercent.toFixed(1)}%` : '—'}
                    trend={kpi && kpi.marginPercent > 30 ? '> 30%' : kpi ? '< 30%' : undefined}
                    trendUp={kpi ? kpi.marginPercent > 30 : true}
                    subtitle="Цель: >30%"
                />
                <MetricCard
                    title="Рейсов завершено"
                    value={kpi ? String(kpi.tripsCompleted) : '—'}
                    subtitle="За выбранный период"
                />
                <MetricCard
                    title="Затраты на ремонт"
                    value={kpi ? fmtMoney(kpi.repairsAmount) : '—'}
                    subtitle="Ремонты + обслуживание"
                />
            </div>

            {/* Traffic Lights */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <TrafficLight
                    label="Дебиторская задолженность"
                    status={kpi?.debtorLight || 'green'}
                    amount={kpi ? fmtMoney(kpi.overdueDebt) : '0 ₽'}
                />
                <TrafficLight
                    label="Штрафы (неоплаченные)"
                    status={kpi?.finesLight || 'green'}
                    amount={kpi ? fmtMoney(kpi.finesAmount) : '0 ₽'}
                />
            </div>

            {/* Charts Row 1: Revenue Bar + Cost Pie */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="col-span-1 lg:col-span-2">
                    <CardHeader>
                        <CardTitle className="text-lg font-semibold text-slate-900">Выручка vs Себестоимость</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-80 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    data={kpi ? [{ name: 'Период', revenue: kpi.revenue / 1000, cost: kpi.cost / 1000, margin: kpi.margin / 1000 }] : []}
                                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                                    <XAxis dataKey="name" stroke="#64748b" axisLine={false} tickLine={false} />
                                    <YAxis stroke="#64748b" axisLine={false} tickLine={false} />
                                    <RechartsTooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '8px' }} />
                                    <Legend iconType="circle" />
                                    <Bar dataKey="revenue" name="Выручка (тыс.)" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={50} />
                                    <Bar dataKey="cost" name="Себестоимость (тыс.)" fill="#818cf8" radius={[4, 4, 0, 0]} barSize={50} />
                                    <Bar dataKey="margin" name="Маржа (тыс.)" fill="#10b981" radius={[4, 4, 0, 0]} barSize={50} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg font-semibold text-slate-900">Структура затрат</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-64 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={costBreakdown} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value" stroke="none">
                                        {costBreakdown.map((_, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <RechartsTooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '8px' }} />
                                    <Legend iconType="circle" layout="vertical" verticalAlign="middle" align="right" />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Charts Row 2: Fuel Analysis + Drivers */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-lg font-semibold text-slate-900">ГСМ: Факт vs Норма (по ТС)</CardTitle>
                        {fuelData.some(f => f.status === 'overconsumption') && (
                            <span className="bg-yellow-100 text-yellow-700 text-xs px-2 py-1 rounded-full border border-yellow-200">
                                Перерасход
                            </span>
                        )}
                    </CardHeader>
                    <CardContent>
                        {fuelChartData.length > 0 ? (
                            <div className="h-64 w-full mt-4">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={fuelChartData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                                        <XAxis type="number" stroke="#64748b" axisLine={false} tickLine={false} unit=" л" />
                                        <YAxis type="category" dataKey="vehicle" stroke="#64748b" axisLine={false} tickLine={false} width={100} />
                                        <RechartsTooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '8px' }} />
                                        <Legend iconType="circle" />
                                        <Bar dataKey="actual" name="Факт" fill="#ef4444" radius={[0, 4, 4, 0]} barSize={14} />
                                        <Bar dataKey="norm" name="Норма" fill="#10b981" radius={[0, 4, 4, 0]} barSize={14} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        ) : (
                            <div className="text-center py-12 text-slate-400">Нет данных по ГСМ за период.</div>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg font-semibold text-slate-900">Топ водителей (Рейтинг)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-slate-500 uppercase border-b border-slate-200">
                                    <tr>
                                        <th className="px-4 py-3 font-medium">Водитель</th>
                                        <th className="px-4 py-3 font-medium">Рейсы</th>
                                        <th className="px-4 py-3 font-medium">Эко-вождение</th>
                                        <th className="px-4 py-3 text-right font-medium">Оценка</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {(kpi?.topDrivers || []).map((driver, i) => (
                                        <tr key={i} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-4 py-4 font-medium text-slate-900">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">{i + 1}</div>
                                                    {driver.name}
                                                </div>
                                            </td>
                                            <td className="px-4 py-4 text-slate-500">{driver.trips}</td>
                                            <td className="px-4 py-4 text-emerald-600">{driver.eco}</td>
                                            <td className="px-4 py-4 text-right font-medium text-yellow-600">★ {driver.score}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
