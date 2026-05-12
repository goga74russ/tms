// ============================================================
// Round 2B — Admin billing overview.
// Lists all organizations with their plan, status, MRR contribution.
// ============================================================
'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { formatKopecks, PLAN_IDS, type PlanId, type SubscriptionStatus } from '@tms/shared';
import { Stat } from '@/components/ui/stat';
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
    const [rows, setRows] = useState<AdminBillingRow[] | null>(null);
    const [statusFilter, setStatusFilter] = useState<'' | SubscriptionStatus>('');
    const [planFilter, setPlanFilter] = useState<'' | PlanId>('');

    useEffect(() => {
        api.get<{ success: boolean; data: AdminBillingRow[] }>('/admin/billing/overview')
            .then((res) => setRows(res.data ?? []))
            .catch((e) => {
                const msg = e instanceof Error ? e.message : 'Ошибка загрузки';
                toast({ variant: 'error', title: 'Не удалось загрузить биллинг', description: msg });
                setRows([]);
            });
    }, [toast]);

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

    const pastDueCount = (rows ?? []).filter(r => r.status === 'past_due' || r.status === 'suspended').length;

    return (
        <div className="space-y-6">
            <header className="flex items-center gap-3">
                <div className="shrink-0 w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center">
                    <CreditCard className="w-5 h-5" />
                </div>
                <div>
                    <h1 className="text-2xl font-semibold text-slate-900">Биллинг — обзор</h1>
                    <p className="text-sm text-slate-500 mt-0.5">Все организации, их тарифы и статусы</p>
                </div>
            </header>

            {/* Stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Stat label="Организаций" value={filtered.length} icon={Building2} tone="neutral" />
                <Stat label="MRR (активные)" value={formatKopecks(totalMrr)} icon={TrendingUp} tone="success" />
                <Stat label="Просрочки" value={pastDueCount} icon={AlertCircle} tone={pastDueCount > 0 ? 'danger' : 'neutral'} />
                <Stat label="Тарифов" value={PLAN_IDS.length} icon={Receipt} tone="info" hint={PLAN_IDS.map(p => `${p}: ${byPlan[p] ?? 0}`).join(' · ')} />
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3 bg-white border border-slate-200 rounded-lg p-3">
                <label className="text-xs text-slate-500 flex items-center gap-2">
                    Статус:
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                        className="border border-slate-200 rounded-md px-2 py-1 text-sm text-slate-700"
                    >
                        {STATUS_FILTER.map((s) => (
                            <option key={s} value={s}>{s === '' ? 'Все' : STATUS_LABEL[s]}</option>
                        ))}
                    </select>
                </label>
                <label className="text-xs text-slate-500 flex items-center gap-2">
                    Тариф:
                    <select
                        value={planFilter}
                        onChange={(e) => setPlanFilter(e.target.value as typeof planFilter)}
                        className="border border-slate-200 rounded-md px-2 py-1 text-sm text-slate-700"
                    >
                        <option value="">Все</option>
                        {PLAN_IDS.map((p) => (
                            <option key={p} value={p}>{p}</option>
                        ))}
                    </select>
                </label>
            </div>

            {/* Table */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
                        <tr>
                            <th className="text-left px-4 py-2.5">Организация</th>
                            <th className="text-left px-4 py-2.5">ИНН</th>
                            <th className="text-left px-4 py-2.5">Тариф</th>
                            <th className="text-left px-4 py-2.5">Статус</th>
                            <th className="text-left px-4 py-2.5">До</th>
                            <th className="text-right px-4 py-2.5">MRR</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
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
                            <tr key={r.organizationId} className="hover:bg-slate-50">
                                <td className="px-4 py-2.5 text-slate-900">{r.organizationName}</td>
                                <td className="px-4 py-2.5 text-slate-600 font-mono text-xs">{r.inn ?? '—'}</td>
                                <td className="px-4 py-2.5">
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
                                        {r.planId}
                                    </span>
                                </td>
                                <td className="px-4 py-2.5">
                                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                                        r.status === 'active' ? 'bg-emerald-50 text-emerald-700' :
                                        r.status === 'trial' ? 'bg-amber-50 text-amber-700' :
                                        r.status === 'past_due' || r.status === 'suspended' ? 'bg-rose-50 text-rose-700' :
                                        'bg-slate-100 text-slate-600'
                                    }`}>
                                        {STATUS_LABEL[r.status]}
                                    </span>
                                </td>
                                <td className="px-4 py-2.5 text-slate-600 text-xs">
                                    {r.currentPeriodEnd ? new Date(r.currentPeriodEnd).toLocaleDateString('ru-RU') : '—'}
                                </td>
                                <td className="px-4 py-2.5 text-right font-medium text-slate-900">
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
