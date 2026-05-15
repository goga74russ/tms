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
    //
    // ВАЖНО: пока эндпоинта POST /transport-documents/:id/sign нет,
    // mchdId/signerInn принимаются опционально из body. Когда /sign
    // будет реализован, он будет писать pendingSignatures[externalId]
    // в metadata документа и связка станет server-side
    // (callback-body-mchdId перестанет приниматься).
    mchdId: z.string().uuid().optional(),
    signerInn: z.string().regex(/^\d{10}$|^\d{12}$/, 'ИНН: 10 или 12 цифр').optional(),
});

/**
 * If externalId encodes an HMAC ("<id>.<hex>"), verify it against the
 * server-side secret. When GOSKLYUCH_CALLBACK_SECRET is unset we skip
 * the check (dev-friendly); in production it should always be set.
 */
function verifyExternalIdHmac(externalId: string): boolean {
    const secret = process.env.GOSKLYUCH_CALLBACK_SECRET;
    if (!secret) return true; // no secret configured → skip
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
        const { externalId, signedXml, signedAt, signerCertificate, mchdId, signerInn } = parsed.data;

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

        const now = new Date();
        const recordedAt = signedAt ? new Date(signedAt) : now;

        // ---- МЧД lookup + INN validation ----------------------------------
        // Если в callback пришёл mchdId — проверяем, что МЧД существует,
        // принадлежит организации документа, активна и не истёкла.
        // Если ещё пришёл signerInn — сверяем с granteeInn МЧД.
        // На любом несоответствии: severity='error' событие, signatureState
        // не помечается 'signed', документ остаётся в подвешенном состоянии
        // (юр-сила подписи под вопросом до ручной проверки админом).
        let mchdRecord: { id: string; mchdNumber: string; granteeInn: string; granterInn: string; status: string; issuedAt: Date; expiresAt: Date } | null = null;
        const mchdProblems: string[] = [];
        if (mchdId) {
            // transport_documents не имеет прямой колонки organization_id —
            // org-скоуп выводим через trip.organizationId.
            const [tripRow] = await db
                .select({ organizationId: trips.organizationId })
                .from(trips)
                .where(eq(trips.id, row.tripId))
                .limit(1);
            const documentOrgId = tripRow?.organizationId ?? null;

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
                .where(
                    documentOrgId
                        ? and(eq(mchd.id, mchdId), eq(mchd.organizationId, documentOrgId))
                        : eq(mchd.id, mchdId),
                )
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

        // Append the signed envelope to metadata.signatures[].
        const metadata = ((row.metadata as Record<string, unknown> | null) ?? {});
        const existingSignatures = Array.isArray(metadata.signatures)
            ? [...metadata.signatures as Array<Record<string, unknown>>]
            : [];

        const signatureEntry: Record<string, unknown> = {
            provider: 'gosklyuch',
            externalId,
            signedXml,
            signedAt: recordedAt.toISOString(),
            signerCertificate: signerCertificate ?? null,
            signerInn: signerInn ?? null,
            mchdId: mchdRecord?.id ?? mchdId ?? null,
            mchdNumber: mchdRecord?.mchdNumber ?? null,
            mchdGranteeInn: mchdRecord?.granteeInn ?? null,
            mchdValid: mchdRecord !== null,
            mchdProblems: mchdProblems.length ? mchdProblems : null,
            receivedAt: now.toISOString(),
        };
        existingSignatures.push(signatureEntry);

        // signatureState помечается 'signed' только если МЧД-связка
        // валидна (или не была передана — backward compat до /sign endpoint).
        // Если есть problems — оставляем 'pending_review' для ручной разборки.
        const stateStatus = mchdProblems.length === 0 ? 'signed' : 'pending_review';
        const nextMetadata = {
            ...metadata,
            signatures: existingSignatures,
            signatureState: {
                status: stateStatus,
                provider: 'gosklyuch',
                lastSignedAt: recordedAt.toISOString(),
                mchdId: mchdRecord?.id ?? null,
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
