// ============================================================
// Round 3B — D8: Demo data generator routes
// ============================================================
import type { FastifyPluginAsync } from 'fastify';
import { generateDemoData, cleanupDemoData } from './service.js';

interface AuthUser {
    userId: string;
    roles: string[];
    organizationId?: string | null;
}

const demoRoutes: FastifyPluginAsync = async (app) => {
    // POST /api/demo/generate — admin-only; idempotent.
    app.post('/demo/generate', {
        schema: {
            tags: ['Импорт'],
            summary: 'Создать демо-данные',
            description: 'Создаёт минимальный демо-набор: 1 контрагент, 2 ТС, 2 водителя, 1 завершённый рейс, 1 активный рейс, 1 заказ с cold-chain. Идемпотентно.',
        },
        preHandler: [app.authenticate],
    }, async (request, reply) => {
        const user = request.user as AuthUser;
        if (!user.roles.includes('admin')) {
            return reply.status(403).send({ success: false, error: 'Только admin' });
        }
        if (!user.organizationId) {
            return reply.status(400).send({ success: false, error: 'У пользователя не указана организация' });
        }

        try {
            const result = await generateDemoData(user.organizationId, user.userId);
            return { success: true, data: result };
        } catch (err: any) {
            request.log.error({ err }, 'demo.generate failed');
            return reply.status(500).send({ success: false, error: err?.message ?? 'Не удалось создать демо-данные' });
        }
    });

    // DELETE /api/demo/cleanup — admin-only.
    app.delete('/demo/cleanup', {
        schema: {
            tags: ['Импорт'],
            summary: 'Удалить демо-данные',
            description: 'Удаляет все объекты, помеченные как демо ([ДЕМО] / DEMO-...).',
        },
        preHandler: [app.authenticate],
    }, async (request, reply) => {
        const user = request.user as AuthUser;
        if (!user.roles.includes('admin')) {
            return reply.status(403).send({ success: false, error: 'Только admin' });
        }
        if (!user.organizationId) {
            return reply.status(400).send({ success: false, error: 'У пользователя не указана организация' });
        }

        try {
            const result = await cleanupDemoData(user.organizationId, user.userId);
            return { success: true, data: result };
        } catch (err: any) {
            request.log.error({ err }, 'demo.cleanup failed');
            return reply.status(500).send({ success: false, error: err?.message ?? 'Не удалось удалить демо-данные' });
        }
    });
};

export default demoRoutes;
