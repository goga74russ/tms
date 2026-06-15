// ============================================================
// Round 2B — Billing service.
// Subscription lifecycle, payment creation, usage accounting.
// ОФД fiscalization runs after a successful payment webhook.
// ============================================================
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import {
    plans, subscriptions, payments, usageCounters, organizations, users,
} from '../../db/schema.js';
import {
    getDefaultRegistry, selectAdapter, getOfdAdapter,
} from '../../providers/index.js';
import {
    TRIAL_DAYS,
    currentBillingPeriodStart,
    type LimitCheckResult,
    type PaymentRecord,
    type Plan,
    type PlanFeatures,
    type PlanId,
    type Subscription,
    type SubscriptionStatus,
    type SubscriptionWithPlan,
    type UsageReport,
    type UsageType,
} from '@tms/shared';

// ---------- Plans ----------

export async function listPlans(): Promise<Plan[]> {
    const rows = await db.select().from(plans).orderBy(plans.priceMonthlyKopecks);
    return rows.map(rowToPlan);
}

export async function getPlan(id: PlanId): Promise<Plan | null> {
    const [row] = await db.select().from(plans).where(eq(plans.id, id)).limit(1);
    return row ? rowToPlan(row) : null;
}

function rowToPlan(row: typeof plans.$inferSelect): Plan {
    return {
        id: row.id as PlanId,
        nameRu: row.nameRu,
        priceMonthlyKopecks: row.priceMonthlyKopecks,
        vehicleLimit: row.vehicleLimit,
        monthlyOrdersLimit: row.monthlyOrdersLimit,
        copilotMessagesDaily: row.copilotMessagesDaily,
        features: (row.features ?? {}) as PlanFeatures,
    };
}

// ---------- Subscriptions ----------

export async function getActiveSubscription(orgId: string | null | undefined): Promise<SubscriptionWithPlan> {
    // B-14: seed-data users (admin@tms.local, super@tms.local) have NULL
    // organization_id. Return a synthetic Free-plan response instead of
    // throwing so billing/copilot routes don't 401/500 on these accounts.
    if (!orgId) {
        const freePlan = await getPlan('free');
        if (freePlan) return { subscription: null, plan: freePlan };
        // Last-resort hard fallback: a free plan object that matches the
        // shape but isn't persisted, so dev environments without seed
        // data still get a 200 response.
        return {
            subscription: null,
            plan: {
                id: 'free',
                nameRu: 'Free',
                priceMonthlyKopecks: 0,
                vehicleLimit: 3,
                monthlyOrdersLimit: 30,
                copilotMessagesDaily: 0,
                features: {} as PlanFeatures,
            },
        };
    }

    const [sub] = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.organizationId, orgId))
        .limit(1);

    if (!sub) {
        const freePlan = await getPlan('free');
        if (!freePlan) throw new Error('Free plan not seeded');
        return { subscription: null, plan: freePlan };
    }

    const plan = await getPlan(sub.planId as PlanId);
    if (!plan) throw new Error(`Plan ${sub.planId} missing for subscription ${sub.id}`);
    return { subscription: rowToSubscription(sub), plan };
}

export async function startTrial(orgId: string, planId: PlanId): Promise<Subscription> {
    const plan = await getPlan(planId);
    if (!plan) throw new Error(`Unknown plan: ${planId}`);

    const now = new Date();
    const trialEnd = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

    const [existing] = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.organizationId, orgId))
        .limit(1);

    if (existing) {
        const [updated] = await db
            .update(subscriptions)
            .set({
                planId,
                status: 'trial',
                trialEndsAt: trialEnd,
                currentPeriodStart: now,
                currentPeriodEnd: trialEnd,
                cancelAtPeriodEnd: false,
                updatedAt: now,
            })
            .where(eq(subscriptions.id, existing.id))
            .returning();
        return rowToSubscription(updated!);
    }

    const [created] = await db
        .insert(subscriptions)
        .values({
            organizationId: orgId,
            planId,
            status: 'trial',
            trialEndsAt: trialEnd,
            currentPeriodStart: now,
            currentPeriodEnd: trialEnd,
        })
        .returning();
    return rowToSubscription(created!);
}

export interface CreatePaymentResult {
    paymentId: string;
    paymentUrl: string;
    amountKopecks: number;
}

