// ============================================================
// Госключ (Госуслуги) signature callback endpoint.
//
// Flow:
//   1. We POST /sign-request to Госключ with our callbackUrl + externalId.
//   2. User opens the deeplink in Госключ mobile app and signs.
//   3. Госключ POSTs the signed envelope back here.
//
// This route is PUBLIC (no JWT/cookie auth) — Госключ servers won't carry
// our session. Authenticity comes from:
//   - externalId being unforgeable (must already exist on a transport_document)
//   - rate-limit (20/min) to blunt enumeration
//   - optional HMAC token embedded in externalId (validated below if present)
// ============================================================
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import crypto from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import { transportDocuments, transportDocumentEvents, mchd, trips } from '../../db/schema.js';

const CallbackBodySchema = z.object({
    externalId: z.string().min(4).max(255),
    signedXml: z.string().min(1).max(4 * 1024 * 1024), // 4 MB hard cap on envelope
    signedAt: z.string().datetime().optional(),
    signerCertificate: z.string().max(64 * 1024).optional(),
    // ---- МЧД-binding (juridical chain of trust) -------------------------
    // mchdId: id записи в реестре МЧД, по которой действует подписант.
    // signerInn: ИНН подписанта (10-12 цифр) — обычно извлекается
    //            интеграцией из сертификата; если отдан, мы сверим его
    //            с granteeInn выбранной МЧД.
    // titleType: тип титула (T01/T02/T05/T06) — нужен чтобы UI
    //            корректно отметил конкретный титул как подписанный.
    //
    // ВАЖНО: эти поля spoof-able из body. В production они ОТКЛЮЧЕНЫ
    // (см. ниже) — должны прийти из server-side metadata.pendingSignatures,
    // которая записывается на этапе POST /transport-documents/:id/sign.
    // Тот эндпоинт пока не реализован; до его готовности в production
    // подпись через Госключ не привязывается к МЧД.
    mchdId: z.string().uuid().optional(),
    signerInn: z.string().regex(/^\d{10}$|^\d{12}$/, 'ИНН: 10 или 12 цифр').optional(),
    titleType: z.enum(['T01', 'T02', 'T05', 'T06']).optional(),
});

/**
 * If externalId encodes an HMAC ("<id>.<hex>"), verify it against the
 * server-side secret.
 *
 * Поведение по средам:
 *   • production — server.ts boot-check уже заваливает запуск без
 *     GOSKLYUCH_CALLBACK_SECRET, поэтому здесь secret гарантированно есть
 *     и сравнивается строго.
 *   • dev/test — если secret реально не задан (undefined), пропускаем
 *     проверку для удобства локальной разработки.
 *   • staging и любой нестандартный env — если переменная задана пустой
 *     строкой, это конфигурационная ошибка. Логируем один раз и
 *     блокируем callback, чтобы случайно открытый канал не стал
 *     вектором инъекции поддельных подписей.
 */
let warnedEmptySecret = false;
function verifyExternalIdHmac(externalId: string): boolean {
    const rawSecret = process.env.GOSKLYUCH_CALLBACK_SECRET;
    if (rawSecret === undefined) return true; // переменная не задана — dev fallback
    if (rawSecret.length === 0) {
        if (!warnedEmptySecret) {
            // eslint-disable-next-line no-console
            console.warn(
                '⚠️  GOSKLYUCH_CALLBACK_SECRET задан пустой строкой — HMAC отключён и callback заблокирован. Установите непустое значение в .env.',
            );
            warnedEmptySecret = true;
        }
        return false;
    }
    const secret = rawSecret;
    const dot = externalId.lastIndexOf('.');
    if (dot <= 0 || dot === externalId.length - 1) {
        // No signature segment — reject if a secret is configured.
        return false;
    }
    const body = externalId.slice(0, dot);
    const provided = externalId.slice(dot + 1);
    const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
    // Timing-safe compare; both must be the same length.
    if (provided.length !== expected.length) return false;
    try {
        return crypto.timingSafeEqual(Buffer.from(provided, 'hex'), Buffer.from(expected, 'hex'));
    } catch {
        return false;
    }
}

