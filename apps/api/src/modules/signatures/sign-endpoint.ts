// ============================================================
// POST /transport-documents/:id/sign — инициация подписания ЭТрН
// GET  /transport-documents/:id     — polling endpoint для UI
//
// Закрывает P0 audit:
//   • UI (SignTitleButton.tsx) уже шлёт сюда POST с
//     { provider, titleType, mchdId, signerInn } и ждёт
//     { success, data: { externalId, deeplink? } }.
//   • Полл-эндпоинт читает metadata.signatureState / metadata.signatures[]
//     чтобы понять, что подпись доставлена через Госключ-callback.
//
// Юр-связка с МЧД (Машиночитаемая Доверенность) выполняется server-side,
// до того как мы отдадим внешнему провайдеру deeplink — иначе
// callback не сможет надёжно сопоставить подписавшего и доверенность
// (см. B1 в gosklyuch-callback.ts).
// ============================================================
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import crypto from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import { transportDocuments, mchd, trips } from '../../db/schema.js';
import { getDefaultRegistry, selectAdapter } from '../../providers/index.js';
import type { SignatureProvider } from '../../providers/signature/interface.js';

// ----------------------------- helpers (pure) -----------------------------

export interface McheckInput {
    id: string;
    status: string;
    issuedAt: Date;
    expiresAt: Date;
    granteeInn: string;
    organizationId: string | null;
}

/**
 * Validate an МЧД row against the supplied signer/document context.
 * Returns the list of problems (empty = valid).
 *
 * Чистая функция — без БД, удобно покрыть unit-тестами.
 */
export function validateMchd(
    record: McheckInput | null,
    args: {
        documentOrgId: string | null;
        signerInn?: string | null;
        now: Date;
    },
): string[] {
    const problems: string[] = [];
    if (!record) {
        problems.push('МЧД не найдена в реестре организации');
        return problems;
    }
    if (args.documentOrgId && record.organizationId !== args.documentOrgId) {
        problems.push('МЧД принадлежит другой организации');
    }
    if (record.status !== 'active') {
        problems.push(`МЧД в статусе '${record.status}', требуется 'active'`);
    }
    if (record.expiresAt.getTime() <= args.now.getTime()) {
        problems.push(`МЧД истекла ${record.expiresAt.toISOString()}`);
    }
    if (record.issuedAt.getTime() > args.now.getTime()) {
        problems.push(`МЧД ещё не действует (issuedAt=${record.issuedAt.toISOString()})`);
    }
    if (args.signerInn && args.signerInn !== record.granteeInn) {
        problems.push(`ИНН подписанта (${args.signerInn}) не совпадает с granteeInn МЧД (${record.granteeInn})`);
    }
    return problems;
}

/**
 * Build the externalId used to correlate the future Госключ callback
 * with this transport document. Format:
 *   • без секрета:      `<uuid>`
 *   • с GOSKLYUCH_CALLBACK_SECRET: `<uuid>.<hmac-sha256-hex>`
 *
 * Совместимо с verifyExternalIdHmac() из gosklyuch-callback.ts.
 */
export function buildExternalId(secret: string | undefined = process.env.GOSKLYUCH_CALLBACK_SECRET): string {
    const body = crypto.randomUUID();
    if (!secret) return body;
    const mac = crypto.createHmac('sha256', secret).update(body).digest('hex');
    return `${body}.${mac}`;
}

const TITLE_TYPES = ['T01', 'T02', 'T05', 'T06'] as const;
type TitleTypeT = typeof TITLE_TYPES[number];

const PROVIDER_IDS = ['gosklyuch', 'kontur-sign', 'sbis-sign', 'cadesplugin', 'mock'] as const;
type ProviderId = typeof PROVIDER_IDS[number];

// 7.20: signerRole — кто именно подписывает (грузоотправитель/перевозчик/
// получатель/экспедитор). Без него UI не может показать «T05 подписал
// грузополучатель Иванов по МЧД 7». Mapping ролей соответствует
// recordTransportDocumentSignature в trips/transport-documents-store.
const SIGNER_ROLES = ['shipper', 'carrier', 'consignee', 'forwarder'] as const;

