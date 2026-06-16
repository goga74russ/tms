// ============================================================
// Round 2B — Admin billing overview.
// Lists all organizations with their plan, status, MRR contribution.
// ============================================================
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useUser } from '@/lib/user-context';
import { formatKopecks, label, PLAN_IDS, PLAN_LABELS, type PlanId, type SubscriptionStatus } from '@tms/shared';
import {
    Bar,
    BarChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip as RechartsTooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { MetricCard } from '@/components/ui/metric-card';
import { DashboardHeader } from '@/components/ui/dashboard-header';
import { computeRange, type PeriodRange } from '@/components/ui/period-selector';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SkeletonRow } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { CreditCard, Building2, TrendingUp, AlertCircle, Receipt } from 'lucide-react';

interface AdminBillingRow {
    organizationId: string;
    organizationName: string;
    inn: string | null;
    planId: PlanId;
    status: SubscriptionStatus;
    currentPeriodEnd: string | null;
    mrrKopecks: number;
}

const STATUS_LABEL: Record<SubscriptionStatus, string> = {
    trial: 'Триал',
    active: 'Активен',
    past_due: 'Просрочен',
    suspended: 'Приостановлен',
    cancelled: 'Отменён',
};

const STATUS_FILTER: Array<'' | SubscriptionStatus> = ['', 'trial', 'active', 'past_due', 'suspended', 'cancelled'];