const gosklyuchCallbackRoutes: FastifyPluginAsync = async (app) => {
    app.post('/signatures/gosklyuch/callback', {
        schema: {
            tags: ['Документы'],
            summary: 'Госключ callback (signed XML delivery)',
            description:
                'Публичный callback, который вызывает мобильное приложение Госуслуги/Госключ '
                + 'после того, как пользователь подписал ЭТрН. Тело: externalId + signedXml.',
        },
        config: {
            rateLimit: {
                max: 20,
                timeWindow: '1 minute',
            },
        },
    }, async (request, reply) => {
        const parsed = CallbackBodySchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({
                success: false,
                error: 'Ошибка валидации callback',
                details: parsed.error.flatten(),
            });
        }
        const parsedBody = parsed.data;
        const { externalId, signedXml, signedAt, signerCertificate } = parsedBody;
        const isProd = process.env.NODE_ENV === 'production';

        // HMAC tamper check (no-op if GOSKLYUCH_CALLBACK_SECRET unset).
        if (!verifyExternalIdHmac(externalId)) {
            request.log.warn({ externalId }, 'Госключ callback: HMAC verification failed');
            return reply.status(400).send({
                success: false,
                error: 'Недействительный externalId',
            });
        }

        // Look up the transport document by externalId.
        const [row] = await db
            .select()
            .from(transportDocuments)
            .where(eq(transportDocuments.externalId, externalId))
            .limit(1);

        if (!row) {
            request.log.warn({ externalId }, 'Госключ callback: externalId not found');
            return reply.status(400).send({
                success: false,
                error: 'Документ по externalId не найден',
            });
        }

        // ---- Resolve mchdId/signerInn/titleType ----------------------------
        // D5: server-side metadata.pendingSignatures[externalId] записан
        // в POST /transport-documents/:id/sign — это trusted источник.
        // Body-поля — fallback для non-prod (dev/test удобство, см. B1).
        // В production body игнорируется ВСЕГДА.
        const rowMetadata = ((row.metadata as Record<string, unknown> | null) ?? {});
        const pendingMap = (rowMetadata.pendingSignatures && typeof rowMetadata.pendingSignatures === 'object'
            ? rowMetadata.pendingSignatures as Record<string, Record<string, unknown>>
            : {});
        const pending = pendingMap[externalId] ?? null;

        const pendingMchdId = pending && typeof pending.mchdId === 'string' ? pending.mchdId : null;
        const pendingSignerInn = pending && typeof pending.signerInn === 'string' ? pending.signerInn : null;
        const pendingTitleType = pending && typeof pending.titleType === 'string' ? pending.titleType : null;
        // 7.20: signerRole тоже копируется из pending — UI узнает «T05 подписал
        // грузополучатель», а не просто «подписан».
        const pendingSignerRole = pending && typeof pending.signerRole === 'string' ? pending.signerRole : null;

        if (isProd && (parsedBody.mchdId || parsedBody.signerInn || parsedBody.titleType)) {
            request.log.warn(
                { externalId, hasMchdId: !!parsedBody.mchdId, hasSignerInn: !!parsedBody.signerInn, hasTitleType: !!parsedBody.titleType },
                'Госключ callback: body-mchdId/signerInn/titleType в production игнорируются — используются только server-side pendingSignatures',
            );
        }
        // pending (server-side) > body (non-prod only).
        const mchdId = pendingMchdId ?? (isProd ? undefined : parsedBody.mchdId);
        const signerInn = pendingSignerInn ?? (isProd ? undefined : parsedBody.signerInn);
        const titleTypeFromBody = pendingTitleType ?? (isProd ? undefined : parsedBody.titleType);

        const now = new Date();
        const recordedAt = signedAt ? new Date(signedAt) : now;

        // ---- МЧД lookup + INN validation ----------------------------------
        // Если в callback пришёл mchdId — проверяем, что МЧД существует,
        // принадлежит организации документа, активна и не истёкла.
        // Если ещё пришёл signerInn — сверяем с granteeInn МЧД.
        // На любом несоответствии: severity='error' событие, signatureState
        // не помечается 'signed', документ остаётся в подвешенном состоянии
        // (юр-сила подписи под вопросом до ручной проверки админом).
        // B2: всегда резолвим organizationId документа через trip.
        // Если у trip нет organization_id (legacy), отказываем —
        // публичный callback не должен делать кросс-tenant lookup МЧД.
        const [tripRow] = await db
            .select({ organizationId: trips.organizationId })
            .from(trips)
            .where(eq(trips.id, row.tripId))
            .limit(1);
        const documentOrgId = tripRow?.organizationId ?? null;
        if (!documentOrgId && mchdId) {
            request.log.error(
                { externalId, tripId: row.tripId, mchdId },
                'Госключ callback: documentOrgId=null — отказываем в МЧД-валидации (legacy trip без organization_id)',
            );
            return reply.status(400).send({
                success: false,
                error: 'Не удаётся определить организацию документа — МЧД-валидация невозможна',
            });
        }

        let mchdRecord: { id: string; mchdNumber: string; granteeInn: string; granterInn: string; status: string; issuedAt: Date; expiresAt: Date } | null = null;
        const mchdProblems: string[] = [];
        if (mchdId && documentOrgId) {
            const [m] = await db
                .select({
                    id: mchd.id,
                    mchdNumber: mchd.mchdNumber,
                    granteeInn: mchd.granteeInn,
                    granterInn: mchd.granterInn,
                    status: mchd.status,
                    issuedAt: mchd.issuedAt,
                    expiresAt: mchd.expiresAt,
                    organizationId: mchd.organizationId,
                })
                .from(mchd)
                .where(and(eq(mchd.id, mchdId), eq(mchd.organizationId, documentOrgId)))
                .limit(1);

            if (!m) {
                mchdProblems.push(`МЧД ${mchdId} не найдена в реестре организации`);
            } else {
                if (m.status !== 'active') mchdProblems.push(`МЧД ${m.mchdNumber} в статусе '${m.status}'`);
                if (m.expiresAt.getTime() <= now.getTime()) mchdProblems.push(`МЧД ${m.mchdNumber} истекла ${m.expiresAt.toISOString()}`);
                if (m.issuedAt.getTime() > now.getTime()) mchdProblems.push(`МЧД ${m.mchdNumber} ещё не действует (issuedAt=${m.issuedAt.toISOString()})`);
                if (signerInn && signerInn !== m.granteeInn) {
                    mchdProblems.push(`ИНН подписанта (${signerInn}) не совпадает с granteeInn МЧД (${m.granteeInn})`);
                }
                if (mchdProblems.length === 0) {
                    mchdRecord = {
                        id: m.id,
                        mchdNumber: m.mchdNumber,
                        granteeInn: m.granteeInn,
                        granterInn: m.granterInn,
                        status: m.status,
                        issuedAt: m.issuedAt,
                        expiresAt: m.expiresAt,
                    };
                }
            }
        }

        // Резолвим финальный titleType: pending (записан /sign) > row.title_type > body.
        // pending уже учтён в titleTypeFromBody-резолвере выше (D5),
        // но row.title_type приоритетнее (стабильнее чем pending в случае
        // расхождения — pending мог быть установлен с неверным titleType).
        const titleType = (
            row.titleType
            ?? titleTypeFromBody
            ?? null
        );

        // Append the signed envelope to metadata.signatures[].
        // rowMetadata уже объявлен выше при резолюции pendingSignatures.
        const existingSignatures = Array.isArray(rowMetadata.signatures)
            ? [...rowMetadata.signatures as Array<Record<string, unknown>>]
            : [];

        const signatureEntry: Record<string, unknown> = {
            provider: 'gosklyuch',
            externalId,
            signedXml,
            signedAt: recordedAt.toISOString(),
            signerCertificate: signerCertificate ?? null,
            signerInn: signerInn ?? null,
            signerRole: pendingSignerRole, // 7.20: «грузополучатель/перевозчик/…»
            mchdId: mchdRecord?.id ?? mchdId ?? null,
            mchdNumber: mchdRecord?.mchdNumber ?? null,
            mchdGranteeInn: mchdRecord?.granteeInn ?? null,
            mchdValid: mchdRecord !== null,
            mchdProblems: mchdProblems.length ? mchdProblems : null,
            titleType, // нужно UI чтобы отметить конкретный титул подписанным
            state: mchdProblems.length === 0 ? 'signed' : 'pending_review',
            receivedAt: now.toISOString(),
        };
        existingSignatures.push(signatureEntry);

        // signatureState помечается 'signed' только если МЧД-связка
        // валидна (или не была передана — backward compat до /sign endpoint).
        // Если есть problems — оставляем 'pending_review' для ручной разборки.
        //
        // Мерджим с предыдущим state, чтобы не затирать lastSignerRole
        // и другие поля, записанные ручным путём через
        // recordTransportDocumentSignature.
        const prevState = (rowMetadata.signatureState && typeof rowMetadata.signatureState === 'object'
            ? rowMetadata.signatureState as Record<string, unknown>
            : {});
        const stateStatus = mchdProblems.length === 0 ? 'signed' : 'pending_review';
        // После успешной подписи pendingSignatures[externalId] нужно
        // снять — он своё дело сделал и больше не trusted-источник.
        const remainingPending: Record<string, unknown> = { ...pendingMap };
        delete remainingPending[externalId];

        const nextMetadata = {
            ...rowMetadata,
            signatures: existingSignatures,
            pendingSignatures: Object.keys(remainingPending).length > 0 ? remainingPending : undefined,
            signatureState: {
                ...prevState,
                status: stateStatus,
                provider: 'gosklyuch',
                lastSignedAt: recordedAt.toISOString(),
                mchdId: mchdRecord?.id ?? null,
                titleType,
                // 7.20: lastSignerRole — приоритет pending (из /sign), иначе
                // оставляем значение из prevState (manual flow).
                lastSignerRole: pendingSignerRole ?? prevState.lastSignerRole ?? null,
                problems: mchdProblems.length ? mchdProblems : null,
            },
            gosklyuchCallback: {
                externalId,
                receivedAt: now.toISOString(),
            },
        };

        await db.update(transportDocuments)
            .set({
                metadata: nextMetadata,
                providerStatus: mchdProblems.length === 0 ? 'signed:gosklyuch' : 'pending_review:gosklyuch',
                updatedAt: now,
            })
            .where(eq(transportDocuments.id, row.id));

        await db.insert(transportDocumentEvents).values({
            documentId: row.id,
            eventType: 'signature_recorded',
            title: mchdProblems.length === 0
                ? 'Госключ: signed envelope received'
                : 'Госключ: подпись принята, но МЧД-связка требует проверки',
            fromStatus: row.status,
            toStatus: row.status,
            severity: mchdProblems.length === 0 ? 'info' : 'critical',
            message: mchdProblems.length === 0
                ? 'Signed XML delivered by Госключ callback'
                : `МЧД-проблемы: ${mchdProblems.join('; ')}`,
            payload: {
                provider: 'gosklyuch',
                externalId,
                titleType,
                signerRole: pendingSignerRole,
                signedAt: recordedAt.toISOString(),
                signerCertificatePresent: Boolean(signerCertificate),
                signedXmlBytes: signedXml.length,
                mchdId: mchdRecord?.id ?? mchdId ?? null,
                mchdNumber: mchdRecord?.mchdNumber ?? null,
                signerInn: signerInn ?? null,
                mchdProblems: mchdProblems.length ? mchdProblems : null,
            },
        });

        if (mchdProblems.length > 0) {
            request.log.warn(
                { documentId: row.id, externalId, mchdId, problems: mchdProblems },
                'Госключ callback: подпись принята с МЧД-проблемами (документ в pending_review)',
            );
        } else {
            request.log.info(
                { documentId: row.id, externalId, mchdId: mchdRecord?.id ?? null, bytes: signedXml.length },
                'Госключ callback: signature recorded',
            );
        }

        return { success: true, mchdProblems: mchdProblems.length ? mchdProblems : undefined };
    });
};

export default gosklyuchCallbackRoutes;
