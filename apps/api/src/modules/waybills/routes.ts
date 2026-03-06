// ============================================================
// Waybills Routes — Путевые листы (§3.5)
// ============================================================
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireAbility } from '../../auth/rbac.js';
import {
    generateWaybill,
    closeWaybill,
    listWaybills,
    getWaybillById,
} from './service.js';
import { db } from '../../db/connection.js';
import { drivers } from '../../db/schema.js';
import { eq } from 'drizzle-orm';

// H-3: Resolve driverId from JWT userId (for RLS)
async function resolveDriverId(userId: string): Promise<string | null> {
    const [driver] = await db.select({ id: drivers.id })
        .from(drivers).where(eq(drivers.userId, userId)).limit(1);
    return driver?.id ?? null;
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
            const user = request.user as { userId: string; roles: string[] };
            const { page = '1', limit = '20' } = request.query as Record<string, string>;

            // H-3: RLS — drivers can only see their own waybills
            let rlsDriverId: string | undefined;
            if (user.roles.includes('driver')) {
                const myDriverId = await resolveDriverId(user.userId);
                if (!myDriverId) {
                    return reply.status(403).send({
                        success: false,
                        error: 'Отказано в доступе (профиль водителя не привязан)',
                    });
                }
                rlsDriverId = myDriverId;
            }

            const result = await listWaybills(parseInt(page), parseInt(limit), rlsDriverId);
            return { success: true, ...result };
        } catch (error: any) {
            request.log.error(error);
            return reply.status(500).send({
                success: false,
                error: error.message || 'Ошибка',
            });
        }
    });

    /**
     * GET /api/waybills/:id
     * Single waybill with related data
     */
    app.get('/waybills/:id', {
        schema: { tags: ['Путевые листы'], summary: 'Получить путевой лист', description: 'Детальная информация о путевом листе с данными рейса, ТС и водителя.' },
        preHandler: [app.authenticate, requireAbility('read', 'Waybill')],
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const user = request.user as { userId: string; roles: string[] };
            const { id } = request.params as { id: string };
            const waybill = await getWaybillById(id);
            if (!waybill) {
                return reply.status(404).send({
                    success: false,
                    error: 'Путевой лист не найден',
                });
            }

            // H-20: RLS - Drivers can only access their own waybills
            if (user.roles.includes('driver')) {
                const myDriverId = await resolveDriverId(user.userId);
                if (myDriverId && waybill.driverId !== myDriverId) {
                    return reply.status(403).send({
                        success: false,
                        error: 'Отказано в доступе (чужой путевой лист)',
                    });
                }
            }

            return { success: true, data: waybill };
        } catch (error: any) {
            request.log.error(error);
            return reply.status(500).send({
                success: false,
                error: error.message || 'Ошибка',
            });
        }
    });

    /**
     * POST /api/waybills/generate/:tripId
     * Generate waybill for a trip (requires both approvals)
     */
    app.post('/waybills/generate/:tripId', {
        schema: { tags: ['Путевые листы'], summary: 'Сформировать путевой лист', description: 'Автоматическое формирование путевого листа для рейса. Проверка наличия техосмотра и медосмотра.' },
        preHandler: [app.authenticate, requireAbility('create', 'Waybill')],
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const user = request.user as { userId: string; roles: string[] };
            const { tripId } = request.params as { tripId: string };

            const waybill = await generateWaybill(tripId, user.userId, user.roles[0]);
            return reply.status(201).send({ success: true, data: waybill });
        } catch (error: any) {
            request.log.error(error);
            const statusCode = error.statusCode || (error.message.includes('Нет допуска') ? 409 : 500);
            return reply.status(statusCode).send({
                success: false,
                error: error.message || 'Ошибка при формировании путевого листа',
            });
        }
    });

    /**
     * POST /api/waybills/:id/close
     * Close waybill (odometer, fuel, return time)
     */
    app.post('/waybills/:id/close', {
        schema: { tags: ['Путевые листы'], summary: 'Закрыть путевой лист', description: 'Закрытие путевого листа с финальными данными одометра и ГСМ.' },
        preHandler: [app.authenticate, requireAbility('update', 'Waybill')],
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const user = request.user as { userId: string; roles: string[] };
            const { id } = request.params as { id: string };
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
                error: error.message || 'Ошибка при закрытии путевого листа',
            });
        }
    });

    // ================================================================
    // ЭПД / ЭТрН — Электронная транспортная накладная (Sprint 6)
    // ================================================================
    const { generateETrN, generateETrNTitle4 } = await import('./etrn-generator.js');
    const { trips, orders, vehicles: vehiclesTable, contractors } = await import('../../db/schema.js');

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
            const waybill = await getWaybillById(id);
            if (!waybill) {
                return reply.status(404).send({ success: false, error: 'Путевой лист не найден' });
            }

            // Assemble ETrNInput from DB
            const [trip] = await db.select().from(trips).where(eq(trips.id, waybill.tripId!)).limit(1);
            const [order] = trip ? await db.select().from(orders).where(eq(orders.tripId, trip.id)).limit(1) : [null];
            const [vehicle] = waybill.vehicleId ? await db.select().from(vehiclesTable).where(eq(vehiclesTable.id, waybill.vehicleId)).limit(1) : [null];
            const [driver] = waybill.driverId ? await db.select().from(drivers).where(eq(drivers.id, waybill.driverId)).limit(1) : [null];
            const [contractor] = order?.contractorId ? await db.select().from(contractors).where(eq(contractors.id, order.contractorId)).limit(1) : [null];

            const xml = generateETrN({
                waybillNumber: waybill.number || id.slice(0, 8),
                issuedAt: (waybill.issuedAt || new Date()).toISOString(),
                tripNumber: trip?.number || '—',
                vehicleMake: vehicle?.make || '—',
                vehicleModel: vehicle?.model || '—',
                vehiclePlateNumber: vehicle?.plateNumber || '—',
                vehicleVin: vehicle?.vin || undefined,
                driverFullName: driver?.fullName || '—',
                driverLicenseNumber: driver?.licenseNumber || '—',
                shipperName: contractor?.name || '—',
                shipperInn: contractor?.inn || '0000000000',
                shipperAddress: contractor?.legalAddress || '—',
                carrierName: process.env.CARRIER_NAME || 'ООО «ТМС Логистик»',
                carrierInn: process.env.CARRIER_INN || '0000000000',
                carrierAddress: process.env.CARRIER_ADDRESS || 'г. Москва',
                consigneeName: order?.unloadingAddress || '—',
                consigneeInn: '0000000000',
                consigneeAddress: order?.unloadingAddress || '—',
                cargoDescription: order?.cargoDescription || '—',
                cargoWeight: order?.cargoWeightKg ? Number(order.cargoWeightKg) : undefined,
                loadingAddress: order?.loadingAddress || '—',
                unloadingAddress: order?.unloadingAddress || '—',
                odometerOut: waybill.odometerOut ? Number(waybill.odometerOut) : undefined,
            });

            reply.header('Content-Type', 'application/xml; charset=utf-8');
            reply.header('Content-Disposition', `attachment; filename="etrn_${waybill.number || id.slice(0, 8)}.xml"`);
            return xml;
        } catch (error: any) {
            request.log.error(error);
            return reply.status(500).send({ success: false, error: error.message });
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
            const waybill = await getWaybillById(id);
            if (!waybill) {
                return reply.status(404).send({ success: false, error: 'Путевой лист не найден' });
            }

            const [vehicle] = waybill.vehicleId ? await db.select().from(vehiclesTable).where(eq(vehiclesTable.id, waybill.vehicleId)).limit(1) : [null];
            const [driver] = waybill.driverId ? await db.select().from(drivers).where(eq(drivers.id, waybill.driverId)).limit(1) : [null];
            const [trip] = await db.select().from(trips).where(eq(trips.id, waybill.tripId!)).limit(1);
            const [order] = trip ? await db.select().from(orders).where(eq(orders.tripId, trip.id)).limit(1) : [null];

            const xml = generateETrNTitle4({
                waybillNumber: waybill.number || id.slice(0, 8),
                issuedAt: (waybill.issuedAt || new Date()).toISOString(),
                tripNumber: trip?.number || '—',
                vehicleMake: vehicle?.make || '—',
                vehicleModel: vehicle?.model || '—',
                vehiclePlateNumber: vehicle?.plateNumber || '—',
                driverFullName: driver?.fullName || '—',
                driverLicenseNumber: driver?.licenseNumber || '—',
                shipperName: '—', shipperInn: '0000000000', shipperAddress: '—',
                carrierName: process.env.CARRIER_NAME || 'ООО «ТМС Логистик»',
                carrierInn: process.env.CARRIER_INN || '0000000000',
                carrierAddress: process.env.CARRIER_ADDRESS || 'г. Москва',
                consigneeName: '—', consigneeInn: '0000000000', consigneeAddress: '—',
                cargoDescription: order?.cargoDescription || '—',
                loadingAddress: order?.loadingAddress || '—',
                unloadingAddress: order?.unloadingAddress || '—',
                odometerIn: waybill.odometerIn ? Number(waybill.odometerIn) : undefined,
            });

            reply.header('Content-Type', 'application/xml; charset=utf-8');
            reply.header('Content-Disposition', `attachment; filename="etrn_t4_${waybill.number || id.slice(0, 8)}.xml"`);
            return xml;
        } catch (error: any) {
            request.log.error(error);
            return reply.status(500).send({ success: false, error: error.message });
        }
    });
}
