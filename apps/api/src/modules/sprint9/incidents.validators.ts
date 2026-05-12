// ============================================================
// Incidents — request body validator extracted from routes.ts.
// Behavior-preserving: the schema definition matches the original
// inline schema verbatim. Lifted so it can be unit-tested without
// booting Fastify.
// ============================================================
import { z } from 'zod';

export const incidentCreateSchema = z.object({
    type: z.enum(['med_inspection', 'tech_inspection', 'road', 'cargo', 'other']),
    severity: z.enum(['low', 'medium', 'critical']).default('low'),
    status: z.enum(['open', 'investigating', 'resolved', 'dismissed']).default('open'),
    description: z.string().min(1),
    vehicleId: z.string().uuid().optional(),
    driverId: z.string().uuid().optional(),
    tripId: z.string().uuid().optional(),
    techInspectionId: z.string().uuid().optional(),
    medInspectionId: z.string().uuid().optional(),
    resolution: z.string().optional(),
    resolvedAt: z.string().datetime().optional(),
    resolvedBy: z.string().uuid().optional(),
    blocksRelease: z.boolean().default(false),
});

export type IncidentCreatePayload = z.infer<typeof incidentCreateSchema>;
