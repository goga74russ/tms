// ============================================================
// Repairs Routes - Fastify plugin
// ============================================================
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAbility } from '../../auth/rbac.js';
import { assertVehicleAccess } from '../../auth/guards.js';
import * as repairsService from './service.js';
import { RepairRequestCreateSchema, RepairRequestSchema } from '@tms/shared';

type RepairQuery = {
    page?: string;
    limit?: string;
    status?: string;
    vehicleId?: string;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
};

type RepairPartCatalogQuery = {
    search?: string;
    limit?: string;
    includeArchived?: string;
};

const RepairPartCatalogCreateSchema = z.object({
    code: z.string().trim().min(1).max(100).optional(),
    name: z.string().trim().min(1).max(255),
    category: z.string().trim().min(1).max(120),
    unit: z.string().trim().min(1).max(30),
    suggestedUnitCost: z.number().min(0),
    aliases: z.array(z.string().trim().min(1)).optional(),
});

const RepairPartCatalogUpdateSchema = RepairPartCatalogCreateSchema.partial().extend({
    isArchived: z.boolean().optional(),
});

export default async function repairsRoutes(app: FastifyInstance) {
    // List repairs (with filters)
    app.get('/repairs', {
        schema: { tags: ['Repairs'], summary: 'List repairs', description: 'Return repairs with filters and pagination.' },
        preHandler: [app.authenticate, requireAbility('read', 'RepairRequest')],
    }, async (request) => {
        const { page, limit, status, vehicleId, search, dateFrom, dateTo } = request.query as RepairQuery;
        const { organizationId } = request.user as { userId: string; roles: string[]; organizationId?: string };
        const result = await repairsService.listRepairs(
            { status, vehicleId, search, dateFrom, dateTo, organizationId },
            { page: Number(page), limit: Number(limit) },
        );
        return { success: true, data: result.data, ...result.pagination };
    });

    // Repair parts catalog
    app.get('/repairs/parts/catalog', {
        schema: { tags: ['Repairs'], summary: 'Repair parts catalog', description: 'Reusable list of common repair parts.' },
        preHandler: [app.authenticate, requireAbility('read', 'RepairRequest')],
    }, async (request) => {
        const { search, limit, includeArchived } = request.query as RepairPartCatalogQuery;
        const { organizationId } = request.user as { organizationId?: string | null };
        const data = await repairsService.listRepairPartCatalog(search, {
            limit: limit ? Number(limit) : 50,
            includeArchived: includeArchived === '1' || includeArchived === 'true',
            organizationId,
        });
        return { success: true, data };
    });

    // Repair parts catalog meta
    app.get('/repairs/parts/catalog/meta', {
        schema: { tags: ['Repairs'], summary: 'Repair parts catalog meta', description: 'Grouped read-only catalog shaping for the repair UI.' },
        preHandler: [app.authenticate, requireAbility('read', 'RepairRequest')],
    }, async (request) => {
        const { organizationId } = request.user as { organizationId?: string | null };
        const data = await repairsService.getRepairPartCatalogMeta(organizationId);
        return { success: true, data };
    });

    app.post('/repairs/parts/catalog', {
        schema: { tags: ['Repairs'], summary: 'Create repair part catalog item', description: 'Create a persisted repair-part catalog item.' },
        preHandler: [app.authenticate, requireAbility('update', 'RepairRequest')],
    }, async (request, reply) => {
        try {
            const parsed = RepairPartCatalogCreateSchema.safeParse(request.body);
            if (!parsed.success) return reply.status(400).send({ success: false, error: 'Ошибка валидации данных', details: parsed.error.flatten() });
            const user = request.user as { userId: string; organizationId?: string };
            const data = await repairsService.createRepairPartCatalogItem(parsed.data, user);
            return reply.status(201).send({ success: true, data });
        } catch (err: any) {
            return reply.status(400).send({ success: false, error: err.message });
        }
    });

    app.put('/repairs/parts/catalog/:id', {
        schema: { tags: ['Repairs'], summary: 'Update repair part catalog item', description: 'Update a persisted repair-part catalog item.' },
        preHandler: [app.authenticate, requireAbility('update', 'RepairRequest')],
    }, async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            const parsed = RepairPartCatalogUpdateSchema.safeParse(request.body);
            if (!parsed.success) return reply.status(400).send({ success: false, error: 'Ошибка валидации данных', details: parsed.error.flatten() });
            const user = request.user as { userId: string; organizationId?: string | null };
            const data = await repairsService.updateRepairPartCatalogItem(id, parsed.data, user);
            return { success: true, data };
        } catch (err: any) {
            return reply.status(400).send({ success: false, error: err.message });
        }
    });

    app.delete('/repairs/parts/catalog/:id', {
        schema: { tags: ['Repairs'], summary: 'Archive repair part catalog item', description: 'Archive a persisted repair-part catalog item.' },
        preHandler: [app.authenticate, requireAbility('update', 'RepairRequest')],
    }, async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            const user = request.user as { userId: string; organizationId?: string | null };
            const data = await repairsService.archiveRepairPartCatalogItem(id, user);
            return { success: true, data };
        } catch (err: any) {
            return reply.status(400).send({ success: false, error: err.message });
        }
    });

    // Get single repair
    app.get('/repairs/:id', {
        schema: { tags: ['Repairs'], summary: 'Get repair', description: 'Detailed repair request information.' },
        preHandler: [app.authenticate, requireAbility('read', 'RepairRequest')],
    }, async (request, reply) => {
        const { id } = request.params as { id: string };
        const { organizationId } = request.user as { organizationId?: string | null };
        const repair = await repairsService.getRepair(id, organizationId);
        if (!repair) return reply.status(404).send({ success: false, error: 'Repair request not found' });
        return { success: true, data: repair };
    });

    // Create repair
    app.post('/repairs', {
        schema: { tags: ['Repairs'], summary: 'Create repair', description: 'Create a new repair request.' },
        preHandler: [app.authenticate, requireAbility('create', 'RepairRequest')],
    }, async (request, reply) => {
        try {
            const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
            const parsed = RepairRequestCreateSchema.safeParse(request.body);
            if (!parsed.success) return reply.status(400).send({ success: false, error: 'Ошибка валидации данных', details: parsed.error.flatten() });
            await assertVehicleAccess(parsed.data.vehicleId, user);
            const repair = await repairsService.createRepair(parsed.data as z.infer<typeof RepairRequestCreateSchema>, user);
            return reply.status(201).send({ success: true, data: repair });
        } catch (err: any) {
            return reply.status(400).send({ success: false, error: err.message });
        }
    });

    // Update repair details
    app.put('/repairs/:id', {
        schema: { tags: ['Repairs'], summary: 'Update repair', description: 'Update repair details.' },
        preHandler: [app.authenticate, requireAbility('update', 'RepairRequest')],
    }, async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
            const parsed = RepairRequestSchema.partial().safeParse(request.body);
            if (!parsed.success) return reply.status(400).send({ success: false, error: 'Ошибка валидации данных', details: parsed.error.flatten() });
            const payload: Parameters<typeof repairsService.updateRepair>[1] = {};
            if (parsed.data.description !== undefined) payload.description = parsed.data.description;
            if (parsed.data.priority !== undefined) payload.priority = parsed.data.priority;
            if (parsed.data.assignedTo !== undefined) payload.assignedTo = parsed.data.assignedTo;
            if (parsed.data.workDescription !== undefined) payload.workDescription = parsed.data.workDescription;
            if (parsed.data.partsUsed !== undefined) payload.partsUsed = parsed.data.partsUsed as any;
            if (parsed.data.totalCost !== undefined) payload.totalCost = parsed.data.totalCost;
            if (parsed.data.odometerAtRepair !== undefined) payload.odometerAtRepair = parsed.data.odometerAtRepair;
            if (parsed.data.photoUrls !== undefined) payload.photoUrls = parsed.data.photoUrls;
            const repair = await repairsService.updateRepair(id, payload, user);
            return { success: true, data: repair };
        } catch (err: any) {
            return reply.status(400).send({ success: false, error: err.message });
        }
    });

    // Change repair status (state machine)
    app.put('/repairs/:id/status', {
        schema: { tags: ['Repairs'], summary: 'Change repair status', description: 'created -> waiting_parts -> in_progress -> done' },
        preHandler: [app.authenticate, requireAbility('update', 'RepairRequest')],
    }, async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            const { status } = request.body as { status: string };
            const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
            const repair = await repairsService.updateRepairStatus(id, status, user);
            return { success: true, data: repair };
        } catch (err: any) {
            return reply.status(400).send({ success: false, error: err.message });
        }
    });

    // Repair analytics by status
    app.get('/repairs/analytics/by-status', {
        schema: { tags: ['Repairs'], summary: 'Repairs analytics by status', description: 'Count repairs by status.' },
        preHandler: [app.authenticate, requireAbility('read', 'RepairRequest')],
    }, async (request) => {
        const { organizationId } = request.user as { organizationId?: string | null };
        const result = await repairsService.repairsByStatus(organizationId);
        return { success: true, data: result };
    });

    // Repair cost by vehicle
    app.get('/repairs/analytics/cost/:vehicleId', {
        schema: { tags: ['Repairs'], summary: 'Repair cost by vehicle', description: 'Sum repair cost by vehicle.' },
        preHandler: [app.authenticate, requireAbility('read', 'RepairRequest')],
    }, async (request) => {
        const { vehicleId } = request.params as { vehicleId: string };
        const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
        await assertVehicleAccess(vehicleId, user);
        const result = await repairsService.repairsCostByVehicle(vehicleId, user.organizationId);
        return { success: true, data: result };
    });
}
