// ============================================================
// Round 2B — Monetization shared types.
// Plans, subscriptions, usage limits — wire-compatible with API.
// ============================================================

export type PlanId = 'free' | 'pro' | 'business' | 'enterprise';

export const PLAN_IDS: ReadonlyArray<PlanId> = ['free', 'pro', 'business', 'enterprise'];

export type SubscriptionStatus =
    | 'trial'
    | 'active'
    | 'past_due'
    | 'suspended'
    | 'cancelled';

export type PaymentRecordStatus =
    | 'pending'
    | 'succeeded'
    | 'failed'
    | 'refunded';

/** Feature flag keys carried in plans.features jsonb. */
export type PlanFeature =
    | 'ai_copilot'
    | 'edi'
    | 'marking'
    | 'multi_tenant'
    | 'sso'
    | 'api_export'
    | 'priority_support'
    | 'custom_integrations';

export type PlanFeatures = Partial<Record<PlanFeature, boolean>>;

export interface Plan {
    id: PlanId;
    nameRu: string;
    priceMonthlyKopecks: number;
    /** null = unlimited. */
    vehicleLimit: number | null;
    monthlyOrdersLimit: number | null;
    /** Daily co-pilot message cap. null = unlimited. */
    copilotMessagesDaily: number | null;
    features: PlanFeatures;
}

export interface Subscription {
    id: string;
    organizationId: string;
    planId: PlanId;
    status: SubscriptionStatus;
    trialEndsAt: string | null;
    currentPeriodStart: string;
    currentPeriodEnd: string;
    cancelAtPeriodEnd: boolean;
    paymentProvider: string | null;
    paymentExternalId: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface SubscriptionWithPlan {
    subscription: Subscription | null;
    plan: Plan;
}

export interface PaymentRecord {
    id: string;
    subscriptionId: string;
    amountKopecks: number;
    status: PaymentRecordStatus;
    providerPaymentId: string | null;
    paidAt: string | null;
    receiptUrl: string | null;
    failureReason: string | null;
    createdAt: string;
}

export type UsageType = 'vehicles' | 'orders' | 'copilot_messages';

export interface UsageSnapshot {
    organizationId: string;
    periodStart: string;
    vehiclesCount: number;
    ordersCount: number;
    copilotMessagesCount: number;
}

export interface LimitCheckResult {
    type: UsageType;
    allowed: boolean;
    current: number;
    /** null = unlimited. */
    limit: number | null;
    plan: PlanId;
}

export interface UsageReport {
    plan: PlanId;
    periodStart: string;
    vehicles: { current: number; limit: number | null };
    orders: { current: number; limit: number | null };
    copilotMessages: { current: number; limit: number | null };
}

/** API response for paywall lock — HTTP 402. */
export interface PlanFeatureLockedResponse {
    success: false;
    error: 'PLAN_FEATURE_LOCKED';
    feature: PlanFeature | string;
    currentPlan: PlanId;
    upgradeUrl: string;
}

/** API response for limit-exceeded — HTTP 402. */
export interface PlanLimitExceededResponse {
    success: false;
    error: 'PLAN_LIMIT_EXCEEDED';
    limit: UsageType;
    current: number;
    cap: number;
    currentPlan: PlanId;
    upgradeUrl: string;
}

export const TRIAL_DAYS = 14;

/** Helper: rubles → kopecks. */
export function rublesToKopecks(rub: number): number {
    return Math.round(rub * 100);
}

/** Helper: kopecks → rubles, two decimals. */
export function kopecksToRubles(kop: number): number {
    return Math.round(kop) / 100;
}

/** Format kopecks as Russian rubles, e.g. 290000 → "2 900 ₽". */
export function formatKopecks(kop: number): string {
    const rub = Math.round(kop) / 100;
    const intPart = Math.trunc(rub).toLocaleString('ru-RU');
    const frac = Math.round((rub - Math.trunc(rub)) * 100);
    if (frac === 0) return `${intPart} ₽`;
    return `${intPart},${String(frac).padStart(2, '0')} ₽`;
}

/** First day of current month (UTC midnight) — the "billing period" key. */
export function currentBillingPeriodStart(now: Date = new Date()): Date {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
}
