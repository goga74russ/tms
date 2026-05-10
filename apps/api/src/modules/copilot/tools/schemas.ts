// ============================================================
// AI Co-pilot — tool input Zod schemas
// Split from tools/index.ts so unit tests can import these without
// pulling in the DB connection (which requires DATABASE_URL at import time).
// ============================================================
import { z } from 'zod';

export const ListActiveTripsInput = z.object({
    limit: z.number().int().min(1).max(50).optional(),
});

export const GetTripDetailsInput = z.object({
    tripId: z.string().uuid(),
});

export const DriverHosInput = z.object({
    driverId: z.string().uuid(),
});

export const ListTripsAtRiskInput = z.object({
    limit: z.number().int().min(1).max(30).optional(),
});

export const TempBreachesInput = z.object({
    tripId: z.string().uuid().optional(),
});

export const ComputeTripCostInput = z.object({
    tripId: z.string().uuid(),
});

export const ProposeReassignmentInput = z.object({
    driverId: z.string().uuid(),
});

export const ListPendingInvoicesInput = z.object({
    limit: z.number().int().min(1).max(50).optional(),
});

export const GetMonthlyMarginInput = z.object({
    monthOffset: z.number().int().min(-12).max(0).optional(),
});

export const TrackContractorOrdersInput = z.object({
    contractorId: z.string().uuid(),
});

export const TOOL_SCHEMAS = {
    list_active_trips: ListActiveTripsInput,
    get_trip_details: GetTripDetailsInput,
    get_driver_hos_status: DriverHosInput,
    list_trips_at_risk: ListTripsAtRiskInput,
    get_temperature_breaches: TempBreachesInput,
    compute_trip_cost: ComputeTripCostInput,
    propose_reassignment: ProposeReassignmentInput,
    list_pending_invoices: ListPendingInvoicesInput,
    get_monthly_margin: GetMonthlyMarginInput,
    track_contractor_orders: TrackContractorOrdersInput,
} as const;

export type ToolName = keyof typeof TOOL_SCHEMAS;

export const TOOL_NAMES: ReadonlyArray<ToolName> = Object.keys(TOOL_SCHEMAS) as ToolName[];
