import { FastifyPluginAsync } from 'fastify';
import { requireAbility } from '../../auth/rbac.js';
import { assertDriverAccess, assertOrderAccess, assertTrailerAccess, assertTripAccess, assertVehicleAccess, resolveContractorId } from '../../auth/guards.js';
import {
    createTrip,
    getTrips,
    getTripById,
    getTransportDossier,
    updateTrip,
    assignTrip,
    changeTripStatus,
    getRoutePoints,
    addRoutePoint,
    updateRoutePoint,
    deleteRoutePoint,
    getAvailableVehicles,
    getAvailableDrivers,
    createDeliveryConfirmation,
    getDeliveryConfirmation,
} from './service.js';
import {
    getPersistedTransportDocumentById,
    recordTransportDocumentSignature,
    recordTransportDocumentSignatureRefusal,
    registerTransportDocumentProviderCallback,
    retryTransportDocument,
    sendTransportDocumentToProvider,
    syncTransportDocumentsForTrip,
    updatePersistedTransportDocumentStatus,
} from './transport-documents-store.js';
import { db } from '../../db/connection.js';
import { drivers, orders, documentDossierItems, trips, waybills, odometerReadings, routePoints } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { recordEvent } from '../../events/journal.js';
import { z } from 'zod';
import { getTripLoadPlan } from '../operational-core/service.js';
import { registerTripCompatibilityRoutes } from '../operational-core/compatibility-routes.js';
import { assignLotToTrip, captureShipmentFact } from '../operational-core/write-service.js';
import { registerExecutionRoutes } from '../operational-core/execution-routes.js';
import { evaluateDossierCloseGate, getDossierItemsForTrip, syncDossierItemsForTrip } from '../operational-core/dossier-service.js';
import {
    TripCreateSchema,
    TripUpdateSchema,
    RoutePointSchema,
    DeliveryConfirmationCreateSchema,
    TransportDocumentExchangeDirection,
    TransportDocumentExchangeStatus,
    TransportDocumentReceiptType,
    TransportDocumentStatus,
    hasPrivilege,
} from '@tms/shared';

// H-3: Resolve driverId from JWT userId (for RLS)
async function resolveDriverId(userId: string): Promise<string | null> {
    const [driver] = await db.select({ id: drivers.id })
        .from(drivers).where(eq(drivers.userId, userId)).limit(1);
    return driver?.id ?? null;
}

