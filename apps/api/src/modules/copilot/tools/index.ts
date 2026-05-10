// ============================================================
// AI Co-pilot — tool registry
// Phase 7 (Round 1A). Each tool wraps an existing service so the
// LLM gets a stable, validated surface independent of REST shapes.
// ============================================================
import { z, type ZodTypeAny } from 'zod';
import { and, desc, eq, gte, inArray, isNull, lte, ne, or } from 'drizzle-orm';
import { db } from '../../../db/connection.js';
import {
    trips, vehicles, drivers, users, routePoints, orders, tripOrders, contractors, invoices,
} from '../../../db/schema.js';
import { getTripById, getTransportDossier } from '../../trips/service.js';
import { getDriverHosStatus } from '../../rto/service.js';
import { computeTripEta } from '../../trips/eta.service.js';
import { summarizeReadings } from '../../cold-chain/service.js';
import { tarificationService } from '../../finance/tarification.service.js';
import { financeService } from '../../finance/finance.service.js';
import {
    ListActiveTripsInput,
    GetTripDetailsInput,
    DriverHosInput,
    ListTripsAtRiskInput,
    TempBreachesInput,
    ComputeTripCostInput,
    ProposeReassignmentInput,
    ListPendingInvoicesInput,
    GetMonthlyMarginInput,
    TrackContractorOrdersInput,
} from './schemas.js';

export interface CopilotToolContext {
    userId: string;
    roles: ReadonlyArray<string>;
    organizationId?: string | null;
}

export interface CopilotToolHandlerResult<TData = unknown> {
    success: boolean;
    data?: TData;
    error?: string;
    /** Marks data the model should treat as a destructive proposal awaiting confirmation. */
    proposed?: boolean;
}

export interface CopilotTool<TInput = unknown> {
    name: string;
    description: string;
    /** JSON-schema (subset) for the Anthropic SDK `tools[].input_schema`. */
    input_schema: Record<string, unknown>;
    /** Zod schema mirroring input_schema — used for runtime validation. */
    inputSchema: ZodTypeAny;
    handler: (input: TInput, ctx: CopilotToolContext) => Promise<CopilotToolHandlerResult>;
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
const ACTIVE_STATUSES = ['planning', 'assigned', 'waybill_issued', 'loading', 'in_transit'] as const;

function zodToJsonSchema(schema: z.ZodObject<z.ZodRawShape>): Record<string, unknown> {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [key, value] of Object.entries(schema.shape)) {
        const meta = describeZodField(value as z.ZodTypeAny);
        properties[key] = meta.json;
        if (meta.required) required.push(key);
    }
    const result: Record<string, unknown> = { type: 'object', properties };
    if (required.length > 0) result.required = required;
    return result;
}

function describeZodField(field: z.ZodTypeAny): { json: Record<string, unknown>; required: boolean } {
    let current = field;
    let required = true;
    if (current instanceof z.ZodOptional || current instanceof z.ZodDefault) {
        required = false;
        current = current._def.innerType as z.ZodTypeAny;
    }
    if (current instanceof z.ZodNullable) {
        current = current._def.innerType as z.ZodTypeAny;
    }
    if (current instanceof z.ZodString) {
        return { json: { type: 'string' }, required };
    }
    if (current instanceof z.ZodNumber) {
        return { json: { type: 'number' }, required };
    }
    if (current instanceof z.ZodBoolean) {
        return { json: { type: 'boolean' }, required };
    }
    if (current instanceof z.ZodEnum) {
        return { json: { type: 'string', enum: current._def.values }, required };
    }
    return { json: { type: 'string' }, required };
}

// ------------------------------------------------------------
// 1. list_active_trips
// ------------------------------------------------------------
const listActiveTripsTool: CopilotTool<z.infer<typeof ListActiveTripsInput>> = {
    name: 'list_active_trips',
    description: 'Возвращает активные рейсы (planning/assigned/in_transit и т.п.) с номером, статусом, водителем и ТС. Используй для общего обзора.',
    inputSchema: ListActiveTripsInput,
    input_schema: zodToJsonSchema(ListActiveTripsInput),
    handler: async (input, ctx) => {
        const limit = input.limit ?? 20;
        const rows = await db
            .select({
                id: trips.id,
                number: trips.number,
                status: trips.status,
                vehicleId: trips.vehicleId,
                driverId: trips.driverId,
                plannedDepartureAt: trips.plannedDepartureAt,
            })
            .from(trips)
            .where(and(
                inArray(trips.status, [...ACTIVE_STATUSES]),
                ctx.organizationId ? eq(trips.organizationId, ctx.organizationId) : undefined,
            ))
            .orderBy(desc(trips.createdAt))
            .limit(limit);
        return { success: true, data: { count: rows.length, trips: rows } };
    },
};

