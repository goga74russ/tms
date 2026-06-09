// ============================================================
// OSAGO compliance routes.
//   GET  /api/compliance/osago/check/:vehicleId  — single check
//   POST /api/compliance/osago/sync              — bulk sync (admin)
//   GET  /api/compliance/osago/status            — latest per vehicle
// ============================================================
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db } from '../../../db/connection.js';
import { vehicles } from '../../../db/schema.js';
import { runOsagoCheck, runOrgOsagoSync, listLatestOsagoStatuses } from './service.js';
import { requireFeature } from '../../../auth/plan-guard.js';

interface AuthUser {
    userId: string;
    roles: string[];
    organizationId?: string | null;
}

const ParamsSchema = z.object({ vehicleId: z.string().uuid() });

const osagoRoutes: FastifyPluginAsync = async (app) => {
    app.get('/compliance/osago/check/:vehicleId', {
        schema: {
            tags: ['Compliance'],
            summary: 'Проверка ОСАГО для ТС',
            description: 'Запрашивает статус ОСАГО у активного провайдера и сохраняет снимок в osago_checks.',
        },
        preHandler: [app.authenticate, requireFeature('osago_monitoring')],
    }, async (request, reply) => {
        const user = request.user as AuthUser;
        // Без role-гейта любой член орг (в т.ч. driver) мог инициировать
        // проверку ОСАГО (внешний запрос к провайдеру + запись снимка). Только
        // эксплуатационные роли / операторы парка: admin/manager/mechanic +
        // logist/dispatcher (как в marking — инициаторы проверок парка).
        const allowed = ['admin', 'manager', 'mechanic', 'logist', 'dispatcher'];
        if (!user.roles?.some((r) => allowed.includes(r))) {
            return reply.status(403).send({ success: false, error: 'Недостаточно прав для проверки ОСАГО' });
        }
        const params = ParamsSchema.safeParse(request.params);
        if (!params.success) {
            return reply.status(400).send({ success: false, error: 'Некорректный vehicleId' });
        }

        // Org-scope: vehicle must belong to user's org (admins of org may check).
        const where = user.organizationId
            ? and(eq(vehicles.id, params.data.vehicleId), eq(vehicles.organizationId, user.organizationId))
            : eq(vehicles.id, params.data.vehicleId);
        const [vehicle] = await db
            .select({ id: vehicles.id, plate: vehicles.plateNumber, vin: vehicles.vin })
            .from(vehicles)
            .where(where)
            .limit(1);
        if (!vehicle) {
            return reply.status(404).send({ success: false, error: 'ТС не найдено' });
        }

        const result = await runOsagoCheck({
            organizationId: user.organizationId ?? null,
            vehicleId: vehicle.id,
            plate: vehicle.plate,
            vin: vehicle.vin,
        });
        return { success: true, data: result };
    });

    app.post('/compliance/osago/sync', {
        schema: {
            tags: ['Compliance'],
            summary: 'Массовая проверка ОСАГО',
            description: 'Проверяет ОСАГО для всех ТС организации. Только для admin.',
        },
        preHandler: [app.authenticate, requireFeature('osago_monitoring')],
    }, async (request, reply) => {
        const user = request.user as AuthUser;
        if (!user.roles.includes('admin')) {
            return reply.status(403).send({ success: false, error: 'admin only' });
        }
        if (!user.organizationId) {
            return reply.status(400).send({ success: false, error: 'Организация не найдена в токене' });
        }
        const summary = await runOrgOsagoSync(user.organizationId);
        return {
            success: true,
            data: {
                checked: summary.checked,
                valid: summary.valid,
                expired: summary.expired,
            },
        };
    });

    app.get('/compliance/osago/status', {
        schema: {
            tags: ['Compliance'],
            summary: 'Сводка ОСАГО по парку',
            description: 'Последняя проверка ОСАГО для каждого ТС текущей организации.',
        },
        preHandler: [app.authenticate, requireFeature('osago_monitoring')],
    }, async (request) => {
        const user = request.user as AuthUser;
        if (!user.organizationId) return { success: true, data: [] };
        const data = await listLatestOsagoStatuses(user.organizationId);
        return { success: true, data };
    });
};

export default osagoRoutes;