const tripsRoutes: FastifyPluginAsync = async (app) => {
    registerExecutionRoutes(app);

    registerTripCompatibilityRoutes(app);

    // --- GET /trips вЂ” list with pagination & filters (RLS: driver sees own, client sees own) ---
    app.get('/trips', {
        schema: { tags: ['Рейсы'], summary: 'Список рейсов', description: 'Получить все рейсы с фильтрацией по статусу, ТС, водителю, дате. Пагинация. RLS для водителей/клиентов.' },
        preHandler: [app.authenticate, requireAbility('read', 'Trip')],
    }, async (request) => {
        const user = request.user as { userId: string; roles: string[]; organizationId?: string };
        const query = request.query as {
            status?: string;
            vehicleId?: string;
            driverId?: string;
            dateFrom?: string;
            dateTo?: string;
            page?: string;
            limit?: string;
        };

        const privileged = hasPrivilege(user.roles);

        // H-3: RLS вЂ” drivers can only see their own trips
        let rlsDriverId = query.driverId;
        if (!privileged && user.roles.includes('driver')) {
            const myDriverId = await resolveDriverId(user.userId);
            if (myDriverId) rlsDriverId = myDriverId;
        }

        // RLS: client can only see trips linked to their orders
        let rlsTripIds: string[] | undefined;
        if (!privileged && user.roles.includes('client')) {
            const myContractorId = await resolveContractorId(user.userId);
            if (!myContractorId) return { success: true, data: [], total: 0, page: 1, limit: 20 };
            const clientOrders = await db.select({ tripId: orders.tripId })
                .from(orders).where(eq(orders.contractorId, myContractorId));
            rlsTripIds = clientOrders.map((o: any) => o.tripId).filter(Boolean);
            if ((rlsTripIds?.length ?? 0) === 0) return { success: true, data: [], total: 0, page: 1, limit: 20 };
        }

        const result = await getTrips({
            status: query.status,
            vehicleId: query.vehicleId,
            driverId: rlsDriverId,
            dateFrom: query.dateFrom,
            dateTo: query.dateTo,
            page: query.page ? parseInt(query.page, 10) : undefined,
            limit: query.limit ? parseInt(query.limit, 10) : undefined,
            tripIds: rlsTripIds,
            organizationId: user.organizationId,
        });

        return { success: true, ...result };
    });

    // --- GET /trips/available-vehicles ---
    app.get('/trips/available-vehicles', {
        schema: { tags: ['Рейсы'], summary: 'Доступные ТС', description: 'Список ТС со статусом available для назначения на рейс.' },
        preHandler: [app.authenticate, requireAbility('read', 'Vehicle')],
    }, async (request) => {
        const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
        const vehicles = await getAvailableVehicles(user.organizationId);
        return { success: true, data: vehicles };
    });

    // --- GET /trips/available-drivers ---
    app.get('/trips/available-drivers', {
        schema: { tags: ['Рейсы'], summary: 'Доступные водители', description: 'Список активных водителей для назначения на рейс.' },
        preHandler: [app.authenticate, requireAbility('read', 'Driver')],
    }, async (request) => {
        const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
        const drivers = await getAvailableDrivers(user.organizationId);
        return { success: true, data: drivers };
    });

    // --- POST /trips/:id/lot-assignments — assign a shipment lot or partial quantity to a trip ---
    app.post('/trips/:id/lot-assignments', {
        schema: { tags: ['Рейсы'], summary: 'Назначить партию в рейс' },
        preHandler: [app.authenticate, requireAbility('update', 'Trip')],
    }, async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
            await assertTripAccess(id, user);
            const result = await assignLotToTrip(id, request.body as { shipmentLotId: string; assignedWeightKg?: number; assignedVolumeM3?: number; assignedPlaces?: number; allowOverCapacity?: boolean }, { userId: user.userId, role: user.roles[0], organizationId: user.organizationId });
            return reply.status(201).send({ success: true, data: result });
        } catch (err: any) {
            return reply.status(400).send({ success: false, error: err.message });
        }
    });

    // --- POST /trips/:id/shipment-facts — loading/unloading/discrepancy evidence ---
    app.post('/trips/:id/shipment-facts', {
        schema: { tags: ['Рейсы'], summary: 'Зафиксировать факт по партии' },
        preHandler: [app.authenticate, requireAbility('update', 'Trip')],
    }, async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
            await assertTripAccess(id, user);
            const result = await captureShipmentFact(id, request.body as any, { userId: user.userId, role: user.roles[0], organizationId: user.organizationId });
            return reply.status(201).send({ success: true, data: result });
        } catch (err: any) {
            return reply.status(400).send({ success: false, error: err.message });
        }
    });

    // --- GET /trips/:id/load-plan — Operational Core v2 read model ---
    app.get('/trips/:id/load-plan', {
        schema: { tags: ['Рейсы'], summary: 'План загрузки рейса', description: 'Партии/назначения рейса, остатки и capacity summary.' },
        preHandler: [app.authenticate, requireAbility('read', 'Trip')],
    }, async (request, reply) => {
        const { id } = request.params as { id: string };
        const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
        await assertTripAccess(id, user);

        const loadPlan = await getTripLoadPlan(id, user.organizationId);
        if (!loadPlan) {
            return reply.status(404).send({ success: false, error: 'Рейс не найден' });
        }

        return { success: true, data: loadPlan };
    });

    // --- GET /trips/:id ---
    app.get('/trips/:id', {
        schema: { tags: ['Рейсы'], summary: 'Получить рейс', description: 'Детальная информация о рейсе по ID с привязанными заявками.' },
        preHandler: [app.authenticate, requireAbility('read', 'Trip')],
    }, async (request, reply) => {
        const { id } = request.params as { id: string };
        const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
        await assertTripAccess(id, user);
        const trip = await getTripById(id);

        if (!trip) {
            return reply.status(404).send({ success: false, error: 'Рейс не найден' });
        }

        return { success: true, data: trip };
    });

    // --- POST /trips вЂ” create ---
    app.post('/trips', {
        schema: { tags: ['Рейсы'], summary: 'Создать рейс', description: 'Создание нового рейса. Автогенерация номера. Валидация Zod.' },
        preHandler: [app.authenticate, requireAbility('create', 'Trip')],
    }, async (request, reply) => {
        try {
            const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
            const body = request.body as { orderIds?: string[]; orders?: string[]; [key: string]: unknown };

            // Accept both the new orderIds field and the legacy orders alias from the dispatcher UI.
            const orderIds = Array.isArray(body.orderIds)
                ? body.orderIds
                : Array.isArray(body.orders)
                    ? body.orders
                    : undefined;

            // H-4: Zod validation for trip creation
            const parsed = TripCreateSchema.safeParse({
                ...body,
                createdBy: user.userId,
            });
            if (!parsed.success) return reply.status(400).send({ success: false, error: 'Validation failed', details: parsed.error.flatten() });
            if (parsed.data.vehicleId) await assertVehicleAccess(parsed.data.vehicleId, user);
            if (parsed.data.driverId) await assertDriverAccess(parsed.data.driverId, user);
            if (parsed.data.trailerId) await assertTrailerAccess(parsed.data.trailerId, user);
            for (const orderId of orderIds ?? []) {
                await assertOrderAccess(orderId, user);
            }

            const trip = await createTrip(
                { ...(parsed.data as z.infer<typeof TripCreateSchema>), orderIds },
                { userId: user.userId, role: user.roles[0], organizationId: user.organizationId },
            );

            return reply.status(201).send({ success: true, data: trip });
        } catch (err: any) {
            return reply.status(400).send({ success: false, error: err.message });
        }
    });

    // --- PUT /trips/:id вЂ” update ---
    app.put('/trips/:id', {
        schema: { tags: ['Рейсы'], summary: 'Обновить рейс', description: 'Частичное обновление рейса (маршрут, плановые данные).' },
        preHandler: [app.authenticate, requireAbility('update', 'Trip')],
    }, async (request, reply) => {
        const { id } = request.params as { id: string };
        const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
        await assertTripAccess(id, user);
        const parseResult = TripUpdateSchema.safeParse(request.body);
        if (!parseResult.success) {
            return reply.status(400).send({
                success: false,
                error: 'Ошибка валидации',
                details: parseResult.error.flatten().fieldErrors,
            });
        }
        if (parseResult.data.vehicleId) await assertVehicleAccess(parseResult.data.vehicleId, user);
        if (parseResult.data.driverId) await assertDriverAccess(parseResult.data.driverId, user);
        if (parseResult.data.trailerId) await assertTrailerAccess(parseResult.data.trailerId, user);

        const trip = await updateTrip(id, parseResult.data);
        if (!trip) {
            return reply.status(404).send({ success: false, error: 'Рейс не найден' });
        }

        return { success: true, data: trip };
    });

    // --- POST /trips/:id/assign вЂ” assign vehicle + driver ---
    app.post('/trips/:id/assign', {
        schema: { tags: ['Рейсы'], summary: 'Назначить ТС/водителя', description: 'Привязка транспортного средства Рё водителя к рейсу. Проверка доступности.' },
        preHandler: [app.authenticate, requireAbility('update', 'Trip')],
    }, async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
            await assertTripAccess(id, user);
            const body = request.body as { vehicleId: string; driverId: string; trailerId?: string };

            if (!body.vehicleId || !body.driverId) {
                return reply.status(400).send({
                    success: false,
                    error: 'vehicleId Рё driverId обязательны',
                });
            }
            await assertVehicleAccess(body.vehicleId, user);
            await assertDriverAccess(body.driverId, user);
            if (body.trailerId) await assertTrailerAccess(body.trailerId, user);

            const result = await assignTrip(id, body.vehicleId, body.driverId, {
                userId: user.userId,
                role: user.roles[0],
                organizationId: user.organizationId,
            }, body.trailerId);

            const hardBlocks = result.warnings.filter(w => w.type === 'hard');
            if (hardBlocks.length > 0) {
                return reply.status(409).send({
                    success: false,
                    error: 'Назначение заблокировано',
                    data: { warnings: result.warnings },
                });
            }

            return {
                success: true,
                data: result.trip,
                warnings: result.warnings.filter(w => w.type === 'soft'),
            };
        } catch (err: any) {
            return reply.status(400).send({ success: false, error: err.message });
        }
    });

    // --- POST /trips/:id/status вЂ” advance status ---
    app.post('/trips/:id/status', {
        schema: { tags: ['Рейсы'], summary: 'Сменить статус', description: 'Переход по state machine рейса (planningв†’assignedв†’inspectionв†’вЂ¦в†’completed). Валидация переходов.' },
        preHandler: [app.authenticate, requireAbility('update', 'Trip')],
    }, async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
            await assertTripAccess(id, user);
            const body = request.body as {
                status: string;
                odometerStart?: number;
                odometerEnd?: number;
                fuelEnd?: number;
            };

            if (!body.status) {
                return reply.status(400).send({
                    success: false,
                    error: 'status обязателен',
                });
            }

            const trip = await changeTripStatus(id, body.status, {
                userId: user.userId,
                role: user.roles[0],
                organizationId: user.organizationId,
            }, body);

            return { success: true, data: trip };
        } catch (err: any) {
            return reply.status(400).send({ success: false, error: err.message });
        }
    });

    // --- POST /trips/:id/cancel ---
    app.post('/trips/:id/cancel', {
        schema: { tags: ['Рейсы'], summary: 'Отменить рейс', description: 'Отмена рейса с указанием причины. Освобождение ТС Рё водителя.' },
        preHandler: [app.authenticate, requireAbility('update', 'Trip')],
    }, async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
            await assertTripAccess(id, user);
            const body = request.body as { reason?: string };

            const trip = await changeTripStatus(id, 'cancelled', {
                userId: user.userId,
                role: user.roles[0],
                organizationId: user.organizationId,
            }, { reason: body?.reason });

            return { success: true, data: trip };
        } catch (err: any) {
            return reply.status(400).send({ success: false, error: err.message });
        }
    });

    // ================================================================
    // Wave 1 — Trip start/complete with odometer readings
    // ================================================================

    const TripStartSchema = z.object({
        odometerStart: z.number().positive(),
    });

    const TripCompleteSchema = z.object({
        odometerEnd: z.number().positive(),
        notes: z.string().max(2000).optional(),
    });

    // POST /api/trips/:id/start — выезд из гаража: фиксация одометра, перевод в in_transit
    app.post('/trips/:id/start', {
        schema: { tags: ['Рейсы'], summary: 'Начать рейс', description: 'Фиксация выезда: проверка путевого листа, запись стартового одометра, переход trip → in_transit (через loading).' },
        preHandler: [app.authenticate, requireAbility('manage', 'Trip')],
    }, async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
            await assertTripAccess(id, user);

            const parsed = TripStartSchema.safeParse(request.body);
            if (!parsed.success) {
                return reply.status(400).send({ success: false, error: 'Validation failed', details: parsed.error.flatten() });
            }

            const [trip] = await db.select().from(trips).where(eq(trips.id, id)).limit(1);
            if (!trip) return reply.status(404).send({ success: false, error: 'Рейс не найден' });
            if (trip.status !== 'waybill_issued') {
                return reply.status(409).send({ success: false, error: `Рейс должен быть в статусе waybill_issued (текущий: ${trip.status})` });
            }

            const [waybill] = await db.select().from(waybills).where(eq(waybills.tripId, id)).limit(1);
            if (!waybill || waybill.status !== 'issued') {
                return reply.status(409).send({ success: false, error: 'Путевой лист должен быть в статусе issued' });
            }

            const ctx = { userId: user.userId, role: user.roles[0], organizationId: user.organizationId };
            // waybill_issued → loading → in_transit (state machine forbids direct waybill_issued → in_transit)
            await changeTripStatus(id, 'loading', ctx);
            const updatedTrip = await changeTripStatus(id, 'in_transit', ctx, { odometerStart: parsed.data.odometerStart });

            // Update waybill.odometerOut to reflect odometerStart if not already set
            if (waybill.odometerOut == null || waybill.odometerOut === 0) {
                await db.update(waybills)
                    .set({ odometerOut: parsed.data.odometerStart })
                    .where(eq(waybills.id, waybill.id));
            }

            // Record odometer reading (best-effort)
            if (trip.vehicleId) {
                await db.insert(odometerReadings).values({
                    vehicleId: trip.vehicleId,
                    recordedAt: new Date(),
                    valueKm: parsed.data.odometerStart,
                    source: 'waybill',
                    tripId: id,
                    driverId: trip.driverId,
                    organizationId: user.organizationId ?? null,
                    createdBy: user.userId,
                });
            }

            await recordEvent({
                authorId: user.userId,
                authorRole: user.roles[0] ?? 'driver',
                eventType: 'trip.started',
                entityType: 'trip',
                entityId: id,
                data: { odometerStart: parsed.data.odometerStart },
            });

            return { success: true, data: updatedTrip };
        } catch (err: any) {
            return reply.status(400).send({ success: false, error: err.message });
        }
    });

    // POST /api/trips/:id/complete — финальный одометр, перевод в completed (waybill → closed)
    app.post('/trips/:id/complete', {
        schema: { tags: ['Рейсы'], summary: 'Завершить рейс', description: 'Фиксация возврата: проверка маршрутных точек, запись финального одометра, переход trip → completed, путевой лист → closed.' },
        preHandler: [app.authenticate, requireAbility('manage', 'Trip')],
    }, async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
            await assertTripAccess(id, user);

            const parsed = TripCompleteSchema.safeParse(request.body);
            if (!parsed.success) {
                return reply.status(400).send({ success: false, error: 'Validation failed', details: parsed.error.flatten() });
            }

            const [trip] = await db.select().from(trips).where(eq(trips.id, id)).limit(1);
            if (!trip) return reply.status(404).send({ success: false, error: 'Рейс не найден' });
            if (trip.status !== 'in_transit') {
                return reply.status(409).send({ success: false, error: `Рейс должен быть в статусе in_transit (текущий: ${trip.status})` });
            }

            const ctx = { userId: user.userId, role: user.roles[0], organizationId: user.organizationId };
            // changeTripStatus enforces all route points are completed/skipped
            const updatedTrip = await changeTripStatus(id, 'completed', ctx, {
                odometerEnd: parsed.data.odometerEnd,
                forcedByDispatcher: false,
            });

            if (trip.vehicleId) {
                await db.insert(odometerReadings).values({
                    vehicleId: trip.vehicleId,
                    recordedAt: new Date(),
                    valueKm: parsed.data.odometerEnd,
                    source: 'waybill',
                    tripId: id,
                    driverId: trip.driverId,
                    organizationId: user.organizationId ?? null,
                    createdBy: user.userId,
                });
            }

            await recordEvent({
                authorId: user.userId,
                authorRole: user.roles[0] ?? 'driver',
                eventType: 'trip.finished',
                entityType: 'trip',
                entityId: id,
                data: { odometerEnd: parsed.data.odometerEnd, notes: parsed.data.notes ?? null },
            });

            return { success: true, data: updatedTrip };
        } catch (err: any) {
            return reply.status(400).send({ success: false, error: err.message });
        }
    });

    // === Route Points sub-routes ===

    // --- GET /trips/:id/points ---
    app.get('/trips/:id/points', {
        schema: { tags: ['Рейсы'], summary: 'Точки маршрута', description: 'Список точек маршрута рейса (погрузка/разгрузка) с координатами Рё статусами.' },
        preHandler: [app.authenticate, requireAbility('read', 'Trip')],
    }, async (request, reply) => {
        const { id } = request.params as { id: string };
        const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
        await assertTripAccess(id, user);
        const points = await getRoutePoints(id);
        return { success: true, data: points };
    });

    // --- POST /trips/:id/points ---
    const RoutePointCreateSchema = z.object({
        orderId: z.string().uuid().optional(),
        type: z.enum(['loading', 'unloading']),
        address: z.string().min(1),
        lat: z.number().optional(),
        lon: z.number().optional(),
        windowStart: z.string().datetime().optional(),
        windowEnd: z.string().datetime().optional(),
        windowFrom: z.string().datetime().optional(),
        windowTo: z.string().datetime().optional(),
        notes: z.string().optional(),
        sealNumbers: z.array(z.string()).optional(),
        packagingCondition: z.string().optional(),
    });

    app.post('/trips/:id/points', {
        schema: { tags: ['Рейсы'], summary: 'Добавить точку', description: 'Добавление новой точки маршрута к рейсу.' },
        preHandler: [app.authenticate, requireAbility('update', 'Trip')],
    }, async (request, reply) => {
        const { id } = request.params as { id: string };
        await assertTripAccess(id, request.user as { userId: string; roles: string[]; organizationId?: string | null });
        const parsed = RoutePointCreateSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({
                success: false,
                error: 'Validation failed',
                details: parsed.error.flatten(),
            });
        }
        const point = await addRoutePoint(id, parsed.data);
        return reply.status(201).send({ success: true, data: point });
    });

    // --- PUT /trips/:id/points/:pointId ---
    app.put('/trips/:id/points/:pointId', {
        schema: { tags: ['Рейсы'], summary: 'Обновить точку', description: 'Обновление точки маршрута (координаты, время прибытия, статус).' },
        preHandler: [app.authenticate, requireAbility('update', 'Trip')],
    }, async (request, reply) => {
        const { id, pointId } = request.params as { id: string; pointId: string };
        await assertTripAccess(id, request.user as { userId: string; roles: string[]; organizationId?: string | null });

        const parseResult = RoutePointSchema.partial().safeParse(request.body);
        if (!parseResult.success) {
            return reply.status(400).send({
                success: false,
                error: 'Ошибка валидации',
                details: parseResult.error.flatten().fieldErrors,
            });
        }

        const point = await updateRoutePoint(id, pointId, parseResult.data);
        if (!point) {
            return reply.status(404).send({ success: false, error: 'Точка не найдена' });
        }

        return { success: true, data: point };
    });

    // --- POST /trips/:id/sort-route-points — сортировка с учётом окон доставки ---
    app.post('/trips/:id/sort-route-points', {
        schema: {
            tags: ['Рейсы'],
            summary: 'Отсортировать точки маршрута',
            description: 'Сортирует точки маршрута: по windowFrom (если у всех заполнено), иначе loading→unloading с сохранением исходного порядка. Перенумеровывает sequence_number 1..N. Возвращает предупреждения о невыполнимых окнах.',
        },
        preHandler: [app.authenticate, requireAbility('manage', 'Trip')],
    }, async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
            await assertTripAccess(id, user);

            const points = await getRoutePoints(id);
            if (points.length === 0) {
                return { success: true, data: { sortedPoints: [], warnings: [] } };
            }

            const allHaveWindowFrom = points.every((p: any) => p.windowFrom != null);
            const original = [...points];
            let sorted: any[];

            if (allHaveWindowFrom) {
                sorted = [...points].sort((a: any, b: any) => {
                    const av = new Date(a.windowFrom as Date).getTime();
                    const bv = new Date(b.windowFrom as Date).getTime();
                    return av - bv;
                });
            } else {
                const indexOf = new Map<string, number>();
                original.forEach((p: any, idx: number) => indexOf.set(p.id, idx));
                sorted = [...points].sort((a: any, b: any) => {
                    const groupA = a.type === 'loading' ? 0 : 1;
                    const groupB = b.type === 'loading' ? 0 : 1;
                    if (groupA !== groupB) return groupA - groupB;
                    return (indexOf.get(a.id) ?? 0) - (indexOf.get(b.id) ?? 0);
                });
            }

            // Warn-only: windowFrom > следующего windowTo
            const warnings: Array<{ pointId: string; nextPointId: string; message: string }> = [];
            for (let i = 0; i < sorted.length - 1; i++) {
                const cur = sorted[i] as any;
                const next = sorted[i + 1] as any;
                if (cur.windowFrom && next.windowTo) {
                    const curStart = new Date(cur.windowFrom).getTime();
                    const nextEnd = new Date(next.windowTo).getTime();
                    if (curStart > nextEnd) {
                        warnings.push({
                            pointId: cur.id,
                            nextPointId: next.id,
                            message: `windowFrom точки ${cur.sequenceNumber} позже windowTo следующей (${next.sequenceNumber})`,
                        });
                    }
                }
            }

            // Перенумеровываем 1..N в одной транзакции
            const updated = await db.transaction(async (tx: any) => {
                const result: any[] = [];
                for (let i = 0; i < sorted.length; i++) {
                    const point = sorted[i] as any;
                    const newSeq = i + 1;
                    if (point.sequenceNumber !== newSeq) {
                        const [row] = await tx
                            .update(routePoints)
                            .set({ sequenceNumber: newSeq })
                            .where(eq(routePoints.id, point.id))
                            .returning();
                        result.push(row ?? { ...point, sequenceNumber: newSeq });
                    } else {
                        result.push(point);
                    }
                }
                return result;
            });

            await recordEvent({
                authorId: user.userId,
                authorRole: user.roles[0] ?? 'system',
                eventType: 'trip.route_points_sorted',
                entityType: 'trip',
                entityId: id,
                data: {
                    strategy: allHaveWindowFrom ? 'window_from' : 'type_then_sequence',
                    pointsCount: updated.length,
                    warnings,
                },
            });

            return { success: true, data: { sortedPoints: updated, warnings } };
        } catch (err: any) {
            return reply.status(400).send({ success: false, error: err.message });
        }
    });

    // --- DELETE /trips/:id/points/:pointId ---
    app.delete('/trips/:id/points/:pointId', {
        schema: { tags: ['Рейсы'], summary: 'Удалить точку', description: 'Удаление точки маршрута из рейса.' },
        preHandler: [app.authenticate, requireAbility('update', 'Trip')],
    }, async (request, reply) => {
        const { id, pointId } = request.params as { id: string; pointId: string };
        await assertTripAccess(id, request.user as { userId: string; roles: string[]; organizationId?: string | null });

        const point = await deleteRoutePoint(id, pointId);
        if (!point) {
            return reply.status(404).send({ success: false, error: 'Точка не найдена' });
        }

        return { success: true, data: point };
    });

    // ================================================================
    // Sprint 13: Delivery Confirmation
    // ================================================================

    // GET /trips/:id/delivery-confirmation вЂ” получить подтверждение доставки
    app.get('/trips/:id/delivery-confirmation', {
        schema: { tags: ['Рейсы'], summary: 'Подтверждение доставки', description: 'Получить данные подтверждения доставки от получателя.' },
        preHandler: [app.authenticate, requireAbility('read', 'DeliveryConfirmation')],
    }, async (request, reply) => {
        const { id } = request.params as { id: string };
        await assertTripAccess(id, request.user as { userId: string; roles: string[] });
        const confirmation = await getDeliveryConfirmation(id);
        if (!confirmation) {
            return reply.status(404).send({ success: false, error: 'Подтверждение не найдено' });
        }
        return { success: true, data: confirmation };
    });

    // POST /trips/:id/delivery-confirmation/v2 — упрощённая схема (signedByName/signatureDataUrl/photoUrls/condition)
    const DeliveryConfirmationV2Schema = z.object({
        signedByName: z.string().min(1),
        signatureDataUrl: z.string().regex(/^data:image\/[a-zA-Z+.-]+;base64,/, 'signatureDataUrl must be data:image/<type>;base64,...'),
        photoUrls: z.array(z.string()).max(10).optional(),
        condition: z.enum(['ok', 'damaged', 'short']),
        notes: z.string().max(2000).optional(),
    });

    const conditionMapV2: Record<'ok' | 'damaged' | 'short', 'intact' | 'damaged' | 'partial'> = {
        ok: 'intact',
        damaged: 'damaged',
        short: 'partial',
    };

    app.post('/trips/:id/delivery-confirmation/v2', {
        schema: { tags: ['Рейсы'], summary: 'Подтвердить доставку (упрощённая схема)', description: 'Wave 1: упрощённая схема подтверждения доставки. Принимает signedByName/signatureDataUrl/photoUrls/condition.' },
        preHandler: [app.authenticate, requireAbility('create', 'DeliveryConfirmation')],
    }, async (request, reply) => {
        const { id } = request.params as { id: string };
        const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
        await assertTripAccess(id, user);

        const parsed = DeliveryConfirmationV2Schema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({ success: false, error: 'Validation failed', details: parsed.error.flatten() });
        }

        try {
            const confirmation = await createDeliveryConfirmation(id, {
                recipientName: parsed.data.signedByName,
                recipientSignaturePath: parsed.data.signatureDataUrl,
                photos: parsed.data.photoUrls ?? [],
                cargoCondition: conditionMapV2[parsed.data.condition],
                notes: parsed.data.notes,
            }, {
                userId: user.userId,
                role: user.roles[0] ?? 'driver',
            });
            return reply.status(201).send({
                success: true,
                data: {
                    id: confirmation.id,
                    tripId: confirmation.tripId,
                    signedAt: confirmation.confirmedAt,
                    signedByName: confirmation.recipientName,
                    condition: parsed.data.condition,
                    photoUrls: confirmation.photos,
                    notes: confirmation.notes,
                },
            });
        } catch (err: any) {
            return reply.status(400).send({ success: false, error: err.message });
        }
    });

    // POST /trips/:id/delivery-confirmation вЂ” создать подтверждение Рё завершить рейс
    app.post('/trips/:id/delivery-confirmation', {
        schema: { tags: ['Рейсы'], summary: 'Подтвердить доставку', description: 'Водитель или диспетчер фиксирует факт доставки. При confirmationMode=required вЂ” единственный способ завершить рейс. Диспетчер может использовать forcedByDispatcher=true.' },
        preHandler: [app.authenticate, requireAbility('create', 'DeliveryConfirmation')],
    }, async (request, reply) => {
        const { id } = request.params as { id: string };
        const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
        await assertTripAccess(id, user);

        const body = DeliveryConfirmationCreateSchema.safeParse(request.body);
        if (!body.success) {
            return reply.status(400).send({ success: false, error: 'Ошибка валидации', details: body.error.flatten() });
        }

        // Only dispatchers can use forcedByDispatcher
        if (body.data.forcedByDispatcher && !user.roles.includes('dispatcher') && !user.roles.includes('admin')) {
            return reply.status(403).send({ success: false, error: 'Только диспетчер может использовать принудительное завершение' });
        }

        try {
            const confirmation = await createDeliveryConfirmation(id, body.data, {
                userId: user.userId,
                role: user.roles[0] ?? 'driver',
            });
            return reply.status(201).send({ success: true, data: confirmation });
        } catch (err: any) {
            return reply.status(400).send({ success: false, error: err.message });
        }
    });

    // Document returns CRUD lives in `apps/api/src/modules/documents/routes.ts` (Wave 1).

    app.get('/trips/:id/transport-documents', {
        schema: { tags: ['Рейсы'], summary: 'Документы перевозки', description: 'Runtime transport document layer: waybill, delivery confirmations, and document returns.' },
        preHandler: [app.authenticate, requireAbility('read', 'Trip')],
    }, async (request, reply) => {
        const { id } = request.params as { id: string };
        const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
        await assertTripAccess(id, user);

        const bundle = await syncTransportDocumentsForTrip(id, user.userId);
        if (!bundle) {
            return reply.status(404).send({ success: false, error: 'Trip not found' });
        }

        return { success: true, data: bundle };
    });

    app.get('/trips/:id/transport-documents/:documentId', {
        schema: { tags: ['Рейсы'], summary: 'Документ перевозки', description: 'Preview a single runtime transport document by composite id.' },
        preHandler: [app.authenticate, requireAbility('read', 'Trip')],
    }, async (request, reply) => {
        const { id, documentId } = request.params as { id: string; documentId: string };
        const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
        await assertTripAccess(id, user);
        await syncTransportDocumentsForTrip(id, user.userId);

        const document = await getPersistedTransportDocumentById(id, documentId);
        if (!document) {
            return reply.status(404).send({ success: false, error: 'Document not found' });
        }

        return { success: true, data: document };
    });

    app.get('/trips/:id/transport-documents/:documentId/exchange', {
        schema: { tags: ['Рейсы'], summary: 'Transport document exchange', description: 'Persisted outbound/inbound exchange state for a transport document.' },
        preHandler: [app.authenticate, requireAbility('read', 'Trip')],
    }, async (request, reply) => {
        const { id, documentId } = request.params as { id: string; documentId: string };
        const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
        await assertTripAccess(id, user);
        await syncTransportDocumentsForTrip(id, user.userId);

        const document = await getPersistedTransportDocumentById(id, documentId);
        if (!document) {
            return reply.status(404).send({ success: false, error: 'Document not found' });
        }

        return {
            success: true,
            data: {
                document,
                exchange: document.exchange ?? null,
                attempts: document.exchanges ?? [],
                receipts: document.receipts ?? [],
            },
        };
      });

    app.post('/trips/:id/transport-documents/:documentId/signatures', {
        schema: { tags: ['Trips'], summary: 'Record transport document signature', description: 'Persist a role-based signature fact for ETRN/transport document lifecycle.' },
        preHandler: [app.authenticate, requireAbility('update', 'Trip')],
    }, async (request, reply) => {
        const { id, documentId } = request.params as { id: string; documentId: string };
        const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
        const bodySchema = z.object({
            signerRole: z.string().min(2).max(100),
            signerName: z.string().min(2).max(255),
            signerInn: z.string().max(12).nullable().optional(),
            authorityType: z.string().max(100).nullable().optional(),
            certificateThumbprint: z.string().max(255).nullable().optional(),
            powerOfAttorneyId: z.string().max(255).nullable().optional(),
            signedAt: z.string().datetime().nullable().optional(),
            notes: z.string().max(2000).nullable().optional(),
        });

        await assertTripAccess(id, user);
        const parsed = bodySchema.safeParse(request.body ?? {});
        if (!parsed.success) {
            return reply.status(400).send({ success: false, error: 'Validation failed', details: parsed.error.flatten() });
        }

        await syncTransportDocumentsForTrip(id, user.userId);
        const document = await recordTransportDocumentSignature({
            tripId: id,
            documentId,
            createdBy: user.userId,
            ...parsed.data,
        });
        if (!document) {
            return reply.status(404).send({ success: false, error: 'Document not found' });
        }
        return reply.status(201).send({ success: true, data: document });
    });

    app.post('/trips/:id/transport-documents/:documentId/signature-refusals', {
        schema: { tags: ['Trips'], summary: 'Record transport document signature refusal', description: 'Persist signer refusal with reason/evidence and mark document rejected.' },
        preHandler: [app.authenticate, requireAbility('update', 'Trip')],
    }, async (request, reply) => {
        const { id, documentId } = request.params as { id: string; documentId: string };
        const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
        const bodySchema = z.object({
            signerRole: z.string().min(2).max(100),
            signerName: z.string().min(2).max(255),
            reason: z.string().min(3).max(1000),
            evidenceUrl: z.string().max(1000).nullable().optional(),
            refusedAt: z.string().datetime().nullable().optional(),
            notes: z.string().max(2000).nullable().optional(),
        });

        await assertTripAccess(id, user);
        const parsed = bodySchema.safeParse(request.body ?? {});
        if (!parsed.success) {
            return reply.status(400).send({ success: false, error: 'Validation failed', details: parsed.error.flatten() });
        }

        await syncTransportDocumentsForTrip(id, user.userId);
        const document = await recordTransportDocumentSignatureRefusal({
            tripId: id,
            documentId,
            createdBy: user.userId,
            ...parsed.data,
        });
        if (!document) {
            return reply.status(404).send({ success: false, error: 'Document not found' });
        }
        return reply.status(201).send({ success: true, data: document });
    });

    app.post('/trips/:id/transport-documents/:documentId/retry', {
        schema: { tags: ['Trips'], summary: 'Retry transport document', description: 'Increment retry counter and append a retry history event for the persisted document.' },
        preHandler: [app.authenticate, requireAbility('update', 'Trip')],
    }, async (request, reply) => {
        const { id, documentId } = request.params as { id: string; documentId: string };
        const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
        await assertTripAccess(id, user);
        await syncTransportDocumentsForTrip(id, user.userId);

        const document = await retryTransportDocument(id, documentId, user.userId);
        if (!document) {
            return reply.status(404).send({ success: false, error: 'Document not found' });
        }

        return { success: true, data: document };
    });

    app.post('/trips/:id/transport-documents/:documentId/exchange/attempts', {
        schema: { tags: ['Trips'], summary: 'Create exchange attempt', description: 'Create an outbound exchange attempt and persist provider metadata for a transport document.' },
        preHandler: [app.authenticate, requireAbility('update', 'Trip')],
    }, async (request, reply) => {
        const { id, documentId } = request.params as { id: string; documentId: string };
        const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
        const bodySchema = z.object({
            providerName: z.string().optional(),
            direction: z.nativeEnum(TransportDocumentExchangeDirection).optional(),
            operation: z.string().min(1).default('submit'),
            status: z.nativeEnum(TransportDocumentExchangeStatus).optional(),
            requestId: z.string().optional(),
            providerDocumentId: z.string().optional(),
            providerMessageId: z.string().optional(),
            providerEventId: z.string().optional(),
            providerStatus: z.string().optional(),
            requestPayload: z.record(z.string(), z.unknown()).optional(),
            responsePayload: z.record(z.string(), z.unknown()).optional(),
            errorCode: z.string().optional(),
            errorMessage: z.string().optional(),
            nextRetryAt: z.string().datetime().optional(),
        });

        await assertTripAccess(id, user);

        const parsed = bodySchema.safeParse(request.body ?? {});
        if (!parsed.success) {
            return reply.status(400).send({ success: false, error: 'Validation failed', details: parsed.error.flatten() });
        }

        await syncTransportDocumentsForTrip(id, user.userId);

        const document = await sendTransportDocumentToProvider({
            tripId: id,
            documentId,
            createdBy: user.userId,
            ...parsed.data,
        });
        if (!document) {
            return reply.status(404).send({ success: false, error: 'Document not found' });
        }

        return {
            success: true,
            data: {
                document,
                exchange: document.exchange ?? null,
                attempts: document.exchanges ?? [],
                receipts: document.receipts ?? [],
            },
        };
    });

    app.post('/trips/:id/transport-documents/:documentId/exchange/receipts', {
        schema: { tags: ['Trips'], summary: 'Record exchange receipt', description: 'Persist a provider receipt/callback for a transport document exchange.' },
        preHandler: [app.authenticate, requireAbility('update', 'Trip')],
    }, async (request, reply) => {
        const { id, documentId } = request.params as { id: string; documentId: string };
        const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
        const bodySchema = z.object({
            receiptType: z.nativeEnum(TransportDocumentReceiptType),
            title: z.string().min(1).optional(),
            message: z.string().optional(),
            providerStatus: z.string().optional(),
            providerReceiptId: z.string().optional(),
            providerEventId: z.string().optional(),
            providerDocumentId: z.string().optional(),
            providerMessageId: z.string().optional(),
            payload: z.record(z.string(), z.unknown()).optional(),
        });

        await assertTripAccess(id, user);

        const parsed = bodySchema.safeParse(request.body ?? {});
        if (!parsed.success) {
            return reply.status(400).send({ success: false, error: 'Validation failed', details: parsed.error.flatten() });
        }

        await syncTransportDocumentsForTrip(id, user.userId);

        const receipt = await registerTransportDocumentProviderCallback({
            tripId: id,
            documentId,
            createdBy: user.userId,
            ...parsed.data,
            title: parsed.data.title ?? 'Provider receipt recorded',
        });
        if (!receipt) {
            return reply.status(404).send({ success: false, error: 'Document not found' });
        }

        const document = await getPersistedTransportDocumentById(id, documentId);
        return { success: true, data: { receipt, document } };
    });

    app.post('/trips/:id/transport-documents/:documentId/provider-status', {
        schema: { tags: ['Trips'], summary: 'Update provider status', description: 'Manual provider/status update that also persists a callback-style receipt.' },
        preHandler: [app.authenticate, requireAbility('update', 'Trip')],
    }, async (request, reply) => {
        const { id, documentId } = request.params as { id: string; documentId: string };
        const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
        const bodySchema = z.object({
            status: z.nativeEnum(TransportDocumentStatus),
            message: z.string().optional(),
            providerStatus: z.string().optional(),
            providerDocumentId: z.string().optional(),
            providerMessageId: z.string().optional(),
            externalId: z.string().optional(),
            nextRetryAt: z.string().datetime().optional(),
            error: z.string().optional(),
        });

        await assertTripAccess(id, user);

        const parsed = bodySchema.safeParse(request.body ?? {});
        if (!parsed.success) {
            return reply.status(400).send({ success: false, error: 'Validation failed', details: parsed.error.flatten() });
        }

        await syncTransportDocumentsForTrip(id, user.userId);

        const result = await updatePersistedTransportDocumentStatus({
            tripId: id,
            documentId,
            createdBy: user.userId,
            ...parsed.data,
        });
        if (!result) {
            return reply.status(404).send({ success: false, error: 'Document not found' });
        }

        return { success: true, data: result };
    });

    app.post('/trips/:id/transport-documents/:documentId/send', {
        schema: { tags: ['Trips'], summary: 'Send transport document to provider', description: 'Create outbound external compliance exchange attempt for a persisted transport document.' },
        preHandler: [app.authenticate, requireAbility('update', 'Trip')],
    }, async (request, reply) => {
        const { id, documentId } = request.params as { id: string; documentId: string };
        const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
        const bodySchema = z.object({
            providerName: z.string().optional(),
            requestPayload: z.record(z.string(), z.unknown()).optional(),
        });

        await assertTripAccess(id, user);

        const parsed = bodySchema.safeParse(request.body ?? {});
        if (!parsed.success) {
            return reply.status(400).send({ success: false, error: 'Validation failed', details: parsed.error.flatten() });
        }

        await syncTransportDocumentsForTrip(id, user.userId);

        const document = await sendTransportDocumentToProvider({
            tripId: id,
            documentId,
            createdBy: user.userId,
            ...parsed.data,
        });
        if (!document) {
            return reply.status(404).send({ success: false, error: 'Document not found' });
        }

        return { success: true, data: document };
    });

    app.post('/trips/:id/transport-documents/:documentId/status', {
        schema: { tags: ['Trips'], summary: 'Update transport document status', description: 'Manual provider/status update for a persisted transport document.' },
        preHandler: [app.authenticate, requireAbility('update', 'Trip')],
    }, async (request, reply) => {
        const { id, documentId } = request.params as { id: string; documentId: string };
        const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
        const bodySchema = z.object({
            status: z.nativeEnum(TransportDocumentStatus),
            message: z.string().optional(),
            providerStatus: z.string().optional(),
            providerDocumentId: z.string().optional(),
            providerMessageId: z.string().optional(),
            externalId: z.string().optional(),
            nextRetryAt: z.string().datetime().optional(),
            error: z.string().optional(),
        });

        await assertTripAccess(id, user);

        const parsed = bodySchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({ success: false, error: 'Validation failed', details: parsed.error.flatten() });
        }

        await syncTransportDocumentsForTrip(id, user.userId);

        const document = await updatePersistedTransportDocumentStatus({
            tripId: id,
            documentId,
            createdBy: user.userId,
            ...parsed.data,
        });
        if (!document) {
            return reply.status(404).send({ success: false, error: 'Document not found' });
        }

        return { success: true, data: document };
    });

    app.post('/trips/:id/transport-documents/:documentId/provider-callback', {
        schema: { tags: ['Trips'], summary: 'Register provider callback', description: 'Persist an inbound provider event/receipt for a transport document and update external compliance state.' },
        preHandler: [app.authenticate, requireAbility('update', 'Trip')],
    }, async (request, reply) => {
        const { id, documentId } = request.params as { id: string; documentId: string };
        const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
        const bodySchema = z.object({
            receiptType: z.nativeEnum(TransportDocumentReceiptType),
            title: z.string().optional(),
            message: z.string().optional(),
            providerStatus: z.string().optional(),
            providerReceiptId: z.string().optional(),
            providerEventId: z.string().optional(),
            providerDocumentId: z.string().optional(),
            providerMessageId: z.string().optional(),
            payload: z.record(z.string(), z.unknown()).optional(),
        });

        await assertTripAccess(id, user);

        const parsed = bodySchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({ success: false, error: 'Validation failed', details: parsed.error.flatten() });
        }

        await syncTransportDocumentsForTrip(id, user.userId);

        const document = await registerTransportDocumentProviderCallback({
            tripId: id,
            documentId,
            createdBy: user.userId,
            ...parsed.data,
        });
        if (!document) {
            return reply.status(404).send({ success: false, error: 'Document not found' });
        }

        return { success: true, data: document };
    });

    app.get('/trips/:id/etrn-workflow', {
        schema: { tags: ['Рейсы'], summary: 'ETRN workflow', description: 'Runtime official ETRN title workflow derived from trip, waybill, confirmations, and returns.' },
        preHandler: [app.authenticate, requireAbility('read', 'Trip')],
    }, async (request, reply) => {
        const { id } = request.params as { id: string };
        const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
        await assertTripAccess(id, user);

        const bundle = await syncTransportDocumentsForTrip(id, user.userId);
        if (!bundle) {
            return reply.status(404).send({ success: false, error: 'Trip not found' });
        }

        return { success: true, data: bundle.etrn };
    });

    app.get('/trips/:id/etrn-workflow/:titleType', {
        schema: { tags: ['Trips'], summary: 'ETRN title', description: 'Runtime official ETRN title detail by title type.' },
        preHandler: [app.authenticate, requireAbility('read', 'Trip')],
    }, async (request, reply) => {
        const { id, titleType } = request.params as { id: string; titleType: string };
        const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
        await assertTripAccess(id, user);

        const bundle = await syncTransportDocumentsForTrip(id, user.userId);
        if (!bundle) {
            return reply.status(404).send({ success: false, error: 'Trip not found' });
        }

        const title = bundle.etrn.titles.find((item) => item.titleType === titleType);
        if (!title) {
            return reply.status(404).send({ success: false, error: 'Title not found' });
        }

        return { success: true, data: title };
    });

    app.get('/trips/:id/compliance-panel', {
        schema: { tags: ['Trips'], summary: 'Compliance panel', description: 'Runtime transport compliance bundle for the UI: documents, lifecycle, timeline, problems, and summary.' },
        preHandler: [app.authenticate, requireAbility('read', 'Trip')],
    }, async (request, reply) => {
        const { id } = request.params as { id: string };
        const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
        await assertTripAccess(id, user);

        const bundle = await syncTransportDocumentsForTrip(id, user.userId);
        if (!bundle) {
            return reply.status(404).send({ success: false, error: 'Trip not found' });
        }

        return { success: true, data: bundle };
    });

    app.post('/trips/:id/dossier/items/:itemId/exception', {
        schema: { tags: ['Trips'], summary: 'Exception a dossier item', description: 'Mark a required dossier item as exceptioned with a reason. ETRN/provider lifecycle remains in transport_documents.' },
        preHandler: [app.authenticate, requireAbility('update', 'Trip')],
    }, async (request, reply) => {
        const { id, itemId } = request.params as { id: string; itemId: string };
        const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
        await assertTripAccess(id, user);
        const body = request.body as { reason?: string; metadata?: Record<string, unknown> };
        const [item] = await db.update(documentDossierItems).set({
            status: 'exceptioned',
            blockedReason: body.reason ?? 'Manual exception',
            metadata: body.metadata ?? {},
            completedAt: new Date(),
            updatedAt: new Date(),
        }).where(eq(documentDossierItems.id, itemId)).returning();
        if (!item) return reply.status(404).send({ success: false, error: 'Dossier item not found' });
        return { success: true, data: item };
    });

    app.get('/trips/:id/dossier/close-gate', {
        schema: { tags: ['Trips'], summary: 'Trip dossier close gate', description: 'Read-only document gate for trip close: blocking/warning dossier items and ETRN exception awareness.' },
        preHandler: [app.authenticate, requireAbility('read', 'Trip')],
    }, async (request, reply) => {
        const { id } = request.params as { id: string };
        const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
        await assertTripAccess(id, user);

        const dossier = await getTransportDossier(id);
        if (!dossier) {
            return reply.status(404).send({ success: false, error: 'Trip not found' });
        }

        const transportDocuments = await syncTransportDocumentsForTrip(id, user.userId);
        await syncDossierItemsForTrip({ tripId: id, organizationId: user.organizationId, transportDocuments: transportDocuments?.documents ?? [] });

        const dossierItems = await getDossierItemsForTrip({ tripId: id, organizationId: user.organizationId });
        return { success: true, data: evaluateDossierCloseGate({ tripId: id, dossierItems }) };
    });

    app.get('/trips/:id/dossier', {
        schema: { tags: ['Trips'], summary: 'Transport dossier', description: 'Read-only dossier for a trip: trip, orders, waybill, vehicle, trailer, and parties.' },
        preHandler: [app.authenticate, requireAbility('read', 'Trip')],
    }, async (request, reply) => {
        const { id } = request.params as { id: string };
        const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
        await assertTripAccess(id, user);

        const dossier = await getTransportDossier(id);
        if (!dossier) {
            return reply.status(404).send({ success: false, error: 'Trip not found' });
        }

        const transportDocuments = await syncTransportDocumentsForTrip(id, user.userId);
        await syncDossierItemsForTrip({ tripId: id, organizationId: user.organizationId, transportDocuments: transportDocuments?.documents ?? [] });

        const dossierItems = await getDossierItemsForTrip({ tripId: id, organizationId: user.organizationId });
        const closeGate = evaluateDossierCloseGate({ tripId: id, dossierItems });

        return { success: true, data: { ...dossier, transportDocuments, dossierItems, closeGate } };
    });
};

export default tripsRoutes;
