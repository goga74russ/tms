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
import {
    validateTachographUpload,
    summarizeIngestResult,
} from './helpers.js';

interface AuthUser {
    userId: string;
    roles: string[];
    organizationId?: string | null;
}

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
        // T-7: загрузка .DDD создаёт org-wide compliance-записи, привязанные к
        // водителям по номеру СКЗИ-карты. Без role-гейта любой член орг (в т.ч.
        // driver) мог заливать данные за чужих водителей. Только эксплуатационные
        // роли: admin/manager/mechanic.
        const allowed = ['admin', 'manager', 'mechanic'];
        if (!user.roles?.some((r) => allowed.includes(r))) {
            return reply.status(403).send({ success: false, error: 'Недостаточно прав для загрузки тахографа' });
        }
        const data = await request.file();
        if (!data) {
            return reply.status(400).send({ success: false, error: 'Поле file обязательно' });
        }
        // Cheap pre-checks (ext + always-true signature placeholder) before
        // we materialise the buffer — keeps oversize-with-wrong-ext rejects fast.
        const extGuard = validateTachographUpload({
            filename: data.filename,
            sizeBytes: 0,
            signatureValid: true,
            nodeEnv: process.env.NODE_ENV,
        });
        if (!extGuard.ok && extGuard.status === 415) {
            return reply.status(415).send({ success: false, error: extGuard.error });
        }

        const buffer = await data.toBuffer();

        // A-P2: in production, refuse to persist a .DDD whose СКЗИ signature
        // we could not verify — the heuristic parser cannot validate CMAC and
        // an unverified file must not feed compliance records. In dev/sandbox
        // we accept + log so QA can iterate without certified СКЗИ bindings.
        // We do a cheap pre-parse just to read the flag; ingestDddBuffer
        // re-parses afterwards (small files, ~ms cost, acceptable for now).
        const preParsed = parseDddBuffer(buffer);
        const guard = validateTachographUpload({
            filename: data.filename,
            sizeBytes: buffer.length,
            signatureValid: preParsed.signatureValid,
            nodeEnv: process.env.NODE_ENV,
        });
        if (!guard.ok) {
            return reply.status(guard.status).send({ success: false, error: guard.error });
        }
        if (!preParsed.signatureValid) {
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
            data: summarizeIngestResult({
                uploadId: result.uploadId,
                driverId: result.driverId,
                recordsInserted: result.recordsInserted,
                totalDrivingMinutes: result.totalDrivingMinutes,
                periodFrom: result.parsed.periodFrom ?? null,
                periodTo: result.parsed.periodTo ?? null,
                vehicleVin: result.parsed.vehicleVin ?? null,
                driverCardNumber: result.parsed.driverCardNumber ?? null,
                warnings: result.parsed.warnings,
            }),
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
