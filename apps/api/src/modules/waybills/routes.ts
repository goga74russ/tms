// ============================================================
// Waybills Routes вЂ” РџСѓС‚РµРІС‹Рµ Р»РёСЃС‚С‹ (В§3.5)
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
} from './service.js';
import { db } from '../../db/connection.js';
import { drivers, waybills, waybillAttachments, deliveryConfirmations } from '../../db/schema.js';
import { and, eq } from 'drizzle-orm';
import { hasPrivilege } from '@tms/shared';

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
        schema: { tags: ['РџСѓС‚РµРІС‹Рµ Р»РёСЃС‚С‹'], summary: 'РЎРїРёСЃРѕРє РїСѓС‚РµРІС‹С… Р»РёСЃС‚РѕРІ', description: 'Р’СЃРµ РїСѓС‚РµРІС‹Рµ Р»РёСЃС‚С‹ СЃ РїР°РіРёРЅР°С†РёРµР№.' },
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
                        error: 'РћС‚РєР°Р·Р°РЅРѕ РІ РґРѕСЃС‚СѓРїРµ (РїСЂРѕС„РёР»СЊ РІРѕРґРёС‚РµР»СЏ РЅРµ РїСЂРёРІСЏР·Р°РЅ)',
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
                error: error.message || 'РћС€РёР±РєР°',
            });
        }
    });

    /**
     * GET /api/waybills/:id
     * Single waybill with related data
     */
    app.get('/waybills/:id', {
        schema: { tags: ['РџСѓС‚РµРІС‹Рµ Р»РёСЃС‚С‹'], summary: 'РџРѕР»СѓС‡РёС‚СЊ РїСѓС‚РµРІРѕР№ Р»РёСЃС‚', description: 'Р”РµС‚Р°Р»СЊРЅР°СЏ РёРЅС„РѕСЂРјР°С†РёСЏ Рѕ РїСѓС‚РµРІРѕРј Р»РёСЃС‚Рµ СЃ РґР°РЅРЅС‹РјРё СЂРµР№СЃР°, РўРЎ Рё РІРѕРґРёС‚РµР»СЏ.' },
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
                error: error.message || 'РћС€РёР±РєР°',
            });
        }
    });

    /**
     * POST /api/waybills/generate/:tripId
     * Generate waybill for a trip (requires both approvals)
     */
    app.post('/waybills/generate/:tripId', {
        schema: { tags: ['РџСѓС‚РµРІС‹Рµ Р»РёСЃС‚С‹'], summary: 'РЎС„РѕСЂРјРёСЂРѕРІР°С‚СЊ РїСѓС‚РµРІРѕР№ Р»РёСЃС‚', description: 'РђРІС‚РѕРјР°С‚РёС‡РµСЃРєРѕРµ С„РѕСЂРјРёСЂРѕРІР°РЅРёРµ РїСѓС‚РµРІРѕРіРѕ Р»РёСЃС‚Р° РґР»СЏ СЂРµР№СЃР°. РџСЂРѕРІРµСЂРєР° РЅР°Р»РёС‡РёСЏ С‚РµС…РѕСЃРјРѕС‚СЂР° Рё РјРµРґРѕСЃРјРѕС‚СЂР°.' },
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
            const statusCode = error.statusCode || (error.message.includes('РќРµС‚ РґРѕРїСѓСЃРєР°') ? 409 : 500);
            return reply.status(statusCode).send({
                success: false,
                error: error.message || 'РћС€РёР±РєР° РїСЂРё С„РѕСЂРјРёСЂРѕРІР°РЅРёРё РїСѓС‚РµРІРѕРіРѕ Р»РёСЃС‚Р°',
            });
        }
    });

    /**
     * POST /api/waybills/:id/close
     * Close waybill (odometer, fuel, return time)
     */
    app.post('/waybills/:id/close', {
        schema: { tags: ['РџСѓС‚РµРІС‹Рµ Р»РёСЃС‚С‹'], summary: 'Р—Р°РєСЂС‹С‚СЊ РїСѓС‚РµРІРѕР№ Р»РёСЃС‚', description: 'Р—Р°РєСЂС‹С‚РёРµ РїСѓС‚РµРІРѕРіРѕ Р»РёСЃС‚Р° СЃ С„РёРЅР°Р»СЊРЅС‹РјРё РґР°РЅРЅС‹РјРё РѕРґРѕРјРµС‚СЂР° Рё Р“РЎРњ.' },
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
                    error: 'РћР±СЏР·Р°С‚РµР»СЊРЅРѕРµ РїРѕР»Рµ: odometerIn',
                });
            }

            const waybill = await closeWaybill(id, body, user.userId, user.roles[0]);
            return { success: true, data: waybill };
        } catch (error: any) {
            request.log.error(error);
            const statusCode = error.statusCode || (error.message.includes('СѓР¶Рµ Р·Р°РєСЂС‹С‚') ? 400 : error.message.includes('РЅРµ РЅР°Р№РґРµРЅ') ? 404 : 500);
            return reply.status(statusCode).send({
                success: false,
                error: error.message || 'РћС€РёР±РєР° РїСЂРё Р·Р°РєСЂС‹С‚РёРё РїСѓС‚РµРІРѕРіРѕ Р»РёСЃС‚Р°',
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
            return reply.status(statusCode).send({ success: false, error: error.message || 'Failed to load attachments' });
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
            return reply.status(statusCode).send({ success: false, error: error.message || 'Failed to upload attachment' });
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
            return reply.status(statusCode).send({ success: false, error: error.message || 'Failed to delete attachment' });
        }
    });
    // ================================================================
    // PDF вЂ” РџСѓС‚РµРІРѕР№ Р»РёСЃС‚
    // ================================================================
    const { generateWaybillPdf } = await import('../documents/waybill-pdf.js');

    /**
     * GET /api/waybills/:id/pdf
     * Download waybill as PDF (Р¤.4-Рџ)
     */
    app.get('/waybills/:id/pdf', {
        schema: { tags: ['РџСѓС‚РµРІС‹Рµ Р»РёСЃС‚С‹'], summary: 'PDF РїСѓС‚РµРІРѕРіРѕ Р»РёСЃС‚Р°', description: 'РЎРєР°С‡Р°С‚СЊ РїСѓС‚РµРІРѕР№ Р»РёСЃС‚ РІ С„РѕСЂРјР°С‚Рµ PDF (С„РѕСЂРјР° Р¤.4-Рџ).' },
        preHandler: [app.authenticate, requireAbility('read', 'Waybill')],
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const { id } = request.params as { id: string };
            const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
            await assertWaybillAccess(id, user);
            const waybill = await getWaybillById(id);
            if (!waybill) {
                return reply.status(404).send({ success: false, error: 'РџСѓС‚РµРІРѕР№ Р»РёСЃС‚ РЅРµ РЅР°Р№РґРµРЅ' });
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
                issuedByName: (waybill as any).issuedByName ?? null,
                issuedByPosition: (waybill as any).issuedByPosition ?? null,
                validFrom: (waybill as any).validFrom ?? null,
                validTo: (waybill as any).validTo ?? null,
                transportServiceType: (waybill as any).transportServiceType ?? null,
                transportMode: (waybill as any).transportMode ?? null,
            });

            reply.header('Content-Type', 'application/pdf');
            reply.header('Content-Disposition', `attachment; filename="waybill_${waybill.number}.pdf"`);
            reply.header('Content-Length', pdfBuffer.length);
            return reply.send(pdfBuffer);
        } catch (error: any) {
            request.log.error(error);
            return reply.status(error.statusCode || 500).send({ success: false, error: error.message });
        }
    });

    // ================================================================
    // Р­РџР” / Р­РўСЂРќ вЂ” Р­Р»РµРєС‚СЂРѕРЅРЅР°СЏ С‚СЂР°РЅСЃРїРѕСЂС‚РЅР°СЏ РЅР°РєР»Р°РґРЅР°СЏ (Sprint 6)
    // ================================================================
    const { generateETrN, generateETrNTitle4, encodeWindows1251 } = await import('./etrn-generator.js');
    const { trips, orders, vehicles: vehiclesTable, contractors } = await import('../../db/schema.js');

    /**
     * GET /api/waybills/:id/etrn
     * Generate Р­РўСЂРќ РўРёС‚СѓР» 1 XML for a waybill
     */
    app.get('/waybills/:id/etrn', {
        schema: { tags: ['РџСѓС‚РµРІС‹Рµ Р»РёСЃС‚С‹'], summary: 'XML Р­РўСЂРќ', description: 'Р­Р»РµРєС‚СЂРѕРЅРЅР°СЏ С‚СЂР°РЅСЃРїРѕСЂС‚РЅР°СЏ РЅР°РєР»Р°РґРЅР°СЏ РІ С„РѕСЂРјР°С‚Рµ XML РґР»СЏ Р“РРЎ Р­РџР”.' },
        preHandler: [app.authenticate, requireAbility('read', 'Waybill')],
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const { id } = request.params as { id: string };
            await assertWaybillAccess(id, request.user as { userId: string; roles: string[]; organizationId?: string | null });
            const waybill = await getWaybillById(id);
            if (!waybill) {
                return reply.status(404).send({ success: false, error: 'РџСѓС‚РµРІРѕР№ Р»РёСЃС‚ РЅРµ РЅР°Р№РґРµРЅ' });
            }

            // Assemble ETrNInput from DB
            const { tripOrders } = await import('../../db/schema.js');
            const [trip] = await db.select().from(trips).where(eq(trips.id, waybill.tripId!)).limit(1);
            const [order] = trip ? await db.select({ order: orders }).from(tripOrders).innerJoin(orders, eq(tripOrders.orderId, orders.id)).where(eq(tripOrders.tripId, trip.id)).limit(1) : [null];
            const [vehicle] = waybill.vehicleId ? await db.select().from(vehiclesTable).where(eq(vehiclesTable.id, waybill.vehicleId)).limit(1) : [null];
            const [driver] = waybill.driverId ? await db.select().from(drivers).where(eq(drivers.id, waybill.driverId)).limit(1) : [null];
            const [contractor] = order?.order.contractorId ? await db.select().from(contractors).where(eq(contractors.id, order.order.contractorId)).limit(1) : [null];

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
                carrierName: process.env.CARRIER_NAME || 'РћРћРћ В«РўРњРЎ Р›РѕРіРёСЃС‚РёРєВ»',
                carrierInn: process.env.CARRIER_INN || '0000000000',
                carrierAddress: process.env.CARRIER_ADDRESS || 'Рі. РњРѕСЃРєРІР°',
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
            return reply.status(error.statusCode || 500).send({ success: false, error: error.message });
        }
    });

    /**
     * GET /api/waybills/:id/etrn-title4
     * Generate Р­РўСЂРќ РўРёС‚СѓР» 4 XML (completion) for a waybill
     */
    app.get('/waybills/:id/etrn-title4', {
        schema: { tags: ['РџСѓС‚РµРІС‹Рµ Р»РёСЃС‚С‹'], summary: 'XML Р­РўСЂРќ РўРёС‚СѓР» 4', description: 'РўРёС‚СѓР» 4 (РїСЂРёС‘РјРєР° РіСЂСѓР·Р°) Р­РўСЂРќ РІ XML.' },
        preHandler: [app.authenticate, requireAbility('read', 'Waybill')],
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const { id } = request.params as { id: string };
            await assertWaybillAccess(id, request.user as { userId: string; roles: string[]; organizationId?: string | null });
            const waybill = await getWaybillById(id);
            if (!waybill) {
                return reply.status(404).send({ success: false, error: 'РџСѓС‚РµРІРѕР№ Р»РёСЃС‚ РЅРµ РЅР°Р№РґРµРЅ' });
            }

            const [vehicle] = waybill.vehicleId ? await db.select().from(vehiclesTable).where(eq(vehiclesTable.id, waybill.vehicleId)).limit(1) : [null];
            const [driver] = waybill.driverId ? await db.select().from(drivers).where(eq(drivers.id, waybill.driverId)).limit(1) : [null];
            const { tripOrders } = await import('../../db/schema.js');
            const [trip] = await db.select().from(trips).where(eq(trips.id, waybill.tripId!)).limit(1);
            const [order] = trip ? await db.select({ order: orders }).from(tripOrders).innerJoin(orders, eq(tripOrders.orderId, orders.id)).where(eq(tripOrders.tripId, trip.id)).limit(1) : [null];
            const [contractor] = order?.order.contractorId ? await db.select().from(contractors).where(eq(contractors.id, order.order.contractorId)).limit(1) : [null];

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
                carrierName: process.env.CARRIER_NAME || 'РћРћРћ В«РўРњРЎ Р›РѕРіРёСЃС‚РёРєВ»',
                carrierInn: process.env.CARRIER_INN || '0000000000',
                carrierAddress: process.env.CARRIER_ADDRESS || 'Рі. РњРѕСЃРєРІР°',
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
            return reply.status(error.statusCode || 500).send({ success: false, error: error.message });
        }
    });
}




