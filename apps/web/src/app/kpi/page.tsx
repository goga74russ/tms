"use client";

import { useCallback, useEffect, useState } from "react";
import { endOfMonth, format, startOfMonth, subMonths } from "date-fns";
import { api } from "@/lib/api";
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Legend,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip as RechartsTooltip,
    XAxis,
    YAxis,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface KpiData {
    revenue: number | string | null;
    cost: number | string | null;
    margin: number | string | null;
    marginPercent: number | string | null;
    finesAmount: number | string | null;
    repairsAmount: number | string | null;
    tripsCompleted: number | string | null;
    overdueDebt: number | string | null;
    ktgPercent: number | string | null;
    fleetActive: number | string | null;
    fleetReady: number | string | null;
    fleetUnavailable: number | string | null;
    ktgLight: "green" | "yellow" | "red";
    debtorLight: "green" | "yellow" | "red";
    finesLight: "green" | "yellow" | "red";
    topDrivers: { name: string; trips: number; eco: string; score: string }[];
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

const MetricCard = ({ title, value, trend, trendUp, subtitle }: {
    title: string;
    value: string;
    trend?: string;
    trendUp?: boolean;
    subtitle?: string;
}) => (
    <Card className="flex flex-col justify-between">
        <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">{title}</CardTitle>
        </CardHeader>
        <CardContent>
            <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold tracking-tight text-slate-900">{value}</span>
                {trend && (
                    <span className={`text-sm font-medium ${trendUp ? "text-emerald-500" : "text-red-500"}`}>
                        {trend}
                    </span>
                )}
            </div>
            {subtitle && <p className="mt-2 text-xs text-slate-400">{subtitle}</p>}
        </CardContent>
    </Card>
);

const TrafficLight = ({ label, status, amount }: {
    label: string;
    status: "green" | "yellow" | "red";
    amount: string;
}) => {
    const colors = {
        green: { bg: "bg-emerald-50", border: "border-emerald-200", dot: "bg-emerald-500", text: "text-emerald-700" },
        yellow: { bg: "bg-amber-50", border: "border-amber-200", dot: "bg-amber-500", text: "text-amber-700" },
        red: { bg: "bg-red-50", border: "border-red-200", dot: "bg-red-500", text: "text-red-700" },
    };
    const c = colors[status];

    return (
        <div className={`${c.bg} ${c.border} flex items-center gap-3 rounded-xl border p-4`}>
            <div className={`h-4 w-4 rounded-full ${c.dot} animate-pulse`} />
            <div>
                <p className="text-sm font-medium text-slate-700">{label}</p>
                <p className={`text-lg font-bold ${c.text}`}>{amount}</p>
            </div>
        </div>
    );
};

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444"];

const toNumber = (value: number | string | null | undefined) => Number(value ?? 0);

const formatMoney = (value: number | string | null | undefined) =>
    `${toNumber(value).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`;

const formatCompactMoney = (value: number | string | null | undefined) => {
    const amount = toNumber(value);
    if (Math.abs(amount) >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M ₽`;
    if (Math.abs(amount) >= 1_000) return `${(amount / 1_000).toFixed(0)}K ₽`;
    return formatMoney(amount);
};

export default function KPIDashboard() {
    const [mounted, setMounted] = useState(false);
    const [kpi, setKpi] = useState<KpiData | null>(null);
    const [fuelData, setFuelData] = useState<FuelRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const now = new Date();
    const [startDate, setStartDate] = useState(format(startOfMonth(subMonths(now, 1)), "yyyy-MM-dd"));
    const [endDate, setEndDate] = useState(format(endOfMonth(now), "yyyy-MM-dd"));

    useEffect(() => {
        setMounted(true);
    }, []);

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
            setError(err.message || "Не удалось загрузить данные KPI.");
        } finally {
            setLoading(false);
        }
    }, [endDate, startDate]);

    useEffect(() => {
        if (mounted) {
            void fetchData();
        }
    }, [mounted, fetchData]);

    if (!mounted) return null;

    const revenue = toNumber(kpi?.revenue);
    const cost = toNumber(kpi?.cost);
    const margin = toNumber(kpi?.margin);
    const marginPercent = toNumber(kpi?.marginPercent);
    const finesAmount = toNumber(kpi?.finesAmount);
    const repairsAmount = toNumber(kpi?.repairsAmount);
    const tripsCompleted = toNumber(kpi?.tripsCompleted);
    const overdueDebt = toNumber(kpi?.overdueDebt);
    const ktgPercent = toNumber(kpi?.ktgPercent);
    const fleetActive = toNumber(kpi?.fleetActive);
    const fleetReady = toNumber(kpi?.fleetReady);
    const fleetUnavailable = toNumber(kpi?.fleetUnavailable);

    const costBreakdown = kpi ? [
        { name: "Ремонты", value: repairsAmount },
        { name: "Штрафы", value: finesAmount },
        { name: "Прочие", value: Math.max(0, cost - repairsAmount - finesAmount) },
    ] : [];

    const fuelChartData = fuelData.map((item) => ({
        vehicle: item.vehicle.split("(")[0].trim(),
        actual: item.fuelUsedLiters,
        norm: item.expectedFuelLiters,
    }));

    return (
        <div className="min-h-screen space-y-8 bg-slate-50 p-8 text-slate-900">
            <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
                <div>
                    <h1 className="mb-2 text-3xl font-bold tracking-tight text-slate-900">Панель KPI</h1>
                    <p className="text-slate-500">Ключевые показатели эффективности бизнеса и аналитика затрат.</p>
                </div>

                <div className="flex items-center gap-3">
                    <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40" />
                    <span className="text-slate-400">-</span>
                    <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40" />
                    <Button variant="outline" onClick={() => void fetchData()} disabled={loading}>
                        {loading ? "Загрузка..." : "Обновить"}
                    </Button>
                </div>
            </div>

            {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
                    {error}
                </div>
            )}

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-5">
                <MetricCard
                    title="Выручка"
                    value={kpi ? formatCompactMoney(revenue) : "—"}
                    trend={revenue > 0 ? "+" : undefined}
                    trendUp
                    subtitle={`Период: ${startDate} - ${endDate}`}
                />
                <MetricCard
                    title="Маржинальность"
                    value={kpi ? `${marginPercent.toFixed(1)}%` : "—"}
                    trend={kpi ? (marginPercent > 30 ? "> 30%" : "< 30%") : undefined}
                    trendUp={marginPercent > 30}
                    subtitle="Цель: >30%"
                />
                <MetricCard
                    title="Выполнено рейсов"
                    value={kpi ? String(tripsCompleted) : "—"}
                    subtitle="За выбранный период"
                />
                <MetricCard
                    title="Затраты на ремонт"
                    value={kpi ? formatCompactMoney(repairsAmount) : "—"}
                    subtitle="Ремонты и обслуживание"
                />
                <MetricCard
                    title="КТГ"
                    value={kpi ? `${ktgPercent.toFixed(1)}%` : "—"}
                    subtitle={kpi ? `Готовы к выпуску: ${fleetReady} / ${fleetActive}${fleetUnavailable > 0 ? `, не готовы: ${fleetUnavailable}` : ""}` : "Техническая готовность парка"}
                />
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <TrafficLight
                    label="Дебиторская задолженность"
                    status={kpi?.debtorLight || "green"}
                    amount={formatMoney(overdueDebt)}
                />
                <TrafficLight
                    label="Штрафы"
                    status={kpi?.finesLight || "green"}
                    amount={formatMoney(finesAmount)}
                />
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <Card className="col-span-1 lg:col-span-2">
                    <CardHeader>
                        <CardTitle className="text-lg font-semibold text-slate-900">Выручка, себестоимость и маржа</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-80 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    data={kpi ? [{ name: "Период", revenue: revenue / 1000, cost: cost / 1000, margin: margin / 1000 }] : []}
                                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                                    <XAxis dataKey="name" stroke="#64748b" axisLine={false} tickLine={false} />
                                    <YAxis stroke="#64748b" axisLine={false} tickLine={false} />
                                    <RechartsTooltip contentStyle={{ backgroundColor: "#ffffff", borderColor: "#e2e8f0", borderRadius: "8px" }} />
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
                                        {costBreakdown.map((_entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <RechartsTooltip contentStyle={{ backgroundColor: "#ffffff", borderColor: "#e2e8f0", borderRadius: "8px" }} />
                                    <Legend iconType="circle" layout="vertical" verticalAlign="middle" align="right" />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-lg font-semibold text-slate-900">Топливо: факт против нормы</CardTitle>
                        {fuelData.some((item) => item.status === "overconsumption") && (
                            <span className="rounded-full border border-yellow-200 bg-yellow-100 px-2 py-1 text-xs text-yellow-700">
                                Есть перерасход
                            </span>
                        )}
                    </CardHeader>
                    <CardContent>
                        {fuelChartData.length > 0 ? (
                            <div className="mt-4 h-64 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={fuelChartData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                                        <XAxis type="number" stroke="#64748b" axisLine={false} tickLine={false} unit=" л" />
                                        <YAxis type="category" dataKey="vehicle" stroke="#64748b" axisLine={false} tickLine={false} width={100} />
                                        <RechartsTooltip contentStyle={{ backgroundColor: "#ffffff", borderColor: "#e2e8f0", borderRadius: "8px" }} />
                                        <Legend iconType="circle" />
                                        <Bar dataKey="actual" name="Факт" fill="#ef4444" radius={[0, 4, 4, 0]} barSize={14} />
                                        <Bar dataKey="norm" name="Норма" fill="#10b981" radius={[0, 4, 4, 0]} barSize={14} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        ) : (
                            <div className="py-12 text-center text-slate-400">Нет данных по ГСМ за выбранный период.</div>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg font-semibold text-slate-900">Топ водителей</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                                    <tr>
                                        <th className="px-4 py-3 font-medium">Водитель</th>
                                        <th className="px-4 py-3 font-medium">Рейсы</th>
                                        <th className="px-4 py-3 font-medium">Эко-вождение</th>
                                        <th className="px-4 py-3 text-right font-medium">Оценка</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {(kpi?.topDrivers || []).map((driver, index) => (
                                        <tr key={`${driver.name}-${index}`} className="transition-colors hover:bg-slate-50">
                                            <td className="px-4 py-4 font-medium text-slate-900">
                                                <div className="flex items-center gap-2">
                                                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-600">
                                                        {index + 1}
                                                    </div>
                                                    {driver.name}
                                                </div>
                                            </td>
                                            <td className="px-4 py-4 text-slate-500">{driver.trips}</td>
                                            <td className="px-4 py-4 text-emerald-600">{driver.eco}</td>
                                            <td className="px-4 py-4 text-right font-medium text-yellow-600">{driver.score}</td>
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
