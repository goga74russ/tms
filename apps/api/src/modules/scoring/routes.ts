// ============================================================
// Wave 5 — Driver scoring routes.
// ============================================================
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireAbility } from '../../auth/rbac.js';
import { assertDriverAccess } from '../../auth/guards.js';
import { computeDriverScore, computeScoreboard } from './service.js';
import { safeClientError } from '../../utils/safe-error.js';

const ParamsSchema = z.object({ id: z.string().uuid() });

// C9: было z.string().datetime() — отвергало date-only 'YYYY-MM-DD', а kpi-страница
// шлёт именно их → запросы скоринга всегда 400. Принимаем date ИЛИ datetime
// (сервис парсит через new Date()).
const dateOrDatetime = z
    .string()
    .refine((s) => !Number.isNaN(Date.parse(s)), { message: 'Некорректная дата' })
    .optional();

const QuerySchema = z.object({
    from: dateOrDatetime,
    to: dateOrDatetime,
});

const ScoreboardQuerySchema = z.object({
    from: dateOrDatetime,
    to: dateOrDatetime,
    limit: z.coerce.number().int().min(1).max(200).optional(),
});

interface AuthUser {
    userId: string;
    roles: string[];
    organizationId?: string | null;
}

const scoringRoutes: FastifyPluginAsync = async (app) => {
    // --- GET /drivers/:id/score ---
    app.get('/drivers/:id/score', {
        schema: {
            tags: ['Аналитика'],
            summary: 'Скоринг водителя',
            description: 'Возвращает композитный балл водителя за период (по умолчанию — последние 30 дней).',
        },
        preHandler: [app.authenticate, requireAbility('read', 'Driver')],
    }, async (request, reply) => {
        const params = ParamsSchema.safeParse(request.params);
        if (!params.success) {
            return reply.status(400).send({ success: false, error: 'Некорректный id' });
        }
        const query = QuerySchema.safeParse(request.query);
        if (!query.success) {
            return reply.status(400).send({
                success: false,
                error: 'Параметры from/to должны быть ISO-датами',
                details: query.error.flatten().fieldErrors,
            });
        }

        const user = request.user as AuthUser;
        try {
            await assertDriverAccess(params.data.id, user);
        } catch (err: any) {
            return reply.status(403).send({ success: false, error: safeClientError(err, 'Внутренняя ошибка сервера') });
        }

        const fromDate = query.data.from ? new Date(query.data.from) : undefined;
        const toDate = query.data.to ? new Date(query.data.to) : undefined;

        const result = await computeDriverScore(params.data.id, fromDate, toDate);
        return { success: true, data: result };
    });

    // --- GET /drivers/scoreboard ---
    app.get('/drivers/scoreboard', {
        schema: {
            tags: ['Аналитика'],
            summary: 'Скоринг-доска водителей',
            description: 'Топ/анти-топ водителей по композитному баллу. По умолчанию — top 10 за последние 30 дней.',
        },
        preHandler: [app.authenticate, requireAbility('read', 'KPI')],
    }, async (request, reply) => {
        const query = ScoreboardQuerySchema.safeParse(request.query);
        if (!query.success) {
            return reply.status(400).send({
                success: false,
                error: 'Некорректные параметры',
                details: query.error.flatten().fieldErrors,
            });
        }

        const user = request.user as AuthUser;
        const fromDate = query.data.from ? new Date(query.data.from) : undefined;
        const toDate = query.data.to ? new Date(query.data.to) : undefined;
        const limit = query.data.limit ?? 10;

        const result = await computeScoreboard(fromDate, toDate, limit, user.organizationId ?? null);
        return { success: true, data: result };
    });
};

export default scoringRoutes;
