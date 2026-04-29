import { eq } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import { orders, tariffs, tripOrders, trips } from '../../db/schema.js';
import { toFiniteNumber } from '../../utils/number.js';

export type TariffRuleServiceType =
    | 'loading'
    | 'unloading'
    | 'permit'
    | 'wash'
    | 'downtime'
    | 'forwarding'
    | 'cancellation_after_arrival'
    | 'other';

export type TariffRuleEvaluationInput = {
    serviceType: TariffRuleServiceType;
    tripId?: string | null;
    quantity?: number | null;
    unit?: string | null;
    minutes?: number | null;
    freeMinutes?: number | null;
    amountOverride?: number | null;
};

export type TariffRuleEvaluation = {
    serviceType: TariffRuleServiceType;
    source: 'contract_tariff' | 'default_rule' | 'manual_override';
    ruleCode: string;
    unit: string;
    quantity: number;
    billableQuantity: number;
    rate: number;
    amount: number;
    currency: 'RUB';
    explanation: string;
    tariffId: string | null;
};

const DEFAULT_RULES: Record<TariffRuleServiceType, { unit: string; rate: number; freeMinutes?: number; ruleCode: string }> = {
    loading: { unit: 'operation', rate: 2500, ruleCode: 'default_loading_operation' },
    unloading: { unit: 'operation', rate: 2500, ruleCode: 'default_unloading_operation' },
    permit: { unit: 'operation', rate: 1000, ruleCode: 'default_permit_operation' },
    wash: { unit: 'operation', rate: 1500, ruleCode: 'default_wash_operation' },
    downtime: { unit: 'hour', rate: 1200, freeMinutes: 120, ruleCode: 'default_downtime_hour' },
    forwarding: { unit: 'operation', rate: 3000, ruleCode: 'default_forwarding_operation' },
    cancellation_after_arrival: { unit: 'case', rate: 5000, ruleCode: 'default_arrival_cancellation_fee' },
    other: { unit: 'operation', rate: 0, ruleCode: 'manual_other_service' },
};

function roundMoney(value: number) {
    return Math.round(value * 100) / 100;
}

async function getTripTariff(tripId?: string | null) {
    if (!tripId) return null;
    const [row] = await db.select({ tariff: tariffs })
        .from(trips)
        .innerJoin(tripOrders, eq(trips.id, tripOrders.tripId))
        .innerJoin(orders, eq(tripOrders.orderId, orders.id))
        .innerJoin(tariffs, eq(orders.contractId, tariffs.contractId))
        .where(eq(trips.id, tripId))
        .limit(1);
    return row?.tariff ?? null;
}

export async function evaluateTariffRule(input: TariffRuleEvaluationInput): Promise<TariffRuleEvaluation> {
    if (input.amountOverride != null) {
        return {
            serviceType: input.serviceType,
            source: 'manual_override',
            ruleCode: 'manual_amount',
            unit: input.unit || DEFAULT_RULES[input.serviceType].unit,
            quantity: input.quantity ?? 1,
            billableQuantity: input.quantity ?? 1,
            rate: input.amountOverride,
            amount: roundMoney(input.amountOverride),
            currency: 'RUB',
            explanation: 'Manual amount supplied by operator',
            tariffId: null,
        };
    }

    const tariff = await getTripTariff(input.tripId);
    const defaults = DEFAULT_RULES[input.serviceType];
    let unit = input.unit || defaults.unit;
    let rate = defaults.rate;
    let quantity = input.quantity ?? 1;
    let billableQuantity = quantity;
    let ruleCode = defaults.ruleCode;
    let source: TariffRuleEvaluation['source'] = 'default_rule';
    let explanation = `${quantity} ${unit} x ${rate} RUB`;

    if (input.serviceType === 'downtime') {
        const freeMinutes = input.freeMinutes ?? (toFiniteNumber(tariff?.idleFreeLimitMinutes) || defaults.freeMinutes || 0);
        const minutes = input.minutes ?? Math.round(quantity * 60);
        const billableMinutes = Math.max(minutes - freeMinutes, 0);
        unit = 'hour';
        quantity = Math.round((minutes / 60) * 100) / 100;
        billableQuantity = Math.ceil((billableMinutes / 60) * 4) / 4;
        rate = toFiniteNumber(tariff?.idleRatePerHour) || defaults.rate;
        ruleCode = tariff ? 'contract_idle_rate_per_hour' : defaults.ruleCode;
        source = tariff ? 'contract_tariff' : 'default_rule';
        explanation = `${minutes} min - ${freeMinutes} free min = ${billableMinutes} billable min; ${billableQuantity} h x ${rate} RUB`;
    } else if (input.serviceType === 'cancellation_after_arrival') {
        rate = toFiniteNumber(tariff?.cancellationFee) || defaults.rate;
        unit = 'case';
        quantity = input.quantity ?? 1;
        billableQuantity = quantity;
        ruleCode = tariff ? 'contract_cancellation_fee' : defaults.ruleCode;
        source = tariff ? 'contract_tariff' : 'default_rule';
        explanation = `${billableQuantity} case x ${rate} RUB`;
    }

    const amount = roundMoney(billableQuantity * rate);
    return {
        serviceType: input.serviceType,
        source,
        ruleCode,
        unit,
        quantity,
        billableQuantity,
        rate,
        amount,
        currency: 'RUB',
        explanation,
        tariffId: tariff?.id ?? null,
    };
}
