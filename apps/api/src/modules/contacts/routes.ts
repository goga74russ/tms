// ============================================================
// Contact requests — заявки «Связаться» с публичного лендинга.
// POST /api/public/contact — ПУБЛИЧНЫЙ (без авторизации), rate-limited (анти-спам).
// GET/PATCH /api/contacts — только admin (founder смотрит лиды в /admin/contacts).
// ============================================================
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import { contactRequests } from '../../db/schema.js';
import { safeClientError } from '../../utils/safe-error.js';

const ContactSchema = z.object({
    name: z.string().trim().min(1, 'Укажите имя').max(200),
    phone: z.string().trim().min(3, 'Укажите телефон').max(50),
    email: z.string().trim().email('Некорректный email').max(255).optional().or(z.literal('')),
    fleetSize: z.enum(['1-5', '5-15', '15-30', '30+']).optional(),
    comment: z.string().trim().max(2000).optional(),
});

function isAdmin(user: unknown): boolean {
    const roles = (user as { roles?: string[] } | null)?.roles ?? [];
    return roles.includes('admin');
}

export default async function contactsRoutes(app: FastifyInstance) {
    // ---- Публичный приём заявки ----
    app.post('/public/contact', {
        schema: {
            tags: ['Контакты'],
            summary: 'Заявка «Связаться» с лендинга',
            description: 'Публичная форма: потенциальный клиент оставляет контакты. Rate-limit анти-спам.',
        },
        config: {
            rateLimit: { max: 5, timeWindow: '10 minutes' },
        },
    }, async (request, reply) => {
        const parsed = ContactSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({
                success: false,
                error: 'Ошибка валидации данных',
                details: parsed.error.flatten(),
            });
        }
        const d = parsed.data;
        try {
            await db.insert(contactRequests).values({
                name: d.name,
                phone: d.phone,
                email: d.email ? d.email : null,
                fleetSize: d.fleetSize ?? null,
                comment: d.comment ?? null,
                source: 'landing',
            });
            return reply.status(201).send({ success: true });
        } catch (err) {
            request.log.error({ err }, 'contact request insert failed');
            return reply.status(500).send({ success: false, error: safeClientError(err, 'Не удалось отправить заявку') });
        }
    });

    // ---- Админ: список лидов ----
    app.get('/contacts', {
        schema: { tags: ['Контакты'], summary: 'Список заявок «Связаться» (admin)' },
        preHandler: [app.authenticate],
    }, async (request, reply) => {
        if (!isAdmin(request.user)) {
            return reply.status(403).send({ success: false, error: 'Доступ запрещён' });
        }
        const rows = await db.select().from(contactRequests)
            .orderBy(desc(contactRequests.createdAt))
            .limit(500);
        return reply.send({ success: true, data: rows });
    });

    // ---- Админ: сменить статус (new → contacted → closed) ----
    app.patch('/contacts/:id', {
        schema: { tags: ['Контакты'], summary: 'Сменить статус заявки (admin)' },
        preHandler: [app.authenticate],
    }, async (request, reply) => {
        if (!isAdmin(request.user)) {
            return reply.status(403).send({ success: false, error: 'Доступ запрещён' });
        }
        const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
        const body = z.object({ status: z.enum(['new', 'contacted', 'closed']) }).safeParse(request.body);
        if (!params.success || !body.success) {
            return reply.status(400).send({ success: false, error: 'Ошибка валидации данных' });
        }
        const [updated] = await db.update(contactRequests)
            .set({ status: body.data.status })
            .where(eq(contactRequests.id, params.data.id))
            .returning();
        if (!updated) return reply.status(404).send({ success: false, error: 'Заявка не найдена' });
        return reply.send({ success: true, data: updated });
    });
}
