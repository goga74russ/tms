// ============================================================
// Fleet Routes — Fastify plugin (§3.10–3.15 ТЗ)
// Vehicles, Drivers, Contractors, Permits, Fines
// ============================================================
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAbility } from '../../auth/rbac.js';
import { assertDriverAccess, assertTripAccess, assertVehicleAccess, resolveDriverId, isPlatformSuperAdmin } from '../../auth/guards.js';
import * as fleetService from './service.js';
import { safeClientError } from '../../utils/safe-error.js';
import {
    VehicleCreateSchema, DriverCreateSchema, DriverUpdateSchema, ContractorCreateSchema,
    PermitCreateSchema, PermitUpdateSchema, FineCreateSchema, FineUpdateSchema,
    PRIVILEGED_ROLES, hasPrivilege,
    FuelRecordCreateSchema, OdometerReadingCreateSchema,
    DowntimeRecordCreateSchema, DowntimeRecordUpdateSchema,
    MaintenancePlanCreateSchema, MaintenancePlanUpdateSchema,
} from '@tms/shared';

// ---- Query param types ----
type PaginationQuery = { page?: string; limit?: string; search?: string };
type VehicleQuery = PaginationQuery & { status?: string; archived?: string };
type DriverQuery = PaginationQuery & { active?: string };
type ContractorQuery = PaginationQuery & { archived?: string };
type PermitQuery = PaginationQuery & { vehicleId?: string; active?: string };
type FineQuery = PaginationQuery & { vehicleId?: string; driverId?: string; status?: string };
type FineAnalyticsQuery = { vehicleId?: string; driverId?: string };

type AuthUser = { userId: string; roles: string[]; organizationId?: string };
type FuelRecordsQuery = {
    vehicleId?: string; driverId?: string; tripId?: string;
    dateFrom?: string; dateTo?: string;
    page?: string; limit?: string;
};
type OdometerQuery = {
    vehicleId?: string; source?: string;
    dateFrom?: string; dateTo?: string;
    page?: string; limit?: string;
};
type DowntimeQuery = {
    vehicleId?: string; reasonCode?: string; openOnly?: string;
    dateFrom?: string; dateTo?: string;
    page?: string; limit?: string;
};
type MaintenanceQuery = {
    vehicleId?: string; status?: string; maintenanceType?: string;
    dateFrom?: string; dateTo?: string;
    page?: string; limit?: string;
};

function sanitizeDriverForViewer(driver: any, viewer: { userId: string; roles: string[] }, ownDriverId?: string | null) {
    if (!driver) return driver;
    const canSeeMedical = viewer.roles.includes('medic') || (viewer.roles.includes('driver') && ownDriverId === driver.id);
    if (canSeeMedical) return driver;

    const { medCertificateExpiry, birthDate, personalDataConsent, personalDataConsentDate, ...safeDriver } = driver;
    return safeDriver;
}

