// ============================================================
// Uploads Routes — POST /api/uploads
// Accepts multipart file, stores via storage.service, returns URL
// ============================================================
import { FastifyPluginAsync } from 'fastify';
import { requireAbility } from '../../auth/rbac.js';
import { uploadBuffer } from '../../services/storage.service.js';

const ALLOWED_MIME_TYPES = new Set([
    'image/jpeg', 'image/png', 'image/webp', 'image/heic',
    'application/pdf',
]);
const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB (enforced by @fastify/multipart too)

const uploadsRoutes: FastifyPluginAsync = async (app) => {
    app.post('/uploads', {
        schema: {
            tags: ['Файлы'],
            summary: 'Загрузить файл',
            description: 'Загрузка фото/документа. Принимает multipart/form-data с полем `file`. Возвращает URL.',
            consumes: ['multipart/form-data'],
        },
        preHandler: [app.authenticate, requireAbility('manage', 'WaybillAttachment')],
    }, async (request, reply) => {
        const data = await request.file();

        if (!data) {
            return reply.status(400).send({ success: false, error: 'Поле file обязательно' });
        }

        if (!ALLOWED_MIME_TYPES.has(data.mimetype)) {
            return reply.status(415).send({
                success: false,
                error: `Тип файла не поддерживается: ${data.mimetype}. Допустимы: JPEG, PNG, WEBP, HEIC, PDF`,
            });
        }

        const buffer = await data.toBuffer();
        if (buffer.length > MAX_FILE_SIZE) {
            return reply.status(413).send({ success: false, error: 'Файл превышает лимит 15 МБ' });
        }

        const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
        const ownerScope = user.organizationId ? `org-${user.organizationId}` : `user-${user.userId}`;
        const folder = user.roles.includes('driver') ? `${ownerScope}/driver-photos` : `${ownerScope}/uploads`;

        const result = await uploadBuffer(buffer, {
            folder,
            filename: data.filename,
            contentType: data.mimetype,
        });

        return reply.status(201).send({ success: true, data: { url: result.url, key: result.key } });
    });
};

export default uploadsRoutes;