/**
 * C9 stop-gate (54-ФЗ). Онлайн-оплата картой через платёжного провайдера требует
 * выдачи фискального чека (ОФД, 54-ФЗ). Реальная фискализация НЕ подключена
 * (план: ЮKassa-фискализация для первого ИП/физлица, Q4+; полный OFD.ru — позже).
 *
 * До этого пилот юридически чист только при работе B2B-юрлица + банковский перевод
 * (счёт оформляется через finance/invoices — там 54-ФЗ-чек не требуется). Поэтому
 * онлайн-приём оплаты ЗАКРЫТ по умолчанию и включается флагом ALLOW_ONLINE_PAYMENTS
 * лишь когда фискализация будет готова. Fail-closed.
 */
export function isOnlinePaymentAllowed(): boolean {
    return process.env.ALLOW_ONLINE_PAYMENTS === 'true';
}

export async function createPayment(orgId: string, planId: PlanId, returnUrl: string): Promise<CreatePaymentResult> {
    if (!isOnlinePaymentAllowed()) {
        throw new Error(
            'Онлайн-оплата временно недоступна. Для юридических лиц оплата производится '
            + 'по счёту (банковский перевод) — оформите счёт в разделе «Финансы».',
        );
    }

    const plan = await getPlan(planId);
    if (!plan) throw new Error(`Unknown plan: ${planId}`);
    if (plan.priceMonthlyKopecks <= 0) {
        throw new Error('This plan does not require payment');
    }

    // Ensure a subscription row exists (in 'trial' or 'past_due' state) — we update it on webhook.
    let { subscription } = await getActiveSubscription(orgId);
    if (!subscription) {
        subscription = await startTrial(orgId, planId);
    }

    // Pick payment adapter for this org (default mock, real one if creds present).
    const registry = getDefaultRegistry();
    const adapter = await selectAdapter(registry.payment, orgId, 'payment');

    const [pendingPayment] = await db
        .insert(payments)
        .values({
            subscriptionId: subscription.id,
            amountKopecks: plan.priceMonthlyKopecks,
            status: 'pending',
        })
        .returning();
    if (!pendingPayment) throw new Error('Failed to create payment row');

    const result = await adapter.createPayment({
        amountRub: plan.priceMonthlyKopecks / 100,
        orderId: pendingPayment.id,
        description: `ТрансПульт — план «${plan.nameRu}» (месяц)`,
        returnUrl,
    });

    await db
        .update(payments)
        .set({ providerPaymentId: result.externalId })
        .where(eq(payments.id, pendingPayment.id));

    await db
        .update(subscriptions)
        .set({
            paymentProvider: adapter.name,
            paymentExternalId: result.externalId,
            updatedAt: new Date(),
        })
        .where(eq(subscriptions.id, subscription.id));

    return {
        paymentId: pendingPayment.id,
        paymentUrl: result.confirmationUrl ?? returnUrl,
        amountKopecks: plan.priceMonthlyKopecks,
    };
}

export async function cancelAtPeriodEnd(orgId: string): Promise<Subscription | null> {
    const [existing] = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.organizationId, orgId))
        .limit(1);
    if (!existing) return null;
    const [updated] = await db
        .update(subscriptions)
        .set({ cancelAtPeriodEnd: true, updatedAt: new Date() })
        .where(eq(subscriptions.id, existing.id))
        .returning();
    return updated ? rowToSubscription(updated) : null;
}

// ---------- Webhooks ----------

export interface PaymentCallbackPayload {
    /** Provider's payment external id. */
    externalId: string;
    /** Provider-reported status. */
    status: 'succeeded' | 'failed' | 'canceled' | 'pending' | 'waiting_for_capture' | 'refunded';
    failureReason?: string;
    /** Optional customer email/phone for fiscalization. */
    customerEmail?: string;
    customerPhone?: string;
    /**
     * A-P0-1: provider webhook event id for replay dedupe. When set and the
     * payment row already has the same `lastWebhookEventId`, the callback is a
     * no-op (returns the current state). This makes the webhook idempotent
     * against ЮKassa retries.
     */
    eventId?: string;
}

export interface PaymentCallbackResult {
    paymentId: string | null;
    subscriptionId: string | null;
    receiptUrl: string | null;
}

