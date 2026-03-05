// ============================================================
// Orders Module — Fastify Routes (§3.1)
// ============================================================
import { FastifyPluginAsync } from 'fastify';
import { requireAbility } from '../../auth/rbac.js';
import {
    createOrder,
    getOrders,
    getOrderById,
    updateOrder,
    changeOrderStatus,
    createOrderFromTemplate,
    getOrdersKanban,
} from './service.js';
import { OrderCreateSchema, OrderUpdateSchema } from '@tms/shared';
import { db } from '../../db/connection.js';
import { drivers, users, trips } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';

async function resolveDriverId(userId: string): Promise<string | null> {
    const [driver] = await db.select({ id: drivers.id })
        .from(drivers).where(eq(drivers.userId, userId)).limit(1);
    return driver?.id ?? null;
}

async function resolveContractorId(userId: string): Promise<string | null> {
    const [user] = await db.select({ contractorId: users.contractorId })
        .from(users).where(eq(users.id, userId)).limit(1);
    return user?.contractorId ?? null;
}

const ordersRoutes: FastifyPluginAsync = async (app) => {
    // --- GET /orders — list with pagination & filters ---
    app.get('/orders', {
        preHandler: [app.authenticate, requireAbility('read', 'Order')],
    }, async (request, reply) => {
        const user = request.user as { userId: string; roles: string[] };
        const query = request.query as {
            status?: string;
            contractorId?: string;
            dateFrom?: string;
            dateTo?: string;
            search?: string;
            page?: string;
            limit?: string;
        };

        let rlsDriverId: string | undefined = undefined;
        let rlsContractorId = query.contractorId;

        // H-5: RLS — drivers can only see their own orders
        if (user.roles.includes('driver')) {
            const myDriverId = await resolveDriverId(user.userId);
            if (myDriverId) rlsDriverId = myDriverId;
        }

        // H-6: RLS — clients can only see their own orders
        if (user.roles.includes('client')) {
            const myContractorId = await resolveContractorId(user.userId);
            if (myContractorId) rlsContractorId = myContractorId;
        }

        const result = await getOrders({
            status: query.status,
            contractorId: rlsContractorId,
            driverId: rlsDriverId,
            dateFrom: query.dateFrom,
            dateTo: query.dateTo,
            search: query.search,
            page: query.page ? parseInt(query.page, 10) : undefined,
            limit: query.limit ? parseInt(query.limit, 10) : undefined,
        });

        return { success: true, ...result };
    });

    // --- GET /orders/kanban — grouped by status ---
    app.get('/orders/kanban', {
        preHandler: [app.authenticate, requireAbility('read', 'Order')],
    }, async (request) => {
        const user = request.user as { userId: string; roles: string[] };
        const query = request.query as {
            contractorId?: string;
            dateFrom?: string;
            dateTo?: string;
        };

        let rlsContractorId = query.contractorId;
        if (user.roles.includes('client')) {
            const myContractorId = await resolveContractorId(user.userId);
            if (myContractorId) rlsContractorId = myContractorId;
        }

        const kanban = await getOrdersKanban({
            contractorId: rlsContractorId,
            dateFrom: query.dateFrom,
            dateTo: query.dateTo,
        });

        return { success: true, data: kanban };
    });

    // --- GET /orders/:id ---
    app.get('/orders/:id', {
        preHandler: [app.authenticate, requireAbility('read', 'Order')],
    }, async (request, reply) => {
        const { id } = request.params as { id: string };
        const user = request.user as { userId: string; roles: string[] };
        const order = await getOrderById(id);

        if (!order) {
            return reply.status(404).send({ success: false, error: 'Заявка не найдена' });
        }

        // H-5: RLS — drivers can only see their own orders
        if (user.roles.includes('driver')) {
            const myDriverId = await resolveDriverId(user.userId);
            if (!myDriverId || !order.tripId) return reply.status(403).send({ success: false, error: 'Доступ запрещён' });

            const [trip] = await db.select({ driverId: trips.driverId }).from(trips).where(eq(trips.id, order.tripId)).limit(1);
            if (!trip || trip.driverId !== myDriverId) {
                return reply.status(403).send({ success: false, error: 'Доступ запрещён' });
            }
        }

        // H-6: RLS — clients can only see their own orders
        if (user.roles.includes('client')) {
            const myContractorId = await resolveContractorId(user.userId);
            if (!myContractorId || order.contractorId !== myContractorId) {
                return reply.status(403).send({ success: false, error: 'Доступ запрещён' });
            }
        }

        return { success: true, data: order };
    });

    // --- POST /orders — create ---
    app.post('/orders', {
        preHandler: [app.authenticate, requireAbility('create', 'Order')],
    }, async (request, reply) => {
        try {
            const user = request.user as { userId: string; roles: string[] };
            const body = request.body as Record<string, unknown>;

            // Validate with Zod (omit id, number, status etc.)
            const parsed = OrderCreateSchema.parse({
                ...body,
                createdBy: user.userId,
            });

            const order = await createOrder(parsed, {
                userId: user.userId,
                role: user.roles[0],
            });

            return reply.status(201).send({ success: true, data: order });
        } catch (err: any) {
            if (err.name === 'ZodError') {
                return reply.status(400).send({
                    success: false,
                    error: 'Ошибка валидации',
                    details: err.flatten().fieldErrors,
                });
            }
            throw err;
        }
    });

    // --- PUT /orders/:id — update ---
    app.put('/orders/:id', {
        preHandler: [app.authenticate, requireAbility('update', 'Order')],
    }, async (request, reply) => {
        const { id } = request.params as { id: string };

        const parseResult = OrderUpdateSchema.safeParse(request.body);
        if (!parseResult.success) {
            return reply.status(400).send({
                success: false,
                error: 'Ошибка валидации',
                details: parseResult.error.flatten().fieldErrors,
            });
        }

        const order = await updateOrder(id, parseResult.data);
        if (!order) {
            return reply.status(404).send({ success: false, error: 'Заявка не найдена' });
        }

        return { success: true, data: order };
    });

    // --- POST /orders/:id/confirm ---
    app.post('/orders/:id/confirm', {
        preHandler: [app.authenticate, requireAbility('update', 'Order')],
    }, async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            const user = request.user as { userId: string; roles: string[] };

            const order = await changeOrderStatus(id, 'confirmed', {
                userId: user.userId,
                role: user.roles[0],
            });

            return { success: true, data: order };
        } catch (err: any) {
            return reply.status(400).send({ success: false, error: err.message });
        }
    });

    // --- POST /orders/:id/cancel ---
    app.post('/orders/:id/cancel', {
        preHandler: [app.authenticate, requireAbility('update', 'Order')],
    }, async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            const user = request.user as { userId: string; roles: string[] };
            const body = request.body as { reason?: string };

            const order = await changeOrderStatus(id, 'cancelled', {
                userId: user.userId,
                role: user.roles[0],
            }, { reason: body?.reason });

            return { success: true, data: order };
        } catch (err: any) {
            return reply.status(400).send({ success: false, error: err.message });
        }
    });

    // --- POST /orders/from-template ---
    app.post('/orders/from-template', {
        preHandler: [app.authenticate, requireAbility('create', 'Order')],
    }, async (request, reply) => {
        try {
            const user = request.user as { userId: string; roles: string[] };
            const body = request.body as {
                templateOrderId: string;
                overrides?: Record<string, unknown>;
            };

            if (!body.templateOrderId) {
                return reply.status(400).send({
                    success: false,
                    error: 'templateOrderId обязателен',
                });
            }

            const order = await createOrderFromTemplate(
                body.templateOrderId,
                body.overrides ?? {},
                { userId: user.userId, role: user.roles[0] },
            );

            return reply.status(201).send({ success: true, data: order });
        } catch (err: any) {
            return reply.status(400).send({ success: false, error: err.message });
        }
    });
};

export default ordersRoutes;
