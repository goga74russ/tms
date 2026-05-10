// ============================================================
// Wave 5 — EDI routes (Diadoc/SBIS/Kontur mock).
// Mock-эндпоинты для демонстрации e-документооборота.
// ============================================================
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../../db/connection.js';
import { transportDocuments } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { requireAbility } from '../../auth/rbac.js';
import { assertTripAccess } from '../../auth/guards.js';
import { requireFeature } from '../../auth/plan-guard.js';
import {
    sendDocumentToEdi,
    getEdiHistory,
    progressEdiManually,
    type EdiProvider,
} from './service.js';

const ParamsSchema = z.object({ id: z.string().uuid() });

const SendBodySchema = z.object({
    provider: z.enum(['diadoc', 'sbis', 'kontur']),
});

const ProgressBodySchema = z.object({
    to: z.enum(['signed_by_carrier', 'signed_by_client', 'rejected']),
});

interface AuthUser {
    userId: string;
    roles: string[];
    organizationId?: string | null;
}

function isAdmin(user: AuthUser): boolean {
    return user.roles.includes('admin');
}

async function loadDocumentTripId(documentId: string): Promise<string | null> {
    const [doc] = await db
        .select({ tripId: transportDocuments.tripId })
        .from(transportDocuments)
        .where(eq(transportDocuments.id, documentId))
        .limit(1);
    return doc?.tripId ?? null;
}

const ediRoutes: FastifyPluginAsync = async (app) => {
    // --- POST /transport-documents/:id/edi/send ---
    app.post('/transport-documents/:id/edi/send', {
        schema: {
            tags: ['ЭДО'],
            summary: 'Отправить документ в EDI (mock)',
            description: 'Mock-отправка документа в Диадок/СБИС/Контур. Через 5с автоматически подписывается перевозчиком, через 10с — клиентом.',
        },
        preHandler: [app.authenticate, requireFeature('edi'), requireAbility('update', 'Trip')],
    }, async (request, reply) => {
        const params = ParamsSchema.safeParse(request.params);
        if (!params.success) {
            return reply.status(400).send({ success: false, error: 'Некорректный id' });
        }
        const body = SendBodySchema.safeParse(request.body);
        if (!body.success) {
            return reply.status(400).send({
                success: false,
                error: 'provider обязателен',
                details: body.error.flatten().fieldErrors,
            });
        }

        const user = request.user as AuthUser;
        const tripId = await loadDocumentTripId(params.data.id);
        if (!tripId) {
            return reply.status(404).send({ success: false, error: 'Документ не найден' });
        }
        try {
            await assertTripAccess(tripId, user);
        } catch (err: any) {
            return reply.status(403).send({ success: false, error: err.message });
        }

        try {
            const result = await sendDocumentToEdi(
                params.data.id,
                body.data.provider as EdiProvider,
            );
            return { success: true, data: result };
        } catch (err: any) {
            return reply.status(400).send({ success: false, error: err.message });
        }
    });

    // --- GET /transport-documents/:id/edi/history ---
    app.get('/transport-documents/:id/edi/history', {
        schema: {
            tags: ['ЭДО'],
            summary: 'История EDI-событий',
            description: 'Журнал событий по документу (sent/signed/rejected) + текущий статус.',
        },
        preHandler: [app.authenticate, requireFeature('edi'), requireAbility('read', 'Trip')],
    }, async (request, reply) => {
        const params = ParamsSchema.safeParse(request.params);
        if (!params.success) {
            return reply.status(400).send({ success: false, error: 'Некорректный id' });
        }

        const user = request.user as AuthUser;
        const tripId = await loadDocumentTripId(params.data.id);
        if (!tripId) {
            return reply.status(404).send({ success: false, error: 'Документ не найден' });
        }
        try {
            await assertTripAccess(tripId, user);
        } catch (err: any) {
            return reply.status(403).send({ success: false, error: err.message });
        }

        try {
            const data = await getEdiHistory(params.data.id);
            return { success: true, data };
        } catch (err: any) {
            return reply.status(404).send({ success: false, error: err.message });
        }
    });

    // --- POST /transport-documents/:id/edi/mock-progress (admin) ---
    app.post('/transport-documents/:id/edi/mock-progress', {
        schema: {
            tags: ['ЭДО'],
            summary: 'Перевести EDI-статус вручную (admin)',
            description: 'Mock-эндпоинт для демонстрации. Доступен только администраторам.',
        },
        preHandler: [app.authenticate, requireFeature('edi')],
    }, async (request, reply) => {
        const user = request.user as AuthUser;
        if (!isAdmin(user)) {
            return reply.status(403).send({ success: false, error: 'Только администратор' });
        }

        const params = ParamsSchema.safeParse(request.params);
        if (!params.success) {
            return reply.status(400).send({ success: false, error: 'Некорректный id' });
        }
        const body = ProgressBodySchema.safeParse(request.body);
        if (!body.success) {
            return reply.status(400).send({
                success: false,
                error: 'to обязателен',
                details: body.error.flatten().fieldErrors,
            });
        }

        try {
            const result = await progressEdiManually(params.data.id, body.data.to);
            return { success: true, data: result };
        } catch (err: any) {
            return reply.status(400).send({ success: false, error: err.message });
        }
    });
};

export default ediRoutes;