const SignBodySchema = z.object({
    provider: z.enum(PROVIDER_IDS),
    titleType: z.enum(TITLE_TYPES),
    signerRole: z.enum(SIGNER_ROLES).optional(),
    mchdId: z.string().uuid().optional(),
    signerInn: z.string().regex(/^\d{10}$|^\d{12}$/, 'ИНН: 10 или 12 цифр').optional(),
});

const ParamsSchema = z.object({
    id: z.string().uuid('id должен быть UUID документа'),
});

/**
 * Self-built deeplink fallback when the real provider stub доступен только в виде skeleton.
 * Используется как safety-net для не-Госключ провайдеров.
 */
function buildFallbackDeeplink(provider: ProviderId, externalId: string): string | undefined {
    if (provider === 'gosklyuch') {
        // 7.19: реальная схема Госключа — `gosuslugiv://signature?externalId=...`.
        // Старое `gosuslugi://signdoc?...` было выдуманным и не открывало
        // приложение на устройстве клиента. Та же схема использована в
        // providers/signature/gosklyuch.ts (GOSKLYUCH_DEEPLINK_SCHEME).
        return `gosuslugiv://signature?externalId=${encodeURIComponent(externalId)}`;
    }
    // browser-plugin провайдеры (kontur-sign / sbis-sign / cadesplugin) не используют deeplink —
    // UI вызывает плагин локально по externalId.
    return undefined;
}

// ----------------------------- route plugin -------------------------------

