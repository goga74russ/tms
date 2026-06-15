// ============================================================
// Wave 5 — ADR routes: проверка совместимости заявки для перевозки
// опасных грузов с конкретными ТС/водителем.
// ============================================================
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireAbility } from '../../auth/rbac.js';
import { assertOrderAccess, assertVehicleAccess, assertDriverAccess } from '../../auth/guards.js';
import { validateAdrCompatibility } from './service.js';
import { safeClientError } from '../../utils/safe-error.js';

const ParamsSchema = z.object({ id: z.string().uuid() });
const QuerySchema = z.object({
    vehicleId: z.string().uuid(),
    driverId: z.string().uuid(),
});

const adrRoutes: FastifyPluginAsync = async (app) => {
    // --- GET /orders/:id/adr-validation?vehicleId=&driverId= ---
    app.get('/orders/:id/adr-validation', {
        schema: {
            tags: ['Заявки'],
            summary: 'Проверка ADR-совместимости',
            description: 'Проверяет, может ли указанное ТС/водитель перевозить опасный груз заявки. Если adr_class пуст — валидация автоматически проходит.',
        },
        preHandler: [app.authenticate, requireAbility('read', 'Order')],
    }, async (request, reply) => {
        const params = ParamsSchema.safeParse(request.params);
        if (!params.success) {
            return reply.status(400).send({
                success: false,
                error: 'Некорректный id заявки',
                details: params.error.flatten().fieldErrors,
            });
        }

        const query = QuerySchema.safeParse(request.query);
        if (!query.success) {
            return reply.status(400).send({
                success: false,
                error: 'vehicleId и driverId обязательны',
                details: query.error.flatten().fieldErrors,
            });
        }

        const user = request.user as {
            userId: string;
            roles: string[];
            organizationId?: string | null;
        };

        try {
            // P1 (код-аудит 2026-06-14): проверяем принадлежность орг не только заказа,
            // но и vehicleId/driverId из query — иначе cross-tenant IDOR (ADR-проверка
            // по чужим ТС/водителю, утечка факта существования и их ADR-данных).
            await assertOrderAccess(params.data.id, user);
            await assertVehicleAccess(query.data.vehicleId, user);
            await assertDriverAccess(query.data.driverId, user);
        } catch (err: any) {
            return reply.status(403).send({ success: false, error: safeClientError(err, 'Внутренняя ошибка сервера') });
        }

        const result = await validateAdrCompatibility(
            params.data.id,
            query.data.vehicleId,
            query.data.driverId,
        );

        return { success: true, data: result };
    });
};

export default adrRoutes;
