// ============================================================
// DPA endpoints (Data Processing Acceptances, 152-ФЗ ст. 9)
//
//   GET  /api/dpa/:providerId             — текст + version + hash для UI
//   POST /api/dpa/:providerId/accept      — записать согласие
//   GET  /api/dpa/:providerId/acceptance  — accepted by current user×org?
//
// Все три требуют auth. Org-scope подразумевается через user.organizationId.
// ============================================================
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, eq, desc } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import { dpaAcceptances } from '../../db/schema.js';
import { getDpa } from './loader.js';

interface AuthUser {
    userId: string;
    roles: string[];
    organizationId?: string | null;
}

const ParamsSchema = z.object({
    providerId: z.string().min(1).max(50),
});

const AcceptBodySchema = z.object({
    /** Версия DPA, которую пользователь видел при accept (из frontmatter). */
    version: z.string().min(1).max(20),
    /** SHA-256 hex (64 chars) контента, который пользователь видел. */
    contentHash: z.string().regex(/^[0-9a-f]{64}$/, 'contentHash должен быть SHA-256 hex (64 hex chars)'),
});

const dpaRoutes: FastifyPluginAsync = async (app) => {
    // ============================================================
    // GET /api/dpa/:providerId
    // Возвращает frontmatter + content + contentHash для рендеринга UI.
    // ============================================================
    app.get<{ Params: { providerId: string } }>('/dpa/:providerId', {
        schema: {
            tags: ['Compliance'],
            summary: 'Текст DPA-согласия для провайдера',
            description: 'Возвращает markdown-текст + версию + sha256-hash. UI рендерит content и при accept шлёт обратно version+hash.',
        },
        preHandler: [app.authenticate],
    }, async (request, reply) => {
        const params = ParamsSchema.safeParse(request.params);
        if (!params.success) {
            return reply.status(400).send({ success: false, error: 'Некорректный providerId' });
        }

        const dpa = await getDpa(params.data.providerId);
        if (!dpa) {
            return reply.status(404).send({
                success: false,
                error: 'DPA для этого провайдера не найден',
                code: 'DPA_NOT_FOUND',
            });
        }

        return {
            success: true,
            data: {
                providerId: dpa.frontmatter.providerId,
                providerLabel: dpa.frontmatter.providerLabel,
                category: dpa.frontmatter.category,
                owner: dpa.frontmatter.owner,
                version: dpa.frontmatter.version,
                effectiveFrom: dpa.frontmatter.effectiveFrom,
                requiresAcceptance: dpa.frontmatter.requiresAcceptance,
                contentHash: dpa.contentHash,
                content: dpa.content,
            },
        };
    });

    // ============================================================
    // POST /api/dpa/:providerId/accept
    // ============================================================
    app.post<{ Params: { providerId: string } }>('/dpa/:providerId/accept', {
        schema: {
            tags: ['Compliance'],
            summary: 'Принять DPA-согласие',
            description: 'Записывает {userId, organizationId, providerId, version, contentHash, acceptedAt}. Идемпотентно: повторный accept той же версии возвращает существующую запись.',
        },
        preHandler: [app.authenticate],
    }, async (request, reply) => {
        const params = ParamsSchema.safeParse(request.params);
        if (!params.success) {
            return reply.status(400).send({ success: false, error: 'Некорректный providerId' });
        }
        const body = AcceptBodySchema.safeParse(request.body);
        if (!body.success) {
            return reply.status(400).send({
                success: false,
                error: 'Ошибка валидации',
                details: body.error.flatten(),
            });
        }

        const user = request.user as AuthUser;
        if (!user.organizationId) {
            return reply.status(400).send({
                success: false,
                error: 'У пользователя не указана организация — DPA-согласие невозможно',
                code: 'NO_ORGANIZATION',
            });
        }

        const dpa = await getDpa(params.data.providerId);
        if (!dpa) {
            return reply.status(404).send({ success: false, error: 'DPA не найден', code: 'DPA_NOT_FOUND' });
        }

        // requires_acceptance=false (vendor-infra типа Mail.ru SMTP) —
        // accept не нужен. Защищаем endpoint, чтобы UI/клиент случайно
        // не записал «согласие» туда, где оно юр-избыточно.
        if (!dpa.frontmatter.requiresAcceptance) {
            return reply.status(409).send({
                success: false,
                error: 'Этот DPA не требует явного согласия (vendor-infra)',
                code: 'DPA_NO_ACCEPTANCE_REQUIRED',
            });
        }

        // Защита от race: пользователь видел версию X, в момент его accept
        // на сервере уже версия Y (Jurist bumpup-ил). Отказываем —
        // пусть UI перечитает текст и покажет новую версию.
        if (body.data.version !== dpa.frontmatter.version) {
            return reply.status(409).send({
                success: false,
                error: `Версия DPA устарела: вы видели ${body.data.version}, актуальная ${dpa.frontmatter.version}. Обновите страницу.`,
                code: 'DPA_VERSION_STALE',
            });
        }
        if (body.data.contentHash !== dpa.contentHash) {
            return reply.status(409).send({
                success: false,
                error: 'Содержимое DPA изменилось с момента отображения. Обновите страницу.',
                code: 'DPA_CONTENT_STALE',
            });
        }

        // Идемпотентность: ON CONFLICT DO NOTHING на unique-индексе
        // (user_id, organization_id, provider_id, version). Повторный
        // accept той же версии — no-op, не дублирует запись.
        await db.insert(dpaAcceptances)
            .values({
                userId: user.userId,
                organizationId: user.organizationId,
                providerId: params.data.providerId,
                version: dpa.frontmatter.version,
                contentHash: dpa.contentHash,
            })
            .onConflictDoNothing();

        return {
            success: true,
            data: {
                providerId: params.data.providerId,
                version: dpa.frontmatter.version,
                acceptedAt: new Date().toISOString(),
            },
        };
    });

    // ============================================================
    // GET /api/dpa/:providerId/acceptance
    // UI helper: «нужно ли показывать DPA-step этому user?»
    // Возвращает { accepted, version?, acceptedAt? } для актуальной версии.
    // ============================================================
    app.get<{ Params: { providerId: string } }>('/dpa/:providerId/acceptance', {
        schema: {
            tags: ['Compliance'],
            summary: 'Принято ли DPA текущим пользователем×организацией',
            description: 'UI вызывает перед открытием CredentialModal. Если accepted=false — показывает DPA-step.',
        },
        preHandler: [app.authenticate],
    }, async (request, reply) => {
        const params = ParamsSchema.safeParse(request.params);
        if (!params.success) {
            return reply.status(400).send({ success: false, error: 'Некорректный providerId' });
        }

        const user = request.user as AuthUser;
        if (!user.organizationId) {
            return reply.status(400).send({
                success: false,
                error: 'Организация не указана',
                code: 'NO_ORGANIZATION',
            });
        }

        const dpa = await getDpa(params.data.providerId);
        if (!dpa) {
            return reply.status(404).send({ success: false, error: 'DPA не найден' });
        }

        // requires_acceptance=false — считаем «принято» автоматически
        // (vendor-infra, юр-избыточно требовать checkbox).
        if (!dpa.frontmatter.requiresAcceptance) {
            return {
                success: true,
                data: { accepted: true, requiresAcceptance: false, version: dpa.frontmatter.version },
            };
        }

        const [row] = await db
            .select({
                version: dpaAcceptances.version,
                contentHash: dpaAcceptances.contentHash,
                acceptedAt: dpaAcceptances.acceptedAt,
            })
            .from(dpaAcceptances)
            .where(and(
                eq(dpaAcceptances.userId, user.userId),
                eq(dpaAcceptances.organizationId, user.organizationId),
                eq(dpaAcceptances.providerId, params.data.providerId),
                eq(dpaAcceptances.version, dpa.frontmatter.version),
            ))
            .orderBy(desc(dpaAcceptances.acceptedAt))
            .limit(1);

        if (!row) {
            return {
                success: true,
                data: {
                    accepted: false,
                    requiresAcceptance: true,
                    currentVersion: dpa.frontmatter.version,
                },
            };
        }

        return {
            success: true,
            data: {
                accepted: true,
                requiresAcceptance: true,
                version: row.version,
                acceptedAt: row.acceptedAt.toISOString(),
            },
        };
    });
};

export default dpaRoutes;