// ------------------------------------------------------------
// 2. get_trip_details
// ------------------------------------------------------------
const getTripDetailsTool: CopilotTool<z.infer<typeof GetTripDetailsInput>> = {
    name: 'get_trip_details',
    description: 'Полная карточка рейса: маршрут, заявки, водитель, ТС, документы.',
    inputSchema: GetTripDetailsInput,
    input_schema: zodToJsonSchema(GetTripDetailsInput),
    handler: async (input) => {
        const dossier = await getTransportDossier(input.tripId);
        if (!dossier) return { success: false, error: 'Trip not found' };
        return { success: true, data: dossier };
    },
};

// ------------------------------------------------------------
// 3. get_driver_hos_status
// ------------------------------------------------------------
const driverHosTool: CopilotTool<z.infer<typeof DriverHosInput>> = {
    name: 'get_driver_hos_status',
    description: 'Текущий статус режима труда и отдыха (РТО) водителя — часы за сегодня и rolling 7 дней, превышения лимитов.',
    inputSchema: DriverHosInput,
    input_schema: zodToJsonSchema(DriverHosInput),
    handler: async (input) => {
        const status = await getDriverHosStatus(input.driverId);
        return { success: true, data: status };
    },
};

// ------------------------------------------------------------
// 4. list_trips_at_risk — ETA later than window_to
// ------------------------------------------------------------
const listTripsAtRiskTool: CopilotTool<z.infer<typeof ListTripsAtRiskInput>> = {
    name: 'list_trips_at_risk',
    description: 'Активные рейсы, у которых ETA позже верхней границы окна доставки (window_to). Возвращает номер рейса, отставание в минутах.',
    inputSchema: ListTripsAtRiskInput,
    input_schema: zodToJsonSchema(ListTripsAtRiskInput),
    handler: async (input, ctx) => {
        const limit = input.limit ?? 10;
        const candidates = await db
            .select({ id: trips.id, number: trips.number })
            .from(trips)
            .where(and(
                eq(trips.status, 'in_transit'),
                ctx.organizationId ? eq(trips.organizationId, ctx.organizationId) : undefined,
            ))
            .limit(50);

        const atRisk: Array<{ tripId: string; tripNumber: string; etaIso: string; windowTo: string; lateMinutes: number }> = [];
        for (const trip of candidates) {
            const eta = await computeTripEta(trip.id);
            if (!eta) continue;
            const [point] = await db
                .select({ windowTo: routePoints.windowTo })
                .from(routePoints)
                .where(and(eq(routePoints.tripId, trip.id), eq(routePoints.status, 'pending')))
                .limit(1);
            if (!point?.windowTo) continue;
            const etaMs = Date.parse(eta.etaIso);
            const winMs = new Date(point.windowTo).getTime();
            if (etaMs > winMs) {
                atRisk.push({
                    tripId: trip.id,
                    tripNumber: trip.number,
                    etaIso: eta.etaIso,
                    windowTo: new Date(point.windowTo).toISOString(),
                    lateMinutes: Math.round((etaMs - winMs) / 60000),
                });
                if (atRisk.length >= limit) break;
            }
        }
        return { success: true, data: { count: atRisk.length, trips: atRisk } };
    },
};

// ------------------------------------------------------------
// 5. get_temperature_breaches
// ------------------------------------------------------------
const tempBreachesTool: CopilotTool<z.infer<typeof TempBreachesInput>> = {
    name: 'get_temperature_breaches',
    description: 'Сводка нарушений температурного режима (cold-chain). Если tripId указан — по этому рейсу, иначе — по всем активным.',
    inputSchema: TempBreachesInput,
    input_schema: zodToJsonSchema(TempBreachesInput),
    handler: async (input, ctx) => {
        if (input.tripId) {
            const summary = await summarizeReadings(input.tripId);
            return { success: true, data: { tripId: input.tripId, ...summary } };
        }
        const activeTrips = await db
            .select({ id: trips.id, number: trips.number })
            .from(trips)
            .where(and(
                inArray(trips.status, ['in_transit', 'loading', 'waybill_issued']),
                ctx.organizationId ? eq(trips.organizationId, ctx.organizationId) : undefined,
            ))
            .limit(20);
        const out: Array<{ tripId: string; tripNumber: string; breachCount: number; minC: number | null; maxC: number | null }> = [];
        for (const t of activeTrips) {
            const s = await summarizeReadings(t.id);
            if (s.breachCount > 0) {
                out.push({ tripId: t.id, tripNumber: t.number, breachCount: s.breachCount, minC: s.minC, maxC: s.maxC });
            }
        }
        return { success: true, data: { count: out.length, breaches: out } };
    },
};