export default async function fleetRoutes(app: FastifyInstance) {
    async function assertScopedRefs(input: {
        vehicleId?: string | null;
        driverId?: string | null;
        tripId?: string | null;
    }, user: { userId: string; roles: string[]; organizationId?: string | null }) {
        if (input.vehicleId) await assertVehicleAccess(input.vehicleId, user);
        if (input.driverId) await assertDriverAccess(input.driverId, user);
        if (input.tripId) await assertTripAccess(input.tripId, user);
    }

    // ========================================
    // VEHICLES
    // ========================================

    app.get('/fleet/vehicles', {
        schema: { tags: ['Автопарк'], summary: 'Список ТС', description: 'Все транспортные средства с фильтрацией по статусу и поиском.' },
        preHandler: [app.authenticate, requireAbility('read', 'Vehicle')],
    }, async (request, reply) => {
        const { page, limit, status, search, archived } = request.query as VehicleQuery;
        const parsedPage = page ? Number(page) : undefined;
        const parsedLimit = limit ? Number(limit) : undefined;
        const user = request.user as { userId: string; roles: string[]; organizationId?: string };
        const result = await fleetService.listVehicles(
            { status, search, isArchived: archived === 'true', organizationId: user.organizationId, crossTenant: isPlatformSuperAdmin(user) },
            { page: Number.isFinite(parsedPage) ? parsedPage : undefined, limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined },
        );
        return { success: true, data: result.data, ...result.pagination };
    });

    app.get('/fleet/vehicles/:id', {
        schema: { tags: ['Автопарк'], summary: 'Получить ТС', description: 'Детальная информация о транспортном средстве по ID.' },
        preHandler: [app.authenticate, requireAbility('read', 'Vehicle')],
    }, async (request, reply) => {
        const { id } = request.params as { id: string };
        const user = request.user as { userId: string; roles: string[]; organizationId?: string };
        const vehicle = await fleetService.getVehicle(id, user.organizationId, isPlatformSuperAdmin(user));
        if (!vehicle) return reply.status(404).send({ success: false, error: 'ТС не найдено' });
        return { success: true, data: vehicle };
    });

    app.post('/fleet/vehicles', {
        schema: { tags: ['Автопарк'], summary: 'Добавить ТС', description: 'Регистрация нового транспортного средства. Валидация VIN и госномера.' },
        preHandler: [app.authenticate, requireAbility('create', 'Vehicle')],
    }, async (request, reply) => {
        try {
            const user = request.user as { userId: string; roles: string[]; organizationId?: string };
            // H-4: Zod validation
            const parsed = VehicleCreateSchema.safeParse(request.body);
            if (!parsed.success) return reply.status(400).send({ success: false, error: 'Ошибка валидации данных', details: parsed.error.flatten() });
            const vehicle = await fleetService.createVehicle(parsed.data as z.infer<typeof VehicleCreateSchema>, user);
            return reply.status(201).send({ success: true, data: vehicle });
        } catch (err: any) {
            return reply.status(400).send({ success: false, error: safeClientError(err, 'Внутренняя ошибка сервера') });
        }
    });

    app.put('/fleet/vehicles/:id', {
        schema: { tags: ['Автопарк'], summary: 'Обновить ТС', description: 'Обновление данных ТС (пробег, статус, документы).' },
        preHandler: [app.authenticate, requireAbility('update', 'Vehicle')],
    }, async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
            // H-4: Zod partial validation for updates
            const parsed = VehicleCreateSchema.partial().safeParse(request.body);
            if (!parsed.success) return reply.status(400).send({ success: false, error: 'Ошибка валидации данных', details: parsed.error.flatten() });
            const vehicle = await fleetService.updateVehicle(id, parsed.data as z.infer<typeof VehicleCreateSchema>, user);
            return { success: true, data: vehicle };
        } catch (err: any) {
            return reply.status(400).send({ success: false, error: safeClientError(err, 'Внутренняя ошибка сервера') });
        }
    });

    // ========================================
    // DRIVERS
    // ========================================

    app.get('/fleet/drivers', {
        schema: { tags: ['Автопарк'], summary: 'Список водителей', description: 'Все водители с поиском по ФИО и номеру ВУ.' },
        preHandler: [app.authenticate, requireAbility('read', 'Driver')],
    }, async (request, reply) => {
        const user = request.user as { userId: string; roles: string[]; organizationId?: string };

        // RLS: driver can only see self
        if (!hasPrivilege(user.roles) && user.roles.includes('driver')) {
            const myDriverId = await resolveDriverId(user.userId);
            if (!myDriverId) {
                return { success: true, data: [], total: 0, page: 1, limit: 1 };
            }
            const driver = await fleetService.getDriver(myDriverId, user.organizationId);
            const safeDriver = driver ? sanitizeDriverForViewer(driver, user, myDriverId) : null;
            return { success: true, data: safeDriver ? [safeDriver] : [], total: safeDriver ? 1 : 0, page: 1, limit: 1 };
        }

        const { page, limit, search, active } = request.query as DriverQuery;
        const result = await fleetService.listDrivers(
            { search, isActive: active !== undefined ? active === 'true' : undefined, organizationId: user.organizationId },
            { page: Number(page), limit: Number(limit) },
        );
        const safeDrivers = result.data.map((driver) => sanitizeDriverForViewer(driver, user));
        return { success: true, data: safeDrivers, ...result.pagination };
    });

    app.get('/fleet/drivers/:id', {
        schema: { tags: ['Автопарк'], summary: 'Получить водителя', description: 'Детальная информация о водителе по ID.' },
        preHandler: [app.authenticate, requireAbility('read', 'Driver')],
    }, async (request, reply) => {
        const { id } = request.params as { id: string };
        const user = request.user as { userId: string; roles: string[]; organizationId?: string };

        // RLS: driver can only see self
        if (!hasPrivilege(user.roles) && user.roles.includes('driver')) {
            const myDriverId = await resolveDriverId(user.userId);
            if (!myDriverId || myDriverId !== id) {
                return reply.status(403).send({ success: false, error: 'Отказано в доступе (чужой профиль)' });
            }
        }

        const driver = await fleetService.getDriver(id, user.organizationId);
        if (!driver) return reply.status(404).send({ success: false, error: 'Водитель не найден' });
        const myDriverId = user.roles.includes('driver') ? await resolveDriverId(user.userId) : null;
        return { success: true, data: sanitizeDriverForViewer(driver, user, myDriverId) };
    });

    app.post('/fleet/drivers', {
        schema: { tags: ['Автопарк'], summary: 'Добавить водителя', description: 'Регистрация нового водителя с привязкой к учётной записи.' },
        preHandler: [app.authenticate, requireAbility('create', 'Driver')],
    }, async (request, reply) => {
        try {
            const user = request.user as { userId: string; roles: string[]; organizationId?: string };
            const parsed = DriverCreateSchema.safeParse(request.body);
            if (!parsed.success) return reply.status(400).send({ success: false, error: 'Ошибка валидации данных', details: parsed.error.flatten() });
            const driver = await fleetService.createDriver(parsed.data as z.infer<typeof DriverCreateSchema>, user);
            return reply.status(201).send({ success: true, data: driver });
        } catch (err: any) {
            return reply.status(400).send({ success: false, error: safeClientError(err, 'Внутренняя ошибка сервера') });
        }
    });

    app.put('/fleet/drivers/:id', {
        schema: { tags: ['Автопарк'], summary: 'Обновить водителя', description: 'Обновление данных водителя (ВУ, медсправка, категории).' },
        preHandler: [app.authenticate, requireAbility('update', 'Driver')],
    }, async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
            // DriverUpdateSchema — whitelist без userId / personalDataConsent
            // (mass-assignment защита: ре-стамп userId = driver-transplant
            // на чужого юзера → RLS-leak; personalDataConsent — write-once
            // по 152-ФЗ).
            const parsed = DriverUpdateSchema.safeParse(request.body);
            if (!parsed.success) return reply.status(400).send({ success: false, error: 'Ошибка валидации данных', details: parsed.error.flatten() });
            const driver = await fleetService.updateDriver(id, parsed.data as z.infer<typeof DriverCreateSchema>, user);
            const myDriverId = user.roles.includes('driver') ? await resolveDriverId(user.userId) : null;
        return { success: true, data: sanitizeDriverForViewer(driver, user, myDriverId) };
        } catch (err: any) {
            return reply.status(400).send({ success: false, error: safeClientError(err, 'Внутренняя ошибка сервера') });
        }
    });

    // ========================================
    // CONTRACTORS
    // ========================================

    app.get('/fleet/contractors', {
        schema: { tags: ['Автопарк'], summary: 'Список контрагентов', description: 'Все контрагенты с поиском.' },
        preHandler: [app.authenticate, requireAbility('read', 'Contractor')],
    }, async (request, reply) => {
        const { page, limit, search, archived } = request.query as ContractorQuery;
        const { organizationId } = request.user as { organizationId?: string };
        const result = await fleetService.listContractors(
            { search, isArchived: archived === 'true', organizationId },
            { page: Number(page), limit: Number(limit) },
        );
        return { success: true, data: result.data, ...result.pagination };
    });

    app.post('/fleet/contractors', {
        schema: { tags: ['Автопарк'], summary: 'Добавить контрагента', description: 'Регистрация нового контрагента. Валидация ИНН/КПП.' },
        preHandler: [app.authenticate, requireAbility('create', 'Contractor')],
    }, async (request, reply) => {
        try {
            const user = request.user as { userId: string; roles: string[]; organizationId?: string };
            const parsed = ContractorCreateSchema.safeParse(request.body);
            if (!parsed.success) return reply.status(400).send({ success: false, error: 'Ошибка валидации данных', details: parsed.error.flatten() });
            const contractor = await fleetService.createContractor(parsed.data as z.infer<typeof ContractorCreateSchema>, user);
            return reply.status(201).send({ success: true, data: contractor });
        } catch (err: any) {
            return reply.status(400).send({ success: false, error: safeClientError(err, 'Внутренняя ошибка сервера') });
        }
    });

    app.put('/fleet/contractors/:id', {
        schema: { tags: ['Автопарк'], summary: 'Обновить контрагента', description: 'Обновление данных контрагента.' },
        preHandler: [app.authenticate, requireAbility('update', 'Contractor')],
    }, async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
            const parsed = ContractorCreateSchema.partial().safeParse(request.body);
            if (!parsed.success) return reply.status(400).send({ success: false, error: 'Ошибка валидации данных', details: parsed.error.flatten() });
            const contractor = await fleetService.updateContractor(id, parsed.data as z.infer<typeof ContractorCreateSchema>, user);
            return { success: true, data: contractor };
        } catch (err: any) {
            return reply.status(400).send({ success: false, error: safeClientError(err, 'Внутренняя ошибка сервера') });
        }
    });

    const contractorAddressSchema = z.object({
        addressString: z.string().trim().min(1),
        lat: z.number(),
        lon: z.number(),
        type: z.enum(['loading', 'unloading']),
        fiasId: z.string().trim().nullable().optional(),
    });

    app.post('/fleet/contractors/:id/addresses', {
        schema: { tags: ['Автопарк'], summary: 'Добавить адрес', description: 'Добавление нового адреса контрагента.' },
        preHandler: [app.authenticate, requireAbility('create', 'Contractor')],
    }, async (request, reply) => {
        const { id } = request.params as { id: string };
        const { organizationId } = request.user as { organizationId?: string };
        const parsed = contractorAddressSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({ success: false, error: 'Ошибка валидации данных', details: parsed.error.flatten() });
        }

        try {
            const address = await fleetService.createContractorAddress(id, parsed.data, organizationId);
            return reply.status(201).send({ success: true, data: address });
        } catch (err: any) {
            return reply.status(400).send({ success: false, error: safeClientError(err, 'Внутренняя ошибка сервера') });
        }
    });

    app.put('/fleet/contractors/:id/addresses/:addressId', {
        schema: { tags: ['Автопарк'], summary: 'Обновить адрес', description: 'Обновление адреса контрагента.' },
        preHandler: [app.authenticate, requireAbility('update', 'Contractor')],
    }, async (request, reply) => {
        const { id, addressId } = request.params as { id: string; addressId: string };
        const { organizationId } = request.user as { organizationId?: string };
        const parsed = contractorAddressSchema.partial().safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({ success: false, error: 'Ошибка валидации данных', details: parsed.error.flatten() });
        }

        try {
            const address = await fleetService.updateContractorAddress(id, addressId, parsed.data, organizationId);
            return { success: true, data: address };
        } catch (err: any) {
            return reply.status(400).send({ success: false, error: safeClientError(err, 'Внутренняя ошибка сервера') });
        }
    });

    app.delete('/fleet/contractors/:id/addresses/:addressId', {
        schema: { tags: ['Автопарк'], summary: 'Удалить адрес', description: 'Удаление адреса контрагента.' },
        preHandler: [app.authenticate, requireAbility('delete', 'Contractor')],
    }, async (request, reply) => {
        const { id, addressId } = request.params as { id: string; addressId: string };
        const { organizationId } = request.user as { organizationId?: string };

        try {
            const deleted = await fleetService.deleteContractorAddress(id, addressId, organizationId);
            return { success: true, data: deleted };
        } catch (err: any) {
            return reply.status(400).send({ success: false, error: safeClientError(err, 'Внутренняя ошибка сервера') });
        }
    });

    /*
    // DaData lookup placeholder
    app.get('/fleet/contractors/:id/addresses', {
        schema: { tags: ['Автопарк'], summary: 'Адреса контрагента', description: 'Список часто используемых адресов погрузки/выгрузки для контрагента.' },
        preHandler: [app.authenticate, requireAbility('read', 'Contractor')],
    }, async (request) => {
        const { id } = request.params as { id: string };
        const { organizationId } = request.user as { organizationId?: string };
        const addresses = await fleetService.listContractorAddresses(id, organizationId);
        return { success: true, data: addresses };
    });

    */

    app.get('/fleet/contractors/lookup/:inn', {
        schema: { tags: ['Автопарк'], summary: 'Поиск по ИНН', description: 'Поиск контрагента по ИНН через DaData.' },
        preHandler: [app.authenticate, requireAbility('read', 'Contractor')],
    }, async (request, reply) => {
        const { inn } = request.params as { inn: string };
        const result = await fleetService.lookupContractorByInn(inn);
        return { success: true, data: result };
    });

    // ========================================
    // PERMITS
    // ========================================

    app.get('/fleet/permits', {
        schema: { tags: ['Автопарк'], summary: 'Список пропусков', description: 'Все пропуска (МКАД, ТТК) с фильтрацией по ТС.' },
        preHandler: [app.authenticate, requireAbility('read', 'Permit')],
    }, async (request, reply) => {
        const { page, limit, vehicleId, active } = request.query as PermitQuery;
        const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
        const result = await fleetService.listPermits(
            { vehicleId, isActive: active !== undefined ? active === 'true' : undefined, organizationId: user.organizationId },
            { page: Number(page), limit: Number(limit) },
        );
        return { success: true, data: result.data, ...result.pagination };
    });

    app.post('/fleet/permits', {
        schema: { tags: ['Автопарк'], summary: 'Добавить пропуск', description: 'Регистрация пропуска на ТС для зоны ограничения.' },
        preHandler: [app.authenticate, requireAbility('create', 'Permit')],
    }, async (request, reply) => {
        try {
            const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
            const parsed = PermitCreateSchema.safeParse(request.body);
            if (!parsed.success) return reply.status(400).send({ success: false, error: 'Ошибка валидации данных', details: parsed.error.flatten() });
            await assertVehicleAccess(parsed.data.vehicleId, user);
            const permit = await fleetService.createPermit(parsed.data as z.infer<typeof PermitCreateSchema>, user);
            return reply.status(201).send({ success: true, data: permit });
        } catch (err: any) {
            return reply.status(400).send({ success: false, error: safeClientError(err, 'Внутренняя ошибка сервера') });
        }
    });

    app.put('/fleet/permits/:id', {
        schema: { tags: ['Автопарк'], summary: 'Обновить пропуск', description: 'Обновление данных пропуска.' },
        preHandler: [app.authenticate, requireAbility('update', 'Permit')],
    }, async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
            const parsed = PermitUpdateSchema.safeParse(request.body);
            if (!parsed.success) return reply.status(400).send({ success: false, error: 'Ошибка валидации данных', details: parsed.error.flatten() });
            const permit = await fleetService.updatePermit(id, parsed.data as z.infer<typeof PermitUpdateSchema>, user);
            return { success: true, data: permit };
        } catch (err: any) {
            return reply.status(400).send({ success: false, error: safeClientError(err, 'Внутренняя ошибка сервера') });
        }
    });

    // ========================================
    // FINES
    // ========================================

    app.get('/fleet/fines', {
        schema: { tags: ['Автопарк'], summary: 'Список штрафов', description: 'Все штрафы ГИБДД с фильтрацией по статусу и ТС.' },
        preHandler: [app.authenticate, requireAbility('read', 'Fine')],
    }, async (request, reply) => {
        const { page, limit, vehicleId, driverId, status } = request.query as FineQuery;
        const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
        const result = await fleetService.listFines(
            { vehicleId, driverId, status, organizationId: user.organizationId },
            { page: Number(page), limit: Number(limit) },
        );
        return { success: true, data: result.data, ...result.pagination };
    });

    app.post('/fleet/fines', {
        schema: { tags: ['Автопарк'], summary: 'Добавить штраф', description: 'Регистрация штрафа ГИБДД.' },
        preHandler: [app.authenticate, requireAbility('create', 'Fine')],
    }, async (request, reply) => {
        try {
            const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
            const parsed = FineCreateSchema.safeParse(request.body);
            if (!parsed.success) return reply.status(400).send({ success: false, error: 'Ошибка валидации данных', details: parsed.error.flatten() });
            await assertScopedRefs({ vehicleId: parsed.data.vehicleId, driverId: parsed.data.driverId }, user);
            const fine = await fleetService.createFine(parsed.data as z.infer<typeof FineCreateSchema>, user);
            return reply.status(201).send({ success: true, data: fine });
        } catch (err: any) {
            return reply.status(400).send({ success: false, error: safeClientError(err, 'Внутренняя ошибка сервера') });
        }
    });

    app.put('/fleet/fines/:id', {
        schema: { tags: ['Автопарк'], summary: 'Обновить штраф', description: 'Обновление штрафа (статус, оплата).' },
        preHandler: [app.authenticate, requireAbility('update', 'Fine')],
    }, async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
            const parsed = FineUpdateSchema.safeParse(request.body);
            if (!parsed.success) return reply.status(400).send({ success: false, error: 'Ошибка валидации данных', details: parsed.error.flatten() });
            if (parsed.data.driverId) await assertDriverAccess(parsed.data.driverId, user);
            const fine = await fleetService.updateFine(id, parsed.data as z.infer<typeof FineUpdateSchema>, user);
            return { success: true, data: fine };
        } catch (err: any) {
            return reply.status(400).send({ success: false, error: safeClientError(err, 'Внутренняя ошибка сервера') });
        }
    });

    // Fines analytics
    app.get('/fleet/fines/analytics', {
        schema: { tags: ['Автопарк'], summary: 'Аналитика штрафов', description: 'Статистика штрафов по ТС и водителям.' },
        preHandler: [app.authenticate, requireAbility('read', 'Fine')],
    }, async (request, reply) => {
        const { vehicleId, driverId } = request.query as FineAnalyticsQuery;
        const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
        const result = await fleetService.finesAnalytics({ vehicleId, driverId, organizationId: user.organizationId });
        return { success: true, data: result };
    });

    // ================================================================
    // FUEL RECORDS
    // ================================================================

    app.get('/fleet/fuel-records', {
        schema: { tags: ['Автопарк'], summary: 'Список записей топлива', description: 'Заправки ТС с фильтрацией по ТС, водителю, рейсу и датам.' },
        preHandler: [app.authenticate, requireAbility('read', 'Vehicle')],
    }, async (request, reply) => {
        const user = request.user as AuthUser;
        const q = request.query as FuelRecordsQuery;
        const filters: {
            vehicleId?: string; driverId?: string; tripId?: string;
            dateFrom?: string; dateTo?: string;
            organizationId?: string;
            page: number; limit: number;
        } = {
            vehicleId: q.vehicleId, driverId: q.driverId, tripId: q.tripId,
            dateFrom: q.dateFrom, dateTo: q.dateTo,
            organizationId: user.organizationId,
            page: q.page ? Number(q.page) : 1,
            limit: q.limit ? Number(q.limit) : 50,
        };
        // Driver RLS: only own records
        if (user.roles.includes('driver') && !hasPrivilege(user.roles)) {
            const driverId = await resolveDriverId(user.userId);
            filters.driverId = driverId ?? undefined;
        }
        const result = await fleetService.listFuelRecords(filters);
        return reply.send({ success: true, ...result });
    });

    app.post('/fleet/fuel-records', {
        schema: { tags: ['Автопарк'], summary: 'Создать запись топлива', description: 'Регистрация заправки ТС.' },
        preHandler: [app.authenticate, requireAbility('create', 'Vehicle')],
    }, async (request, reply) => {
        try {
            const user = request.user as AuthUser;
            const parsed = FuelRecordCreateSchema.safeParse(request.body);
            if (!parsed.success) return reply.status(400).send({ success: false, error: 'Ошибка валидации данных', details: parsed.error.flatten() });
            // C9: cross-field — totalCost должен соответствовать liters × costPerLiter
            // (±1 ₽ округление). Раньше три поля принимались независимо → битая аналитика.
            if (Math.abs(parsed.data.totalCost - parsed.data.liters * parsed.data.costPerLiter) > 1) {
                return reply.status(400).send({ success: false, error: 'totalCost должен равняться liters × costPerLiter' });
            }
            // Driver RLS
            if (user.roles.includes('driver') && !hasPrivilege(user.roles)) {
                const myDriverId = await resolveDriverId(user.userId);
                if (parsed.data.driverId && parsed.data.driverId !== myDriverId) {
                    return reply.status(403).send({ success: false, error: 'Нельзя создавать записи для другого водителя' });
                }
                (parsed.data as { driverId?: string | null }).driverId = myDriverId;
            }
            await assertScopedRefs({ vehicleId: parsed.data.vehicleId, driverId: parsed.data.driverId, tripId: parsed.data.tripId }, user);
            const record = await fleetService.createFuelRecord({ ...parsed.data, organizationId: user.organizationId, createdBy: user.userId });
            return reply.status(201).send({ success: true, data: record });
        } catch (err: any) {
            return reply.status(400).send({ success: false, error: safeClientError(err, 'Внутренняя ошибка сервера') });
        }
    });

    app.put('/fleet/fuel-records/:id', {
        schema: { tags: ['Автопарк'], summary: 'Обновить запись топлива', description: 'Обновление данных заправки.' },
        preHandler: [app.authenticate, requireAbility('update', 'Vehicle')],
    }, async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            const user = request.user as AuthUser;
            // C9: PUT не валидировался (raw cast) — в отличие от POST. Гоним через
            // тот же Zod-контракт (.partial), чтобы negative/NaN/мусор не попал в БД.
            const parsed = FuelRecordCreateSchema.partial().safeParse(request.body);
            if (!parsed.success) return reply.status(400).send({ success: false, error: 'Ошибка валидации данных', details: parsed.error.flatten() });
            const body = parsed.data;
            await assertScopedRefs({ vehicleId: body.vehicleId, driverId: body.driverId, tripId: body.tripId }, user);
            const updated = await fleetService.updateFuelRecord(id, body, user.organizationId);
            if (!updated) return reply.status(404).send({ success: false, error: 'Запись не найдена' });
            return reply.send({ success: true, data: updated });
        } catch (err: any) {
            return reply.status(400).send({ success: false, error: safeClientError(err, 'Внутренняя ошибка сервера') });
        }
    });

    // ================================================================
    // ODOMETER READINGS
    // ================================================================

    app.get('/fleet/odometer-readings', {
        schema: { tags: ['Автопарк'], summary: 'Показания одометра', description: 'История показаний одометра по ТС.' },
        preHandler: [app.authenticate, requireAbility('read', 'Vehicle')],
    }, async (request, reply) => {
        const user = request.user as AuthUser;
        const q = request.query as OdometerQuery;
        const result = await fleetService.listOdometerReadings({
            vehicleId: q.vehicleId, source: q.source, dateFrom: q.dateFrom, dateTo: q.dateTo,
            organizationId: user.organizationId,
            page: q.page ? Number(q.page) : 1, limit: q.limit ? Number(q.limit) : 50,
        });
        return reply.send({ success: true, ...result });
    });

    app.post('/fleet/odometer-readings', {
        schema: { tags: ['Автопарк'], summary: 'Добавить показание одометра', description: 'Фиксация показания одометра.' },
        preHandler: [app.authenticate, requireAbility('create', 'Vehicle')],
    }, async (request, reply) => {
        try {
            const user = request.user as AuthUser;
            const parsed = OdometerReadingCreateSchema.safeParse(request.body);
            if (!parsed.success) return reply.status(400).send({ success: false, error: 'Ошибка валидации данных', details: parsed.error.flatten() });
            if (user.roles.includes('driver') && !hasPrivilege(user.roles)) {
                const myDriverId = await resolveDriverId(user.userId);
                if (parsed.data.driverId && parsed.data.driverId !== myDriverId) {
                    return reply.status(403).send({ success: false, error: 'Нельзя создавать записи для другого водителя' });
                }
                (parsed.data as { driverId?: string | null }).driverId = myDriverId;
            }
            await assertScopedRefs({ vehicleId: parsed.data.vehicleId, driverId: parsed.data.driverId, tripId: parsed.data.tripId }, user);
            const reading = await fleetService.createOdometerReading({ ...parsed.data, organizationId: user.organizationId, createdBy: user.userId });
            return reply.status(201).send({ success: true, data: reading });
        } catch (err: any) {
            return reply.status(400).send({ success: false, error: safeClientError(err, 'Внутренняя ошибка сервера') });
        }
    });

    // ================================================================
    // DOWNTIME RECORDS
    // ================================================================

    app.get('/fleet/downtime-records', {
        schema: { tags: ['Автопарк'], summary: 'Простои ТС', description: 'История простоев транспортных средств.' },
        preHandler: [app.authenticate, requireAbility('read', 'Vehicle')],
    }, async (request, reply) => {
        const user = request.user as AuthUser;
        const q = request.query as DowntimeQuery;
        const result = await fleetService.listDowntimeRecords({
            vehicleId: q.vehicleId, reasonCode: q.reasonCode,
            openOnly: q.openOnly === 'true',
            dateFrom: q.dateFrom, dateTo: q.dateTo,
            organizationId: user.organizationId,
            page: q.page ? Number(q.page) : 1, limit: q.limit ? Number(q.limit) : 50,
        });
        return reply.send({ success: true, ...result });
    });

    app.get('/fleet/downtime-records/vehicle/:vehicleId/active', {
        schema: { tags: ['Автопарк'], summary: 'Активный простой ТС', description: 'Текущий открытый простой для указанного ТС.' },
        preHandler: [app.authenticate, requireAbility('read', 'Vehicle')],
    }, async (request, reply) => {
        const { vehicleId } = request.params as { vehicleId: string };
        const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
        await assertVehicleAccess(vehicleId, user);
        const record = await fleetService.getActiveDowntime(vehicleId, user.organizationId);
        return reply.send({ success: true, data: record });
    });

    app.post('/fleet/downtime-records', {
        schema: { tags: ['Автопарк'], summary: 'Создать простой', description: 'Регистрация простоя ТС.' },
        preHandler: [app.authenticate, requireAbility('create', 'Vehicle')],
    }, async (request, reply) => {
        try {
            const user = request.user as AuthUser;
            const parsed = DowntimeRecordCreateSchema.safeParse(request.body);
            if (!parsed.success) return reply.status(400).send({ success: false, error: 'Ошибка валидации данных', details: parsed.error.flatten() });
            await assertScopedRefs({ vehicleId: parsed.data.vehicleId, tripId: parsed.data.tripId }, user);
            const record = await fleetService.createDowntimeRecord({ ...parsed.data, organizationId: user.organizationId, createdBy: user.userId });
            return reply.status(201).send({ success: true, data: record });
        } catch (err: any) {
            return reply.status(400).send({ success: false, error: safeClientError(err, 'Внутренняя ошибка сервера') });
        }
    });

    app.put('/fleet/downtime-records/:id', {
        schema: { tags: ['Автопарк'], summary: 'Закрыть/обновить простой', description: 'Обновление записи простоя (закрытие, смена причины).' },
        preHandler: [app.authenticate, requireAbility('update', 'Vehicle')],
    }, async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
            const parsed = DowntimeRecordUpdateSchema.safeParse(request.body);
            if (!parsed.success) return reply.status(400).send({ success: false, error: 'Ошибка валидации данных', details: parsed.error.flatten() });
            const updated = await fleetService.updateDowntimeRecord(id, parsed.data, user.organizationId);
            if (!updated) return reply.status(404).send({ success: false, error: 'Запись не найдена' });
            return reply.send({ success: true, data: updated });
        } catch (err: any) {
            return reply.status(400).send({ success: false, error: safeClientError(err, 'Внутренняя ошибка сервера') });
        }
    });

    // ================================================================
    // MAINTENANCE SCHEDULE
    // ================================================================

    app.get('/fleet/maintenance-schedule', {
        schema: { tags: ['Автопарк'], summary: 'План ТО', description: 'Расписание технического обслуживания ТС.' },
        preHandler: [app.authenticate, requireAbility('read', 'Vehicle')],
    }, async (request, reply) => {
        const user = request.user as AuthUser;
        const q = request.query as MaintenanceQuery;
        const result = await fleetService.listMaintenanceSchedule({
            vehicleId: q.vehicleId, status: q.status, maintenanceType: q.maintenanceType,
            dateFrom: q.dateFrom, dateTo: q.dateTo,
            organizationId: user.organizationId,
            page: q.page ? Number(q.page) : 1, limit: q.limit ? Number(q.limit) : 50,
        });
        return reply.send({ success: true, ...result });
    });

    app.post('/fleet/maintenance-schedule', {
        schema: { tags: ['Автопарк'], summary: 'Создать план ТО', description: 'Добавление записи в план технического обслуживания.' },
        preHandler: [app.authenticate, requireAbility('create', 'Vehicle')],
    }, async (request, reply) => {
        try {
            const user = request.user as AuthUser;
            const parsed = MaintenancePlanCreateSchema.safeParse(request.body);
            if (!parsed.success) return reply.status(400).send({ success: false, error: 'Ошибка валидации данных', details: parsed.error.flatten() });
            await assertVehicleAccess(parsed.data.vehicleId, user);
            const record = await fleetService.createMaintenancePlan({ ...parsed.data, organizationId: user.organizationId, createdBy: user.userId });
            return reply.status(201).send({ success: true, data: record });
        } catch (err: any) {
            return reply.status(400).send({ success: false, error: safeClientError(err, 'Внутренняя ошибка сервера') });
        }
    });

    app.put('/fleet/maintenance-schedule/:id', {
        schema: { tags: ['Автопарк'], summary: 'Обновить план ТО', description: 'Обновление записи ТО (статус, фактические данные).' },
        preHandler: [app.authenticate, requireAbility('update', 'Vehicle')],
    }, async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
            const parsed = MaintenancePlanUpdateSchema.safeParse(request.body);
            if (!parsed.success) return reply.status(400).send({ success: false, error: 'Ошибка валидации данных', details: parsed.error.flatten() });
            const updated = await fleetService.updateMaintenancePlan(id, parsed.data, user.organizationId);
            if (!updated) return reply.status(404).send({ success: false, error: 'Запись не найдена' });
            return reply.send({ success: true, data: updated });
        } catch (err: any) {
            return reply.status(400).send({ success: false, error: safeClientError(err, 'Внутренняя ошибка сервера') });
        }
    });
}
