// ============================================================
// Documents Module — Document Returns CRUD (Wave 1)
// ============================================================
import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { requireAbility } from '../../auth/rbac.js';
import { assertTripAccess } from '../../auth/guards.js';
import { db } from '../../db/connection.js';
import { documentReturns, trips } from '../../db/schema.js';
import { recordEvent } from '../../events/journal.js';
import { syncTransportDocumentsForTrip } from '../trips/transport-documents-store.js';

// Wave 1 schema accepts a wider documentType set than the underlying enum.
// The DB enum is ['ttn','upd','act','other'] — anything outside is collapsed to 'other'
// while the original semantic value is kept inside notes for traceability.
const DocumentTypeInput = z.enum(['ttn', 'waybill', 'act', 'invoice', 'cmr', 'other']);
const DocReturnStatusInput = z.enum(['received', 'lost', 'damaged']);

const DocReturnTypeMap: Record<z.infer<typeof DocumentTypeInput>, 'ttn' | 'upd' | 'act' | 'other'> = {
    ttn: 'ttn',
    waybill: 'other',
    act: 'act',
    invoice: 'upd',
    cmr: 'other',
    other: 'other',
};

// DB status enum: ['pending','received','overdue']
const DocReturnStatusMap: Record<z.infer<typeof DocReturnStatusInput>, 'received' | 'overdue'> = {
    received: 'received',
    lost: 'overdue',
    damaged: 'overdue',
};

const CreateDocReturnSchema = z.object({
    documentType: DocumentTypeInput,
    expectedDate: z.string().datetime().optional(),
    notes: z.string().max(2000).optional(),
});

const UpdateDocReturnSchema = z.object({
    status: DocReturnStatusInput,
    receivedDate: z.string().datetime().optional(),
    notes: z.string().max(2000).optional(),
});

function buildNotes(parts: Array<string | null | undefined>): string | null {
    const filtered = parts.map((p) => (p ?? '').trim()).filter(Boolean);
    return filtered.length > 0 ? filtered.join(' | ') : null;
}

const documentRoutes: FastifyPluginAsync = async (app) => {
    // ----------------------------------------------------------------
    // GET /api/trips/:id/document-returns
    // ----------------------------------------------------------------
    app.get('/trips/:id/document-returns', {
        schema: {
            tags: ['Документы'],
            summary: 'Список возвратов оригиналов по рейсу',
            description: 'Возвращает реестр оригиналов документов рейса.',
        },
        preHandler: [app.authenticate, requireAbility('read', 'Trip')],
    }, async (request, reply) => {
        const { id } = request.params as { id: string };
        const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
        await assertTripAccess(id, user);

        const rows = await db
            .select()
            .from(documentReturns)
            .where(eq(documentReturns.tripId, id));

        return { success: true, data: rows };
    });

    // ----------------------------------------------------------------
    // POST /api/trips/:id/document-returns
    // ----------------------------------------------------------------
    app.post('/trips/:id/document-returns', {
        schema: {
            tags: ['Документы'],
            summary: 'Создать запись о возврате документа',
            description: 'Регистрирует ожидаемый оригинал. Стартовый статус — pending.',
        },
        preHandler: [app.authenticate, requireAbility('manage', 'DocumentReturn')],
    }, async (request, reply) => {
        const { id } = request.params as { id: string };
        const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
        await assertTripAccess(id, user);

        const parsed = CreateDocReturnSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({ success: false, error: 'Validation failed', details: parsed.error.flatten() });
        }

        const [tripExists] = await db.select({ id: trips.id }).from(trips).where(eq(trips.id, id)).limit(1);
        if (!tripExists) {
            return reply.status(404).send({ success: false, error: 'Рейс не найден' });
        }

        const docType = DocReturnTypeMap[parsed.data.documentType];
        const semanticTag = parsed.data.documentType !== docType ? `documentType=${parsed.data.documentType}` : null;
        const expectedTag = parsed.data.expectedDate ? `expected=${parsed.data.expectedDate}` : null;
        const combinedNotes = buildNotes([semanticTag, expectedTag, parsed.data.notes]);

        try {
            const [row] = await db
                .insert(documentReturns)
                .values({
                    tripId: id,
                    docType,
                    status: 'pending',
                    receivedAt: null,
                    notes: combinedNotes,
                })
                .returning();

            await recordEvent({
                authorId: user.userId,
                authorRole: user.roles[0] ?? 'manager',
                eventType: 'document_return.created',
                entityType: 'document_return',
                entityId: row.id,
                data: {
                    tripId: id,
                    documentType: parsed.data.documentType,
                    docType,
                    expectedDate: parsed.data.expectedDate ?? null,
                },
            });

            await syncTransportDocumentsForTrip(id, user.userId);

            return reply.status(201).send({ success: true, data: row });
        } catch (err: any) {
            // Likely unique-constraint conflict on (tripId, docType)
            return reply.status(409).send({ success: false, error: err.message ?? 'Не удалось создать запись' });
        }
    });

    // ----------------------------------------------------------------
    // PUT /api/document-returns/:id
    // ----------------------------------------------------------------
    app.put('/document-returns/:id', {
        schema: {
            tags: ['Документы'],
            summary: 'Обновить статус возврата документа',
            description: 'Финальный статус: received/lost/damaged. lost/damaged маппятся в overdue в БД, оригинальный статус сохраняется в notes.',
        },
        preHandler: [app.authenticate, requireAbility('manage', 'DocumentReturn')],
    }, async (request, reply) => {
        const { id } = request.params as { id: string };
        const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };

        const parsed = UpdateDocReturnSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({ success: false, error: 'Validation failed', details: parsed.error.flatten() });
        }

        const [existing] = await db
            .select()
            .from(documentReturns)
            .where(eq(documentReturns.id, id))
            .limit(1);
        if (!existing) {
            return reply.status(404).send({ success: false, error: 'Запись не найдена' });
        }

        // Enforce trip access via RLS guard
        await assertTripAccess(existing.tripId, user);

        const dbStatus = DocReturnStatusMap[parsed.data.status];
        const semanticTag = parsed.data.status !== dbStatus ? `status=${parsed.data.status}` : null;
        const receivedAt = parsed.data.receivedDate
            ? new Date(parsed.data.receivedDate)
            : (parsed.data.status === 'received' ? new Date() : existing.receivedAt);

        const combinedNotes = buildNotes([semanticTag, parsed.data.notes ?? existing.notes]);

        const [row] = await db
            .update(documentReturns)
            .set({
                status: dbStatus,
                receivedAt,
                notes: combinedNotes,
                updatedAt: new Date(),
            })
            .where(eq(documentReturns.id, id))
            .returning();

        await recordEvent({
            authorId: user.userId,
            authorRole: user.roles[0] ?? 'manager',
            eventType: 'document_return.updated',
            entityType: 'document_return',
            entityId: row.id,
            data: {
                tripId: row.tripId,
                status: parsed.data.status,
                dbStatus,
                receivedDate: parsed.data.receivedDate ?? null,
            },
        });

        await syncTransportDocumentsForTrip(row.tripId, user.userId);

        return { success: true, data: row };
    });
};

export default documentRoutes;
