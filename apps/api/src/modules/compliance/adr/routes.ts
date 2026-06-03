// ============================================================
// ADR strict-mode admin routes.
//   POST /api/compliance/adr/strict-mode { enabled }
//   GET  /api/compliance/adr/strict-mode
//   GET  /api/compliance/adr/orders        — flagged ADR orders
//   POST /api/compliance/adr/validate-hard — preview the wrapper
// ============================================================
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
    setAdrStrictMode, getAdrStrictMode, validateAdrHard, listAdrOrders,
} from './service.js';
import { requireFeature } from '../../../auth/plan-guard.js';
import { assertOrderAccess, assertVehicleAccess, assertDriverAccess } from '../../../auth/guards.js';

interface AuthUser {
    userId: string;
    roles: string[];
    organizationId?: string | null;
}

const StrictModeSchema = z.object({ enabled: z.boolean() });

const ValidateSchema = z.object({
    orderId: z.string().uuid(),
    vehicleId: z.string().uuid(),
    driverId: z.string().uuid(),
});

const adrComplianceRoutes: FastifyPluginAsync = async (app) => {
    app.get('/compliance/adr/strict-mode', {
        schema: {
            tags: ['Compliance'],
            summary: 'Текущий режим строгости ADR',
        },
        preHandler: [app.authenticate, requireFeature('adr')],
    }, async (request) => {
        const user = request.user as AuthUser;
        if (!user.organizationId) return { success: true, data: { enabled: false } };
        const enabled = await getAdrStrictMode(user.organizationId);
        return { success: true, data: { enabled } };
    });

    app.post('/compliance/adr/strict-mode', {
        schema: {
            tags: ['Compliance'],
            summary: 'Переключить режим строгости ADR (admin)',
            description: 'Когда enabled=true, любые ошибки ADR при назначении рейса будут блокировать операцию вместо предупреждения.',
        },
        preHandler: [app.authenticate, requireFeature('adr')],
    }, async (request, reply) => {
        const user = request.user as AuthUser;
        if (!user.roles.includes('admin')) {
            return reply.status(403).send({ success: false, error: 'admin only' });
        }
        if (!user.organizationId) {
            return reply.status(400).send({ success: false, error: 'Организация не найдена в токене' });
        }
        const parsed = StrictModeSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({ success: false, error: 'enabled должен быть boolean' });
        }
        const out = await setAdrStrictMode(user.organizationId, parsed.data.enabled);
        return { success: true, data: out };
    });

    app.get('/compliance/adr/orders', {
        schema: {
            tags: ['Compliance'],
            summary: 'Список заявок с ADR-классом',
        },
        preHandler: [app.authenticate, requireFeature('adr')],
    }, async (request) => {
        const user = request.user as AuthUser;
        const isSuper = !user.organizationId && Boolean(user.roles?.includes('admin'));
        if (!user.organizationId && !isSuper) return { success: true, data: [] };
        const rows = await listAdrOrders(user.organizationId ?? '', isSuper);
        return { success: true, data: rows };
    });

    app.post('/compliance/adr/validate-hard', {
        schema: {
            tags: ['Compliance'],
            summary: 'Жёсткая валидация ADR (учитывает strict-mode)',
        },
        preHandler: [app.authenticate, requireFeature('adr')],
    }, async (request, reply) => {
        const user = request.user as AuthUser;
        const parsed = ValidateSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({ success: false, error: 'orderId/vehicleId/driverId обязательны' });
        }
        // C3 (механизм «а»): order/vehicle/driver обязаны принадлежать орг —
        // иначе cross-tenant probing ADR-совместимости. assert* DENY org-less + чужие.
        if (parsed.data.orderId) await assertOrderAccess(parsed.data.orderId, user);
        if (parsed.data.vehicleId) await assertVehicleAccess(parsed.data.vehicleId, user);
        if (parsed.data.driverId) await assertDriverAccess(parsed.data.driverId, user);
        const out = await validateAdrHard(
            user.organizationId ?? null,
            parsed.data.orderId,
            parsed.data.vehicleId,
            parsed.data.driverId,
        );
        return { success: true, data: out };
    });
};

export default adrComplianceRoutes;
