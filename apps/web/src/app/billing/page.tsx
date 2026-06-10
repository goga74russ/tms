// ============================================================
// Round 2B — Customer-facing billing page.
// Current plan, plan comparison, usage bars, payment history.
// ============================================================
'use client';

import { useEffect, useState } from 'react';
import { Check, X, ExternalLink, AlertCircle, Sparkles, CreditCard, RefreshCw, CalendarClock, Wallet } from 'lucide-react';
import { differenceInCalendarDays } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { api } from '@/lib/api';
import {
    formatKopecks,
    label,
    PLAN_LABELS,
    AI_ASSISTANT_LABEL,
    type Plan,
    type PlanId,
    type PaymentRecord,
    type SubscriptionWithPlan,
    type UsageReport,
} from '@tms/shared';

const FEATURE_ORDER: Array<{ key: string; label: string }> = [
    { key: 'ai_copilot', label: AI_ASSISTANT_LABEL },
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
    // Унифицировано с баннером периода подписки (differenceInCalendarDays),
    // чтобы два индикатора показывали одинаковое число оставшихся дней.
    if (!iso) return null;
    const diff = differenceInCalendarDays(new Date(iso), new Date());
    return diff <= 0 ? 0 : diff;
}

function formatRuDate(iso: string): string {
    return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Round 5 audit v3: payment method UI is a stub until PaymentMethodService lands.
// Shape we *would* show if the API returned it on Subscription / PaymentRecord.
// TODO(api): expose `paymentMethod` on Subscription (last4, brand, expMonth, expYear)
// and on PaymentRecord (method label per row). See billing.ts in @tms/shared.
interface StubPaymentMethod {
    last4?: string;
    brand?: string;
    expMonth?: number | string;
    expYear?: number | string;
}

function readPaymentMethod(sub: SubscriptionWithPlan | null): StubPaymentMethod | null {
    const raw = (sub?.subscription as unknown as { paymentMethod?: StubPaymentMethod } | null)?.paymentMethod;
    if (!raw || typeof raw !== 'object') return null;
    if (!raw.last4 && !raw.brand) return null;
    return raw;
}

function readPaymentRecordMethod(record: PaymentRecord): string | null {
    const raw = (record as unknown as { paymentMethod?: StubPaymentMethod | string }).paymentMethod;
    if (!raw) return null;
    if (typeof raw === 'string') return raw;
    if (raw.brand && raw.last4) return `${raw.brand} •••• ${raw.last4}`;
    if (raw.last4) return `•••• ${raw.last4}`;
    if (raw.brand) return raw.brand;
    return null;
}

function formatPaymentMethod(pm: StubPaymentMethod): string {
    const brand = pm.brand || 'Карта';
    const last4 = pm.last4 ? `•••• ${pm.last4}` : '';
    const exp = pm.expMonth && pm.expYear
        ? `, истекает ${String(pm.expMonth).padStart(2, '0')}/${String(pm.expYear).slice(-2)}`
        : '';
    return [brand, last4].filter(Boolean).join(' ') + exp;
}

export default function BillingPage() {
    const [plans, setPlans] = useState<Plan[] | null>(null);
    const [sub, setSub] = useState<SubscriptionWithPlan | null>(null);
    const [usage, setUsage] = useState<UsageReport | null>(null);
    const [history, setHistory] = useState<PaymentRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionPlan, setActionPlan] = useState<PlanId | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [showManagePayment, setShowManagePayment] = useState(false);

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
            // B-15: do not leak raw English API errors (e.g. "no organization in token").
            // Log details for debugging, surface a Russian-only banner to the user.
            // eslint-disable-next-line no-console
            console.error('[billing] failed to load subscription data', e);
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
            // eslint-disable-next-line no-console
            console.error('[billing] subscribe failed', e);
            setError('Не удалось создать платёж');
        } finally {
            setActionPlan(null);
        }
    };

    const cancel = async () => {
        try {
            await api.post('/billing/cancel');
            await reload();
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error('[billing] cancel failed', e);
            setError('Ошибка отмены подписки');
        }
    };

    if (loading) {
        return (
            <div className="max-w-6xl mx-auto p-6 space-y-6">
                <Skeleton className="h-8 w-64" />
                <div className="grid md:grid-cols-3 gap-4">
                    <Skeleton className="h-48 w-full" />
                    <Skeleton className="h-48 w-full" />
                    <Skeleton className="h-48 w-full" />
                </div>
            </div>
        );
    }

    const currentPlanId = sub?.plan.id ?? 'free';
    const trialDays = daysUntil(sub?.subscription?.trialEndsAt ?? null);

    // Days-remaining banner is shown only for an *active* subscription with a known
    // period end. Trial countdown already lives on the current-plan card, so we
    // intentionally skip non-active statuses here to avoid double-banners.
    const isActiveSub = sub?.subscription?.status === 'active';
    const periodEndIso = sub?.subscription?.currentPeriodEnd ?? null;
    const daysToPeriodEnd =
        isActiveSub && periodEndIso
            ? differenceInCalendarDays(new Date(periodEndIso), new Date())
            : null;
    const periodEndTone: 'neutral' | 'amber' | 'red' =
        daysToPeriodEnd === null
            ? 'neutral'
            : daysToPeriodEnd <= 3
                ? 'red'
                : daysToPeriodEnd <= 7
                    ? 'amber'
                    : 'neutral';
    const periodEndStyles: Record<typeof periodEndTone, string> = {
        neutral: 'bg-neutral-50 border-neutral-200 text-neutral-700',
        amber: 'bg-amber-50 border-amber-200 text-amber-800',
        red: 'bg-rose-50 border-rose-200 text-rose-800',
    };

    // Round 5 audit v3: «manage payment / update card flow» is now a Dialog
    // with two explicit choices instead of a toast action. Once the backend
    // exposes PaymentMethodService we'll replace «Перейти в ЮKassa» with an
    // in-app SetupIntent-style flow.
    // TODO(api): wire to a future POST /billing/payment-methods/setup that
    // returns a redirect URL for adding a new card without a charge.
    const handleManagePayment = () => setShowManagePayment(true);
    const paymentMethod = readPaymentMethod(sub);
    const hasMethodOnHistory = history.some(p => readPaymentRecordMethod(p));

    return (
        <div className="max-w-6xl mx-auto p-6 space-y-6">
            <header className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                    <div className="shrink-0 w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center">
                        <CreditCard className="w-5 h-5" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-semibold text-neutral-900">Тарифы и подписка</h1>
                        <p className="text-sm text-neutral-500 mt-0.5">Управление подпиской и расходом лимитов</p>
                    </div>
                </div>
            </header>

            {error && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span className="text-sm">Подписка временно недоступна. Попробуйте обновить страницу.</span>
                    </div>
                    <button
                        type="button"
                        onClick={() => { setError(null); setLoading(true); void reload(); }}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-900 hover:text-amber-950 underline-offset-2 hover:underline"
                    >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Повторить
                    </button>
                </div>
            )}

            {/* Current plan card */}
            {sub && (
                <div className="bg-gradient-to-br from-indigo-50 to-white border border-indigo-100 rounded-xl p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3 md:gap-4">
                    <div className="min-w-0">
                        <p className="text-xs uppercase tracking-wide text-indigo-700 font-semibold">Текущий тариф</p>
                        <h2 className="text-xl font-bold text-neutral-900 mt-1">{PLAN_LABELS[sub.plan.id] ?? sub.plan.nameRu}</h2>
                        <div className="flex items-center gap-3 mt-2 flex-wrap">
                            {sub.subscription && (
                                <span className="inline-flex items-center px-2 py-0.5 bg-white border border-indigo-200 text-indigo-700 text-xs rounded-full">
                                    {label(STATUS_LABEL, sub.subscription.status)}
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
                    <div className="text-left md:text-right">
                        <div className="text-2xl font-bold text-neutral-900">
                            {sub.plan.priceMonthlyKopecks > 0 ? formatKopecks(sub.plan.priceMonthlyKopecks) : 'Бесплатно'}
                            {sub.plan.priceMonthlyKopecks > 0 && <span className="text-sm font-normal text-neutral-500"> / мес</span>}
                        </div>
                        <div className="mt-2 flex items-center gap-3 md:justify-end flex-wrap">
                            {sub.subscription?.status === 'active' && sub.plan.priceMonthlyKopecks > 0 && (
                                <button
                                    type="button"
                                    onClick={handleManagePayment}
                                    className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-700 hover:text-indigo-900 underline-offset-2 hover:underline"
                                >
                                    <Wallet className="w-3.5 h-3.5" />
                                    Управление платежами
                                </button>
                            )}
                            {sub.subscription && !sub.subscription.cancelAtPeriodEnd && sub.subscription.status === 'active' && (
                                <button onClick={cancel} className="text-xs text-neutral-500 hover:text-rose-600 underline-offset-2 hover:underline">
                                    Отменить продление
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Round 5 audit v3: saved payment method card.
                Shown for paid plans only. Until PaymentMethodService is live
                we surface the stub from subscription.paymentMethod (if the
                API ever populates it) or a «not attached» state. */}
            {sub && sub.plan.priceMonthlyKopecks > 0 && (
                <section className="bg-white border border-neutral-200 rounded-xl p-5">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="flex items-start gap-3 min-w-0">
                            <div className="shrink-0 w-9 h-9 rounded-lg bg-neutral-100 text-neutral-600 flex items-center justify-center">
                                <CreditCard className="w-4.5 h-4.5" />
                            </div>
                            <div className="min-w-0">
                                <h3 className="text-sm font-semibold text-neutral-900">Способ оплаты</h3>
                                {paymentMethod ? (
                                    <p className="text-sm text-neutral-700 mt-0.5">{formatPaymentMethod(paymentMethod)}</p>
                                ) : (
                                    <p className="text-sm text-neutral-500 mt-0.5">
                                        Способ оплаты не привязан. Привяжете при следующей оплате.
                                    </p>
                                )}
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={handleManagePayment}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700 hover:text-indigo-900 underline-offset-2 hover:underline shrink-0"
                        >
                            <Wallet className="w-3.5 h-3.5" />
                            Обновить способ оплаты
                        </button>
                    </div>
                </section>
            )}

            {/* Days-remaining banner for active subscription */}
            {sub && isActiveSub && periodEndIso && daysToPeriodEnd !== null && (
                <div className={`rounded-lg border px-4 py-3 flex items-center gap-3 ${periodEndStyles[periodEndTone]}`}>
                    <CalendarClock className="w-4 h-4 shrink-0" />
                    <div className="text-sm">
                        {sub.subscription?.cancelAtPeriodEnd ? (
                            <>
                                Подписка действует до <strong>{formatRuDate(periodEndIso)}</strong>
                                {daysToPeriodEnd > 0
                                    ? <> — осталось <strong>{daysToPeriodEnd}</strong> дн., автопродление отключено.</>
                                    : <> — продление отключено.</>}
                            </>
                        ) : (
                            <>
                                Подписка активна до <strong>{formatRuDate(periodEndIso)}</strong>
                                {daysToPeriodEnd > 0 && <> — через <strong>{daysToPeriodEnd}</strong> дн.</>}
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Usage bars */}
            {usage && (
                <section>
                    <h3 className="text-sm font-semibold text-neutral-700 mb-3 uppercase tracking-wide">Использование в этом периоде</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <UsageBar label="Транспорт" current={usage.vehicles.current} limit={usage.vehicles.limit} />
                        <UsageBar label="Заявки в этом месяце" current={usage.orders.current} limit={usage.orders.limit} />
                        <UsageBar label={`${AI_ASSISTANT_LABEL}: сообщений за день`} current={usage.copilotMessages.current} limit={usage.copilotMessages.limit} />
                    </div>
                </section>
            )}

            {/* Plan comparison */}
            {plans && (
                <section>
                    <h3 className="text-sm font-semibold text-neutral-700 mb-3 uppercase tracking-wide">Сравнение тарифов</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {plans.map((p) => {
                            const isCurrent = p.id === currentPlanId;
                            return (
                                <div
                                    key={p.id}
                                    className={`rounded-xl border bg-white p-5 flex flex-col gap-3 ${
                                        isCurrent ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-neutral-200'
                                    }`}
                                >
                                    <div>
                                        <h4 className="font-semibold text-neutral-900">{PLAN_LABELS[p.id] ?? p.nameRu}</h4>
                                        <p className="text-2xl font-bold text-neutral-900 mt-1">
                                            {p.priceMonthlyKopecks > 0 ? formatKopecks(p.priceMonthlyKopecks) : '0 ₽'}
                                            {p.priceMonthlyKopecks > 0 && <span className="text-xs font-normal text-neutral-500"> / мес</span>}
                                        </p>
                                    </div>

                                    <ul className="text-xs text-neutral-700 space-y-1.5 flex-1">
                                        <li>Транспорт: <strong>{formatLimit(p.vehicleLimit)}</strong></li>
                                        <li>Заявок в месяц: <strong>{formatLimit(p.monthlyOrdersLimit)}</strong></li>
                                        <li>{AI_ASSISTANT_LABEL}/день: <strong>{formatLimit(p.copilotMessagesDaily)}</strong></li>
                                        {FEATURE_ORDER.map((f) => (
                                            <li key={f.key} className="flex items-center gap-1.5">
                                                {p.features[f.key as keyof typeof p.features]
                                                    ? <Check className="w-3.5 h-3.5 text-emerald-600" />
                                                    : <X className="w-3.5 h-3.5 text-neutral-300" />}
                                                <span className={p.features[f.key as keyof typeof p.features] ? 'text-neutral-700' : 'text-neutral-400 line-through'}>
                                                    {f.label}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>

                                    {isCurrent ? (
                                        <button disabled className="w-full px-3 py-2 bg-neutral-100 text-neutral-500 rounded-lg text-sm font-medium cursor-default">
                                            Текущий тариф
                                        </button>
                                    ) : p.priceMonthlyKopecks === 0 ? (
                                        <button disabled className="w-full px-3 py-2 bg-neutral-100 text-neutral-500 rounded-lg text-sm font-medium cursor-default">
                                            {p.id === 'enterprise' ? 'По запросу' : label(PLAN_LABELS, p.id)}
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => void subscribe(p.id)}
                                            disabled={actionPlan === p.id}
                                            className="inline-flex items-center justify-center gap-1.5 w-full px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                                        >
                                            <Sparkles className="w-3.5 h-3.5" />
                                            {actionPlan === p.id ? 'Создаю платёж…' : `Перейти на ${PLAN_LABELS[p.id] ?? p.nameRu}`}
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
                <h3 className="text-sm font-semibold text-neutral-700 mb-3 uppercase tracking-wide">История платежей</h3>
                {history.length === 0 ? (
                    <EmptyState
                        icon={CreditCard}
                        title="Платежей пока не было"
                        description="Платежи появятся после первой оплаты"
                        tone="brand"
                    />
                ) : (
                    <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-neutral-50 text-neutral-600 text-xs uppercase">
                                <tr>
                                    <th className="text-left px-4 py-2.5">Дата</th>
                                    <th className="text-left px-4 py-2.5">Сумма</th>
                                    <th className="text-left px-4 py-2.5">Статус</th>
                                    {hasMethodOnHistory && <th className="text-left px-4 py-2.5">Способ</th>}
                                    <th className="text-left px-4 py-2.5">Чек</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-100">
                                {history.map((p) => {
                                    const methodLabel = readPaymentRecordMethod(p);
                                    return (
                                        <tr key={p.id} className="hover:bg-neutral-50">
                                            <td className="px-4 py-2.5 text-neutral-700">
                                                {new Date(p.createdAt).toLocaleString('ru-RU')}
                                            </td>
                                            <td className="px-4 py-2.5 font-medium text-neutral-900">
                                                {formatKopecks(p.amountKopecks)}
                                            </td>
                                            <td className="px-4 py-2.5">
                                                <span className={`text-xs px-2 py-0.5 rounded-full ${
                                                    p.status === 'succeeded' ? 'bg-emerald-50 text-emerald-700' :
                                                    p.status === 'failed' ? 'bg-rose-50 text-rose-700' :
                                                    p.status === 'refunded' ? 'bg-amber-50 text-amber-700' :
                                                    'bg-neutral-100 text-neutral-600'
                                                }`}>
                                                    {label(STATUS_LABEL, p.status)}
                                                </span>
                                            </td>
                                            {hasMethodOnHistory && (
                                                <td className="px-4 py-2.5 text-xs text-neutral-600">
                                                    {methodLabel ?? <span className="text-neutral-400">—</span>}
                                                </td>
                                            )}
                                            <td className="px-4 py-2.5">
                                                {p.receiptUrl ? (
                                                    <a href={p.receiptUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-indigo-600 hover:underline text-xs">
                                                        Открыть <ExternalLink className="w-3 h-3" />
                                                    </a>
                                                ) : (
                                                    <span className="text-xs text-neutral-400">—</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {/* Round 5 audit v3: manage-payment dialog (stub).
                Two explicit user choices replace the previous toast action. */}
            <Dialog
                open={showManagePayment}
                onClose={() => setShowManagePayment(false)}
                title="Обновить способ оплаты"
                description="Выберите, как удобнее обновить карту."
                size="md"
            >
                <div className="space-y-3">
                    <button
                        type="button"
                        onClick={() => {
                            window.open('https://yookassa.ru/my/', '_blank', 'noopener,noreferrer');
                            setShowManagePayment(false);
                        }}
                        className="w-full text-left rounded-xl border border-neutral-200 hover:border-indigo-300 hover:bg-indigo-50/40 transition-colors p-4 flex items-start gap-3"
                    >
                        <div className="shrink-0 w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                            <ExternalLink className="w-4.5 h-4.5" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-sm font-semibold text-neutral-900">Перейти в личный кабинет ЮKassa</p>
                            <p className="text-xs text-neutral-500 mt-0.5">Управление сохранёнными картами и реквизитами на стороне платёжной системы.</p>
                        </div>
                    </button>
                    <button
                        type="button"
                        onClick={() => setShowManagePayment(false)}
                        className="w-full text-left rounded-xl border border-neutral-200 hover:border-emerald-300 hover:bg-emerald-50/40 transition-colors p-4 flex items-start gap-3"
                    >
                        <div className="shrink-0 w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                            <CreditCard className="w-4.5 h-4.5" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-sm font-semibold text-neutral-900">Привязать новую карту при следующей оплате</p>
                            <p className="text-xs text-neutral-500 mt-0.5">При очередном списании вам предложат сохранить новую карту вместо текущей.</p>
                        </div>
                    </button>
                    <div className="pt-2 border-t border-neutral-100 flex justify-end">
                        <Button variant="outline" onClick={() => setShowManagePayment(false)}>Закрыть</Button>
                    </div>
                </div>
            </Dialog>
        </div>
    );
}

function UsageBar({ label, current, limit }: { label: string; current: number; limit: number | null }) {
    const pct = limit === null || limit === 0 ? 0 : Math.min(100, (current / limit) * 100);
    const danger = limit !== null && pct >= 90;
    return (
        <div className="bg-white border border-neutral-200 rounded-lg p-4">
            <div className="flex items-baseline justify-between mb-2">
                <span className="text-sm text-neutral-700">{label}</span>
                <span className="text-xs text-neutral-500">
                    <strong className={danger ? 'text-rose-600' : 'text-neutral-900'}>{current}</strong>
                    {' '} / {' '}
                    {limit === null ? '∞' : limit}
                </span>
            </div>
            <div className="h-2 bg-neutral-100 rounded-full overflow-hidden">
                <div
                    className={`h-full ${danger ? 'bg-rose-500' : limit === null ? 'bg-emerald-400' : 'bg-indigo-500'}`}
                    style={{ width: limit === null ? '100%' : `${pct}%` }}
                />
            </div>
        </div>
    );
}
