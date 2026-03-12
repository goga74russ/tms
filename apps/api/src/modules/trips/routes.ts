import { FastifyPluginAsync } from 'fastify';
import { requireAbility } from '../../auth/rbac.js';
import { resolveContractorId } from '../../auth/guards.js';
import {
    createTrip,
    getTrips,
    getTripById,
    updateTrip,
    assignTrip,
    changeTripStatus,
    getRoutePoints,
    addRoutePoint,
    updateRoutePoint,
    deleteRoutePoint,
    getAvailableVehicles,
    getAvailableDrivers,
} from './service.js';
import { db } from '../../db/connection.js';
import { drivers, orders } from '../../db/schema.js';
import { eq, inArray } from 'drizzle-orm';
import { TripCreateSchema, TripUpdateSchema, RoutePointSchema } from '@tms/shared';

// H-3: Resolve driverId from JWT userId (for RLS)
async function resolveDriverId(userId: string): Promise<string | null> {
    const [driver] = await db.select({ id: drivers.id })
        .from(drivers).where(eq(drivers.userId, userId)).limit(1);
    return driver?.id ?? null;
}

const tripsRoutes: FastifyPluginAsync = async (app) => {
    // --- GET /trips — list with pagination & filters (RLS: driver sees own, client sees own) ---
    app.get('/trips', {
        schema: { tags: ['Рейсы'], summary: 'Список рейсов', description: 'Получить все рейсы с фильтрацией по статусу, ТС, водителю, дате. Пагинация. RLS для водителей/клиентов.' },
        preHandler: [app.authenticate, requireAbility('read', 'Trip')],
    }, async (request) => {
        const user = request.user as { userId: string; roles: string[] };
        const query = request.query as {
            status?: string;
            vehicleId?: string;
            driverId?: string;
            dateFrom?: string;
            dateTo?: string;
            page?: string;
            limit?: string;
        };

        // H-3: RLS — drivers can only see their own trips
        let rlsDriverId = query.driverId;
        if (user.roles.includes('driver')) {
            const myDriverId = await resolveDriverId(user.userId);
            if (myDriverId) rlsDriverId = myDriverId;
        }

        // RLS: client can only see trips linked to their orders
        let rlsTripIds: string[] | undefined;
        if (user.roles.includes('client')) {
            const myContractorId = await resolveContractorId(user.userId);
            if (!myContractorId) return { success: true, data: [], total: 0, page: 1, limit: 20 };
            const clientOrders = await db.select({ tripId: orders.tripId })
                .from(orders).where(eq(orders.contractorId, myContractorId));
            rlsTripIds = clientOrders.map((o: any) => o.tripId).filter(Boolean);
            if (rlsTripIds.length === 0) return { success: true, data: [], total: 0, page: 1, limit: 20 };
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
        });

        return { success: true, ...result };
    });

    // --- GET /trips/available-vehicles ---
    app.get('/trips/available-vehicles', {
        schema: { tags: ['Рейсы'], summary: 'Доступные ТС', description: 'Список ТС со статусом available для назначения на рейс.' },
        preHandler: [app.authenticate, requireAbility('read', 'Vehicle')],
    }, async () => {
        const vehicles = await getAvailableVehicles();
        return { success: true, data: vehicles };
    });

    // --- GET /trips/available-drivers ---
    app.get('/trips/available-drivers', {
        schema: { tags: ['Рейсы'], summary: 'Доступные водители', description: 'Список активных водителей для назначения на рейс.' },
        preHandler: [app.authenticate, requireAbility('read', 'Driver')],
    }, async () => {
        const drivers = await getAvailableDrivers();
        return { success: true, data: drivers };
    });

    // --- GET /trips/:id ---
    app.get('/trips/:id', {
        schema: { tags: ['Рейсы'], summary: 'Получить рейс', description: 'Детальная информация о рейсе по ID с привязанными заявками.' },
        preHandler: [app.authenticate, requireAbility('read', 'Trip')],
    }, async (request, reply) => {
        const { id } = request.params as { id: string };
        const user = request.user as { userId: string; roles: string[] };
        const trip = await getTripById(id);

        if (!trip) {
            return reply.status(404).send({ success: false, error: 'Рейс не найден' });
        }

        // H-3 FIX: RLS — drivers can only see their own trips
        if (user.roles.includes('driver')) {
            const myDriverId = await resolveDriverId(user.userId);
            if (myDriverId && trip.driverId !== myDriverId) {
                return reply.status(403).send({ success: false, error: 'Доступ запрещён' });
            }
        }

        // RLS: client can only see trips linked to their orders
        if (user.roles.includes('client')) {
            const myContractorId = await resolveContractorId(user.userId);
            if (!myContractorId) {
                return reply.status(403).send({ success: false, error: 'Доступ запрещён' });
            }
            const [linkedOrder] = await db.select({ id: orders.id })
                .from(orders)
                .where(eq(orders.tripId, id))
                .limit(1);
            if (!linkedOrder) {
                return reply.status(403).send({ success: false, error: 'Доступ запрещён' });
            }
        }

        return { success: true, data: trip };
    });

    // --- POST /trips — create ---
    app.post('/trips', {
        schema: { tags: ['Рейсы'], summary: 'Создать рейс', description: 'Создание нового рейса. Автогенерация номера. Валидация Zod.' },
        preHandler: [app.authenticate, requireAbility('create', 'Trip')],
    }, async (request, reply) => {
        try {
            const user = request.user as { userId: string; roles: string[] };
            const body = request.body as any;

            // Extract orderIds before Zod strips it (not a DB/schema field)
            const orderIds = body.orderIds as string[] | undefined;

            // H-4: Zod validation for trip creation
            const parsed = TripCreateSchema.safeParse({
                ...body,
                createdBy: user.userId,
            });
            if (!parsed.success) return reply.status(400).send({ success: false, error: 'Validation failed', details: parsed.error.flatten() });

            const trip = await createTrip(
                { ...(parsed.data as any), orderIds },
                { userId: user.userId, role: user.roles[0] },
            );

            return reply.status(201).send({ success: true, data: trip });
        } catch (err: any) {
            return reply.status(400).send({ success: false, error: err.message });
        }
    });

    // --- PUT /trips/:id — update ---
    app.put('/trips/:id', {
        schema: { tags: ['Рейсы'], summary: 'Обновить рейс', description: 'Частичное обновление рейса (маршрут, плановые данные).' },
        preHandler: [app.authenticate, requireAbility('update', 'Trip')],
    }, async (request, reply) => {
        const { id } = request.params as { id: string };
        const parseResult = TripUpdateSchema.safeParse(request.body);
        if (!parseResult.success) {
            return reply.status(400).send({
                success: false,
                error: 'Ошибка валидации',
                details: parseResult.error.flatten().fieldErrors,
            });
        }

        const trip = await updateTrip(id, parseResult.data);
        if (!trip) {
            return reply.status(404).send({ success: false, error: 'Рейс не найден' });
        }

        return { success: true, data: trip };
    });

    // --- POST /trips/:id/assign — assign vehicle + driver ---
    app.post('/trips/:id/assign', {
        schema: { tags: ['Рейсы'], summary: 'Назначить ТС/водителя', description: 'Привязка транспортного средства и водителя к рейсу. Проверка доступности.' },
        preHandler: [app.authenticate, requireAbility('update', 'Trip')],
    }, async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            const user = request.user as { userId: string; roles: string[] };
            const body = request.body as { vehicleId: string; driverId: string };

            if (!body.vehicleId || !body.driverId) {
                return reply.status(400).send({
                    success: false,
                    error: 'vehicleId и driverId обязательны',
                });
            }

            const result = await assignTrip(id, body.vehicleId, body.driverId, {
                userId: user.userId,
                role: user.roles[0],
            });

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

    // --- POST /trips/:id/status — advance status ---
    app.post('/trips/:id/status', {
        schema: { tags: ['Рейсы'], summary: 'Сменить статус', description: 'Переход по state machine рейса (planning→assigned→inspection→…→completed). Валидация переходов.' },
        preHandler: [app.authenticate, requireAbility('update', 'Trip')],
    }, async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            const user = request.user as { userId: string; roles: string[] };
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
            }, body);

            return { success: true, data: trip };
        } catch (err: any) {
            return reply.status(400).send({ success: false, error: err.message });
        }
    });

    // --- POST /trips/:id/cancel ---
    app.post('/trips/:id/cancel', {
        schema: { tags: ['Рейсы'], summary: 'Отменить рейс', description: 'Отмена рейса с указанием причины. Освобождение ТС и водителя.' },
        preHandler: [app.authenticate, requireAbility('update', 'Trip')],
    }, async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            const user = request.user as { userId: string; roles: string[] };
            const body = request.body as { reason?: string };

            const trip = await changeTripStatus(id, 'cancelled', {
                userId: user.userId,
                role: user.roles[0],
            }, { reason: body?.reason });

            return { success: true, data: trip };
        } catch (err: any) {
            return reply.status(400).send({ success: false, error: err.message });
        }
    });

    // === Route Points sub-routes ===

    // --- GET /trips/:id/points ---
    app.get('/trips/:id/points', {
        schema: { tags: ['Рейсы'], summary: 'Точки маршрута', description: 'Список точек маршрута рейса (погрузка/разгрузка) с координатами и статусами.' },
        preHandler: [app.authenticate, requireAbility('read', 'Trip')],
    }, async (request, reply) => {
        const { id } = request.params as { id: string };
        const user = request.user as { userId: string; roles: string[] };

        // H-5: RLS — drivers can only see points of their own trips
        if (user.roles.includes('driver')) {
            const myDriverId = await resolveDriverId(user.userId);
            const trip = await getTripById(id);
            if (!trip || !myDriverId || trip.driverId !== myDriverId) {
                return reply.status(403).send({ success: false, error: 'Доступ запрещён' });
            }
        }

        const points = await getRoutePoints(id);
        return { success: true, data: points };
    });

    // --- POST /trips/:id/points ---
    app.post('/trips/:id/points', {
        schema: { tags: ['Рейсы'], summary: 'Добавить точку', description: 'Добавление новой точки маршрута к рейсу.' },
        preHandler: [app.authenticate, requireAbility('update', 'Trip')],
    }, async (request, reply) => {
        const { id } = request.params as { id: string };
        const body = request.body as {
            orderId?: string;
            type: 'loading' | 'unloading';
            address: string;
            lat?: number;
            lon?: number;
            windowStart?: string;
            windowEnd?: string;
            notes?: string;
        };

        const point = await addRoutePoint(id, body);
        return reply.status(201).send({ success: true, data: point });
    });

    // --- PUT /trips/:id/points/:pointId ---
    app.put('/trips/:id/points/:pointId', {
        schema: { tags: ['Рейсы'], summary: 'Обновить точку', description: 'Обновление точки маршрута (координаты, время прибытия, статус).' },
        preHandler: [app.authenticate, requireAbility('update', 'Trip')],
    }, async (request, reply) => {
        const { pointId } = request.params as { id: string; pointId: string };

        const parseResult = RoutePointSchema.partial().safeParse(request.body);
        if (!parseResult.success) {
            return reply.status(400).send({
                success: false,
                error: 'Ошибка валидации',
                details: parseResult.error.flatten().fieldErrors,
            });
        }

        const point = await updateRoutePoint(pointId, parseResult.data);
        if (!point) {
            return reply.status(404).send({ success: false, error: 'Точка не найдена' });
        }

        return { success: true, data: point };
    });

    // --- DELETE /trips/:id/points/:pointId ---
    app.delete('/trips/:id/points/:pointId', {
        schema: { tags: ['Рейсы'], summary: 'Удалить точку', description: 'Удаление точки маршрута из рейса.' },
        preHandler: [app.authenticate, requireAbility('update', 'Trip')],
    }, async (request, reply) => {
        const { pointId } = request.params as { id: string; pointId: string };

        const point = await deleteRoutePoint(pointId);
        if (!point) {
            return reply.status(404).send({ success: false, error: 'Точка не найдена' });
        }

        return { success: true, data: point };
    });
};

export default tripsRoutes;
