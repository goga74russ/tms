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
import { eq } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import { transportDocuments, transportDocumentEvents } from '../../db/schema.js';

const CallbackBodySchema = z.object({
    externalId: z.string().min(4).max(255),
    signedXml: z.string().min(1).max(4 * 1024 * 1024), // 4 MB hard cap on envelope
    signedAt: z.string().datetime().optional(),
    signerCertificate: z.string().max(64 * 1024).optional(),
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
        const { externalId, signedXml, signedAt, signerCertificate } = parsed.data;

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
            receivedAt: now.toISOString(),
        };
        existingSignatures.push(signatureEntry);

        const nextMetadata = {
            ...metadata,
            signatures: existingSignatures,
            signatureState: {
                status: 'signed',
                provider: 'gosklyuch',
                lastSignedAt: recordedAt.toISOString(),
            },
            gosklyuchCallback: {
                externalId,
                receivedAt: now.toISOString(),
            },
        };

        await db.update(transportDocuments)
            .set({
                metadata: nextMetadata,
                providerStatus: 'signed:gosklyuch',
                updatedAt: now,
            })
            .where(eq(transportDocuments.id, row.id));

        await db.insert(transportDocumentEvents).values({
            documentId: row.id,
            eventType: 'signature_recorded',
            title: 'Госключ: signed envelope received',
            fromStatus: row.status,
            toStatus: row.status,
            severity: 'info',
            message: 'Signed XML delivered by Госключ callback',
            payload: {
                provider: 'gosklyuch',
                externalId,
                signedAt: recordedAt.toISOString(),
                signerCertificatePresent: Boolean(signerCertificate),
                signedXmlBytes: signedXml.length,
            },
        });

        request.log.info(
            { documentId: row.id, externalId, bytes: signedXml.length },
            'Госключ callback: signature recorded',
        );

        return { success: true };
    });
};

export default gosklyuchCallbackRoutes;
