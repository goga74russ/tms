"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { differenceInCalendarDays, format, subDays } from "date-fns";
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
import { Dialog } from "@/components/ui/dialog";
import { DashboardHeader } from "@/components/ui/dashboard-header";
import { MetricCard } from "@/components/ui/metric-card";
import { computeRange, type PeriodRange } from "@/components/ui/period-selector";
import { BarChart3, TrendingUp, Truck, Percent, Wallet, ArrowRight } from "lucide-react";
import Link from "next/link";

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

type ApiResponse<T> = { success: boolean; data: T };

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
                <p className="text-sm font-medium text-neutral-700">{label}</p>
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

function computeChange(current: number, previous: number): { value: number; direction: 'up' | 'down' | 'flat' } | undefined {
    if (!Number.isFinite(previous) || previous === 0) return undefined;
    const diff = ((current - previous) / Math.abs(previous)) * 100;
    if (Math.abs(diff) < 0.5) return { value: 0, direction: 'flat' };
    return { value: Math.round(diff), direction: diff > 0 ? 'up' : 'down' };
}

interface DriverScoreEntry {
    id?: string;
    driverId?: string;
    name?: string;
    fullName?: string;
    score?: number | string;
    tripsCount?: number;
    onTimePercent?: number;
    coldBreaches?: number;
    rtoBreaches?: number;
    fines?: number;
}

interface DriverScoreDetail {
    tripsCount: number;
    onTimePercent: number;
    coldBreaches: number;
    rtoBreaches: number;
    fines: number;
    score: number;
}

