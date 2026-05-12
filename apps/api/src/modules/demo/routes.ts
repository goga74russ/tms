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

/**
 * A-P2: demo endpoints are gated behind `ALLOW_DEMO_SEED=true`. In
 * production with that env unset, the handlers return 404 — a
 * compromised admin token still can't trigger destructive
 * `cleanupDemoData` (which deletes everything matching the demo
 * pattern) on real tenant data. We pick 404 (not 403/503) so the
 * endpoint's existence is not revealed: an attacker scanning a
 * production deployment sees no signal that demo seeding is even a
 * thing in this build.
 *
 * To re-enable for sandbox tenants in production, set
 * `ALLOW_DEMO_SEED=true` in the environment. Default behaviour
 * (env unset) preserves the ability to seed demo data locally
 * outside production (`NODE_ENV !== 'production'`).
 */
function isDemoSeedAllowed(): boolean {
    if (process.env.ALLOW_DEMO_SEED === 'true') return true;
    // Non-production environments stay permissive — devs need the
    // generator. Only production-without-opt-in is blocked.
    return process.env.NODE_ENV !== 'production';
}

function demoDisabledReply(reply: import('fastify').FastifyReply) {
    // A-P2: 404 (not 403/503) keeps the endpoint surface hidden in
    // production — same shape Fastify would emit for an unregistered
    // route, so route enumeration via response code is defeated.
    return reply.status(404).send({
        success: false,
        error: 'Not found',
    });
}

const demoRoutes: FastifyPluginAsync = async (app) => {
    // POST /api/demo/generate — admin-only; idempotent; env-gated (A-P2).
    app.post('/demo/generate', {
        schema: {
            tags: ['Импорт'],
            summary: 'Создать демо-данные',
            description: 'Создаёт минимальный демо-набор: 1 контрагент, 2 ТС, 2 водителя, 1 завершённый рейс, 1 активный рейс, 1 заказ с cold-chain. Идемпотентно. В production требуется ALLOW_DEMO_SEED=true.',
        },
        preHandler: [app.authenticate],
    }, async (request, reply) => {
        if (!isDemoSeedAllowed()) {
            return demoDisabledReply(reply);
        }
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

    // DELETE /api/demo/cleanup — admin-only; env-gated (A-P2). A
    // compromised admin token must not be able to wipe everything
    // matching the demo pattern on a production tenant.
    app.delete('/demo/cleanup', {
        schema: {
            tags: ['Импорт'],
            summary: 'Удалить демо-данные',
            description: 'Удаляет все объекты, помеченные как демо ([ДЕМО] / DEMO-...). В production требуется ALLOW_DEMO_SEED=true.',
        },
        preHandler: [app.authenticate],
    }, async (request, reply) => {
        if (!isDemoSeedAllowed()) {
            return demoDisabledReply(reply);
        }
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
