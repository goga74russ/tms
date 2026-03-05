import { z } from 'zod';
import { PaginationSchema } from '@tms/shared';

// ================================================================
// Finance API Schemas
// ================================================================

export const InvoiceCreateSchema = z.object({
    contractorId: z.string().uuid(),
    periodStart: z.string().datetime(),
    periodEnd: z.string().datetime(),
    type: z.enum(['invoice', 'act', 'upd']).default('invoice'),
});
export type InvoiceCreate = z.infer<typeof InvoiceCreateSchema>;

export const ProfitabilityQuerySchema = z.object({
    periodStart: z.string().datetime().optional(),
    periodEnd: z.string().datetime().optional(),
    contractorId: z.string().uuid().optional(),
});
export type ProfitabilityQuery = z.infer<typeof ProfitabilityQuerySchema>;

export const FuelAnalysisQuerySchema = z.object({
    periodStart: z.string().datetime().optional(),
    periodEnd: z.string().datetime().optional(),
    vehicleId: z.string().uuid().optional(),
});
export type FuelAnalysisQuery = z.infer<typeof FuelAnalysisQuerySchema>;

export const Export1CQuerySchema = z.object({
    periodStart: z.string().datetime(),
    periodEnd: z.string().datetime(),
});
export type Export1CQuery = z.infer<typeof Export1CQuerySchema>;