function DriverScoreboardSection() {
    const today = new Date();
    const [from, setFrom] = useState(format(subDays(today, 30), "yyyy-MM-dd"));
    const [to, setTo] = useState(format(today, "yyyy-MM-dd"));
    const [top, setTop] = useState<DriverScoreEntry[]>([]);
    const [bottom, setBottom] = useState<DriverScoreEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selected, setSelected] = useState<DriverScoreEntry | null>(null);
    const [detail, setDetail] = useState<DriverScoreDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get<{ success: boolean; data: { top: DriverScoreEntry[]; bottom: DriverScoreEntry[] } }>(
                `/drivers/scoreboard?from=${from}&to=${to}&limit=5`,
            );
            setTop(res.data?.top || []);
            setBottom(res.data?.bottom || []);
        } catch (err: any) {
            setError(err?.message || "Не удалось загрузить рейтинг");
        } finally {
            setLoading(false);
        }
    }, [from, to]);

    useEffect(() => {
        void load();
    }, [load]);

    const openDriver = async (entry: DriverScoreEntry) => {
        const id = entry.driverId || entry.id;
        if (!id) return;
        setSelected(entry);
        setDetail(null);
        setDetailLoading(true);
        try {
            const res = await api.get<{ success: boolean; data: DriverScoreDetail }>(
                `/drivers/${id}/score?from=${from}&to=${to}`,
            );
            setDetail(res.data || null);
        } catch {
            setDetail(null);
        } finally {
            setDetailLoading(false);
        }
    };

    const renderRow = (entry: DriverScoreEntry, idx: number, tone: "green" | "red") => {
        const name = entry.name || entry.fullName || (entry.driverId || entry.id || "—").slice(0, 8);
        const scoreNum = typeof entry.score === "string" ? parseFloat(entry.score) : entry.score;
        const accent = tone === "green" ? "text-emerald-600" : "text-red-600";
        const bg = tone === "green" ? "bg-emerald-100" : "bg-red-100";
        return (
            <button
                key={`${entry.id || entry.driverId || idx}`}
                type="button"
                onClick={() => openDriver(entry)}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-neutral-50"
            >
                <div className="flex items-center gap-3 min-w-0">
                    <span className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${bg} ${accent}`}>
                        {idx + 1}
                    </span>
                    <span className="truncate text-neutral-800">{name}</span>
                </div>
                <span className={`font-bold ${accent}`}>{scoreNum != null && Number.isFinite(scoreNum) ? scoreNum.toFixed(1) : "—"}</span>
            </button>
        );
    };

    return (
        <Card>
            <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <CardTitle className="text-lg font-semibold text-neutral-900">Рейтинг водителей</CardTitle>
                <div className="flex items-center gap-2">
                    <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-36" />
                    <span className="text-neutral-400">-</span>
                    <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-36" />
                    <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
                        {loading ? "..." : "Обновить"}
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <div>
                        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-emerald-600">Топ 5</p>
                        {top.length === 0 ? (
                            <p className="py-4 text-center text-sm text-neutral-400">Нет данных</p>
                        ) : (
                            <div className="space-y-1">{top.map((e, i) => renderRow(e, i, "green"))}</div>
                        )}
                    </div>
                    <div>
                        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-red-600">Худшие 5</p>
                        {bottom.length === 0 ? (
                            <p className="py-4 text-center text-sm text-neutral-400">Нет данных</p>
                        ) : (
                            <div className="space-y-1">{bottom.map((e, i) => renderRow(e, i, "red"))}</div>
                        )}
                    </div>
                </div>
            </CardContent>

            <Dialog
                open={Boolean(selected)}
                onClose={() => { setSelected(null); setDetail(null); }}
                title={`Детали водителя · ${selected?.name || selected?.fullName || ""}`}
            >
                {detailLoading ? (
                    <p className="py-6 text-center text-sm text-neutral-500">Загрузка...</p>
                ) : !detail ? (
                    <p className="py-6 text-center text-sm text-neutral-400">Данных нет</p>
                ) : (
                    <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="rounded-lg bg-neutral-50 px-3 py-2">
                            <p className="text-xs text-neutral-500">Рейсов</p>
                            <p className="text-lg font-bold text-neutral-900">{detail.tripsCount}</p>
                        </div>
                        <div className="rounded-lg bg-neutral-50 px-3 py-2">
                            <p className="text-xs text-neutral-500">В срок (%)</p>
                            <p className="text-lg font-bold text-neutral-900">{detail.onTimePercent}</p>
                        </div>
                        <div className="rounded-lg bg-neutral-50 px-3 py-2">
                            <p className="text-xs text-neutral-500">Нарушения холодовой цепи</p>
                            <p className="text-lg font-bold text-neutral-900">{detail.coldBreaches}</p>
                        </div>
                        <div className="rounded-lg bg-neutral-50 px-3 py-2">
                            <p className="text-xs text-neutral-500">Нарушения возврата ТС</p>
                            <p className="text-lg font-bold text-neutral-900">{detail.rtoBreaches}</p>
                        </div>
                        <div className="rounded-lg bg-neutral-50 px-3 py-2">
                            <p className="text-xs text-neutral-500">Штрафы</p>
                            <p className="text-lg font-bold text-neutral-900">{detail.fines}</p>
                        </div>
                        <div className="rounded-lg bg-emerald-50 px-3 py-2">
                            <p className="text-xs text-emerald-600">Оценка</p>
                            <p className="text-lg font-bold text-emerald-700">{detail.score}</p>
                        </div>
                    </div>
                )}
            </Dialog>
        </Card>
    );
}

export default function KPIDashboard() {
    const [mounted, setMounted] = useState(false);
    const [kpi, setKpi] = useState<KpiData | null>(null);
    const [prevKpi, setPrevKpi] = useState<KpiData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [period, setPeriod] = useState<PeriodRange>(() => computeRange('mtd'));

    useEffect(() => {
        setMounted(true);
    }, []);

    const startDate = useMemo(() => format(period.from, 'yyyy-MM-dd'), [period.from]);
    const endDate = useMemo(() => format(period.to, 'yyyy-MM-dd'), [period.to]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            // Compute prior-period window of equal length for change% comparison.
            const days = Math.max(1, differenceInCalendarDays(period.to, period.from));
            const prevTo = subDays(period.from, 1);
            const prevFrom = subDays(prevTo, days);
            const prevStart = format(prevFrom, 'yyyy-MM-dd');
            const prevEnd = format(prevTo, 'yyyy-MM-dd');

            const [kpiRes, prevKpiRes] = await Promise.all([
                api.get<ApiResponse<KpiData>>(`/finance/kpi?startDate=${startDate}&endDate=${endDate}`),
                api.get<ApiResponse<KpiData>>(`/finance/kpi?startDate=${prevStart}&endDate=${prevEnd}`).catch(() => ({ success: false, data: null as unknown as KpiData })),
            ]);

            setKpi(kpiRes.data);
            setPrevKpi(prevKpiRes.data ?? null);
        } catch (err: any) {
            setError(err.message || "Не удалось загрузить данные KPI.");
        } finally {
            setLoading(false);
        }
    }, [endDate, startDate, period.from, period.to]);

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

    const prevRevenue = toNumber(prevKpi?.revenue);
    const prevTrips = toNumber(prevKpi?.tripsCompleted);
    const prevMargin = toNumber(prevKpi?.marginPercent);

    // Build a 7-point sparkline from the current/prev pair (smooth visual gradient).
    const sparkBetween = (start: number, end: number, n = 7) => {
        if (start === 0 && end === 0) return [];
        const arr: number[] = [];
        for (let i = 0; i < n; i++) {
            const t = i / (n - 1);
            arr.push(start + (end - start) * t);
        }
        return arr;
    };

    const costBreakdown = kpi ? [
        { name: "Ремонты", value: repairsAmount },
        { name: "Штрафы", value: finesAmount },
        { name: "Прочие", value: Math.max(0, cost - repairsAmount - finesAmount) },
    ] : [];

    return (
        <div className="min-h-screen space-y-6 bg-neutral-50 p-4 sm:p-6 lg:p-8 text-neutral-900">
            <DashboardHeader
                title="Панель KPI"
                subtitle="Финансовый дашборд руководителя: выручка, маржа, дебиторка, штрафы"
                icon={BarChart3}
                iconTone="brand"
                period={period}
                onPeriodChange={setPeriod}
                onRefresh={() => void fetchData()}
                refreshing={loading}
            />

            {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
                    {error}
                </div>
            )}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                    label="Выручка"
                    value={kpi ? formatCompactMoney(revenue) : "—"}
                    change={computeChange(revenue, prevRevenue)}
                    hint="vs прошлый период"
                    sparkline={sparkBetween(prevRevenue, revenue)}
                    sparklineTone="brand"
                    icon={TrendingUp}
                    tone="brand"
                />
                <MetricCard
                    label="Рейсы"
                    value={kpi ? String(tripsCompleted) : "—"}
                    change={computeChange(tripsCompleted, prevTrips)}
                    hint="за период"
                    sparkline={sparkBetween(prevTrips, tripsCompleted)}
                    sparklineTone="success"
                    icon={Truck}
                    tone="info"
                />
                <MetricCard
                    label="Маржинальность"
                    value={kpi ? `${marginPercent.toFixed(1)}%` : "—"}
                    change={computeChange(marginPercent, prevMargin)}
                    hint="цель >30%"
                    sparkline={sparkBetween(prevMargin, marginPercent)}
                    sparklineTone={marginPercent >= 30 ? 'success' : 'warning'}
                    icon={Percent}
                    tone={marginPercent >= 30 ? 'success' : 'warning'}
                />
                <MetricCard
                    label="Маржа, ₽"
                    value={kpi ? formatCompactMoney(margin) : "—"}
                    change={computeChange(margin, toNumber(prevKpi?.margin))}
                    hint="абсолютная маржа"
                    sparkline={sparkBetween(toNumber(prevKpi?.margin), margin)}
                    sparklineTone={margin >= 0 ? 'success' : 'warning'}
                    icon={Wallet}
                    tone={margin >= 0 ? 'success' : 'warning'}
                />
            </div>

            <Link
                href="/analytics"
                className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-700 shadow-sm transition-colors hover:border-brand-300 hover:bg-brand-50"
            >
                <span>
                    Операционные метрики — ТО, маржинальность рейсов, расход топлива, КТГ парка — на странице{' '}
                    <span className="font-semibold text-brand-700">Аналитика</span>
                </span>
                <ArrowRight className="h-4 w-4 text-neutral-400" />
            </Link>

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
                        <CardTitle className="text-lg font-semibold text-neutral-900">Выручка, себестоимость и маржа</CardTitle>
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
                        <CardTitle className="text-lg font-semibold text-neutral-900">Структура затрат</CardTitle>
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

            <div className="grid grid-cols-1 gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg font-semibold text-neutral-900">Топ водителей (KPI)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="border-b border-neutral-200 text-xs uppercase text-neutral-500">
                                    <tr>
                                        <th className="px-4 py-3 font-medium">Водитель</th>
                                        <th className="px-4 py-3 font-medium">Рейсы</th>
                                        <th className="px-4 py-3 font-medium">Эко-вождение</th>
                                        <th className="px-4 py-3 text-right font-medium">Оценка</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-neutral-100">
                                    {(kpi?.topDrivers || []).map((driver, index) => (
                                        <tr key={`${driver.name}-${index}`} className="transition-colors hover:bg-neutral-50">
                                            <td className="px-4 py-4 font-medium text-neutral-900">
                                                <div className="flex items-center gap-2">
                                                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-600">
                                                        {index + 1}
                                                    </div>
                                                    {driver.name}
                                                </div>
                                            </td>
                                            <td className="px-4 py-4 text-neutral-500">{driver.trips}</td>
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

            <DriverScoreboardSection />
        </div>
    );
}
