// ============================================================
// Round 2B — Customer-facing billing page.
// Current plan, plan comparison, usage bars, payment history.
// ============================================================
'use client';

import { useEffect, useState } from 'react';
import { Check, X, ExternalLink, AlertCircle, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import {
    formatKopecks,
    type Plan,
    type PlanId,
    type PaymentRecord,
    type SubscriptionWithPlan,
    type UsageReport,
} from '@tms/shared';

const FEATURE_ORDER: Array<{ key: string; label: string }> = [
    { key: 'ai_copilot', label: 'AI Co-pilot' },
    { key: 'edi', label: 'Электронный документооборот' },
    { key: 'marking', label: 'Честный знак' },
    { key: 'api_export', label: 'API экспорт' },
    { key: 'sso', label: 'SSO' },
    { key: 'multi_tenant', label: 'Мульти-арендность' },
    { key: 'priority_support', label: 'Приоритетная поддержка' },
    { key: 'custom_integrations', label: 'Персональные интеграции' },
];

const STATUS_LABEL: Record<string, string> = {
    trial: 'Триал',
    active: 'Активен',
    past_due: 'Просрочен',
    suspended: 'Приостановлен',
    cancelled: 'Отменён',
    pending: 'Ожидает',
    succeeded: 'Оплачен',
    failed: 'Неуспешно',
    refunded: 'Возврат',
};

function formatLimit(n: number | null): string {
    return n === null ? '∞' : String(n);
}

function daysUntil(iso: string | null): number | null {
    if (!iso) return null;
    const ms = new Date(iso).getTime() - Date.now();
    if (ms <= 0) return 0;
    return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

export default function BillingPage() {
    const [plans, setPlans] = useState<Plan[] | null>(null);
    const [sub, setSub] = useState<SubscriptionWithPlan | null>(null);
    const [usage, setUsage] = useState<UsageReport | null>(null);
    const [history, setHistory] = useState<PaymentRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionPlan, setActionPlan] = useState<PlanId | null>(null);
    const [error, setError] = useState<string | null>(null);

    const reload = async () => {
        try {
            const [plansRes, subRes, usageRes, payRes] = await Promise.all([
                api.get<{ success: boolean; data: Plan[] }>('/billing/plans'),
                api.get<{ success: boolean; data: SubscriptionWithPlan }>('/billing/subscription'),
                api.get<{ success: boolean; data: UsageReport }>('/billing/usage'),
                api.get<{ success: boolean; data: PaymentRecord[] }>('/billing/payments'),
            ]);
            setPlans(plansRes.data ?? null);
            setSub(subRes.data ?? null);
            setUsage(usageRes.data ?? null);
            setHistory(payRes.data ?? []);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Ошибка загрузки');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { void reload(); }, []);

    const subscribe = async (planId: PlanId) => {
        setActionPlan(planId);
        setError(null);
        try {
            const res = await api.post<{ success: boolean; data: { paymentUrl: string } }>(
                '/billing/subscribe',
                { planId, returnUrl: `${window.location.origin}/billing?status=return` },
            );
            if (res.data?.paymentUrl) {
                window.location.href = res.data.paymentUrl;
                return;
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Не удалось создать платёж');
        } finally {
            setActionPlan(null);
        }
    };

    const cancel = async () => {
        try {
            await api.post('/billing/cancel');
            await reload();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Ошибка отмены');
        }
    };

    if (loading) {
        return (
            <div className="p-8 flex items-center justify-center">
                <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
            </div>
        );
    }

    const currentPlanId = sub?.plan.id ?? 'free';
    const trialDays = daysUntil(sub?.subscription?.trialEndsAt ?? null);

    return (
        <div className="max-w-6xl mx-auto p-6 space-y-6">
            <header className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Тарифы и подписка</h1>
                    <p className="text-sm text-slate-500 mt-1">Управление подпиской и расходом лимитов.</p>
                </div>
            </header>

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    <span className="text-sm">{error}</span>
                </div>
            )}

            {/* Current plan card */}
            {sub && (
                <div className="bg-gradient-to-br from-indigo-50 to-white border border-indigo-100 rounded-xl p-6 flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <p className="text-xs uppercase tracking-wide text-indigo-700 font-semibold">Текущий тариф</p>
                        <h2 className="text-xl font-bold text-slate-900 mt-1">{sub.plan.nameRu}</h2>
                        <div className="flex items-center gap-3 mt-2">
                            {sub.subscription && (
                                <span className="inline-flex items-center px-2 py-0.5 bg-white border border-indigo-200 text-indigo-700 text-xs rounded-full">
                                    {STATUS_LABEL[sub.subscription.status] ?? sub.subscription.status}
                                </span>
                            )}
                            {trialDays !== null && trialDays > 0 && (
                                <span className="text-xs text-amber-700">
                                    Триал — осталось {trialDays} дн.
                                </span>
                            )}
                            {sub.subscription?.cancelAtPeriodEnd && (
                                <span className="text-xs text-rose-700">Не будет продлён</span>
                            )}
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-2xl font-bold text-slate-900">
                            {sub.plan.priceMonthlyKopecks > 0 ? formatKopecks(sub.plan.priceMonthlyKopecks) : 'Бесплатно'}
                            {sub.plan.priceMonthlyKopecks > 0 && <span className="text-sm font-normal text-slate-500"> / мес</span>}
                        </div>
                        {sub.subscription && !sub.subscription.cancelAtPeriodEnd && sub.subscription.status === 'active' && (
                            <button onClick={cancel} className="mt-2 text-xs text-slate-500 hover:text-rose-600 underline-offset-2 hover:underline">
                                Отменить продление
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Usage bars */}
            {usage && (
                <section>
                    <h3 className="text-sm font-semibold text-slate-700 mb-3 uppercase tracking-wide">Использование в этом периоде</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <UsageBar label="Транспорт" current={usage.vehicles.current} limit={usage.vehicles.limit} />
                        <UsageBar label="Заявки в этом месяце" current={usage.orders.current} limit={usage.orders.limit} />
                        <UsageBar label="Сообщения co-pilot за день" current={usage.copilotMessages.current} limit={usage.copilotMessages.limit} />
                    </div>
                </section>
            )}

            {/* Plan comparison */}
            {plans && (
                <section>
                    <h3 className="text-sm font-semibold text-slate-700 mb-3 uppercase tracking-wide">Сравнение тарифов</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {plans.map((p) => {
                            const isCurrent = p.id === currentPlanId;
                            return (
                                <div
                                    key={p.id}
                                    className={`rounded-xl border bg-white p-5 flex flex-col gap-3 ${
                                        isCurrent ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-slate-200'
                                    }`}
                                >
                                    <div>
                                        <h4 className="font-semibold text-slate-900">{p.nameRu}</h4>
                                        <p className="text-2xl font-bold text-slate-900 mt-1">
                                            {p.priceMonthlyKopecks > 0 ? formatKopecks(p.priceMonthlyKopecks) : '0 ₽'}
                                            {p.priceMonthlyKopecks > 0 && <span className="text-xs font-normal text-slate-500"> / мес</span>}
                                        </p>
                                    </div>

                                    <ul className="text-xs text-slate-700 space-y-1.5 flex-1">
                                        <li>Транспорт: <strong>{formatLimit(p.vehicleLimit)}</strong></li>
                                        <li>Заявок в месяц: <strong>{formatLimit(p.monthlyOrdersLimit)}</strong></li>
                                        <li>Co-pilot/день: <strong>{formatLimit(p.copilotMessagesDaily)}</strong></li>
                                        {FEATURE_ORDER.map((f) => (
                                            <li key={f.key} className="flex items-center gap-1.5">
                                                {p.features[f.key as keyof typeof p.features]
                                                    ? <Check className="w-3.5 h-3.5 text-emerald-600" />
                                                    : <X className="w-3.5 h-3.5 text-slate-300" />}
                                                <span className={p.features[f.key as keyof typeof p.features] ? 'text-slate-700' : 'text-slate-400 line-through'}>
                                                    {f.label}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>

                                    {isCurrent ? (
                                        <button disabled className="w-full px-3 py-2 bg-slate-100 text-slate-500 rounded-lg text-sm font-medium cursor-default">
                                            Текущий тариф
                                        </button>
                                    ) : p.priceMonthlyKopecks === 0 ? (
                                        <button disabled className="w-full px-3 py-2 bg-slate-100 text-slate-500 rounded-lg text-sm font-medium cursor-default">
                                            {p.id === 'enterprise' ? 'По запросу' : 'Free'}
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => void subscribe(p.id)}
                                            disabled={actionPlan === p.id}
                                            className="inline-flex items-center justify-center gap-1.5 w-full px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                                        >
                                            <Sparkles className="w-3.5 h-3.5" />
                                            {actionPlan === p.id ? 'Создаю платёж…' : `Перейти на ${p.nameRu}`}
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </section>
            )}

            {/* Payment history */}
            <section>
                <h3 className="text-sm font-semibold text-slate-700 mb-3 uppercase tracking-wide">История платежей</h3>
                {history.length === 0 ? (
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-6 text-center text-sm text-slate-500">
                        Платежей пока не было.
                    </div>
                ) : (
                    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
                                <tr>
                                    <th className="text-left px-4 py-2.5">Дата</th>
                                    <th className="text-left px-4 py-2.5">Сумма</th>
                                    <th className="text-left px-4 py-2.5">Статус</th>
                                    <th className="text-left px-4 py-2.5">Чек</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {history.map((p) => (
                                    <tr key={p.id} className="hover:bg-slate-50">
                                        <td className="px-4 py-2.5 text-slate-700">
                                            {new Date(p.createdAt).toLocaleString('ru-RU')}
                                        </td>
                                        <td className="px-4 py-2.5 font-medium text-slate-900">
                                            {formatKopecks(p.amountKopecks)}
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                                                p.status === 'succeeded' ? 'bg-emerald-50 text-emerald-700' :
                                                p.status === 'failed' ? 'bg-rose-50 text-rose-700' :
                                                p.status === 'refunded' ? 'bg-amber-50 text-amber-700' :
                                                'bg-slate-100 text-slate-600'
                                            }`}>
                                                {STATUS_LABEL[p.status] ?? p.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2.5">
                                            {p.receiptUrl ? (
                                                <a href={p.receiptUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-indigo-600 hover:underline text-xs">
                                                    Открыть <ExternalLink className="w-3 h-3" />
                                                </a>
                                            ) : (
                                                <span className="text-xs text-slate-400">—</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </div>
    );
}

function UsageBar({ label, current, limit }: { label: string; current: number; limit: number | null }) {
    const pct = limit === null || limit === 0 ? 0 : Math.min(100, (current / limit) * 100);
    const danger = limit !== null && pct >= 90;
    return (
        <div className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="flex items-baseline justify-between mb-2">
                <span className="text-sm text-slate-700">{label}</span>
                <span className="text-xs text-slate-500">
                    <strong className={danger ? 'text-rose-600' : 'text-slate-900'}>{current}</strong>
                    {' '} / {' '}
                    {limit === null ? '∞' : limit}
                </span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                    className={`h-full ${danger ? 'bg-rose-500' : limit === null ? 'bg-emerald-400' : 'bg-indigo-500'}`}
                    style={{ width: limit === null ? '100%' : `${pct}%` }}
                />
            </div>
        </div>
    );
}