const signRoutes: FastifyPluginAsync = async (app) => {

    // ---------------- POST /transport-documents/:id/sign -----------------
    app.post('/transport-documents/:id/sign', {
        preHandler: [app.authenticate],
        schema: {
            tags: ['Документы'],
            summary: 'Инициировать подписание титула ЭТрН',
            description:
                'Готовит подпись через выбранного провайдера (Госключ/Контур/СБИС/CADES/mock). '
                + 'Записывает pendingSignatures + signatureState=awaiting и возвращает externalId/deeplink.',
        },
    }, async (request, reply) => {
        const paramsParsed = ParamsSchema.safeParse(request.params);
        if (!paramsParsed.success) {
            return reply.status(400).send({
                success: false,
                error: 'Некорректный id документа',
                details: paramsParsed.error.flatten(),
            });
        }
        const bodyParsed = SignBodySchema.safeParse(request.body ?? {});
        if (!bodyParsed.success) {
            return reply.status(400).send({
                success: false,
                error: 'Ошибка валидации запроса на подписание',
                details: bodyParsed.error.flatten(),
            });
        }

        const { id } = paramsParsed.data;
        const { provider, titleType, mchdId, signerInn, signerRole } = bodyParsed.data;
        const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };

        // ---- 1. Найти документ ----
        const [doc] = await db.select().from(transportDocuments)
            .where(eq(transportDocuments.id, id))
            .limit(1);
        if (!doc) {
            return reply.status(404).send({ success: false, error: 'Документ не найден' });
        }

        // ---- 2. Org-scope через trip ----
        const [tripRow] = await db.select({
            organizationId: trips.organizationId,
            executionMode: trips.executionMode,
        })
            .from(trips).where(eq(trips.id, doc.tripId)).limit(1);
        const documentOrgId = tripRow?.organizationId ?? null;

        // ---- 2b. Gap 2 (docs/legal/subcontract-legal-analysis.md §2) — ЭТрН-роли.
        // При наёмном рейсе (execution_mode='subcontract') наша роль в ЭТрН
        // зависит от типа договора с клиентом (перевозка → 2 ЭТрН; экспедиция →
        // экспедиторские документы). Текущий генератор assume «мы перевозчик»,
        // что верно только для own. Подписывая ЭТрН от своего имени для
        // subcontract, создаём юридически некорректный документ (разрыв цепочки
        // / переквалификация экспедиции в перевозку).
        //
        // MVP-fallback (до реализации client_contract_type + двойной ЭТрН):
        // блокируем подпись ЭТрН-титулов для subcontract. Свой парк не затронут.
        // TODO(W5+): client_contract_type × execution_mode → структура ЭТрН.
        if (tripRow?.executionMode === 'subcontract') {
            return reply.status(422).send({
                success: false,
                code: 'SUBCONTRACT_ETRN_BLOCKED',
                error: 'Оформление ЭТрН при наёмном транспорте требует ручной настройки '
                    + 'ролей (перевозчик/экспедитор) — обратитесь к ответственному за ЭПД. '
                    + 'См. docs/legal/subcontract-legal-analysis.md §2.',
            });
        }

        if (!user.organizationId) {
            // super-admin (без organizationId) не подписывает — у него нет МЧД и
            // юр-роли в документе. Возвращаем 403, а не 200, чтобы не оставлять
            // ложного впечатления, что подпись прошла.
            return reply.status(403).send({
                success: false,
                error: 'super-admin не подписывает документы — переключитесь в организацию',
            });
        }
        if (!documentOrgId || documentOrgId !== user.organizationId) {
            request.log.warn(
                { documentId: id, tripId: doc.tripId, documentOrgId, userOrgId: user.organizationId },
                'sign-endpoint: org-scope mismatch',
            );
            return reply.status(403).send({
                success: false,
                error: 'Документ принадлежит другой организации',
            });
        }

        // ---- 3. Проверить titleType против сохранённого в БД (если есть) ----
        if (doc.titleType && doc.titleType !== titleType) {
            return reply.status(400).send({
                success: false,
                error: `Запрошен титул ${titleType}, но документ относится к титулу ${doc.titleType}`,
            });
        }

        // ---- 4. МЧД-валидация (обязательно для всех провайдеров, кроме mock в non-prod) ----
        const now = new Date();
        const isProd = process.env.NODE_ENV === 'production';
        const mchdRequired = !(provider === 'mock' && !isProd);

        if (mchdRequired && !mchdId) {
            return reply.status(400).send({
                success: false,
                error: 'Не указана МЧД — без действующей доверенности подпись не имеет юридической силы',
            });
        }

        let mchdRecord: McheckInput | null = null;
        if (mchdId) {
            const [m] = await db.select({
                id: mchd.id,
                status: mchd.status,
                issuedAt: mchd.issuedAt,
                expiresAt: mchd.expiresAt,
                granteeInn: mchd.granteeInn,
                organizationId: mchd.organizationId,
            }).from(mchd)
                .where(and(eq(mchd.id, mchdId), eq(mchd.organizationId, documentOrgId)))
                .limit(1);
            mchdRecord = m ?? null;

            const problems = validateMchd(mchdRecord, { documentOrgId, signerInn, now });
            if (problems.length > 0) {
                return reply.status(400).send({
                    success: false,
                    error: 'МЧД не прошла валидацию',
                    details: { mchdProblems: problems },
                });
            }
        }

        // ---- 5. externalId (+ optional HMAC) ----
        const externalId = buildExternalId();

        // ---- 6. Запросить deeplink у провайдера (или сгенерировать сами) ----
        let deeplink: string | undefined;
        try {
            if (provider === 'gosklyuch' && user.organizationId) {
                // Реальный gosklyuch-адаптер уже умеет строить deeplink с externalId.
                const registry = getDefaultRegistry();
                const adapter = await selectAdapter<SignatureProvider>(
                    registry.signature, user.organizationId, 'signature',
                );
                // Госключ-адаптер генерирует свой externalId (`gk-...`), но callback
                // ищет документ по transport_documents.externalId — мы перезаписываем
                // его ниже. Deeplink Госключа берём как есть для совместимости
                // c мобильным приложением.
                if (adapter.name === 'gosklyuch') {
                    const out = await adapter.sign(id, doc.artifactId ?? id, user.userId);
                    deeplink = out.deeplink ?? buildFallbackDeeplink(provider, externalId);
                } else {
                    deeplink = buildFallbackDeeplink(provider, externalId);
                }
            } else {
                deeplink = buildFallbackDeeplink(provider, externalId);
            }
        } catch (err) {
            request.log.warn({ err, provider, documentId: id }, 'sign-endpoint: provider.sign() failed, fallback deeplink');
            deeplink = buildFallbackDeeplink(provider, externalId);
        }

        // ---- 7. Записать pendingSignatures + signatureState ----
        const metadata = ((doc.metadata as Record<string, unknown> | null) ?? {});
        const prevPending = (metadata.pendingSignatures && typeof metadata.pendingSignatures === 'object'
            ? metadata.pendingSignatures as Record<string, unknown>
            : {});
        const prevState = (metadata.signatureState && typeof metadata.signatureState === 'object'
            ? metadata.signatureState as Record<string, unknown>
            : {});

        const requestedAtIso = now.toISOString();
        const nextMetadata = {
            ...metadata,
            pendingSignatures: {
                ...prevPending,
                [externalId]: {
                    titleType,
                    mchdId: mchdId ?? null,
                    signerInn: signerInn ?? null,
                    signerRole: signerRole ?? null,
                    provider,
                    signerUserId: user.userId,
                    requestedAt: requestedAtIso,
                },
            },
            signatureState: {
                ...prevState,
                status: 'awaiting',
                provider,
                titleType,
                externalId,
                requestedAt: requestedAtIso,
            },
        };

        await db.update(transportDocuments)
            .set({
                metadata: nextMetadata,
                // Сохраняем externalId на самой строке, чтобы public callback
                // находил документ через eq(externalId).
                externalId,
                updatedAt: now,
            })
            .where(eq(transportDocuments.id, id));

        return reply.status(200).send({
            success: true,
            data: { externalId, deeplink },
        });
    });

    // ---------------- GET /transport-documents/:id ----------------------
    app.get('/transport-documents/:id', {
        preHandler: [app.authenticate],
        schema: {
            tags: ['Документы'],
            summary: 'Получить транспортный документ',
            description:
                'Polling endpoint для UI: возвращает строку transport_documents целиком. '
                + 'metadata.signatures[].signedXml вырезается (заменяется signedXmlBytes).',
        },
    }, async (request, reply) => {
        const paramsParsed = ParamsSchema.safeParse(request.params);
        if (!paramsParsed.success) {
            return reply.status(400).send({
                success: false,
                error: 'Некорректный id документа',
                details: paramsParsed.error.flatten(),
            });
        }
        const { id } = paramsParsed.data;
        const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };

        const [doc] = await db.select().from(transportDocuments)
            .where(eq(transportDocuments.id, id))
            .limit(1);
        if (!doc) {
            return reply.status(404).send({ success: false, error: 'Документ не найден' });
        }

        const [tripRow] = await db.select({ organizationId: trips.organizationId })
            .from(trips).where(eq(trips.id, doc.tripId)).limit(1);
        const documentOrgId = tripRow?.organizationId ?? null;

        if (!user.organizationId || !documentOrgId || documentOrgId !== user.organizationId) {
            request.log.warn(
                { documentId: id, tripId: doc.tripId, documentOrgId, userOrgId: user.organizationId },
                'transport-documents GET: org-scope mismatch',
            );
            return reply.status(403).send({
                success: false,
                error: 'Документ принадлежит другой организации',
            });
        }

        // Вырезаем тяжёлый signedXml из metadata.signatures[], оставляя
        // signedXmlBytes для UI-индикации «подпись доставлена».
        const metadata = ((doc.metadata as Record<string, unknown> | null) ?? {});
        const sanitizedMetadata: Record<string, unknown> = { ...metadata };
        if (Array.isArray(metadata.signatures)) {
            sanitizedMetadata.signatures = (metadata.signatures as Array<Record<string, unknown>>).map((s) => {
                const { signedXml, ...rest } = s;
                const bytes = typeof signedXml === 'string' ? signedXml.length : 0;
                return { ...rest, signedXmlBytes: bytes };
            });
        }

        return reply.status(200).send({
            success: true,
            data: { ...doc, metadata: sanitizedMetadata },
        });
    });
};

export default signRoutes;
