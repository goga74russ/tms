import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, desc, eq, ilike, inArray, sql } from 'drizzle-orm';
import { requireAbility } from '../../auth/rbac.js';
import { assertIncidentAccess, assertVehicleAccess, assertDriverAccess, assertTripAccess, assertWaybillAccess, resolveDriverId } from '../../auth/guards.js';
import { db } from '../../db/connection.js';
import {
    incidents,
    trailers,
    waybillDrivers,
    waybillExpenses,
    waybills,
    drivers,
    vehicles,
} from '../../db/schema.js';
import { containsLikePattern } from '../../utils/search.js';
import { incidentCreateSchema } from './incidents.validators.js';

const paginationSchema = z.object({
    page: z.coerce.number().int().min(1).default(1).catch(1),
    limit: z.coerce.number().int().min(1).default(20).catch(20).transform((limit) => Math.min(limit, 100)),
});

const trailerCreateSchema = z.object({
    plateNumber: z.string().min(1),
    vin: z.string().max(17).optional(),
    type: z.enum(['tent', 'board', 'refrigerator', 'cistern', 'flatbed', 'container', 'other']),
    make: z.string().optional(),
    model: z.string().optional(),
    year: z.number().int().min(1900).max(2100).optional(),
    payloadCapacityKg: z.number().positive().optional(),
    payloadVolumeM3: z.number().positive().optional(),
    techInspectionExpiry: z.string().datetime().optional(),
    osagoExpiry: z.string().datetime().optional(),
    tachographCalibrationExpiry: z.string().datetime().optional(),
    currentVehicleId: z.string().uuid().optional(),
    isArchived: z.boolean().optional(),
});

const waybillDriverCreateSchema = z.object({
    driverId: z.string().uuid(),
    shiftStart: z.string().datetime().optional(),
    shiftEnd: z.string().datetime().optional(),
    isPrimary: z.boolean().default(false),
});

const waybillExpenseCreateSchema = z.object({
    category: z.enum(['fuel', 'platon', 'parking', 'fine', 'repair', 'toll', 'other']),
    description: z.string().max(255).optional(),
    plannedAmount: z.number().nonnegative().optional(),
    actualAmount: z.number().nonnegative().optional(),
    receiptUrl: z.string().url().optional(),
});

function toPagination(query: unknown) {
    return paginationSchema.parse(query);
}

