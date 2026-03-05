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
        schema: { tags: ['Ремонты'], summary: 'Список ремонтов', description: 'Все заявки на ремонт с фильтрацией по статусу и ТС.' },
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
        schema: { tags: ['Ремонты'], summary: 'Получить ремонт', description: 'Детальная информация о заявке на ремонт.' },
        preHandler: [app.authenticate, requireAbility('read', 'RepairRequest')],
    }, async (request, reply) => {
        const { id } = request.params as { id: string };
        const repair = await repairsService.getRepair(id);
        if (!repair) return reply.status(404).send({ success: false, error: 'Заявка на ремонт не найдена' });
        return { success: true, data: repair };
    });

    // Create repair
    app.post('/repairs', {
        schema: { tags: ['Ремонты'], summary: 'Создать заявку на ремонт', description: 'Новая заявка: описание, приоритет, источник (автоосмотр / водитель / механик).' },
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
        schema: { tags: ['Ремонты'], summary: 'Обновить ремонт', description: 'Обновление заявки (описание работ, запчасти, стоимость).' },
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
        schema: { tags: ['Ремонты'], summary: 'Сменить статус ремонта', description: 'Переход: created→waiting_parts→in_progress→done. Валидация state machine.' },
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
        schema: { tags: ['Ремонты'], summary: 'Аналитика по статусам', description: 'Количество ремонтов по статусам (для дашборда).' },
        preHandler: [app.authenticate, requireAbility('read', 'RepairRequest')],
    }, async (request, reply) => {
        const result = await repairsService.repairsByStatus();
        return { success: true, data: result };
    });

    // Repair cost by vehicle
    app.get('/repairs/analytics/cost/:vehicleId', {
        schema: { tags: ['Ремонты'], summary: 'Стоимость ремонтов ТС', description: 'Суммарная стоимость ремонтов для конкретного ТС.' },
        preHandler: [app.authenticate, requireAbility('read', 'RepairRequest')],
    }, async (request, reply) => {
        const { vehicleId } = request.params as { vehicleId: string };
        const result = await repairsService.repairsCostByVehicle(vehicleId);
        return { success: true, data: result };
    });
}