// ------------------------------------------------------------
// 6. compute_trip_cost
// ------------------------------------------------------------
const computeTripCostTool: CopilotTool<z.infer<typeof ComputeTripCostInput>> = {
    name: 'compute_trip_cost',
    description: 'Расчёт себестоимости и тарифа рейса (топливо, водитель, амортизация, ночная надбавка, платные дороги).',
    inputSchema: ComputeTripCostInput,
    input_schema: zodToJsonSchema(ComputeTripCostInput),
    handler: async (input) => {
        try {
            const cost = await tarificationService.calculateTripCost(input.tripId);
            return { success: true, data: cost };
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Calculation failed';
            return { success: false, error: msg };
        }
    },
};

// ------------------------------------------------------------
// 7. propose_reassignment — destructive proposal (no execution)
// ------------------------------------------------------------
const proposeReassignmentTool: CopilotTool<z.infer<typeof ProposeReassignmentInput>> = {
    name: 'propose_reassignment',
    description: 'Подбор водителей-кандидатов для замены указанного (например, при превышении РТО). НЕ выполняет переназначение — возвращает предложение для подтверждения пользователем.',
    inputSchema: ProposeReassignmentInput,
    input_schema: zodToJsonSchema(ProposeReassignmentInput),
    handler: async (input, ctx) => {
        const [target] = await db
            .select({
                id: drivers.id,
                userId: drivers.userId,
                fullName: users.fullName,
            })
            .from(drivers)
            .innerJoin(users, eq(drivers.userId, users.id))
            .where(eq(drivers.id, input.driverId))
            .limit(1);
        if (!target) return { success: false, error: 'Driver not found' };

        const candidates = await db
            .select({
                id: drivers.id,
                fullName: users.fullName,
            })
            .from(drivers)
            .innerJoin(users, eq(drivers.userId, users.id))
            .where(and(
                eq(drivers.isActive, true),
                ne(drivers.id, input.driverId),
                ctx.organizationId ? eq(drivers.organizationId, ctx.organizationId) : undefined,
            ))
            .limit(5);

        // Annotate each with HOS status so model can pick safest.
        const ranked: Array<{ driverId: string; fullName: string; dayHours: number; weekHours: number; breach: boolean }> = [];
        for (const c of candidates) {
            const hos = await getDriverHosStatus(c.id);
            ranked.push({
                driverId: c.id,
                fullName: c.fullName,
                dayHours: hos.dayHours,
                weekHours: hos.weekHours,
                breach: hos.breach,
            });
        }
        ranked.sort((a, b) => Number(a.breach) - Number(b.breach) || a.weekHours - b.weekHours);

        return {
            success: true,
            proposed: true,
            data: {
                target: { driverId: target.id, fullName: target.fullName },
                candidates: ranked,
                note: 'Это предложение. Для применения переназначения требуется явное подтверждение диспетчера.',
            },
        };
    },
};

// ------------------------------------------------------------
// 8. list_pending_invoices
// ------------------------------------------------------------
const listPendingInvoicesTool: CopilotTool<z.infer<typeof ListPendingInvoicesInput>> = {
    name: 'list_pending_invoices',
    description: 'Список счетов с открытым статусом (issued/overdue) для текущей организации.',
    inputSchema: ListPendingInvoicesInput,
    input_schema: zodToJsonSchema(ListPendingInvoicesInput),
    handler: async (input, ctx) => {
        const limit = input.limit ?? 20;
        const rows = await db
            .select({
                id: invoices.id,
                number: invoices.number,
                status: invoices.status,
                total: invoices.total,
                contractorId: invoices.contractorId,
                contractorName: contractors.name,
                createdAt: invoices.createdAt,
            })
            .from(invoices)
            .innerJoin(contractors, eq(invoices.contractorId, contractors.id))
            .where(and(
                inArray(invoices.status, ['sent', 'overdue']),
                ctx.organizationId ? eq(contractors.organizationId, ctx.organizationId) : undefined,
            ))
            .orderBy(desc(invoices.createdAt))
            .limit(limit);
        return { success: true, data: { count: rows.length, invoices: rows } };
    },
};

