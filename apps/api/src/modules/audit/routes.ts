// ============================================================
// Round 3B — D10: Audit log API
// Reader-only wrapper over the existing append-only `events` table.
// ============================================================
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, desc, eq, gte, lte, sql, ilike, type SQL } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import { events, users } from '../../db/schema.js';

interface AuthUser {
    userId: string;
    roles: string[];
    organizationId?: string | null;
}

const QuerySchema = z.object({
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    entity_type: z.string().optional(),
    entity_id: z.string().uuid().optional(),
    author_id: z.string().uuid().optional(),
    event_type: z.string().optional(),
    search: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(500).default(50),
    page: z.coerce.number().int().min(1).default(1),
});

const auditRoutes: FastifyPluginAsync = async (app) => {
    app.get('/audit-log', {
        schema: {
            tags: ['Аудит'],
            summary: 'Журнал событий',
            description: 'Append-only журнал всех действий пользователей. Доступ: admin, manager.',
        },
        preHandler: [app.authenticate],
    }, async (request, reply) => {
        const user = request.user as AuthUser;
        if (!user.roles.includes('admin') && !user.roles.includes('manager')) {
            return reply.status(403).send({ success: false, error: 'Только admin/manager' });
        }

        const parsed = QuerySchema.safeParse(request.query ?? {});
        if (!parsed.success) {
            return reply.status(400).send({
                success: false,
                error: 'Validation failed',
                details: parsed.error.flatten(),
            });
        }
        const q = parsed.data;
        const offset = (q.page - 1) * q.limit;

        // A-P0-12: tenant scoping. Before this, any tenant admin could read
        // every other tenant's audit log (event_type / entity_id / data JSON
        // containing PII + diffs). Now: scope by request.orgId; users without
        // an org get nothing.
        const conditions: SQL[] = [];
        if (user.organizationId) {
            conditions.push(eq(events.organizationId, user.organizationId));
        } else {
            // No org → no audit access. Return empty result rather than 403
            // to keep the dashboard UX intact for seed admins.
            return {
                success: true,
                data: [],
                pagination: { page: 1, limit: q.limit, total: 0, pages: 1 },
                note: 'no_organization_in_token',
            };
        }
        if (q.from) conditions.push(gte(events.timestamp, new Date(q.from)));
        if (q.to) conditions.push(lte(events.timestamp, new Date(q.to)));
        if (q.entity_type) conditions.push(eq(events.entityType, q.entity_type));
        if (q.entity_id) conditions.push(eq(events.entityId, q.entity_id));
        if (q.author_id) conditions.push(eq(events.authorId, q.author_id));
        if (q.event_type) conditions.push(eq(events.eventType, q.event_type));
        // A-P2: escape % and _ in user-provided search to prevent pattern-DoS
        // on the events table (M+ rows on a busy tenant).
        if (q.search) {
            const safeSearch = q.search.replace(/[%_\\]/g, (c) => `\\${c}`);
            conditions.push(ilike(events.eventType, `%${safeSearch}%`));
        }

        const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

        const [rows, [{ total }]] = await Promise.all([
            db.select({
                id: events.id,
                timestamp: events.timestamp,
                authorId: events.authorId,
                authorRole: events.authorRole,
                authorName: users.fullName,
                eventType: events.eventType,
                entityType: events.entityType,
                entityId: events.entityId,
                data: events.data,
                version: events.version,
                conflict: events.conflict,
            })
                .from(events)
                .leftJoin(users, eq(events.authorId, users.id))
                .where(whereClause)
                .orderBy(desc(events.timestamp))
                .limit(q.limit)
                .offset(offset),
            db.select({ total: sql<number>`count(*)::int` })
                .from(events)
                .where(whereClause),
        ]);

        return {
            success: true,
            data: rows,
            pagination: {
                page: q.page,
                limit: q.limit,
                total,
                pages: Math.max(1, Math.ceil(total / q.limit)),
            },
        };
    });

    // Distinct event types — for filter dropdown
    app.get('/audit-log/types', {
        schema: {
            tags: ['Аудит'],
            summary: 'Уникальные значения для фильтров журнала',
        },
        preHandler: [app.authenticate],
    }, async (request, reply) => {
        const user = request.user as AuthUser;
        if (!user.roles.includes('admin') && !user.roles.includes('manager')) {
            return reply.status(403).send({ success: false, error: 'Только admin/manager' });
        }
        // A-P0-12: scope distinct values by org (otherwise filter dropdowns
        // leak event/entity names from other tenants).
        const orgFilter = user.organizationId
            ? eq(events.organizationId, user.organizationId)
            : sql`false`;
        const [eventTypes, entityTypes] = await Promise.all([
            db.selectDistinct({ value: events.eventType }).from(events).where(orgFilter).limit(500),
            db.selectDistinct({ value: events.entityType }).from(events).where(orgFilter).limit(200),
        ]);
        return {
            success: true,
            data: {
                eventTypes: eventTypes.map((r) => r.value).filter(Boolean).sort(),
                entityTypes: entityTypes.map((r) => r.value).filter(Boolean).sort(),
            },
        };
    });
};

export default auditRoutes;
