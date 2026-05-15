// ============================================================
// МЧД — Машиночитаемые Доверенности (ЭТрН-подписание с 01.09.2026)
// ------------------------------------------------------------
// Реестр МЧД клиента. Мы XML не выпускаем — клиент получает его в
// ФНС/УЦ и загружает к нам через POST /api/mchd. При подписании
// ЭТрН/ПУД система подбирает активную МЧД по ИНН подписанта
// (GET /api/mchd/find-for-signer?granteeInn=...).
//
// Все endpoint'ы:
//   • требуют app.authenticate
//   • org-scoped: видна только МЧД своей organizationId
//   • create / revoke / delete — только admin
// ============================================================
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import crypto from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import { mchd } from '../../db/schema.js';

interface AuthUser {
    userId: string;
    roles: string[];
    organizationId?: string | null;
}

// ---- Validation schemas ----

const ParamsSchema = z.object({ id: z.string().uuid() });

const CreateSchema = z.object({
    mchdNumber: z.string().min(1).max(64),
    granterInn: z.string().min(10).max(12),
    granterName: z.string().min(1).max(255),
    granterOgrn: z.string().max(15).optional(),
    granteeFullName: z.string().min(1).max(255),
    granteeInn: z.string().min(10).max(12),
    granteePassport: z.string().max(20).optional(),
    scope: z.string().min(1),
    issuedAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
    certificateXml: z.string().min(20),
    notes: z.string().optional(),
});

const RevokeSchema = z.object({
    revocationReason: z.string().min(1).max(2000),
});

const FindForSignerSchema = z.object({
    granteeInn: z.string().min(10).max(12),
});

// ---- Helpers ----

/** Columns без `certificateXml` (он большой) для списочных ответов. */
const listColumns = {
    id: mchd.id,
    organizationId: mchd.organizationId,
    mchdNumber: mchd.mchdNumber,
    granterInn: mchd.granterInn,
    granterName: mchd.granterName,
    granterOgrn: mchd.granterOgrn,
    granteeFullName: mchd.granteeFullName,
    granteeInn: mchd.granteeInn,
    granteePassport: mchd.granteePassport,
    scope: mchd.scope,
    issuedAt: mchd.issuedAt,
    expiresAt: mchd.expiresAt,
    status: mchd.status,
    revokedAt: mchd.revokedAt,
    revocationReason: mchd.revocationReason,
    certificateXmlHash: mchd.certificateXmlHash,
    uploadedByUserId: mchd.uploadedByUserId,
    notes: mchd.notes,
    createdAt: mchd.createdAt,
    updatedAt: mchd.updatedAt,
} as const;

