// ============================================================
// Repairs Routes — Fastify plugin (§3.10 ТЗ)
// ============================================================
import { FastifyInstance } from 'fastify';
import { requireAbility } from '../../auth/rbac.js';
import * as repairsService from './service.js';
import { RepairRequestCreateSchema } from '@tms/shared';

export default async function repairsRoutes(app: FastifyInstance) {

    // List repairs (with filters)
    app.get('/repairs', {
        preHandler: [app.authenticate, requireAbility('read', 'RepairRequest')],
    }, async (request, reply) => {
        const { page, limit, status, vehicleId, search, dateFrom, dateTo } = request.query as any;
        const result = await repairsService.listRepairs(
            { status, vehicleId, search, dateFrom, dateTo },
            { page: Number(page), limit: Number(limit) },
        );
        return { success: true, data: result.data, ...result.pagination };
    });

    // Get single repair
    app.get('/repairs/:id', {
        preHandler: [app.authenticate, requireAbility('read', 'RepairRequest')],
    }, async (request, reply) => {
        const { id } = request.params as { id: string };
        const repair = await repairsService.getRepair(id);
        if (!repair) return reply.status(404).send({ success: false, error: 'Заявка на ремонт не найдена' });
        return { success: true, data: repair };
    });

    // Create repair
    app.post('/repairs', {
        preHandler: [app.authenticate, requireAbility('create', 'RepairRequest')],
    }, async (request, reply) => {
        try {
            const user = request.user as { userId: string; roles: string[] };
            // H-4: Zod validation
            const parsed = RepairRequestCreateSchema.safeParse(request.body);
            if (!parsed.success) return reply.status(400).send({ success: false, error: 'Validation failed', details: parsed.error.flatten() });
            const repair = await repairsService.createRepair(parsed.data as any, user);
            return reply.status(201).send({ success: true, data: repair });
        } catch (err: any) {
            return reply.status(400).send({ success: false, error: err.message });
        }
    });

    // Update repair details
    app.put('/repairs/:id', {
        preHandler: [app.authenticate, requireAbility('update', 'RepairRequest')],
    }, async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            const user = request.user as { userId: string; roles: string[] };
            const parsed = RepairRequestCreateSchema.partial().safeParse(request.body);
            if (!parsed.success) return reply.status(400).send({ success: false, error: 'Validation failed', details: parsed.error.flatten() });
            const repair = await repairsService.updateRepair(id, parsed.data as any, user);
            return { success: true, data: repair };
        } catch (err: any) {
            return reply.status(400).send({ success: false, error: err.message });
        }
    });

    // Change repair status (state machine)
    app.put('/repairs/:id/status', {
        preHandler: [app.authenticate, requireAbility('update', 'RepairRequest')],
    }, async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            const { status } = request.body as { status: string };
            const user = request.user as { userId: string; roles: string[] };
            const repair = await repairsService.updateRepairStatus(id, status, user);
            return { success: true, data: repair };
        } catch (err: any) {
            return reply.status(400).send({ success: false, error: err.message });
        }
    });

    // Repair analytics by status
    app.get('/repairs/analytics/by-status', {
        preHandler: [app.authenticate, requireAbility('read', 'RepairRequest')],
    }, async (request, reply) => {
        const result = await repairsService.repairsByStatus();
        return { success: true, data: result };
    });

    // Repair cost by vehicle
    app.get('/repairs/analytics/cost/:vehicleId', {
        preHandler: [app.authenticate, requireAbility('read', 'RepairRequest')],
    }, async (request, reply) => {
        const { vehicleId } = request.params as { vehicleId: string };
        const result = await repairsService.repairsCostByVehicle(vehicleId);
        return { success: true, data: result };
    });
}
