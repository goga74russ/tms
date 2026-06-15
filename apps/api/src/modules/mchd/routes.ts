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

// A5 (код-аудит 2026-06-14): ИНН/ОГРН должны быть строгого формата (только
// цифры, валидная длина). Прежний min(10).max(12) пропускал 11-значные и
// буквенный мусор в реквизиты МЧД — отклонялось бы оператором ЭДО при подписи.
const INN_RE = /^(\d{10}|\d{12})$/;   // 10 — ЮЛ, 12 — ФЛ/ИП
const OGRN_RE = /^(\d{13}|\d{15})$/;  // 13 — ОГРН (ЮЛ), 15 — ОГРНИП

const ParamsSchema = z.object({ id: z.string().uuid() });

const CreateSchema = z.object({
    mchdNumber: z.string().min(1).max(64),
    granterInn: z.string().regex(INN_RE, 'ИНН доверителя: 10 или 12 цифр'),
    granterName: z.string().min(1).max(255),
    granterOgrn: z.string().regex(OGRN_RE, 'ОГРН: 13 или 15 цифр').optional(),
    granteeFullName: z.string().min(1).max(255),
    granteeInn: z.string().regex(INN_RE, 'ИНН представителя: 10 или 12 цифр'),
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
    granteeInn: z.string().regex(INN_RE, 'ИНН представителя: 10 или 12 цифр'),
    // Опциональные фильтры. Если переданы — сужают выборку:
    //   granterInn — ИНН доверителя (организации). Должен совпадать
    //                с ИНН org-владельца документа. Если не передан —
    //                фильтрация только по grantee+org.
    //   requiredScope — keyword/подстрока, которая должна встречаться
    //                   в scope МЧД. Без полного формат-1 матчинга,
    //                   но отсекает явно нерелевантные доверенности.
    granterInn: z.string().regex(INN_RE, 'ИНН доверителя: 10 или 12 цифр').optional(),
    requiredScope: z.string().min(2).max(255).optional(),
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
    }, async (request, reply) => {
        const user = request.user as AuthUser;
        // Раньше super-admin без org получал тихий [] и считал что реестр
        // пустой / данные потерялись (та же UX-ловушка что закрыли
        // OrganizationSetupBanner-ом). Возвращаем 400 с понятным сообщением.
        if (!user.organizationId) {
            return reply.status(400).send({
                success: false,
                error: 'Super-admin без организации не работает с реестром МЧД. Создайте организацию через POST /api/auth/me/organization или зайдите как tenant-admin.',
                code: 'SUPER_ADMIN_NO_ORG',
            });
        }

        const rows = await db
            .select(listColumns)
            .from(mchd)
            .where(eq(mchd.organizationId, user.organizationId))
            .orderBy(desc(mchd.createdAt));

        // P2 (код-аудит 2026-06-14): обещанного крона перевода в 'expired' нет, и
        // status в БД остаётся 'active' для истёкших. Runtime уже отвергает истёкшие
        // МЧД при подписании (validateMchd проверяет expiresAt), поэтому вместо крона
        // отдаём ЭФФЕКТИВНЫЙ статус на чтении: active + expiresAt<now → 'expired'.
        const now = Date.now();
        const data = rows.map((r) => ({
            ...r,
            status: r.status === 'active' && new Date(r.expiresAt).getTime() <= now ? 'expired' : r.status,
        }));

        return { success: true, data };
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

        const conditions = [
            eq(mchd.organizationId, user.organizationId),
            eq(mchd.granteeInn, parsed.data.granteeInn),
            eq(mchd.status, 'active'),
        ];
        if (parsed.data.granterInn) {
            conditions.push(eq(mchd.granterInn, parsed.data.granterInn));
        }
        const rows = await db
            .select(listColumns)
            .from(mchd)
            .where(and(...conditions))
            .orderBy(desc(mchd.issuedAt))
            .limit(10);

        // Отфильтровать истёкшие и ещё-не-действующие на уровне приложения
        // (не помечаем статус здесь, чтобы не делать UPDATE на read-запросе;
        // крон-задача переведёт их в 'expired' отдельно). Истёкшие — это
        // expiresAt <= now. Ещё-не-действующие — issuedAt > now.
        const now = Date.now();
        let active = rows.filter((r) => {
            const expired = new Date(r.expiresAt).getTime() <= now;
            const notYet = new Date(r.issuedAt).getTime() > now;
            return !expired && !notYet;
        });

        // Keyword-фильтр по scope (substring, case-insensitive) — если задан.
        // Не полный 1-формат-1 матчинг, но отсекает явно нерелевантные.
        if (parsed.data.requiredScope) {
            const needle = parsed.data.requiredScope.toLowerCase();
            active = active.filter((r) => r.scope.toLowerCase().includes(needle));
        }

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

        // P3 (код-аудит 2026-06-14): прежняя проверка смотрела ТОЛЬКО на пролог
        // '<?xml' — пролог + мусор без единого тега проходили как валидный XML.
        // Усиливаем до well-formed-похожей структуры: (1) есть XML-пролог,
        // (2) после пролога присутствует корневой элемент (открывающий тег
        // <Имя...>, не комментарий/PI), и (3) встречается закрывающий/самозакрытый
        // тег — отсекает оборванные/битые документы. Точную структуру МЧД ФНС
        // (корневой элемент EMCHD/неймспейс) тут не знаем — формат клиент получает
        // в ФНС/УЦ, в кодовой базе фикстур МЧД нет.
        // TODO: полноценная валидация по XSD-схеме ФНС МЧД + проверка подписи/ГОСТ —
        // на этапе ЭТрН-подписания (см. lib/xsd-validator для ЭТрН-титулов <Файл>).
        const trimmed = payload.certificateXml.trimStart();
        if (!trimmed.startsWith('<?xml')) {
            return reply.status(400).send({
                success: false,
                error: 'certificateXml должен быть XML-документом (начинаться с <?xml)',
            });
        }
        // Корневой элемент: после пролога ищем первый открывающий тег-элемент
        // (исключая декларацию <?xml?>, комментарии <!-- --> и PI <? ?>).
        const ROOT_ELEMENT_RE = /<([A-Za-zА-Яа-яЁё_][\w.\-:]*)[\s>/]/;
        const afterProlog = trimmed.replace(/^<\?xml[^>]*\?>/, '').trimStart();
        const hasRootElement = ROOT_ELEMENT_RE.test(afterProlog);
        const hasClosingTag = afterProlog.includes('</') || /\/\s*>/.test(afterProlog);
        if (!hasRootElement || !hasClosingTag) {
            return reply.status(400).send({
                success: false,
                error: 'certificateXml не похож на well-formed XML: отсутствует корневой элемент или закрывающий тег',
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
            // C9 (миг.0043): уникальность mchd_number PER-ORG (uq_mchd_org_number).
            // P3 (код-аудит 2026-06-14): детектим дубль по КОДУ PG 23505 (unique_violation),
            // а не по подстроке текста ошибки (хрупко, ломалось бы при i18n PG/санитайзе).
            if ((err as { code?: string })?.code === '23505') {
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