function sha256Hex(input: string): string {
    return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

// ---- Routes ----

const mchdRoutes: FastifyPluginAsync = async (app) => {
    // ---- GET /api/mchd — список МЧД текущей организации ----
    app.get('/mchd', {
        schema: {
            tags: ['Compliance'],
            summary: 'Реестр МЧД организации',
            description: 'Список Машиночитаемых Доверенностей текущей организации. Без полного XML — для деталей используйте GET /mchd/:id.',
        },
        preHandler: [app.authenticate],
    }, async (request) => {
        const user = request.user as AuthUser;
        if (!user.organizationId) return { success: true, data: [] };

        const rows = await db
            .select(listColumns)
            .from(mchd)
            .where(eq(mchd.organizationId, user.organizationId))
            .orderBy(desc(mchd.createdAt));

        return { success: true, data: rows };
    });

    // ---- GET /api/mchd/find-for-signer?granteeInn=... ----
    // Зарегистрирован ДО `/mchd/:id`, чтобы 'find-for-signer' не съелся
    // динамическим сегментом (fastify matches statics first, but be explicit).
    app.get('/mchd/find-for-signer', {
        schema: {
            tags: ['Compliance'],
            summary: 'Найти активную МЧД для подписанта',
            description: 'По ИНН физлица возвращает активную (status=active, не истёкшую) МЧД текущей организации. Используется на этапе ЭТрН-подписания.',
        },
        preHandler: [app.authenticate],
    }, async (request, reply) => {
        const user = request.user as AuthUser;
        if (!user.organizationId) {
            return reply.status(400).send({ success: false, error: 'Организация не найдена в токене' });
        }

        const parsed = FindForSignerSchema.safeParse(request.query ?? {});
        if (!parsed.success) {
            return reply.status(400).send({
                success: false,
                error: 'Некорректный granteeInn',
                details: parsed.error.flatten(),
            });
        }

        const rows = await db
            .select(listColumns)
            .from(mchd)
            .where(and(
                eq(mchd.organizationId, user.organizationId),
                eq(mchd.granteeInn, parsed.data.granteeInn),
                eq(mchd.status, 'active'),
            ))
            .orderBy(desc(mchd.issuedAt))
            .limit(10);

        // Отфильтровать истёкшие на уровне приложения (не помечаем статус
        // здесь, чтобы не делать UPDATE на read-запросе; крон-задача
        // переведёт их в 'expired' отдельно).
        const now = Date.now();
        const active = rows.filter((r) => new Date(r.expiresAt).getTime() > now);

        return { success: true, data: active[0] ?? null, candidates: active };
    });

    // ---- GET /api/mchd/:id — детали + полный XML ----
    app.get<{ Params: { id: string } }>('/mchd/:id', {
        schema: {
            tags: ['Compliance'],
            summary: 'Детали МЧД с полным XML',
            description: 'Возвращает запись МЧД вместе с полным certificateXml. Только своя организация.',
        },
        preHandler: [app.authenticate],
    }, async (request, reply) => {
        const user = request.user as AuthUser;
        if (!user.organizationId) {
            return reply.status(404).send({ success: false, error: 'МЧД не найдена' });
        }

        const params = ParamsSchema.safeParse(request.params);
        if (!params.success) {
            return reply.status(400).send({ success: false, error: 'Некорректный id' });
        }

        const [row] = await db
            .select()
            .from(mchd)
            .where(and(
                eq(mchd.id, params.data.id),
                eq(mchd.organizationId, user.organizationId),
            ))
            .limit(1);

        if (!row) {
            return reply.status(404).send({ success: false, error: 'МЧД не найдена' });
        }

        return { success: true, data: row };
    });

    // ---- POST /api/mchd — загрузить новую МЧД ----
    app.post('/mchd', {
        schema: {
            tags: ['Compliance'],
            summary: 'Загрузить МЧД в реестр',
            description: 'Регистрирует новую МЧД (XML от ФНС). Только admin. Минимальная проверка XML — должен начинаться с <?xml. Полная валидация XML — на этапе ЭТрН-подписания.',
        },
        preHandler: [app.authenticate],
    }, async (request, reply) => {
        const user = request.user as AuthUser;
        if (!user.roles.includes('admin')) {
            return reply.status(403).send({ success: false, error: 'Только admin может загружать МЧД' });
        }
        if (!user.organizationId) {
            return reply.status(400).send({ success: false, error: 'Организация не найдена в токене' });
        }

        const parsed = CreateSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({
                success: false,
                error: 'Ошибка валидации данных',
                details: parsed.error.flatten(),
            });
        }
        const payload = parsed.data;

        // Минимальная проверка формата XML. Полную семантическую валидацию
        // (структура, подпись ФНС, соответствие ГОСТ) делаем на этапе
        // ЭТрН-подписания, не здесь.
        const trimmed = payload.certificateXml.trimStart();
        if (!trimmed.startsWith('<?xml')) {
            return reply.status(400).send({
                success: false,
                error: 'certificateXml должен быть XML-документом (начинаться с <?xml)',
            });
        }

        // Срок действия должен быть в будущем относительно issuedAt.
        if (new Date(payload.expiresAt).getTime() <= new Date(payload.issuedAt).getTime()) {
            return reply.status(400).send({
                success: false,
                error: 'expiresAt должна быть позже issuedAt',
            });
        }

        const certificateXmlHash = sha256Hex(payload.certificateXml);

        try {
            const [inserted] = await db
                .insert(mchd)
                .values({
                    organizationId: user.organizationId,
                    mchdNumber: payload.mchdNumber,
                    granterInn: payload.granterInn,
                    granterName: payload.granterName,
                    granterOgrn: payload.granterOgrn,
                    granteeFullName: payload.granteeFullName,
                    granteeInn: payload.granteeInn,
                    granteePassport: payload.granteePassport,
                    scope: payload.scope,
                    issuedAt: new Date(payload.issuedAt),
                    expiresAt: new Date(payload.expiresAt),
                    status: 'active',
                    certificateXml: payload.certificateXml,
                    certificateXmlHash,
                    uploadedByUserId: user.userId,
                    notes: payload.notes,
                })
                .returning(listColumns);

            return reply.status(201).send({ success: true, data: inserted });
        } catch (err) {
            // Уникальность mchd_number — глобальная.
            const message = err instanceof Error ? err.message : String(err);
            if (message.includes('mchd_number') || message.includes('unique')) {
                return reply.status(409).send({
                    success: false,
                    error: 'МЧД с таким номером уже зарегистрирована',
                });
            }
            throw err;
        }
    });

    // ---- PATCH /api/mchd/:id/revoke — отозвать ----
    app.patch<{ Params: { id: string } }>('/mchd/:id/revoke', {
        schema: {
            tags: ['Compliance'],
            summary: 'Отозвать МЧД',
            description: 'Переводит МЧД в статус revoked. Необратимо. Только admin.',
        },
        preHandler: [app.authenticate],
    }, async (request, reply) => {
        const user = request.user as AuthUser;
        if (!user.roles.includes('admin')) {
            return reply.status(403).send({ success: false, error: 'Только admin может отзывать МЧД' });
        }
        if (!user.organizationId) {
            return reply.status(400).send({ success: false, error: 'Организация не найдена в токене' });
        }

        const params = ParamsSchema.safeParse(request.params);
        if (!params.success) {
            return reply.status(400).send({ success: false, error: 'Некорректный id' });
        }

        const parsed = RevokeSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({
                success: false,
                error: 'Укажите revocationReason',
                details: parsed.error.flatten(),
            });
        }

        const [updated] = await db
            .update(mchd)
            .set({
                status: 'revoked',
                revokedAt: new Date(),
                revocationReason: parsed.data.revocationReason,
                updatedAt: new Date(),
            })
            .where(and(
                eq(mchd.id, params.data.id),
                eq(mchd.organizationId, user.organizationId),
            ))
            .returning(listColumns);

        if (!updated) {
            return reply.status(404).send({ success: false, error: 'МЧД не найдена' });
        }

        return { success: true, data: updated };
    });

    // ---- DELETE /api/mchd/:id — soft-delete (status='revoked') ----
    app.delete<{ Params: { id: string } }>('/mchd/:id', {
        schema: {
            tags: ['Compliance'],
            summary: 'Удалить МЧД (soft-delete)',
            description: 'Soft-delete: переводит МЧД в статус revoked с причиной "Удалено пользователем". Только admin.',
        },
        preHandler: [app.authenticate],
    }, async (request, reply) => {
        const user = request.user as AuthUser;
        if (!user.roles.includes('admin')) {
            return reply.status(403).send({ success: false, error: 'Только admin может удалять МЧД' });
        }
        if (!user.organizationId) {
            return reply.status(400).send({ success: false, error: 'Организация не найдена в токене' });
        }

        const params = ParamsSchema.safeParse(request.params);
        if (!params.success) {
            return reply.status(400).send({ success: false, error: 'Некорректный id' });
        }

        const [updated] = await db
            .update(mchd)
            .set({
                status: 'revoked',
                revokedAt: new Date(),
                revocationReason: 'Удалено пользователем',
                updatedAt: new Date(),
            })
            .where(and(
                eq(mchd.id, params.data.id),
                eq(mchd.organizationId, user.organizationId),
            ))
            .returning(listColumns);

        if (!updated) {
            return reply.status(404).send({ success: false, error: 'МЧД не найдена' });
        }

        return { success: true, data: updated };
    });
};

export default mchdRoutes;
