import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireAbility } from '../../auth/rbac.js';
import { getCostModelSettings, listRecentSettings, updateCostModelSettings } from './service.js';

const CostSettingsUpdateSchema = z.object({
    fuelPricePerLiter: z.number().positive().optional(),
    driverSalaryPerHour: z.number().positive().optional(),
    amortizationPerKm: z.number().positive().optional(),
});

const settingsRoutes: FastifyPluginAsync = async (fastify) => {
    fastify.get('/settings/cost-model', {
        schema: {
            tags: ['Настройки'],
            summary: 'Настройки cost model',
            description: 'Текущие настройки себестоимости для тарификации: топливо, ставка водителя, амортизация.',
        },
        preHandler: [fastify.authenticate, requireAbility('manage', 'Settings')],
    }, async (request) => {
        const orgId = (request.user as { organizationId?: string }).organizationId;
        const data = await getCostModelSettings(orgId);
        return { success: true, data };
    });

    fastify.put('/settings/cost-model', {
        schema: {
            tags: ['Настройки'],
            summary: 'Обновить cost model',
            description: 'Сохраняет настройки себестоимости в БД и делает их источником истины для тарификации.',
        },
        preHandler: [fastify.authenticate, requireAbility('manage', 'Settings')],
    }, async (request, reply) => {
        const parsed = CostSettingsUpdateSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.code(422).send({ success: false, error: parsed.error.flatten() });
        }

        const orgId = (request.user as { organizationId?: string }).organizationId;
        const data = await updateCostModelSettings(parsed.data, request.user.userId, orgId);
        return { success: true, data };
    });

    fastify.get('/settings/recent', {
        schema: {
            tags: ['Настройки'],
            summary: 'Недавние изменения настроек',
            description: 'Возвращает последние сохраненные системные настройки.',
        },
        preHandler: [fastify.authenticate, requireAbility('manage', 'Settings')],
    }, async () => {
        const data = await listRecentSettings();
        return { success: true, data };
    });
};

export default settingsRoutes;