// ------------------------------------------------------------
// 9. get_monthly_margin
// ------------------------------------------------------------
const getMonthlyMarginTool: CopilotTool<z.infer<typeof GetMonthlyMarginInput>> = {
    name: 'get_monthly_margin',
    description: 'Маржа за выбранный месяц: выручка, затраты, маржа, %, штрафы, ремонты. monthOffset=0 — текущий, -1 — предыдущий.',
    inputSchema: GetMonthlyMarginInput,
    input_schema: zodToJsonSchema(GetMonthlyMarginInput),
    handler: async (input, ctx) => {
        const offset = input.monthOffset ?? 0;
        const now = new Date();
        const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
        const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset + 1, 1));
        const kpi = await financeService.getKpiMetrics(start, end, ctx.organizationId ?? null);
        return {
            success: true,
            data: {
                periodFrom: start.toISOString(),
                periodTo: end.toISOString(),
                revenue: kpi.revenue,
                cost: kpi.cost,
                margin: kpi.margin,
                marginPercent: Math.round(kpi.marginPercent * 10) / 10,
                finesAmount: kpi.finesAmount,
                repairsAmount: kpi.repairsAmount,
                tripsCompleted: kpi.tripsCompleted,
                overdueDebt: kpi.overdueDebt,
            },
        };
    },
};

// ------------------------------------------------------------
// 10. track_contractor_orders
// ------------------------------------------------------------
const trackContractorOrdersTool: CopilotTool<z.infer<typeof TrackContractorOrdersInput>> = {
    name: 'track_contractor_orders',
    description: 'Активные заявки контрагента + связанный рейс и ETA на ближайшую точку (если есть).',
    inputSchema: TrackContractorOrdersInput,
    input_schema: zodToJsonSchema(TrackContractorOrdersInput),
    handler: async (input, ctx) => {
        const rows = await db
            .select({
                orderId: orders.id,
                orderNumber: orders.number,
                orderStatus: orders.status,
                tripId: orders.tripId,
            })
            .from(orders)
            .where(and(
                eq(orders.contractorId, input.contractorId),
                inArray(orders.status, ['confirmed', 'assigned', 'in_transit']),
                ctx.organizationId ? eq(orders.organizationId, ctx.organizationId) : undefined,
            ))
            .limit(50);

        const enriched: Array<{
            orderId: string;
            orderNumber: string;
            orderStatus: string;
            tripId: string | null;
            tripNumber: string | null;
            etaIso: string | null;
            distanceKm: number | null;
        }> = [];
        for (const row of rows) {
            let tripNumber: string | null = null;
            let etaIso: string | null = null;
            let distanceKm: number | null = null;
            if (row.tripId) {
                const trip = await getTripById(row.tripId);
                tripNumber = trip?.number ?? null;
                const eta = await computeTripEta(row.tripId);
                if (eta) {
                    etaIso = eta.etaIso;
                    distanceKm = eta.distanceKm;
                }
            }
            enriched.push({
                orderId: row.orderId,
                orderNumber: row.orderNumber,
                orderStatus: row.orderStatus,
                tripId: row.tripId,
                tripNumber,
                etaIso,
                distanceKm,
            });
        }

        return { success: true, data: { count: enriched.length, orders: enriched } };
    },
};

// ------------------------------------------------------------
// Registry
// ------------------------------------------------------------
export const ALL_TOOLS: ReadonlyArray<CopilotTool> = [
    listActiveTripsTool,
    getTripDetailsTool,
    driverHosTool,
    listTripsAtRiskTool,
    tempBreachesTool,
    computeTripCostTool,
    proposeReassignmentTool,
    listPendingInvoicesTool,
    getMonthlyMarginTool,
    trackContractorOrdersTool,
] as ReadonlyArray<CopilotTool>;

export function getToolByName(name: string): CopilotTool | undefined {
    return ALL_TOOLS.find((t) => t.name === name);
}

export async function runTool(
    name: string,
    rawInput: unknown,
    ctx: CopilotToolContext,
): Promise<CopilotToolHandlerResult> {
    const tool = getToolByName(name);
    if (!tool) return { success: false, error: `Unknown tool: ${name}` };
    const parsed = tool.inputSchema.safeParse(rawInput ?? {});
    if (!parsed.success) {
        return { success: false, error: `Invalid input: ${parsed.error.message}` };
    }
    try {
        return await tool.handler(parsed.data, ctx);
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Tool execution failed';
        return { success: false, error: msg };
    }
}

// Suppress tree-shaken-but-needed import warnings
void or; void isNull; void gte; void lte; void tripOrders; void vehicles;
