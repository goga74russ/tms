// ============================================================
// Waybills Routes вЂ” Путевые листы (В§3.5)
// ============================================================
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { basename, join, relative, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { requireAbility } from '../../auth/rbac.js';
import { assertTripAccess, assertWaybillAccess, resolveDriverId } from '../../auth/guards.js';
import {
    generateWaybill,
    closeWaybill,
    listWaybills,
    getWaybillById,
    syncWaybillStateForTrip,
} from './service.js';
import { db } from '../../db/connection.js';
import { drivers, waybills, waybillAttachments, deliveryConfirmations } from '../../db/schema.js';
import { and, eq } from 'drizzle-orm';
import { hasPrivilege } from '@tms/shared';
import { safeClientError } from '../../utils/safe-error.js';

const WAYBILL_UPLOADS_DIR = resolve(process.cwd(), 'uploads', 'waybills');
const ALLOWED_ATTACHMENT_MIME_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
]);
const MAX_ATTACHMENT_SIZE = 15 * 1024 * 1024;
const MIME_EXTENSIONS: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'application/pdf': '.pdf',
};

function sanitizeFileName(fileName: string) {
    return fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
}

async function ensureWaybillUploadsDir() {
    await mkdir(WAYBILL_UPLOADS_DIR, { recursive: true });
}

function getAttachmentAbsolutePath(storagePath: string) {
    const absolutePath = resolve(process.cwd(), storagePath);
    const relativePath = relative(WAYBILL_UPLOADS_DIR, absolutePath);
    if (!relativePath || relativePath.startsWith('..') || relativePath.includes('../') || relativePath.includes('..\\')) {
        throw new Error('Invalid attachment storage path');
    }
    return absolutePath;
}

