// ============================================================
// Orders Module — Fastify Routes (§3.1)
// ============================================================
import { FastifyPluginAsync } from 'fastify';
import { requireAbility } from '../../auth/rbac.js';
import { assertOrderAccess, AccessDeniedError, EntityNotFoundError } from '../../auth/guards.js';
import {
    createOrder,
    getOrders,
    getOrdersList,
    getOrderById,
    updateOrder,
    changeOrderStatus,
    createOrderFromTemplate,
    getOrdersKanban,
} from './service.js';
import { OrderCreateSchema, OrderUpdateSchema, PRIVILEGED_ROLES, hasPrivilege } from '@tms/shared';
import { db } from '../../db/connection.js';
import { drivers, users, trips } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { getOrderFulfillment } from '../operational-core/service.js';
import { splitOrderIntoLots } from '../operational-core/write-service.js';

function sendAccessError(reply: any, err: unknown) {
    if (err instanceof AccessDeniedError) {
        return reply.status(403).send({ success: false, error: err.message });
    }
    if (err instanceof EntityNotFoundError) {
        return reply.status(404).send({ success: false, error: err.message });
    }
    throw err;
}

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
        schema: { tags: ['Заявки'], summary: 'Список заявок', description: 'Получить список заявок с фильтрацией по статусу, контрагенту, дате и поиском. Поддерживает пагинацию. Для водителей/клиентов — только свои заявки (RLS).' },
        preHandler: [app.authenticate, requireAbility('read', 'Order')],
    }, async (request, reply) => {
        const user = request.user as { userId: string; roles: string[]; organizationId?: string };
        const query = request.query as {
            status?: string;
            contractorId?: string;
            dateFrom?: string;
            dateTo?: string;
            search?: string;
            page?: string;
            limit?: string;
        };

        const privileged = hasPrivilege(user.roles);
        let rlsDriverId: string | undefined = undefined;
        let rlsContractorId = query.contractorId;

        // H-5: RLS — drivers can only see their own orders
        if (!privileged && user.roles.includes('driver')) {
            const myDriverId = await resolveDriverId(user.userId);
            if (myDriverId) rlsDriverId = myDriverId;
        }

        // H-6: RLS — clients can only see their own orders
        if (!privileged && user.roles.includes('client')) {
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
            organizationId: user.organizationId,
        });

        return { success: true, ...result };
    });

    // --- GET /orders/list — denormalized list for /orders page (table view) ---
    // H1: возвращает orders + contractor + assigned trip за один запрос.
    // Используется новой страницей /orders (table view для logist/dispatcher/manager/accountant).
    // Org-scoping обязательный + RLS для driver/client (через тот же паттерн что и /orders).
    app.get('/orders/list', {
        schema: { tags: ['Заявки'], summary: 'Список заявок (denormalized)', description: 'Заявки с прикреплённым контрагентом и назначенным рейсом. Поиск по номеру, адресам и имени контрагента.' },
        preHandler: [app.authenticate, requireAbility('read', 'Order')],
    }, async (request) => {
        const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
        const query = request.query as {
            status?: string;
            contractorId?: string;
            dateFrom?: string;
            dateTo?: string;
            search?: string;
            hasTrip?: string;
            page?: string;
            limit?: string;
        };

        let rlsContractorId = query.contractorId;
        if (!hasPrivilege(user.roles) && user.roles.includes('client')) {
            const myContractorId = await resolveContractorId(user.userId);
            if (myContractorId) rlsContractorId = myContractorId;
        }
        // Note: driver-RLS у этого endpoint'а отсутствует намеренно — таблица /orders
        // не предназначена для driver-роли (у них своя мобильная страница рейсов).

        const result = await getOrdersList({
            status: query.status,
            contractorId: rlsContractorId,
            dateFrom: query.dateFrom,
            dateTo: query.dateTo,
            search: query.search,
            hasTrip: query.hasTrip === 'true' ? true : query.hasTrip === 'false' ? false : undefined,
            page: query.page ? parseInt(query.page, 10) : undefined,
            limit: query.limit ? parseInt(query.limit, 10) : undefined,
            organizationId: user.organizationId,
        });

        // K3 RBAC — финансовые поля видят только manager+/accountant/admin.
        // Logist/dispatcher вводят свою цену, но в списке её не получают
        // (commercial-info защита).
        const canViewFinance = user.roles.includes('manager')
            || user.roles.includes('accountant')
            || user.roles.includes('admin');
        if (!canViewFinance) {
            result.data = result.data.map((r) => ({
                ...r,
                customerPrice: null,
                customerPriceIncludesVat: false,
            }));
        }

        return { success: true, ...result };
    });

    // --- GET /orders/kanban — grouped by status ---
    app.get('/orders/kanban', {
        schema: { tags: ['Заявки'], summary: 'Kanban доска', description: 'Заявки сгруппированные по статусам для Kanban-доски логиста.' },
        preHandler: [app.authenticate, requireAbility('read', 'Order')],
    }, async (request) => {
        const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
        const query = request.query as {
            contractorId?: string;
            dateFrom?: string;
            dateTo?: string;
        };

        let rlsContractorId = query.contractorId;
        if (!hasPrivilege(user.roles) && user.roles.includes('client')) {
            const myContractorId = await resolveContractorId(user.userId);
            if (myContractorId) rlsContractorId = myContractorId;
        }

        const kanban = await getOrdersKanban({
            contractorId: rlsContractorId,
            dateFrom: query.dateFrom,
            dateTo: query.dateTo,
            organizationId: user.organizationId,
        });

        return { success: true, data: kanban };
    });

    // --- POST /orders/:id/lots/split — split one order into transportable lots ---
    app.post('/orders/:id/lots/split', {
        schema: { tags: ['Заявки'], summary: 'Разбить заявку на партии' },
        preHandler: [app.authenticate, requireAbility('update', 'Order')],
    }, async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
            await assertOrderAccess(id, user);
            const lots = await splitOrderIntoLots(id, request.body as { maxWeightKg?: number; lotCount?: number }, { userId: user.userId, role: user.roles[0], organizationId: user.organizationId });
            return reply.status(201).send({ success: true, data: lots });
        } catch (err: any) {
            return reply.status(400).send({ success: false, error: err.message });
        }
    });

    // --- GET /orders/:id/fulfillment — Operational Core v2 read model ---
    app.get('/orders/:id/fulfillment', {
        schema: { tags: ['Заявки'], summary: 'Фулфилмент заявки', description: 'Партии, назначения, факты и остатки по заявке.' },
        preHandler: [app.authenticate, requireAbility('read', 'Order')],
    }, async (request, reply) => {
        const { id } = request.params as { id: string };
        const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
        try {
            await assertOrderAccess(id, user);
        } catch (err) {
            return sendAccessError(reply, err);
        }

        const fulfillment = await getOrderFulfillment(id, user.organizationId);
        if (!fulfillment) {
            return reply.status(404).send({ success: false, error: 'Заявка не найдена' });
        }

        return { success: true, data: fulfillment };
    });

    // --- GET /orders/:id ---
    app.get('/orders/:id', {
        schema: { tags: ['Заявки'], summary: 'Получить заявку', description: 'Получить заявку по ID. Проверка доступа (RLS) для водителей и клиентов.' },
        preHandler: [app.authenticate, requireAbility('read', 'Order')],
    }, async (request, reply) => {
        const { id } = request.params as { id: string };
        const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
        try {
            await assertOrderAccess(id, user);
        } catch (err) {
            return sendAccessError(reply, err);
        }

        const order = await getOrderById(id);
        if (!order) {
            return reply.status(404).send({ success: false, error: 'Заявка не найдена' });
        }

        // K3 RBAC — финансовые поля только manager+/accountant/admin.
        const canViewFinance = user.roles.includes('manager')
            || user.roles.includes('accountant')
            || user.roles.includes('admin');
        const filteredOrder = canViewFinance ? order : {
            ...order,
            customerPrice: null,
            customerPriceIncludesVat: false,
        };

        return { success: true, data: filteredOrder };
    });

    // --- GET /orders/:id/ttn — Download ТТН as PDF ---
    app.get('/orders/:id/ttn', {
        schema: { tags: ['Заявки'], summary: 'PDF ТТН', description: 'Скачать товарно-транспортную накладную (форма 1-Т) в формате PDF.' },
        preHandler: [app.authenticate, requireAbility('read', 'Order')],
    }, async (request, reply) => {
        const { id } = request.params as { id: string };
        const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
        try {
            await assertOrderAccess(id, user);
        } catch (err) {
            return sendAccessError(reply, err);
        }

        const order = await getOrderById(id);
        if (!order) {
            return reply.status(404).send({ success: false, error: 'Заявка не найдена' });
        }

        try {
            const { vehicles, drivers: driversTable, contractors, waybills } = await import('../../db/schema.js');

            const [contractor] = order.contractorId
                ? await db.select({ name: contractors.name, inn: contractors.inn, kpp: contractors.kpp, legalAddress: contractors.legalAddress })
                    .from(contractors).where(eq(contractors.id, order.contractorId)).limit(1)
                : [null];

            // Sprint 14: Use separate consignee contractor if specified
            const consigneeContractorId = (order as typeof order & { consigneeContractorId?: string | null }).consigneeContractorId ?? order.contractorId;
            const [consigneeContractor] = consigneeContractorId && consigneeContractorId !== order.contractorId
                ? await db.select({ name: contractors.name, inn: contractors.inn, kpp: contractors.kpp, legalAddress: contractors.legalAddress })
                    .from(contractors).where(eq(contractors.id, consigneeContractorId)).limit(1)
                : [contractor];

            let vehicleMake, vehicleModel, vehiclePlate, driverName, driverLicense, waybillNumber, tripNumber, distanceKm;

            if (order.tripId) {
                const [trip] = await db.select().from(trips).where(eq(trips.id, order.tripId)).limit(1);
                if (trip) {
                    tripNumber = trip.number;
                    distanceKm = trip.actualDistanceKm ? Number(trip.actualDistanceKm) : undefined;

                    if (trip.vehicleId) {
                        const [veh] = await db.select({ make: vehicles.make, model: vehicles.model, plateNumber: vehicles.plateNumber })
                            .from(vehicles).where(eq(vehicles.id, trip.vehicleId)).limit(1);
                        vehicleMake = veh?.make;
                        vehicleModel = veh?.model;
                        vehiclePlate = veh?.plateNumber;
                    }
                    if (trip.driverId) {
                        const [drv] = await db.select({ fullName: driversTable.fullName, licenseNumber: driversTable.licenseNumber })
                            .from(driversTable).where(eq(driversTable.id, trip.driverId)).limit(1);
                        driverName = drv?.fullName;
                        driverLicense = drv?.licenseNumber;
                    }
                    if (trip.waybillId) {
                        const [wb] = await db.select({ number: waybills.number }).from(waybills).where(eq(waybills.id, trip.waybillId)).limit(1);
                        waybillNumber = wb?.number;
                    }
                }
            }

            const { generateTtnPdf } = await import('../documents/ttn-pdf.js');
            const pdfBuffer = await generateTtnPdf({
                orderNumber: order.number,
                date: order.createdAt,
                shipperName: contractor?.name ?? '—',
                shipperInn: contractor?.inn,
                shipperAddress: contractor?.legalAddress,
                consigneeName: consigneeContractor?.name ?? order.unloadingAddress ?? '—',
                consigneeInn: consigneeContractor?.inn ?? null,
                consigneeAddress: order.unloadingAddress,
                cargoDescription: order.cargoDescription ?? '—',
                cargoWeightKg: order.cargoWeightKg ? Number(order.cargoWeightKg) : null,
                vehicleMake,
                vehicleModel,
                vehiclePlate,
                driverName,
                driverLicense,
                loadingAddress: order.loadingAddress ?? '—',
                unloadingAddress: order.unloadingAddress ?? '—',
                distanceKm,
                tripNumber,
                waybillNumber,
            });

            reply.header('Content-Type', 'application/pdf');
            reply.header('Content-Disposition', `attachment; filename="ttn_${order.number}.pdf"`);
            reply.header('Content-Length', pdfBuffer.length);
            return reply.send(pdfBuffer);
        } catch (error: any) {
            request.log.error(error);
            return reply.status(500).send({ success: false, error: error.message });
        }
    });

    // --- POST /orders — create ---
    app.post('/orders', {
        schema: { tags: ['Заявки'], summary: 'Создать заявку', description: 'Создание новой заявки на перевозку. Валидация через Zod. Автоматическая генерация номера.' },
        preHandler: [app.authenticate, requireAbility('create', 'Order')],
    }, async (request, reply) => {
        try {
            const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
            const body = request.body as Record<string, unknown>;

            // Validate with Zod (omit id, number, status etc.)
            const parsed = OrderCreateSchema.parse({
                ...body,
                createdBy: user.userId,
            });

            const order = await createOrder(parsed, {
                userId: user.userId,
                role: user.roles[0],
                organizationId: user.organizationId ?? null,
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
        schema: { tags: ['Заявки'], summary: 'Обновить заявку', description: 'Частичное обновление заявки. IDOR-защита: проверка владения.' },
        preHandler: [app.authenticate, requireAbility('update', 'Order')],
    }, async (request, reply) => {
        const { id } = request.params as { id: string };
        const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };

        // IDOR guard: verify ownership
        try {
            await assertOrderAccess(id, user);
        } catch (err: any) {
            return sendAccessError(reply, err);
        }

        const parseResult = OrderUpdateSchema.safeParse(request.body);
        if (!parseResult.success) {
            return reply.status(400).send({
                success: false,
                error: 'Ошибка валидации',
                details: parseResult.error.flatten().fieldErrors,
            });
        }

        const order = await updateOrder(id, parseResult.data, user.organizationId ?? null, {
            userId: user.userId,
            role: user.roles[0],
        });
        if (!order) {
            return reply.status(404).send({ success: false, error: 'Заявка не найдена' });
        }

        return { success: true, data: order };
    });

    // --- POST /orders/:id/status — generic status transition (state machine) ---
    app.post('/orders/:id/status', {
        schema: { tags: ['Заявки'], summary: 'Изменить статус заявки', description: 'Переход статуса через state machine. Валидация допустимости перехода.' },
        preHandler: [app.authenticate, requireAbility('update', 'Order')],
    }, async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
            const body = request.body as { status: string; reason?: string };

            if (!body.status) {
                return reply.status(400).send({ success: false, error: 'Поле status обязательно' });
            }

            // IDOR guard: verify ownership
            await assertOrderAccess(id, user);

            const order = await changeOrderStatus(id, body.status, {
                userId: user.userId,
                role: user.roles[0],
            }, body.reason ? { reason: body.reason } : undefined);

            return { success: true, data: order };
        } catch (err: any) {
            if (err instanceof AccessDeniedError) {
                return reply.status(403).send({ success: false, error: err.message });
            }
            return reply.status(400).send({ success: false, error: err.message });
        }
    });

    // --- POST /orders/:id/confirm ---
    app.post('/orders/:id/confirm', {
        schema: { tags: ['Заявки'], summary: 'Подтвердить заявку', description: 'Перевод заявки в статус «подтверждена». Валидация state machine.' },
        preHandler: [app.authenticate, requireAbility('update', 'Order')],
    }, async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };

            // IDOR guard: verify ownership
            await assertOrderAccess(id, user);

            const order = await changeOrderStatus(id, 'confirmed', {
                userId: user.userId,
                role: user.roles[0],
            });

            return { success: true, data: order };
        } catch (err: any) {
            if (err instanceof AccessDeniedError) {
                return reply.status(403).send({ success: false, error: err.message });
            }
            return reply.status(400).send({ success: false, error: err.message });
        }
    });

    // --- POST /orders/:id/cancel ---
    app.post('/orders/:id/cancel', {
        schema: { tags: ['Заявки'], summary: 'Отменить заявку', description: 'Отмена заявки с указанием причины. IDOR-защита.' },
        preHandler: [app.authenticate, requireAbility('update', 'Order')],
    }, async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
            const body = request.body as { reason?: string };

            // IDOR guard: verify ownership
            await assertOrderAccess(id, user);

            const order = await changeOrderStatus(id, 'cancelled', {
                userId: user.userId,
                role: user.roles[0],
            }, { reason: body?.reason });

            return { success: true, data: order };
        } catch (err: any) {
            if (err instanceof AccessDeniedError) {
                return reply.status(403).send({ success: false, error: err.message });
            }
            return reply.status(400).send({ success: false, error: err.message });
        }
    });

    // --- POST /orders/from-template ---
    app.post('/orders/from-template', {
        schema: { tags: ['Заявки'], summary: 'Создать из шаблона', description: 'Создание заявки на основе существующей (копирование с переопределением полей).' },
        preHandler: [app.authenticate, requireAbility('create', 'Order')],
    }, async (request, reply) => {
        try {
            const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
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
                { userId: user.userId, role: user.roles[0], organizationId: user.organizationId ?? null },
            );

            return reply.status(201).send({ success: true, data: order });
        } catch (err: any) {
            return reply.status(400).send({ success: false, error: err.message });
        }
    });
};

export default ordersRoutes;
