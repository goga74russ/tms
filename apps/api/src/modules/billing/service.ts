// ============================================================
// Round 2B — Billing service.
// Subscription lifecycle, payment creation, usage accounting.
// ОФД fiscalization runs after a successful payment webhook.
// ============================================================
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import {
    plans, subscriptions, payments, usageCounters, organizations,
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

export async function createPayment(orgId: string, planId: PlanId, returnUrl: string): Promise<CreatePaymentResult> {
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
        description: `TMS — план «${plan.nameRu}» (месяц)`,
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
}

export interface PaymentCallbackResult {
    paymentId: string | null;
    subscriptionId: string | null;
    receiptUrl: string | null;
}

export async function handlePaymentCallback(payload: PaymentCallbackPayload): Promise<PaymentCallbackResult> {
    const [paymentRow] = await db
        .select()
        .from(payments)
        .where(eq(payments.providerPaymentId, payload.externalId))
        .limit(1);
    if (!paymentRow) {
        return { paymentId: null, subscriptionId: null, receiptUrl: null };
    }

    const [subRow] = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.id, paymentRow.subscriptionId))
        .limit(1);

    if (payload.status === 'succeeded') {
        // 1) Mark the payment as succeeded.
        const paidAt = new Date();
        await db
            .update(payments)
            .set({ status: 'succeeded', paidAt })
            .where(eq(payments.id, paymentRow.id));

        // 2) Roll subscription forward: 30 days from now.
        let receiptUrl: string | null = null;
        if (subRow) {
            const periodStart = paidAt;
            const periodEnd = new Date(paidAt.getTime() + 30 * 24 * 60 * 60 * 1000);
            await db
                .update(subscriptions)
                .set({
                    status: 'active',
                    currentPeriodStart: periodStart,
                    currentPeriodEnd: periodEnd,
                    trialEndsAt: null,
                    updatedAt: paidAt,
                })
                .where(eq(subscriptions.id, subRow.id));

            // 3) Fiscalize via ОФД (mock by default).
            try {
                const ofd = getOfdAdapter();
                const receipt = await ofd.fiscalize({
                    paymentId: paymentRow.id,
                    amountKopecks: paymentRow.amountKopecks,
                    description: 'Подписка TMS (месяц)',
                    customerEmail: payload.customerEmail,
                    customerPhone: payload.customerPhone,
                    taxSystem: 'usn_income',
                    vatCode: 'vat_none',
                });
                receiptUrl = receipt.receiptUrl;
                await db
                    .update(payments)
                    .set({ receiptUrl })
                    .where(eq(payments.id, paymentRow.id));
            } catch {
                // Fiscalization failed — keep payment succeeded, leave receiptUrl null
                // so an operator can re-fiscalize later.
            }
        }
        return { paymentId: paymentRow.id, subscriptionId: subRow?.id ?? null, receiptUrl };
    }

    if (payload.status === 'failed' || payload.status === 'canceled') {
        await db
            .update(payments)
            .set({
                status: 'failed',
                failureReason: payload.failureReason ?? payload.status,
            })
            .where(eq(payments.id, paymentRow.id));
        if (subRow) {
            await db
                .update(subscriptions)
                .set({ status: 'past_due', updatedAt: new Date() })
                .where(eq(subscriptions.id, subRow.id));
        }
        return { paymentId: paymentRow.id, subscriptionId: subRow?.id ?? null, receiptUrl: null };
    }

    if (payload.status === 'refunded') {
        await db
            .update(payments)
            .set({ status: 'refunded' })
            .where(eq(payments.id, paymentRow.id));
        return { paymentId: paymentRow.id, subscriptionId: subRow?.id ?? null, receiptUrl: null };
    }

    // 'pending' / 'waiting_for_capture' — no-op.
    return { paymentId: paymentRow.id, subscriptionId: subRow?.id ?? null, receiptUrl: null };
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