export async function handlePaymentCallback(payload: PaymentCallbackPayload): Promise<PaymentCallbackResult> {
  // B-P1-2 (P1-C): весь callback — в одной транзакции с FOR UPDATE на payment.
  // Иначе dedupe-проверка и продление подписки — TOCTOU: два конкурентных
  // ретрая вебхука оба читают старую metadata, оба проходят dedupe и оба
  // катят период вперёд (двойное продление). FOR UPDATE сериализует ретраи:
  // второй ждёт COMMIT первого, затем видит записанный lastWebhookEventId.
  return db.transaction(async (tx) => {
    const [paymentRow] = await tx
        .select()
        .from(payments)
        // idx_payments_provider_id НЕ уникален — теоретически возможны дубли строк
        // с одним providerPaymentId. Детерминированный orderBy (новейшая запись)
        // гарантирует стабильный выбор одной и той же строки на любом ретрае вебхука.
        .where(eq(payments.providerPaymentId, payload.externalId))
        .orderBy(sql`${payments.createdAt} DESC`)
        .limit(1)
        .for('update');
    if (!paymentRow) {
        return { paymentId: null, subscriptionId: null, receiptUrl: null };
    }

    // A-P0-1: replay dedupe. ЮKassa retries failed webhook deliveries
    // and the same `event_id` should never be processed twice — otherwise a
    // single succeeded payment would roll the subscription period N times.
    if (payload.eventId && paymentRow.providerMetadata) {
        try {
            const meta = paymentRow.providerMetadata as { lastWebhookEventId?: string };
            if (meta.lastWebhookEventId === payload.eventId) {
                return {
                    paymentId: paymentRow.id,
                    subscriptionId: paymentRow.subscriptionId,
                    receiptUrl: null,
                };
            }
        } catch { /* malformed metadata — fall through and process */ }
    }

    const [subRow] = await tx
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.id, paymentRow.subscriptionId))
        .limit(1);

    // Helper to merge providerMetadata while persisting the dedupe event id.
    const mergedMeta = (current: unknown): Record<string, unknown> => {
        const base = (current && typeof current === 'object' && !Array.isArray(current))
            ? { ...(current as Record<string, unknown>) }
            : {};
        if (payload.eventId) base.lastWebhookEventId = payload.eventId;
        return base;
    };

    if (payload.status === 'succeeded') {
        // C2: идемпотентность по СОСТОЯНИЮ платежа (belt поверх eventId-dedup).
        // Повторный succeeded-вебхук (ретрай ЮKassa) на уже-succeeded платёж НЕ
        // должен катить подписку второй раз и НЕ должен фискализировать дубль чека.
        if (paymentRow.status === 'succeeded') {
            return {
                paymentId: paymentRow.id,
                subscriptionId: paymentRow.subscriptionId,
                receiptUrl: paymentRow.receiptUrl ?? null,
            };
        }
        // 1) Mark the payment as succeeded.
        const paidAt = new Date();
        await tx
            .update(payments)
            .set({
                status: 'succeeded',
                paidAt,
                providerMetadata: mergedMeta(paymentRow.providerMetadata),
            })
            .where(eq(payments.id, paymentRow.id));

        // 2) Roll subscription forward: 30 days from now.
        let receiptUrl: string | null = null;
        if (subRow) {
            const periodStart = paidAt;
            const periodEnd = new Date(paidAt.getTime() + 30 * 24 * 60 * 60 * 1000);
            await tx
                .update(subscriptions)
                .set({
                    status: 'active',
                    currentPeriodStart: periodStart,
                    currentPeriodEnd: periodEnd,
                    trialEndsAt: null,
                    updatedAt: paidAt,
                })
                .where(eq(subscriptions.id, subRow.id));

            // 3) Fiscalize via ОФД.
            // C9: реальная интеграция OFD.ru ещё не построена (ждёт креды), поэтому
            // getOfdAdapter() отдаёт mock. В ПРОДЕ молча минтить ФЕЙКОВЫЙ 54-ФЗ чек
            // ( offd.example.com) недопустимо — это выдаётся покупателю как настоящий.
            // Fail-closed: в production без ALLOW_MOCK_OFD оставляем receiptUrl=null,
            // оператор дофискализирует позже. ALLOW_MOCK_OFD=true — осознанный режим
            // B2B-only/free-box, где 54-ФЗ не требуется (см. mock.ts).
            try {
                const ofd = getOfdAdapter();
                const mockInProd = ofd.mode === 'mock'
                    && process.env.NODE_ENV === 'production'
                    && process.env.ALLOW_MOCK_OFD !== 'true';
                if (mockInProd) {
                    console.warn('[billing] ОФД-фискализация пропущена: в production доступен только mock-адаптер (фейковый чек не выдаём). Для B2B-only установки задайте ALLOW_MOCK_OFD=true.');
                } else {
                    // A7 (код-аудит 2026-06-14): 54-ФЗ ч.6.1 ст.4.7 — чек обязан
                    // содержать контакт покупателя (email или телефон) для выдачи
                    // в электронной форме. Вебхук ЮKassa контакт не передаёт, поэтому
                    // берём из самого раннего активного пользователя орг (владелец).
                    let customerEmail = payload.customerEmail;
                    let customerPhone = payload.customerPhone;
                    if (!customerEmail && !customerPhone) {
                        const [contact] = await tx
                            .select({ email: users.email, phone: users.phone })
                            .from(users)
                            .where(and(eq(users.organizationId, subRow.organizationId), eq(users.isActive, true)))
                            .orderBy(sql`${users.createdAt} ASC`)
                            .limit(1);
                        customerEmail = contact?.email ?? undefined;
                        customerPhone = contact?.phone ?? undefined;
                    }
                    const receipt = await ofd.fiscalize({
                        paymentId: paymentRow.id,
                        amountKopecks: paymentRow.amountKopecks,
                        description: 'Подписка ТрансПульт (месяц)',
                        customerEmail,
                        customerPhone,
                        taxSystem: 'usn_income',
                        vatCode: 'vat_none',
                    });
                    receiptUrl = receipt.receiptUrl;
                    await tx
                        .update(payments)
                        .set({ receiptUrl })
                        .where(eq(payments.id, paymentRow.id));
                }
            } catch (err) {
                // Fiscalization failed — keep payment succeeded, leave receiptUrl null
                // so an operator can re-fiscalize later. Раньше ошибка глушилась молча.
                console.warn('[billing] ОФД-фискализация не удалась:', (err as Error).message);
            }
        }
        return { paymentId: paymentRow.id, subscriptionId: subRow?.id ?? null, receiptUrl };
    }

    if (payload.status === 'failed' || payload.status === 'canceled') {
        await tx
            .update(payments)
            .set({
                status: 'failed',
                failureReason: payload.failureReason ?? payload.status,
                providerMetadata: mergedMeta(paymentRow.providerMetadata),
            })
            .where(eq(payments.id, paymentRow.id));
        if (subRow) {
            await tx
                .update(subscriptions)
                .set({ status: 'past_due', updatedAt: new Date() })
                .where(eq(subscriptions.id, subRow.id));
        }
        return { paymentId: paymentRow.id, subscriptionId: subRow?.id ?? null, receiptUrl: null };
    }

    if (payload.status === 'refunded') {
        await tx
            .update(payments)
            .set({
                status: 'refunded',
                providerMetadata: mergedMeta(paymentRow.providerMetadata),
            })
            .where(eq(payments.id, paymentRow.id));
        return { paymentId: paymentRow.id, subscriptionId: subRow?.id ?? null, receiptUrl: null };
    }

    // 'pending' / 'waiting_for_capture' — no-op.
    return { paymentId: paymentRow.id, subscriptionId: subRow?.id ?? null, receiptUrl: null };
  });
}