export default async function waybillRoutes(app: FastifyInstance) {

    /**
     * GET /api/waybills
     * List waybills (paginated, H-3: driver RLS)
     */
    app.get('/waybills', {
        schema: { tags: ['Путевые листы'], summary: 'Список путевых листов', description: 'Все путевые листы с пагинацией.' },
        preHandler: [app.authenticate, requireAbility('read', 'Waybill')],
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const user = request.user as { userId: string; roles: string[]; organizationId?: string };
            const { page = '1', limit = '20', status, search } = request.query as Record<string, string>;

            // H-3: RLS вЂ” drivers can only see their own waybills
            let rlsDriverId: string | undefined;
            if (!hasPrivilege(user.roles) && user.roles.includes('driver')) {
                const myDriverId = await resolveDriverId(user.userId);
                if (!myDriverId) {
                    return reply.status(403).send({
                        success: false,
                        error: 'Отказано в доступе (профиль водителя не привязан)',
                    });
                }
                rlsDriverId = myDriverId;
            }

            const result = await listWaybills(parseInt(page), parseInt(limit), rlsDriverId, { status, search, organizationId: user.organizationId });
            return { success: true, ...result };
        } catch (error: any) {
            request.log.error(error);
            return reply.status(error.statusCode || 500).send({
                success: false,
                error: safeClientError(error, 'Ошибка'),
            });
        }
    });

    /**
     * GET /api/waybills/:id
     * Single waybill with related data
     */
    app.get('/waybills/:id', {
        schema: { tags: ['Путевые листы'], summary: 'Получить путевой лист', description: 'Детальная информация о путевом листе с данными рейса, ТС Рё водителя.' },
        preHandler: [app.authenticate, requireAbility('read', 'Waybill')],
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
            const { id } = request.params as { id: string };
            await assertWaybillAccess(id, user);
            const waybill = await getWaybillById(id);
            if (!waybill) {
                return reply.status(404).send({
                    success: false,
                    error: 'Waybill not found',
                });
            }
            return { success: true, data: waybill };
        } catch (error: any) {
            request.log.error(error);
            return reply.status(500).send({
                success: false,
                error: safeClientError(error, 'Ошибка'),
            });
        }
    });

    /**
     * POST /api/waybills/generate/:tripId
     * Generate waybill for a trip (requires both approvals)
     */
    app.post('/waybills/generate/:tripId', {
        schema: { tags: ['Путевые листы'], summary: 'Сформировать путевой лист', description: 'Автоматическое формирование путевого листа для рейса. Проверка наличия техосмотра Рё медосмотра.' },
        preHandler: [app.authenticate, requireAbility('create', 'Waybill')],
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
            const { tripId } = request.params as { tripId: string };
            await assertTripAccess(tripId, user);

            const waybill = await generateWaybill(tripId, user.userId, user.roles[0]);
            return reply.status(201).send({ success: true, data: waybill });
        } catch (error: any) {
            request.log.error(error);
            const statusCode = error.statusCode || (error.message.includes('Нет допуска') ? 409 : 500);
            return reply.status(statusCode).send({
                success: false,
                error: safeClientError(error, 'Ошибка при формировании путевого листа'),
            });
        }
    });

    /**
     * POST /api/waybills/:id/close
     * Close waybill (odometer, fuel, return time)
     */
    app.post('/waybills/:id/close', {
        schema: { tags: ['Путевые листы'], summary: 'Р—акрыть путевой лист', description: 'Р—акрытие путевого листа с финальными данными одометра Рё ГСМ.' },
        preHandler: [app.authenticate, requireAbility('update', 'Waybill')],
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
            const { id } = request.params as { id: string };
            await assertWaybillAccess(id, user);
            const body = request.body as {
                odometerIn: number;
                fuelIn?: number;
                returnAt?: string;
            };

            if (!body.odometerIn && body.odometerIn !== 0) {
                return reply.status(400).send({
                    success: false,
                    error: 'Обязательное поле: odometerIn',
                });
            }

            const waybill = await closeWaybill(id, body, user.userId, user.roles[0]);
            return { success: true, data: waybill };
        } catch (error: any) {
            request.log.error(error);
            const statusCode = error.statusCode || (error.message.includes('уже закрыт') ? 400 : error.message.includes('не найден') ? 404 : 500);
            return reply.status(statusCode).send({
                success: false,
                error: safeClientError(error, 'Ошибка при закрытии путевого листа'),
            });
        }
    });

    /**
     * POST /api/waybills/:id/sync-status
     * Re-evaluate inspection state and resync waybill status (idempotent)
     */
    app.post('/waybills/:id/sync-status', {
        schema: { tags: ['Путевые листы'], summary: 'Синхронизировать статус путевого листа', description: 'Пересчитывает статус путевого листа по факту имеющихся осмотров (draft/medical_check/technical_check/issued).' },
        preHandler: [app.authenticate, requireAbility('update', 'Waybill')],
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
            const { id } = request.params as { id: string };
            await assertWaybillAccess(id, user);

            const [existing] = await db.select({ id: waybills.id, tripId: waybills.tripId }).from(waybills).where(eq(waybills.id, id)).limit(1);
            if (!existing) {
                return reply.status(404).send({ success: false, error: 'Путевой лист не найден' });
            }

            const updated = await syncWaybillStateForTrip(existing.tripId, user.userId, user.roles[0]);
            if (!updated) {
                return reply.status(409).send({ success: false, error: 'Не удалось синхронизировать статус путевого листа' });
            }

            return { success: true, data: { id: updated.id, status: updated.status } };
        } catch (error: any) {
            request.log.error(error);
            return reply.status(error.statusCode || 500).send({
                success: false,
                error: safeClientError(error, 'Ошибка синхронизации статуса'),
            });
        }
    });

    app.get('/waybills/:id/attachments', {
        schema: { tags: ['Attachments'], summary: 'List waybill attachments' },
        preHandler: [app.authenticate, requireAbility('read', 'WaybillAttachment')],
    }, async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            await assertWaybillAccess(id, request.user as { userId: string; roles: string[]; organizationId?: string | null });

            const rows = await db.select().from(waybillAttachments)
                .where(eq(waybillAttachments.waybillId, id));

            return { success: true, data: rows };
        } catch (error: any) {
            request.log.error(error);
            const statusCode = error.statusCode || 500;
            return reply.status(statusCode).send({ success: false, error: safeClientError(error, 'Failed to load attachments') });
        }
    });

    app.post('/waybills/:id/attachments', {
        schema: { tags: ['Attachments'], summary: 'Upload waybill attachment' },
        preHandler: [app.authenticate, requireAbility('create', 'WaybillAttachment')],
    }, async (request, reply) => {
        try {
            const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
            const { id } = request.params as { id: string };
            await assertWaybillAccess(id, user);

            const [waybill] = await db.select({ id: waybills.id }).from(waybills).where(eq(waybills.id, id)).limit(1);
            if (!waybill) {
                return reply.status(404).send({ success: false, error: 'Waybill not found' });
            }

            const file = await request.file();
            if (!file) {
                return reply.status(400).send({ success: false, error: 'File is required' });
            }

            const mimeType = file.mimetype || 'application/octet-stream';
            if (!ALLOWED_ATTACHMENT_MIME_TYPES.has(mimeType)) {
                return reply.status(400).send({ success: false, error: 'Unsupported file type' });
            }

            const buffer = await file.toBuffer();
            if (buffer.length > MAX_ATTACHMENT_SIZE) {
                return reply.status(400).send({ success: false, error: 'Attachment exceeds 15 MB limit' });
            }

            const extension = MIME_EXTENSIONS[mimeType] ?? '.bin';
            const storedFileName = randomUUID() + extension;
            await ensureWaybillUploadsDir();
            const absolutePath = getAttachmentAbsolutePath(join('uploads', 'waybills', storedFileName).replace(/\\/g, '/'));
            await writeFile(absolutePath, buffer);

            const [created] = await db.insert(waybillAttachments).values({
                waybillId: id,
                fileName: storedFileName,
                originalName: sanitizeFileName(file.filename || storedFileName),
                mimeType,
                fileSize: buffer.length,
                storagePath: join('uploads', 'waybills', storedFileName).replace(/\\/g, '/'),
                uploadedBy: user.userId,
            }).returning();

            return reply.status(201).send({ success: true, data: created });
        } catch (error: any) {
            request.log.error(error);
            const statusCode = error.statusCode || 500;
            return reply.status(statusCode).send({ success: false, error: safeClientError(error, 'Failed to upload attachment') });
        }
    });

    app.get('/waybills/:waybillId/attachments/:attachmentId/download', {
        schema: { tags: ['Attachments'], summary: 'Download waybill attachment' },
        preHandler: [app.authenticate, requireAbility('read', 'WaybillAttachment')],
    }, async (request, reply) => {
        try {
            const { waybillId, attachmentId } = request.params as { waybillId: string; attachmentId: string };
            await assertWaybillAccess(waybillId, request.user as { userId: string; roles: string[]; organizationId?: string | null });

            const [attachment] = await db.select().from(waybillAttachments)
                .where(and(eq(waybillAttachments.id, attachmentId), eq(waybillAttachments.waybillId, waybillId)))
                .limit(1);
            if (!attachment) {
                return reply.status(404).send({ success: false, error: 'Attachment not found' });
            }

            const absolutePath = getAttachmentAbsolutePath(attachment.storagePath);
            const fileBuffer = await readFile(absolutePath);
            const fileStat = await stat(absolutePath);
            reply.header('Content-Type', attachment.mimeType || 'application/octet-stream');
            reply.header('Content-Disposition', 'attachment; filename="' + basename(attachment.originalName || attachment.fileName) + '"');
            reply.header('Content-Length', fileStat.size);
            return reply.send(fileBuffer);
        } catch (error: any) {
            request.log.error(error);
            const statusCode = error.code === 'ENOENT' ? 404 : (error.statusCode || 500);
            const message = error.code === 'ENOENT' ? 'Attachment file not found' : (error.message || 'Failed to download attachment');
            return reply.status(statusCode).send({ success: false, error: message });
        }
    });

    app.delete('/waybills/:waybillId/attachments/:attachmentId', {
        schema: { tags: ['Attachments'], summary: 'Delete waybill attachment' },
        preHandler: [app.authenticate, requireAbility('delete', 'WaybillAttachment')],
    }, async (request, reply) => {
        try {
            const { waybillId, attachmentId } = request.params as { waybillId: string; attachmentId: string };
            await assertWaybillAccess(waybillId, request.user as { userId: string; roles: string[]; organizationId?: string | null });

            const [attachment] = await db.delete(waybillAttachments)
                .where(and(eq(waybillAttachments.id, attachmentId), eq(waybillAttachments.waybillId, waybillId)))
                .returning();
            if (!attachment) {
                return reply.status(404).send({ success: false, error: 'Attachment not found' });
            }

            const absolutePath = getAttachmentAbsolutePath(attachment.storagePath);
            await unlink(absolutePath).catch((error: any) => {
                if (error?.code !== 'ENOENT') throw error;
            });

            return { success: true, data: attachment };
        } catch (error: any) {
            request.log.error(error);
            const statusCode = error.statusCode || 500;
            return reply.status(statusCode).send({ success: false, error: safeClientError(error, 'Failed to delete attachment') });
        }
    });
    // ================================================================
    // PDF вЂ” Путевой лист
    // ================================================================
    const { generateWaybillPdf } = await import('../documents/waybill-pdf.js');

    /**
     * GET /api/waybills/:id/pdf
     * Download waybill as PDF (Ф.4-П)
     */
    app.get('/waybills/:id/pdf', {
        schema: { tags: ['Путевые листы'], summary: 'PDF путевого листа', description: 'Скачать путевой лист в формате PDF (форма Ф.4-П).' },
        preHandler: [app.authenticate, requireAbility('read', 'Waybill')],
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const { id } = request.params as { id: string };
            const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
            await assertWaybillAccess(id, user);
            const waybill = await getWaybillById(id);
            if (!waybill) {
                return reply.status(404).send({ success: false, error: 'Путевой лист не найден' });
            }

            const { trips: tripsTable, tripOrders, orders: ordersTable, vehicles: vehiclesTable, contractors, techInspections, medInspections, users, drivers: driversTable } = await import('../../db/schema.js');
            const [trip] = await db.select().from(tripsTable).where(eq(tripsTable.id, waybill.tripId!)).limit(1);
            const [order] = trip ? await db.select({ order: ordersTable }).from(tripOrders).innerJoin(ordersTable, eq(tripOrders.orderId, ordersTable.id)).where(eq(tripOrders.tripId, trip.id)).limit(1) : [null];
            const [vehicle] = waybill.vehicleId ? await db.select({ make: vehiclesTable.make, model: vehiclesTable.model, plateNumber: vehiclesTable.plateNumber, vin: vehiclesTable.vin }).from(vehiclesTable).where(eq(vehiclesTable.id, waybill.vehicleId)).limit(1) : [null];

            // Fetch driver SNILS for \u041c\u0438\u043d\u0442\u0440\u0430\u043d\u0441 \u2116390 section
            let driverSnils: string | null = null;
            if (waybill.driverId) {
                const [driverRow] = await db.select({ snils: driversTable.snils }).from(driversTable).where(eq(driversTable.id, waybill.driverId)).limit(1);
                driverSnils = driverRow?.snils ?? null;
            }

            // Get mechanic name via techInspection.mechanicId в†’ users.fullName
            let mechanicName: string | null = null;
            let mechanicDecision: string | null = null;
            let mechanicTime: Date | null = null;
            if (waybill.techInspectionId) {
                const [techInsp] = await db.select({ mechanicId: techInspections.mechanicId, decision: techInspections.decision, createdAt: techInspections.createdAt })
                    .from(techInspections).where(eq(techInspections.id, waybill.techInspectionId)).limit(1);
                if (techInsp) {
                    mechanicDecision = techInsp.decision;
                    mechanicTime = techInsp.createdAt;
                    const [mechUser] = await db.select({ fullName: users.fullName }).from(users).where(eq(users.id, techInsp.mechanicId)).limit(1);
                    mechanicName = mechUser?.fullName ?? null;
                }
            }

            // Get medic name via medInspection.medicId в†’ users.fullName
            let medicName: string | null = null;
            let medicDecision: string | null = null;
            let medicTime: Date | null = null;
            if (waybill.medInspectionId) {
                const [medInsp] = await db.select({ medicId: medInspections.medicId, decision: medInspections.decision, createdAt: medInspections.createdAt })
                    .from(medInspections).where(eq(medInspections.id, waybill.medInspectionId)).limit(1);
                if (medInsp) {
                    medicDecision = medInsp.decision;
                    medicTime = medInsp.createdAt;
                    const [medicUser] = await db.select({ fullName: users.fullName }).from(users).where(eq(users.id, medInsp.medicId)).limit(1);
                    medicName = medicUser?.fullName ?? null;
                }
            }

            // Order numbers linked to the trip
            const orderNumbers: string[] = [];
            if (trip) {
                const linkedOrders = await db.select({ number: ordersTable.number }).from(tripOrders).innerJoin(ordersTable, eq(tripOrders.orderId, ordersTable.id)).where(eq(tripOrders.tripId, trip.id));
                orderNumbers.push(...linkedOrders.map(o => o.number));
            }

            const pdfBuffer = await generateWaybillPdf({
                number: waybill.number,
                issuedAt: waybill.issuedAt,
                departureAt: waybill.departureAt,
                returnAt: waybill.returnAt,
                vehicleMake: vehicle?.make,
                vehicleModel: vehicle?.model,
                vehiclePlate: vehicle?.plateNumber,
                vehicleVin: vehicle?.vin,
                odometerOut: waybill.odometerOut ? Number(waybill.odometerOut) : null,
                odometerIn: waybill.odometerIn ? Number(waybill.odometerIn) : null,
                fuelOut: waybill.fuelOut ? Number(waybill.fuelOut) : null,
                fuelIn: waybill.fuelIn ? Number(waybill.fuelIn) : null,
                driverName: waybill.driver?.fullName,
                driverLicense: waybill.driver?.licenseNumber,
                mechanicName,
                mechanicDecision,
                mechanicTime,
                medicName,
                medicDecision,
                medicTime,
                tripNumber: trip?.number,
                loadingAddress: order?.order.loadingAddress,
                unloadingAddress: order?.order.unloadingAddress,
                orderNumbers,
                status: waybill.status,
                // \u041c\u0438\u043d\u0442\u0440\u0430\u043d\u0441 \u2116390
                driverSnils,
                issuedByName: waybill.issuedByName ?? null,
                issuedByPosition: waybill.issuedByPosition ?? null,
                validFrom: waybill.validFrom ?? null,
                validTo: waybill.validTo ?? null,
                transportServiceType: waybill.transportServiceType ?? null,
                transportMode: waybill.transportMode ?? null,
            });

            reply.header('Content-Type', 'application/pdf');
            reply.header('Content-Disposition', `attachment; filename="waybill_${waybill.number}.pdf"`);
            reply.header('Content-Length', pdfBuffer.length);
            return reply.send(pdfBuffer);
        } catch (error: any) {
            request.log.error(error);
            return reply.status(error.statusCode || 500).send({ success: false, error: safeClientError(error, 'Внутренняя ошибка сервера') });
        }
    });

    // ================================================================
    // ЭПД / ЭТрН вЂ” Электронная транспортная накладная (Sprint 6)
    // ================================================================
    const { generateETrN, generateETrNTitle4, encodeWindows1251 } = await import('./etrn-generator.js');
    const { trips, orders, vehicles: vehiclesTable, contractors, organizations: organizationsTable } = await import('../../db/schema.js');

    /**
     * GET /api/waybills/:id/etrn
     * Generate ЭТрН Титул 1 XML for a waybill
     */
    app.get('/waybills/:id/etrn', {
        schema: { tags: ['Путевые листы'], summary: 'XML ЭТрН', description: 'Электронная транспортная накладная в формате XML для ГИС ЭПД.' },
        preHandler: [app.authenticate, requireAbility('read', 'Waybill')],
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const { id } = request.params as { id: string };
            await assertWaybillAccess(id, request.user as { userId: string; roles: string[]; organizationId?: string | null });
            const waybill = await getWaybillById(id);
            if (!waybill) {
                return reply.status(404).send({ success: false, error: 'Путевой лист не найден' });
            }

            // C6 (CBO): субподряд-гейт ЭТрН — XML наёмного рейса выдавать нельзя
            // (раньше GET /etrn миновал assertEtrnAllowed, обходя sign/send-блок).
            const { assertEtrnAllowed } = await import('./etrn-guard.js');
            await assertEtrnAllowed(waybill.tripId);

            // Assemble ETrNInput from DB
            const { tripOrders } = await import('../../db/schema.js');
            const [trip] = await db.select().from(trips).where(eq(trips.id, waybill.tripId!)).limit(1);
            const [order] = trip ? await db.select({ order: orders }).from(tripOrders).innerJoin(orders, eq(tripOrders.orderId, orders.id)).where(eq(tripOrders.tripId, trip.id)).limit(1) : [null];
            const [vehicle] = waybill.vehicleId ? await db.select().from(vehiclesTable).where(eq(vehiclesTable.id, waybill.vehicleId)).limit(1) : [null];
            const [driver] = waybill.driverId ? await db.select().from(drivers).where(eq(drivers.id, waybill.driverId)).limit(1) : [null];
            const [contractor] = order?.order.contractorId ? await db.select().from(contractors).where(eq(contractors.id, order.order.contractorId)).limit(1) : [null];

            // P0-C3: перевозчик в ЭТрН — реквизиты ОРГАНИЗАЦИИ рейса, не глобальный
            // process.env.CARRIER_* (иначе в мульти-тенанте все ЭТрН заявляют одного
            // перевозчика / нулевой ИНН). Без ИНН организации ЭТрН выпускать нельзя.
            const [carrierOrg] = trip?.organizationId
                ? await db.select().from(organizationsTable).where(eq(organizationsTable.id, trip.organizationId)).limit(1)
                : [null];
            if (!carrierOrg?.inn) {
                return reply.status(422).send({
                    success: false,
                    code: 'CARRIER_REQUISITES_MISSING',
                    error: 'Не заполнены реквизиты организации-перевозчика (ИНН). Заполните их в Настройках → Реквизиты перед выпуском ЭТрН.',
                });
            }

            // Sprint 14: Use separate consignee contractor if specified on order
            const consigneeContractorId = order?.order.consigneeContractorId ?? order?.order.contractorId;
            const [consigneeContractor] = consigneeContractorId && consigneeContractorId !== order?.order.contractorId
                ? await db.select().from(contractors).where(eq(contractors.id, consigneeContractorId)).limit(1)
                : [contractor];

            const xml = generateETrN({
                waybillNumber: waybill.number || id.slice(0, 8),
                issuedAt: (waybill.issuedAt || new Date()).toISOString(),
                tripNumber: trip?.number || 'вЂ”',
                vehicleMake: vehicle?.make || 'вЂ”',
                vehicleModel: vehicle?.model || 'вЂ”',
                vehiclePlateNumber: vehicle?.plateNumber || 'вЂ”',
                vehicleVin: vehicle?.vin || undefined,
                driverFullName: driver?.fullName || 'вЂ”',
                driverLicenseNumber: driver?.licenseNumber || 'вЂ”',
                shipperName: contractor?.name || 'вЂ”',
                shipperInn: contractor?.inn || '0000000000',
                shipperAddress: contractor?.legalAddress || 'вЂ”',
                carrierName: carrierOrg.name,
                carrierInn: carrierOrg.inn,
                carrierKpp: carrierOrg.kpp || undefined,
                carrierAddress: carrierOrg.legalAddress || 'вЂ”',
                consigneeName: consigneeContractor?.name || order?.order.unloadingAddress || 'вЂ”',
                consigneeInn: consigneeContractor?.inn || '0000000000',
                consigneeKpp: consigneeContractor?.kpp || undefined,
                consigneeAddress: order?.order.unloadingAddress || 'вЂ”',
                cargoDescription: order?.order.cargoDescription || 'вЂ”',
                cargoWeight: order?.order.cargoWeightKg ? Number(order.order.cargoWeightKg) : undefined,
                loadingAddress: order?.order.loadingAddress || 'вЂ”',
                unloadingAddress: order?.order.unloadingAddress || 'вЂ”',
                odometerOut: waybill.odometerOut ? Number(waybill.odometerOut) : undefined,
            });

            const xmlBuffer = encodeWindows1251(xml);
            reply.header('Content-Type', 'application/xml; charset=windows-1251');
            reply.header('Content-Disposition', `attachment; filename="etrn_${waybill.number || id.slice(0, 8)}.xml"`);
            reply.header('Content-Length', xmlBuffer.length);
            return reply.send(xmlBuffer);
        } catch (error: any) {
            request.log.error(error);
            return reply.status(error.statusCode || 500).send({ success: false, error: safeClientError(error, 'Внутренняя ошибка сервера') });
        }
    });

    /**
     * GET /api/waybills/:id/etrn-title4
     * Generate ЭТрН Титул 4 XML (completion) for a waybill
     */
    app.get('/waybills/:id/etrn-title4', {
        schema: { tags: ['Путевые листы'], summary: 'XML ЭТрН Титул 4', description: 'Титул 4 (приёмка груза) ЭТрН в XML.' },
        preHandler: [app.authenticate, requireAbility('read', 'Waybill')],
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const { id } = request.params as { id: string };
            await assertWaybillAccess(id, request.user as { userId: string; roles: string[]; organizationId?: string | null });
            const waybill = await getWaybillById(id);
            if (!waybill) {
                return reply.status(404).send({ success: false, error: 'Путевой лист не найден' });
            }

            // C6 (CBO): субподряд-гейт ЭТрН — XML Титул 4 наёмного рейса выдавать нельзя.
            const { assertEtrnAllowed } = await import('./etrn-guard.js');
            await assertEtrnAllowed(waybill.tripId);

            const [vehicle] = waybill.vehicleId ? await db.select().from(vehiclesTable).where(eq(vehiclesTable.id, waybill.vehicleId)).limit(1) : [null];
            const [driver] = waybill.driverId ? await db.select().from(drivers).where(eq(drivers.id, waybill.driverId)).limit(1) : [null];
            const { tripOrders } = await import('../../db/schema.js');
            const [trip] = await db.select().from(trips).where(eq(trips.id, waybill.tripId!)).limit(1);
            const [order] = trip ? await db.select({ order: orders }).from(tripOrders).innerJoin(orders, eq(tripOrders.orderId, orders.id)).where(eq(tripOrders.tripId, trip.id)).limit(1) : [null];
            const [contractor] = order?.order.contractorId ? await db.select().from(contractors).where(eq(contractors.id, order.order.contractorId)).limit(1) : [null];

            // P0-C3: перевозчик — реквизиты организации рейса, не process.env.CARRIER_*.
            const [carrierOrg] = trip?.organizationId
                ? await db.select().from(organizationsTable).where(eq(organizationsTable.id, trip.organizationId)).limit(1)
                : [null];
            if (!carrierOrg?.inn) {
                return reply.status(422).send({
                    success: false,
                    code: 'CARRIER_REQUISITES_MISSING',
                    error: 'Не заполнены реквизиты организации-перевозчика (ИНН). Заполните их в Настройках → Реквизиты перед выпуском ЭТрН.',
                });
            }

            // Sprint 14: Use separate consignee contractor if specified
            const consigneeContractorId = order?.order.consigneeContractorId ?? order?.order.contractorId;
            const [consigneeContractor] = consigneeContractorId && consigneeContractorId !== order?.order.contractorId
                ? await db.select().from(contractors).where(eq(contractors.id, consigneeContractorId)).limit(1)
                : [contractor];

            // Sprint 13: Get cargo condition from delivery confirmation
            const [confirmation] = trip ? await db.select({ cargoCondition: deliveryConfirmations.cargoCondition })
                .from(deliveryConfirmations).where(eq(deliveryConfirmations.tripId, trip.id)).limit(1) : [null];

            const xml = generateETrNTitle4({
                waybillNumber: waybill.number || id.slice(0, 8),
                issuedAt: (waybill.issuedAt || new Date()).toISOString(),
                tripNumber: trip?.number || 'вЂ”',
                vehicleMake: vehicle?.make || 'вЂ”',
                vehicleModel: vehicle?.model || 'вЂ”',
                vehiclePlateNumber: vehicle?.plateNumber || 'вЂ”',
                driverFullName: driver?.fullName || 'вЂ”',
                driverLicenseNumber: driver?.licenseNumber || 'вЂ”',
                shipperName: contractor?.name || 'вЂ”',
                shipperInn: contractor?.inn || '0000000000',
                shipperAddress: contractor?.legalAddress || 'вЂ”',
                carrierName: carrierOrg.name,
                carrierInn: carrierOrg.inn,
                carrierKpp: carrierOrg.kpp || undefined,
                carrierAddress: carrierOrg.legalAddress || 'вЂ”',
                consigneeName: consigneeContractor?.name || order?.order.unloadingAddress || 'вЂ”',
                consigneeInn: consigneeContractor?.inn || '0000000000',
                consigneeKpp: consigneeContractor?.kpp || undefined,
                consigneeAddress: order?.order.unloadingAddress || 'вЂ”',
                cargoDescription: order?.order.cargoDescription || 'вЂ”',
                loadingAddress: order?.order.loadingAddress || 'вЂ”',
                unloadingAddress: order?.order.unloadingAddress || 'вЂ”',
                odometerIn: waybill.odometerIn ? Number(waybill.odometerIn) : undefined,
                cargoCondition: (confirmation?.cargoCondition as 'intact' | 'damaged' | 'partial') || undefined,
            });

            const xmlBuffer = encodeWindows1251(xml);
            reply.header('Content-Type', 'application/xml; charset=windows-1251');
            reply.header('Content-Disposition', `attachment; filename="etrn_t4_${waybill.number || id.slice(0, 8)}.xml"`);
            reply.header('Content-Length', xmlBuffer.length);
            return reply.send(xmlBuffer);
        } catch (error: any) {
            request.log.error(error);
            return reply.status(error.statusCode || 500).send({ success: false, error: safeClientError(error, 'Внутренняя ошибка сервера') });
        }
    });
}




