// ============================================================
// Wave 3 — РТО endpoints (часы вождения, статус HOS).
// ============================================================
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireAbility } from '../../auth/rbac.js';
import { assertDriverAccess } from '../../auth/guards.js';
import { recordEvent } from '../../events/journal.js';
import { getDriverHoursSummary, getDriverHosStatus } from './service.js';

interface AuthUser {
    userId: string;
    roles: string[];
    organizationId?: string | null;
}

const ParamsSchema = z.object({ id: z.string().uuid() });

const HoursSummaryQuerySchema = z.object({
    from: z.string().datetime(),
    to: z.string().datetime(),
});

const HosStatusQuerySchema = z.object({
    asOf: z.string().datetime().optional(),
});

const rtoRoutes: FastifyPluginAsync = async (app) => {
    // ──────────────────────────────────────────────
    // GET /api/drivers/:id/hours-summary?from=&to=
    // ──────────────────────────────────────────────
    app.get('/drivers/:id/hours-summary', {
        schema: {
            tags: ['Водители'],
            summary: 'Часы вождения за период (РТО)',
            description: 'Агрегирует tachograph_records по дням, считает суммарные часы и нарушения дневного лимита (9 ч).',
        },
        preHandler: [app.authenticate, requireAbility('read', 'Driver')],
    }, async (request, reply) => {
        const user = request.user as AuthUser;
        const params = ParamsSchema.safeParse(request.params);
        if (!params.success) {
            return reply.status(400).send({ success: false, error: 'Invalid driver id' });
        }
        const query = HoursSummaryQuerySchema.safeParse(request.query);
        if (!query.success) {
            return reply.status(400).send({
                success: false,
                error: 'Ошибка валидации данных',
                details: query.error.flatten(),
            });
        }

        await assertDriverAccess(params.data.id, user);

        const from = new Date(query.data.from);
        const to = new Date(query.data.to);
        if (from > to) {
            return reply.status(400).send({ success: false, error: 'from > to' });
        }

        const summary = await getDriverHoursSummary(params.data.id, from, to);

        if (summary.breaches.length > 0) {
            try {
                await recordEvent({
                    authorId: user.userId,
                    authorRole: user.roles[0] ?? 'system',
                    eventType: 'rto.breach',
                    entityType: 'driver',
                    entityId: params.data.id,
                    data: {
                        breaches: summary.breaches,
                        from: summary.from,
                        to: summary.to,
                    },
                });
            } catch (err) {
                app.log.warn({ err }, 'rto.breach journal write failed');
            }
        }

        return { success: true, data: summary };
    });

    // ──────────────────────────────────────────────
    // GET /api/drivers/:id/hos-status
    // ──────────────────────────────────────────────
    app.get('/drivers/:id/hos-status', {
        schema: {
            tags: ['Водители'],
            summary: 'Статус РТО (Hours of Service)',
            description: 'Текущие часы за сегодня и rolling 7-day с проверкой лимитов (9 ч/день, 56 ч/неделя).',
        },
        preHandler: [app.authenticate, requireAbility('read', 'Driver')],
    }, async (request, reply) => {
        const user = request.user as AuthUser;
        const params = ParamsSchema.safeParse(request.params);
        if (!params.success) {
            return reply.status(400).send({ success: false, error: 'Invalid driver id' });
        }
        const query = HosStatusQuerySchema.safeParse(request.query);
        if (!query.success) {
            return reply.status(400).send({
                success: false,
                error: 'Ошибка валидации данных',
                details: query.error.flatten(),
            });
        }

        await assertDriverAccess(params.data.id, user);

        const asOf = query.data.asOf ? new Date(query.data.asOf) : undefined;
        const status = await getDriverHosStatus(params.data.id, asOf);

        if (status.breach) {
            try {
                await recordEvent({
                    authorId: user.userId,
                    authorRole: user.roles[0] ?? 'system',
                    eventType: 'rto.breach',
                    entityType: 'driver',
                    entityId: params.data.id,
                    data: {
                        reasons: status.breachReasons,
                        dayHours: status.dayHours,
                        weekHours: status.weekHours,
                        asOf: status.asOf,
                    },
                });
            } catch (err) {
                app.log.warn({ err }, 'rto.breach journal write failed');
            }
        }

        return { success: true, data: status };
    });
};

export default rtoRoutes;
