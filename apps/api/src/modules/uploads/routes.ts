// ============================================================
// Uploads Routes — POST /api/uploads
// Accepts multipart file, stores via storage.service, returns URL
// ============================================================
import { FastifyPluginAsync } from 'fastify';
import { fileTypeFromBuffer } from 'file-type';
import { requireAbility } from '../../auth/rbac.js';
import { uploadBuffer } from '../../services/storage.service.js';

// A-P1-4: HEIC is intentionally removed from the strict allowlist used for
// content sniffing — file-type detects it, but the practical risk is that
// browsers can't render HEIC inline, so it provides no benefit and widening
// the surface invites trouble. Keep PNG/JPEG/WEBP/PDF.
const ALLOWED_SNIFFED_MIME_TYPES = new Set([
    'image/jpeg', 'image/png', 'image/webp',
    'application/pdf',
]);
// Claimed MIME accepts a slightly broader set so existing mobile clients
// that still send image/heic don't immediately break — they'll fail the
// sniffing check instead, which is the correct failure mode.
const ALLOWED_CLAIMED_MIME_TYPES = new Set([
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

        // First-line cheap rejection: claimed Content-Type from the client.
        // The real check is below against the sniffed magic bytes.
        if (!ALLOWED_CLAIMED_MIME_TYPES.has(data.mimetype)) {
            return reply.status(415).send({
                success: false,
                error: `Тип файла не поддерживается: ${data.mimetype}. Допустимы: JPEG, PNG, WEBP, PDF`,
            });
        }

        const buffer = await data.toBuffer();
        if (buffer.length > MAX_FILE_SIZE) {
            return reply.status(413).send({ success: false, error: 'Файл превышает лимит 15 МБ' });
        }

        // A-P1-4: SNIFF the actual content. Previously we trusted the client's
        // Content-Type — an attacker could upload `evil.html` claiming
        // `image/jpeg`, S3 would return it with that header and serve the
        // raw HTML, and any browser hitting `S3_PUBLIC_URL` would execute
        // attacker JS in our origin (stored XSS via S3 public bucket).
        const sniffed = await fileTypeFromBuffer(buffer.subarray(0, 4100));
        if (!sniffed) {
            return reply.status(415).send({
                success: false,
                error: 'Не удалось определить тип файла. Загрузите JPEG, PNG, WEBP или PDF.',
            });
        }
        if (!ALLOWED_SNIFFED_MIME_TYPES.has(sniffed.mime)) {
            return reply.status(415).send({
                success: false,
                error: `Содержимое файла (${sniffed.mime}) не входит в список разрешённых: JPEG, PNG, WEBP, PDF`,
            });
        }
        // Claimed and sniffed must agree. (HEIC is allowed as a claim but
        // not as a sniffed type, so HEIC uploads now fail here — by design;
        // mobile clients should re-encode to JPEG before upload.)
        if (data.mimetype !== sniffed.mime) {
            return reply.status(415).send({
                success: false,
                error: `Несовпадение Content-Type (${data.mimetype}) и содержимого (${sniffed.mime})`,
            });
        }

        const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
        const ownerScope = user.organizationId ? `org-${user.organizationId}` : `user-${user.userId}`;
        const folder = user.roles.includes('driver') ? `${ownerScope}/driver-photos` : `${ownerScope}/uploads`;

        const result = await uploadBuffer(buffer, {
            folder,
            filename: data.filename,
            // A-P1-4: write the SNIFFED content-type to S3, not the client's
            // claim. This is what S3 puts in the response header when serving
            // the public object, so it must match the bytes.
            contentType: sniffed.mime,
        });

        return reply.status(201).send({ success: true, data: { url: result.url, key: result.key } });
    });
};

export default uploadsRoutes;