// ---------- Usage ----------

export async function recordUsage(
    orgId: string,
    type: UsageType,
    amount = 1,
): Promise<void> {
    const periodStart = currentBillingPeriodStart();

    // Atomic upsert via raw SQL to keep the index unique on (org, period).
    const column = usageColumn(type);
    await db.execute(sql`
        INSERT INTO usage_counters (organization_id, period_start, ${sql.raw(column)})
        VALUES (${orgId}::uuid, ${periodStart}::timestamptz, ${amount})
        ON CONFLICT (organization_id, period_start)
        DO UPDATE SET
            ${sql.raw(column)} = usage_counters.${sql.raw(column)} + ${amount},
            updated_at = now()
    `);
}

export async function checkLimit(orgId: string, type: UsageType): Promise<LimitCheckResult> {
    const { plan } = await getActiveSubscription(orgId);
    const limit = planLimit(plan, type);
    const current = await readUsageCount(orgId, type);
    const allowed = limit === null || current < limit;
    return { type, allowed, current, limit, plan: plan.id };
}

export async function getUsageReport(orgId: string): Promise<UsageReport> {
    const { plan } = await getActiveSubscription(orgId);
    const periodStart = currentBillingPeriodStart();

    const [row] = await db
        .select()
        .from(usageCounters)
        .where(and(
            eq(usageCounters.organizationId, orgId),
            eq(usageCounters.periodStart, periodStart),
        ))
        .limit(1);

    return {
        plan: plan.id,
        periodStart: periodStart.toISOString(),
        vehicles: { current: row?.vehiclesCount ?? 0, limit: plan.vehicleLimit },
        orders: { current: row?.ordersCount ?? 0, limit: plan.monthlyOrdersLimit },
        copilotMessages: { current: row?.copilotMessagesCount ?? 0, limit: plan.copilotMessagesDaily },
    };
}