export default async function sprint9Routes(app: FastifyInstance) {
    app.get('/fleet/trailers', {
        schema: { tags: ['Автопарк'], summary: 'Список прицепов', description: 'Список прицепов с поиском Рё фильтрацией.' },
        preHandler: [app.authenticate, requireAbility('read', 'Trailer')],
    }, async (request) => {
        const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
        const { page, limit } = toPagination(request.query);
        const { search, archived } = request.query as { search?: string; archived?: string };
        const conditions = [];
        if (user.organizationId) conditions.push(eq(trailers.organizationId, user.organizationId));
        if (search) {
            conditions.push(
                sql`(${trailers.plateNumber} ILIKE ${`%${search}%`} OR ${trailers.make} ILIKE ${`%${search}%`} OR ${trailers.model} ILIKE ${`%${search}%`})`
            );
        }
        if (archived !== undefined) conditions.push(eq(trailers.isArchived, archived === 'true'));
        const where = conditions.length ? and(...conditions) : undefined;
        const offset = (page - 1) * limit;

        const [rows, totalResult] = await Promise.all([
            db.select().from(trailers).where(where).orderBy(desc(trailers.createdAt)).limit(limit).offset(offset),
            db.select({ count: sql<number>`count(*)::int` }).from(trailers).where(where),
        ]);

        return { success: true, data: rows, total: totalResult[0]?.count ?? 0, page, limit };
    });

    app.post('/fleet/trailers', {
        schema: { tags: ['Автопарк'], summary: 'Добавить прицеп', description: 'Создание нового прицепа.' },
        preHandler: [app.authenticate, requireAbility('create', 'Trailer')],
    }, async (request, reply) => {
        const parsed = trailerCreateSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({ success: false, error: 'Ошибка валидации данных', details: parsed.error.flatten() });
        }
        const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
        if (parsed.data.currentVehicleId) {
            await assertVehicleAccess(parsed.data.currentVehicleId, user);
        }

        const [created] = await db.insert(trailers).values({
            ...parsed.data,
            organizationId: user.organizationId ?? null,
            techInspectionExpiry: parsed.data.techInspectionExpiry ? new Date(parsed.data.techInspectionExpiry) : undefined,
            osagoExpiry: parsed.data.osagoExpiry ? new Date(parsed.data.osagoExpiry) : undefined,
            tachographCalibrationExpiry: parsed.data.tachographCalibrationExpiry ? new Date(parsed.data.tachographCalibrationExpiry) : undefined,
        }).returning();

        return reply.status(201).send({ success: true, data: created });
    });

    app.put('/fleet/trailers/:id', {
        schema: { tags: ['Автопарк'], summary: 'Обновить прицеп', description: 'Обновление данных прицепа.' },
        preHandler: [app.authenticate, requireAbility('update', 'Trailer')],
    }, async (request, reply) => {
        const { id } = request.params as { id: string };
        const parsed = trailerCreateSchema.partial().safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({ success: false, error: 'Ошибка валидации данных', details: parsed.error.flatten() });
        }
        const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
        if (parsed.data.currentVehicleId) {
            await assertVehicleAccess(parsed.data.currentVehicleId, user);
        }

        const [updated] = await db.update(trailers).set({
            ...parsed.data,
            techInspectionExpiry: parsed.data.techInspectionExpiry ? new Date(parsed.data.techInspectionExpiry) : undefined,
            osagoExpiry: parsed.data.osagoExpiry ? new Date(parsed.data.osagoExpiry) : undefined,
            tachographCalibrationExpiry: parsed.data.tachographCalibrationExpiry ? new Date(parsed.data.tachographCalibrationExpiry) : undefined,
            updatedAt: new Date(),
        }).where(user.organizationId
            ? and(eq(trailers.id, id), eq(trailers.organizationId, user.organizationId))
            : eq(trailers.id, id)).returning();

        if (!updated) return reply.status(404).send({ success: false, error: 'Прицеп не найден' });
        return { success: true, data: updated };
    });

    app.get('/incidents', {
        schema: { tags: ['Рейсы'], summary: 'Список инцидентов', description: 'Список инцидентов по мед/техосмотрам, ТС, водителям Рё рейсам.' },
        preHandler: [app.authenticate, requireAbility('read', 'Incident')],
    }, async (request) => {
        const user = request.user as { userId: string; roles: string[]; organizationId?: string };
        const { page, limit } = toPagination(request.query);
        const { status, severity, type, vehicleId, driverId, tripId, search } = request.query as Record<string, string | undefined>;
        const conditions = [];
        if (user.organizationId) {
            conditions.push(
                inArray(incidents.vehicleId,
                    db.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.organizationId, user.organizationId))
                )
            );
        }
        if (status) conditions.push(eq(incidents.status, status as any));
        if (severity) conditions.push(eq(incidents.severity, severity as any));
        if (type) conditions.push(eq(incidents.type, type as any));
        if (vehicleId) conditions.push(eq(incidents.vehicleId, vehicleId));
        if (driverId) conditions.push(eq(incidents.driverId, driverId));
        if (tripId) conditions.push(eq(incidents.tripId, tripId));
        // A-P2: escape %/_/\ to prevent pattern-DoS on free-text search.
        if (search) conditions.push(ilike(incidents.description, containsLikePattern(search)));
        if (user.roles.includes('driver')) {
            const myDriverId = await resolveDriverId(user.userId);
            if (myDriverId) {
                conditions.push(eq(incidents.driverId, myDriverId));
            }
        }
        const where = conditions.length ? and(...conditions) : undefined;
        const offset = (page - 1) * limit;

        const [rows, totalResult] = await Promise.all([
            db.select().from(incidents).where(where).orderBy(desc(incidents.createdAt)).limit(limit).offset(offset),
            db.select({ count: sql<number>`count(*)::int` }).from(incidents).where(where),
        ]);

        return { success: true, data: rows, total: totalResult[0]?.count ?? 0, page, limit };
    });

    app.post('/incidents', {
        schema: { tags: ['Рейсы'], summary: 'Создать инцидент', description: 'Создание инцидента с привязкой к ТС/водителю/рейсу.' },
        preHandler: [app.authenticate, requireAbility('create', 'Incident')],
    }, async (request, reply) => {
        const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
        const parsed = incidentCreateSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({ success: false, error: 'Ошибка валидации данных', details: parsed.error.flatten() });
        }

        // B3.3: org-scope для каждого FK. Прежний код не проверял, что
        // vehicleId/driverId/tripId принадлежат той же организации, что
        // и actor — tenant-admin Org-A мог создать incident, ссылающийся
        // на ТС/рейс Org-B (cross-tenant referencing).
        if (parsed.data.vehicleId) await assertVehicleAccess(parsed.data.vehicleId, user);
        if (parsed.data.driverId) await assertDriverAccess(parsed.data.driverId, user);
        if (parsed.data.tripId) await assertTripAccess(parsed.data.tripId, user);

        const [created] = await db.insert(incidents).values({
            ...parsed.data,
            resolvedAt: parsed.data.resolvedAt ? new Date(parsed.data.resolvedAt) : undefined,
            createdBy: user.userId,
        }).returning();

        return reply.status(201).send({ success: true, data: created });
    });

    app.put('/incidents/:id', {
        schema: { tags: ['Рейсы'], summary: 'Обновить инцидент', description: 'Обновление статуса, resolution Рё блокировки выпуска.' },
        preHandler: [app.authenticate, requireAbility('update', 'Incident')],
    }, async (request, reply) => {
        const { id } = request.params as { id: string };
        const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
        await assertIncidentAccess(id, user);
        const parsed = incidentCreateSchema.partial().safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({ success: false, error: 'Ошибка валидации данных', details: parsed.error.flatten() });
        }

        // B3.3: re-check FK-org-scope если caller пытается перепривязать
        // incident на чужие vehicle/driver/trip через PUT.
        if (parsed.data.vehicleId) await assertVehicleAccess(parsed.data.vehicleId, user);
        if (parsed.data.driverId) await assertDriverAccess(parsed.data.driverId, user);
        if (parsed.data.tripId) await assertTripAccess(parsed.data.tripId, user);

        const [updated] = await db.update(incidents).set({
            ...parsed.data,
            resolvedAt: parsed.data.resolvedAt ? new Date(parsed.data.resolvedAt) : undefined,
            updatedAt: new Date(),
        }).where(eq(incidents.id, id)).returning();

        if (!updated) return reply.status(404).send({ success: false, error: 'Инцидент не найден' });
        return { success: true, data: updated };
    });

    app.get('/waybills/:id/drivers', {
        schema: { tags: ['Путевые листы'], summary: 'Водители путевого листа', description: 'Список водителей, привязанных к путевому листу.' },
        preHandler: [app.authenticate, requireAbility('read', 'WaybillDriver')],
    }, async (request, reply) => {
        const { id } = request.params as { id: string };
        await assertWaybillAccess(id, request.user as { userId: string; roles: string[] });

        const rows = await db.select({
            id: waybillDrivers.id,
            waybillId: waybillDrivers.waybillId,
            driverId: waybillDrivers.driverId,
            shiftStart: waybillDrivers.shiftStart,
            shiftEnd: waybillDrivers.shiftEnd,
            isPrimary: waybillDrivers.isPrimary,
            createdAt: waybillDrivers.createdAt,
            driverName: drivers.fullName,
            licenseNumber: drivers.licenseNumber,
        }).from(waybillDrivers)
            .innerJoin(drivers, eq(waybillDrivers.driverId, drivers.id))
            .where(eq(waybillDrivers.waybillId, id))
            .orderBy(desc(waybillDrivers.isPrimary), desc(waybillDrivers.createdAt));

        return { success: true, data: rows };
    });

    app.post('/waybills/:id/drivers', {
        schema: { tags: ['Путевые листы'], summary: 'Добавить водителя в путевой', description: 'Привязка дополнительного водителя к путевому листу.' },
        preHandler: [app.authenticate, requireAbility('create', 'WaybillDriver')],
    }, async (request, reply) => {
        const { id } = request.params as { id: string };
        await assertWaybillAccess(id, request.user as { userId: string; roles: string[] });
        const parsed = waybillDriverCreateSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({ success: false, error: 'Ошибка валидации данных', details: parsed.error.flatten() });
        }

        const [waybill] = await db.select({ id: waybills.id }).from(waybills).where(eq(waybills.id, id)).limit(1);
        if (!waybill) return reply.status(404).send({ success: false, error: 'Путевой лист не найден' });

        const [driver] = await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.id, parsed.data.driverId)).limit(1);
        if (!driver) return reply.status(404).send({ success: false, error: 'Водитель не найден' });

        const existing = await db.select({ id: waybillDrivers.id }).from(waybillDrivers)
            .where(and(eq(waybillDrivers.waybillId, id), eq(waybillDrivers.driverId, parsed.data.driverId))).limit(1);
        if (existing[0]) {
            return reply.status(409).send({ success: false, error: 'Водитель уже привязан к путевому листу' });
        }

        if (parsed.data.isPrimary) {
            await db.update(waybillDrivers).set({ isPrimary: false }).where(eq(waybillDrivers.waybillId, id));
        }

        const [created] = await db.insert(waybillDrivers).values({
            waybillId: id,
            driverId: parsed.data.driverId,
            shiftStart: parsed.data.shiftStart ? new Date(parsed.data.shiftStart) : undefined,
            shiftEnd: parsed.data.shiftEnd ? new Date(parsed.data.shiftEnd) : undefined,
            isPrimary: parsed.data.isPrimary,
        }).returning();

        return reply.status(201).send({ success: true, data: created });
    });

    app.delete('/waybills/:waybillId/drivers/:driverLinkId', {
        schema: { tags: ['Путевые листы'], summary: 'Удалить водителя из путевого', description: 'Удаление связи водитель-путевой лист.' },
        preHandler: [app.authenticate, requireAbility('delete', 'WaybillDriver')],
    }, async (request, reply) => {
        const { waybillId, driverLinkId } = request.params as { waybillId: string; driverLinkId: string };
        await assertWaybillAccess(waybillId, request.user as { userId: string; roles: string[] });

        const [deleted] = await db.delete(waybillDrivers)
            .where(and(eq(waybillDrivers.id, driverLinkId), eq(waybillDrivers.waybillId, waybillId)))
            .returning();
        if (!deleted) return reply.status(404).send({ success: false, error: 'Связь не найдена' });
        return { success: true, data: deleted };
    });

    app.get('/waybills/:id/expenses', {
        schema: { tags: ['Путевые листы'], summary: 'Расходы путевого листа', description: 'Список расходов по путевому листу.' },
        preHandler: [app.authenticate, requireAbility('read', 'WaybillExpense')],
    }, async (request) => {
        const { id } = request.params as { id: string };
        await assertWaybillAccess(id, request.user as { userId: string; roles: string[] });

        const rows = await db.select().from(waybillExpenses)
            .where(eq(waybillExpenses.waybillId, id))
            .orderBy(desc(waybillExpenses.createdAt));

        return { success: true, data: rows };
    });

    app.post('/waybills/:id/expenses', {
        schema: { tags: ['Путевые листы'], summary: 'Добавить расход', description: 'Добавление расхода к путевому листу.' },
        preHandler: [app.authenticate, requireAbility('create', 'WaybillExpense')],
    }, async (request, reply) => {
        const user = request.user as { userId: string; roles: string[] };
        const { id } = request.params as { id: string };
        await assertWaybillAccess(id, user);
        const parsed = waybillExpenseCreateSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({ success: false, error: 'Ошибка валидации данных', details: parsed.error.flatten() });
        }

        const [created] = await db.insert(waybillExpenses).values({
            waybillId: id,
            category: parsed.data.category,
            description: parsed.data.description,
            plannedAmount: parsed.data.plannedAmount,
            actualAmount: parsed.data.actualAmount,
            receiptUrl: parsed.data.receiptUrl,
            createdBy: user.userId,
        }).returning();

        return reply.status(201).send({ success: true, data: created });
    });

    app.put('/waybills/:waybillId/expenses/:expenseId', {
        schema: { tags: ['Путевые листы'], summary: 'Обновить расход', description: 'Редактирование расхода путевого листа.' },
        preHandler: [app.authenticate, requireAbility('update', 'WaybillExpense')],
    }, async (request, reply) => {
        const { waybillId, expenseId } = request.params as { waybillId: string; expenseId: string };
        await assertWaybillAccess(waybillId, request.user as { userId: string; roles: string[] });
        const parsed = waybillExpenseCreateSchema.partial().safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({ success: false, error: 'Ошибка валидации данных', details: parsed.error.flatten() });
        }

        const [updated] = await db.update(waybillExpenses).set(parsed.data)
            .where(and(eq(waybillExpenses.id, expenseId), eq(waybillExpenses.waybillId, waybillId)))
            .returning();
        if (!updated) return reply.status(404).send({ success: false, error: 'Расход не найден' });
        return { success: true, data: updated };
    });

    app.delete('/waybills/:waybillId/expenses/:expenseId', {
        schema: { tags: ['Путевые листы'], summary: 'Удалить расход', description: 'Удаление расхода путевого листа.' },
        preHandler: [app.authenticate, requireAbility('delete', 'WaybillExpense')],
    }, async (request, reply) => {
        const { waybillId, expenseId } = request.params as { waybillId: string; expenseId: string };
        await assertWaybillAccess(waybillId, request.user as { userId: string; roles: string[] });
        const [deleted] = await db.delete(waybillExpenses)
            .where(and(eq(waybillExpenses.id, expenseId), eq(waybillExpenses.waybillId, waybillId)))
            .returning();
        if (!deleted) return reply.status(404).send({ success: false, error: 'Расход не найден' });
        return { success: true, data: deleted };
    });
}
