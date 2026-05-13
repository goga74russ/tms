// ============================================================
// Tachograph compliance routes.
//   POST /api/compliance/tachograph/upload — multipart .DDD/.ESM
//   GET  /api/compliance/tachograph/uploads — recent uploads
// ============================================================
import type { FastifyPluginAsync } from 'fastify';
import { desc, eq } from 'drizzle-orm';
import { db } from '../../../db/connection.js';
import { tachographUploads, drivers } from '../../../db/schema.js';
import { ingestDddBuffer } from './service.js';
import { parseDddBuffer } from './ddd-parser.js';
import { requireFeature } from '../../../auth/plan-guard.js';

interface AuthUser {
    userId: string;
    roles: string[];
    organizationId?: string | null;
}

const ALLOWED_EXT = /\.(ddd|esm)$/i;
const MAX_BYTES = 15 * 1024 * 1024;

const tachographRoutes: FastifyPluginAsync = async (app) => {
    app.post('/compliance/tachograph/upload', {
        schema: {
            tags: ['Compliance'],
            summary: 'Загрузить файл тахографа (.DDD / .ESM)',
            description: 'Парсит файл лучшим образом, сохраняет посуточные сводки в `tachograph_records` и аудит-запись в `tachograph_uploads`. Привязка к водителю по номеру СКЗИ-карты.',
            consumes: ['multipart/form-data'],
        },
        preHandler: [app.authenticate, requireFeature('tachograph')],
    }, async (request, reply) => {
        const user = request.user as AuthUser;
        const data = await request.file();
        if (!data) {
            return reply.status(400).send({ success: false, error: 'Поле file обязательно' });
        }
        if (!ALLOWED_EXT.test(data.filename)) {
            return reply.status(415).send({
                success: false,
                error: 'Поддерживаются только .DDD / .ESM файлы тахографа',
            });
        }
        const buffer = await data.toBuffer();
        if (buffer.length > MAX_BYTES) {
            return reply.status(413).send({ success: false, error: 'Файл превышает 15 МБ' });
        }

        // A-P2: in production, refuse to persist a .DDD whose СКЗИ signature
        // we could not verify — the heuristic parser cannot validate CMAC and
        // an unverified file must not feed compliance records. In dev/sandbox
        // we accept + log so QA can iterate without certified СКЗИ bindings.
        // We do a cheap pre-parse just to read the flag; ingestDddBuffer
        // re-parses afterwards (small files, ~ms cost, acceptable for now).
        const preParsed = parseDddBuffer(buffer);
        if (!preParsed.signatureValid) {
            if (process.env.NODE_ENV === 'production') {
                return reply.status(422).send({
                    success: false,
                    error: 'Подпись файла тахографа не прошла проверку (СКЗИ)',
                });
            }
            request.log.warn({
                fileName: data.filename,
                fileSize: buffer.length,
            }, 'Tachograph file accepted without verified signature (non-prod)');
        }

        const result = await ingestDddBuffer({
            buffer,
            organizationId: user.organizationId ?? null,
            uploadedBy: user.userId,
            fileName: data.filename,
        });

        return reply.status(201).send({
            success: true,
            data: {
                uploadId: result.uploadId,
                driverId: result.driverId,
                recordsInserted: result.recordsInserted,
                period: {
                    from: result.parsed.periodFrom?.toISOString() ?? null,
                    to: result.parsed.periodTo?.toISOString() ?? null,
                },
                totalDrivingHours: +(result.totalDrivingMinutes / 60).toFixed(2),
                vehicleVin: result.parsed.vehicleVin,
                driverCardNumber: result.parsed.driverCardNumber,
                warnings: result.parsed.warnings,
            },
        });
    });

    app.get('/compliance/tachograph/uploads', {
        schema: {
            tags: ['Compliance'],
            summary: 'Журнал загрузок тахографа',
            description: 'Возвращает последние 100 загрузок текущей организации.',
        },
        preHandler: [app.authenticate, requireFeature('tachograph')],
    }, async (request) => {
        const user = request.user as AuthUser;
        if (!user.organizationId) return { success: true, data: [] };

        const rows = await db
            .select({
                id: tachographUploads.id,
                driverId: tachographUploads.driverId,
                driverFullName: drivers.fullName,
                driverCardNumber: tachographUploads.driverCardNumber,
                vehicleVin: tachographUploads.vehicleVin,
                periodFrom: tachographUploads.periodFrom,
                periodTo: tachographUploads.periodTo,
                fileName: tachographUploads.fileName,
                recordsInserted: tachographUploads.recordsInserted,
                totalDrivingMinutes: tachographUploads.totalDrivingMinutes,
                uploadedAt: tachographUploads.uploadedAt,
                parseWarnings: tachographUploads.parseWarnings,
            })
            .from(tachographUploads)
            .leftJoin(drivers, eq(drivers.id, tachographUploads.driverId))
            .where(eq(tachographUploads.organizationId, user.organizationId))
            .orderBy(desc(tachographUploads.uploadedAt))
            .limit(100);

        return { success: true, data: rows };
    });
};

export default tachographRoutes;