export default function AdminBillingPage() {
    const { toast } = useToast();
    const router = useRouter();
    const { user, loading: userLoading } = useUser();
    const [rows, setRows] = useState<AdminBillingRow[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [statusFilter, setStatusFilter] = useState<'' | SubscriptionStatus>('');
    const [planFilter, setPlanFilter] = useState<'' | PlanId>('');
    const [period, setPeriod] = useState<PeriodRange>(() => computeRange('mtd'));

    // Guard: cross-tenant billing view is super-admin-only. Tenant admins
    // landing here directly get redirected to their normal admin home.
    useEffect(() => {
        if (userLoading) return;
        if (!user || !user.isSuperAdmin) {
            router.replace('/admin/users');
        }
    }, [user, userLoading, router]);

    const loadRows = () => {
        setLoading(true);
        api.get<{ success: boolean; data: AdminBillingRow[] }>('/admin/billing/overview')
            .then((res) => setRows(res.data ?? []))
            .catch((e) => {
                const msg = e instanceof Error ? e.message : 'Ошибка загрузки';
                toast({ variant: 'error', title: 'Не удалось загрузить биллинг', description: msg });
                setRows([]);
            })
            .finally(() => setLoading(false));
    };

    // P3 (код-аудит 2026-06-14): cross-tenant billing-запрос только ПОСЛЕ подтверждения
    // super-admin — раньше loadRows на mount уходил до guard-редиректа (запрос летел
    // даже у не-super-admin; сервер тоже гейтит, но запрос лишний).
    useEffect(() => {
        if (userLoading) return;
        if (user?.isSuperAdmin) loadRows();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, userLoading]);

    const filtered = useMemo(() => {
        if (!rows) return [];
        return rows.filter((r) => {
            if (statusFilter && r.status !== statusFilter) return false;
            if (planFilter && r.planId !== planFilter) return false;
            return true;
        });
    }, [rows, statusFilter, planFilter]);

    const totalMrr = useMemo(
        () => filtered.reduce((sum, r) => sum + r.mrrKopecks, 0),
        [filtered],
    );

    const byPlan = useMemo(() => {
        const acc: Record<string, number> = {};
        for (const r of filtered) acc[r.planId] = (acc[r.planId] ?? 0) + 1;
        return acc;
    }, [filtered]);

    // MRR by plan, in roubles (kopecks/100), for the mini bar chart.
    const mrrByPlan = useMemo(() => {
        const acc: Record<string, number> = {};
        for (const r of filtered) acc[r.planId] = (acc[r.planId] ?? 0) + r.mrrKopecks;
        return PLAN_IDS.map((p) => ({ plan: label(PLAN_LABELS, p), mrr: Math.round((acc[p] ?? 0) / 100) }));
    }, [filtered]);

    const pastDueCount = (rows ?? []).filter(r => r.status === 'past_due' || r.status === 'suspended').length;
    const activeCount = (rows ?? []).filter(r => r.status === 'active').length;

    return (
        <div className="space-y-6">
            <DashboardHeader
                title="Биллинг — обзор"
                subtitle="Все организации, их тарифы и статусы"
                icon={CreditCard}
                iconTone="brand"
                period={period}
                onPeriodChange={setPeriod}
                onRefresh={loadRows}
                refreshing={loading}
            />

            {/* Metric cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <MetricCard
                    label="Организаций"
                    value={filtered.length}
                    hint={`${activeCount} активных`}
                    icon={Building2}
                    tone="neutral"
                />
                <MetricCard
                    label="MRR (активные)"
                    value={formatKopecks(totalMrr)}
                    hint="ежемесячный доход"
                    icon={TrendingUp}
                    tone="success"
                    sparklineTone="success"
                />
                <MetricCard
                    label="Просрочки"
                    value={pastDueCount}
                    hint={pastDueCount > 0 ? 'требует внимания' : 'нет просрочек'}
                    icon={AlertCircle}
                    tone={pastDueCount > 0 ? 'danger' : 'neutral'}
                    changeGood={false}
                />
                <MetricCard
                    label="Тарифов"
                    value={PLAN_IDS.length}
                    hint={PLAN_IDS.map((p) => `${label(PLAN_LABELS, p)}: ${byPlan[p] ?? 0}`).join(' · ')}
                    icon={Receipt}
                    tone="info"
                />
            </div>

            {/* Mini-charts row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base font-semibold text-neutral-900">MRR по тарифам</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[180px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={mrrByPlan} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                                    <XAxis dataKey="plan" stroke="#64748b" axisLine={false} tickLine={false} fontSize={12} />
                                    <YAxis stroke="#64748b" axisLine={false} tickLine={false} fontSize={12} />
                                    <RechartsTooltip
                                        contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '8px' }}
                                        formatter={(v: any) => [`${Number(v).toLocaleString('ru-RU')} ₽`, 'MRR']}
                                    />
                                    <Bar dataKey="mrr" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base font-semibold text-neutral-900">Отток за 6 месяцев</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[180px] w-full flex items-center justify-center">
                            <EmptyState
                                icon={TrendingUp}
                                title="Нет данных по оттоку"
                                description="Данные появятся после 2+ месяцев работы."
                                tone="neutral"
                            />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3 bg-white border border-neutral-200 rounded-lg p-3">
                <label className="text-xs text-neutral-500 flex items-center gap-2">
                    Статус:
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                        className="border border-neutral-200 rounded-md px-2 py-1 text-sm text-neutral-700"
                    >
                        {STATUS_FILTER.map((s) => (
                            <option key={s} value={s}>{s === '' ? 'Все' : STATUS_LABEL[s]}</option>
                        ))}
                    </select>
                </label>
                <label className="text-xs text-neutral-500 flex items-center gap-2">
                    Тариф:
                    <select
                        value={planFilter}
                        onChange={(e) => setPlanFilter(e.target.value as typeof planFilter)}
                        className="border border-neutral-200 rounded-md px-2 py-1 text-sm text-neutral-700"
                    >
                        <option value="">Все</option>
                        {PLAN_IDS.map((p) => (
                            <option key={p} value={p}>{label(PLAN_LABELS, p)}</option>
                        ))}
                    </select>
                </label>
            </div>

            {/* Table */}
            <div className="bg-white border border-neutral-200 rounded-xl overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                    <thead className="bg-neutral-50 text-neutral-600 text-xs uppercase">
                        <tr>
                            <th className="text-left px-4 py-2.5">Организация</th>
                            <th className="text-left px-4 py-2.5">ИНН</th>
                            <th className="text-left px-4 py-2.5">Тариф</th>
                            <th className="text-left px-4 py-2.5">Статус</th>
                            <th className="text-left px-4 py-2.5">До</th>
                            <th className="text-right px-4 py-2.5">MRR</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                        {rows === null ? (
                            Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} columns={6} />)
                        ) : filtered.length === 0 ? (
                            <tr><td colSpan={6}>
                                <div className="p-6">
                                    <EmptyState
                                        icon={Building2}
                                        title="Нет организаций"
                                        description={statusFilter || planFilter ? 'Попробуйте сбросить фильтры.' : 'Организаций ещё не зарегистрировано.'}
                                    />
                                </div>
                            </td></tr>
                        ) : filtered.map((r) => (
                            <tr key={r.organizationId} className="hover:bg-neutral-50">
                                <td className="px-4 py-2.5 text-neutral-900">{r.organizationName}</td>
                                <td className="px-4 py-2.5 text-neutral-600 font-mono text-xs">{r.inn ?? '—'}</td>
                                <td className="px-4 py-2.5">
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-brand-50 text-brand-700">
                                        {label(PLAN_LABELS, r.planId)}
                                    </span>
                                </td>
                                <td className="px-4 py-2.5">
                                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                                        r.status === 'active' ? 'bg-success-50 text-success-700' :
                                        r.status === 'trial' ? 'bg-warning-50 text-warning-700' :
                                        r.status === 'past_due' || r.status === 'suspended' ? 'bg-danger-50 text-danger-700' :
                                        'bg-neutral-100 text-neutral-600'
                                    }`}>
                                        {STATUS_LABEL[r.status]}
                                    </span>
                                </td>
                                <td className="px-4 py-2.5 text-neutral-600 text-xs">
                                    {r.currentPeriodEnd ? new Date(r.currentPeriodEnd).toLocaleDateString('ru-RU') : '—'}
                                </td>
                                <td className="px-4 py-2.5 text-right font-medium text-neutral-900">
                                    {r.mrrKopecks > 0 ? formatKopecks(r.mrrKopecks) : '—'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