async function readUsageCount(orgId: string, type: UsageType): Promise<number> {
    const periodStart = currentBillingPeriodStart();
    const [row] = await db
        .select()
        .from(usageCounters)
        .where(and(
            eq(usageCounters.organizationId, orgId),
            eq(usageCounters.periodStart, periodStart),
        ))
        .limit(1);
    if (!row) return 0;
    switch (type) {
        case 'vehicles': return row.vehiclesCount;
        case 'orders': return row.ordersCount;
        case 'copilot_messages': return row.copilotMessagesCount;
    }
}

function planLimit(plan: Plan, type: UsageType): number | null {
    switch (type) {
        case 'vehicles': return plan.vehicleLimit;
        case 'orders': return plan.monthlyOrdersLimit;
        case 'copilot_messages': return plan.copilotMessagesDaily;
    }
}

function usageColumn(type: UsageType): string {
    switch (type) {
        case 'vehicles': return 'vehicles_count';
        case 'orders': return 'orders_count';
        case 'copilot_messages': return 'copilot_messages_count';
    }
}

// ---------- Payment history ----------

export async function listPayments(orgId: string): Promise<PaymentRecord[]> {
    // Join through subscriptions so we can scope by org without exposing other tenants.
    const rows = await db
        .select({
            id: payments.id,
            subscriptionId: payments.subscriptionId,
            amountKopecks: payments.amountKopecks,
            status: payments.status,
            providerPaymentId: payments.providerPaymentId,
            paidAt: payments.paidAt,
            receiptUrl: payments.receiptUrl,
            failureReason: payments.failureReason,
            createdAt: payments.createdAt,
        })
        .from(payments)
        .innerJoin(subscriptions, eq(subscriptions.id, payments.subscriptionId))
        .where(eq(subscriptions.organizationId, orgId))
        .orderBy(sql`${payments.createdAt} DESC`)
        .limit(100);

    return rows.map((r) => ({
        id: r.id,
        subscriptionId: r.subscriptionId,
        amountKopecks: r.amountKopecks,
        status: r.status as PaymentRecord['status'],
        providerPaymentId: r.providerPaymentId ?? null,
        paidAt: r.paidAt ? r.paidAt.toISOString() : null,
        receiptUrl: r.receiptUrl ?? null,
        failureReason: r.failureReason ?? null,
        createdAt: r.createdAt.toISOString(),
    }));
}

// ---------- Admin ----------

export interface AdminBillingRow {
    organizationId: string;
    organizationName: string;
    inn: string | null;
    planId: PlanId;
    status: SubscriptionStatus;
    currentPeriodEnd: string | null;
    mrrKopecks: number;
}

export async function listAllSubscriptionsForAdmin(): Promise<AdminBillingRow[]> {
    // Left join: orgs without a subscription show as 'free' / no MRR.
    const rows = await db
        .select({
            organizationId: organizations.id,
            organizationName: organizations.name,
            inn: organizations.inn,
            planId: subscriptions.planId,
            status: subscriptions.status,
            currentPeriodEnd: subscriptions.currentPeriodEnd,
            priceKopecks: plans.priceMonthlyKopecks,
        })
        .from(organizations)
        .leftJoin(subscriptions, eq(subscriptions.organizationId, organizations.id))
        .leftJoin(plans, eq(plans.id, subscriptions.planId));

    return rows.map((r) => {
        const planId = (r.planId ?? 'free') as PlanId;
        const status = (r.status ?? 'active') as SubscriptionStatus;
        const mrr = status === 'active' ? (r.priceKopecks ?? 0) : 0;
        return {
            organizationId: r.organizationId,
            organizationName: r.organizationName,
            inn: r.inn ?? null,
            planId,
            status,
            currentPeriodEnd: r.currentPeriodEnd ? r.currentPeriodEnd.toISOString() : null,
            mrrKopecks: mrr,
        };
    });
}

// ---------- Helpers ----------

function rowToSubscription(row: typeof subscriptions.$inferSelect): Subscription {
    return {
        id: row.id,
        organizationId: row.organizationId,
        planId: row.planId as PlanId,
        status: row.status as SubscriptionStatus,
        trialEndsAt: row.trialEndsAt ? row.trialEndsAt.toISOString() : null,
        currentPeriodStart: row.currentPeriodStart.toISOString(),
        currentPeriodEnd: row.currentPeriodEnd.toISOString(),
        cancelAtPeriodEnd: row.cancelAtPeriodEnd,
        paymentProvider: row.paymentProvider ?? null,
        paymentExternalId: row.paymentExternalId ?? null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
    };
}
