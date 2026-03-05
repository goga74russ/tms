// ============================================================
// Fleet Routes — Fastify plugin (§3.10–3.15 ТЗ)
// Vehicles, Drivers, Contractors, Permits, Fines
// ============================================================
import { FastifyInstance } from 'fastify';
import { requireAbility } from '../../auth/rbac.js';
import * as fleetService from './service.js';
import { VehicleCreateSchema, DriverCreateSchema, ContractorCreateSchema, PermitCreateSchema, PermitUpdateSchema, FineCreateSchema, FineUpdateSchema } from '@tms/shared';

export default async function fleetRoutes(app: FastifyInstance) {

    // ========================================
    // VEHICLES
    // ========================================

    app.get('/fleet/vehicles', {
        preHandler: [app.authenticate, requireAbility('read', 'Vehicle')],
    }, async (request, reply) => {
        const { page, limit, status, search, archived } = request.query as any;
        const result = await fleetService.listVehicles(
            { status, search, isArchived: archived === 'true' },
            { page: Number(page), limit: Number(limit) },
        );
        return { success: true, data: result.data, ...result.pagination };
    });

    app.get('/fleet/vehicles/:id', {
        preHandler: [app.authenticate, requireAbility('read', 'Vehicle')],
    }, async (request, reply) => {
        const { id } = request.params as { id: string };
        const vehicle = await fleetService.getVehicle(id);
        if (!vehicle) return reply.status(404).send({ success: false, error: 'ТС не найдено' });
        return { success: true, data: vehicle };
    });

    app.post('/fleet/vehicles', {
        preHandler: [app.authenticate, requireAbility('create', 'Vehicle')],
    }, async (request, reply) => {
        try {
            const user = request.user as { userId: string; roles: string[] };
            // H-4: Zod validation
            const parsed = VehicleCreateSchema.safeParse(request.body);
            if (!parsed.success) return reply.status(400).send({ success: false, error: 'Validation failed', details: parsed.error.flatten() });
            const vehicle = await fleetService.createVehicle(parsed.data as any, user);
            return reply.status(201).send({ success: true, data: vehicle });
        } catch (err: any) {
            return reply.status(400).send({ success: false, error: err.message });
        }
    });

    app.put('/fleet/vehicles/:id', {
        preHandler: [app.authenticate, requireAbility('update', 'Vehicle')],
    }, async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            const user = request.user as { userId: string; roles: string[] };
            // H-4: Zod partial validation for updates
            const parsed = VehicleCreateSchema.partial().safeParse(request.body);
            if (!parsed.success) return reply.status(400).send({ success: false, error: 'Validation failed', details: parsed.error.flatten() });
            const vehicle = await fleetService.updateVehicle(id, parsed.data as any, user);
            return { success: true, data: vehicle };
        } catch (err: any) {
            return reply.status(400).send({ success: false, error: err.message });
        }
    });

    // ========================================
    // DRIVERS
    // ========================================

    app.get('/fleet/drivers', {
        preHandler: [app.authenticate, requireAbility('read', 'Driver')],
    }, async (request, reply) => {
        const { page, limit, search, active } = request.query as any;
        const result = await fleetService.listDrivers(
            { search, isActive: active !== undefined ? active === 'true' : undefined },
            { page: Number(page), limit: Number(limit) },
        );
        return { success: true, data: result.data, ...result.pagination };
    });

    app.get('/fleet/drivers/:id', {
        preHandler: [app.authenticate, requireAbility('read', 'Driver')],
    }, async (request, reply) => {
        const { id } = request.params as { id: string };
        const driver = await fleetService.getDriver(id);
        if (!driver) return reply.status(404).send({ success: false, error: 'Водитель не найден' });
        return { success: true, data: driver };
    });

    app.post('/fleet/drivers', {
        preHandler: [app.authenticate, requireAbility('create', 'Driver')],
    }, async (request, reply) => {
        try {
            const user = request.user as { userId: string; roles: string[] };
            const parsed = DriverCreateSchema.safeParse(request.body);
            if (!parsed.success) return reply.status(400).send({ success: false, error: 'Validation failed', details: parsed.error.flatten() });
            const driver = await fleetService.createDriver(parsed.data as any, user);
            return reply.status(201).send({ success: true, data: driver });
        } catch (err: any) {
            return reply.status(400).send({ success: false, error: err.message });
        }
    });

    app.put('/fleet/drivers/:id', {
        preHandler: [app.authenticate, requireAbility('update', 'Driver')],
    }, async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            const user = request.user as { userId: string; roles: string[] };
            const parsed = DriverCreateSchema.partial().safeParse(request.body);
            if (!parsed.success) return reply.status(400).send({ success: false, error: 'Validation failed', details: parsed.error.flatten() });
            const driver = await fleetService.updateDriver(id, parsed.data as any, user);
            return { success: true, data: driver };
        } catch (err: any) {
            return reply.status(400).send({ success: false, error: err.message });
        }
    });

    // ========================================
    // CONTRACTORS
    // ========================================

    app.get('/fleet/contractors', {
        preHandler: [app.authenticate, requireAbility('read', 'Contractor')],
    }, async (request, reply) => {
        const { page, limit, search, archived } = request.query as any;
        const result = await fleetService.listContractors(
            { search, isArchived: archived === 'true' },
            { page: Number(page), limit: Number(limit) },
        );
        return { success: true, data: result.data, ...result.pagination };
    });

    app.post('/fleet/contractors', {
        preHandler: [app.authenticate, requireAbility('create', 'Contractor')],
    }, async (request, reply) => {
        try {
            const user = request.user as { userId: string; roles: string[] };
            const parsed = ContractorCreateSchema.safeParse(request.body);
            if (!parsed.success) return reply.status(400).send({ success: false, error: 'Validation failed', details: parsed.error.flatten() });
            const contractor = await fleetService.createContractor(parsed.data as any, user);
            return reply.status(201).send({ success: true, data: contractor });
        } catch (err: any) {
            return reply.status(400).send({ success: false, error: err.message });
        }
    });

    app.put('/fleet/contractors/:id', {
        preHandler: [app.authenticate, requireAbility('update', 'Contractor')],
    }, async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            const user = request.user as { userId: string; roles: string[] };
            const parsed = ContractorCreateSchema.partial().safeParse(request.body);
            if (!parsed.success) return reply.status(400).send({ success: false, error: 'Validation failed', details: parsed.error.flatten() });
            const contractor = await fleetService.updateContractor(id, parsed.data as any, user);
            return { success: true, data: contractor };
        } catch (err: any) {
            return reply.status(400).send({ success: false, error: err.message });
        }
    });

    // DaData lookup placeholder
    app.get('/fleet/contractors/lookup/:inn', {
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
        preHandler: [app.authenticate, requireAbility('read', 'Permit')],
    }, async (request, reply) => {
        const { page, limit, vehicleId, active } = request.query as any;
        const result = await fleetService.listPermits(
            { vehicleId, isActive: active !== undefined ? active === 'true' : undefined },
            { page: Number(page), limit: Number(limit) },
        );
        return { success: true, data: result.data, ...result.pagination };
    });

    app.post('/fleet/permits', {
        preHandler: [app.authenticate, requireAbility('create', 'Permit')],
    }, async (request, reply) => {
        try {
            const user = request.user as { userId: string; roles: string[] };
            const parsed = PermitCreateSchema.safeParse(request.body);
            if (!parsed.success) return reply.status(400).send({ success: false, error: 'Validation failed', details: parsed.error.flatten() });
            const permit = await fleetService.createPermit(parsed.data as any, user);
            return reply.status(201).send({ success: true, data: permit });
        } catch (err: any) {
            return reply.status(400).send({ success: false, error: err.message });
        }
    });

    app.put('/fleet/permits/:id', {
        preHandler: [app.authenticate, requireAbility('update', 'Permit')],
    }, async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            const user = request.user as { userId: string; roles: string[] };
            const parsed = PermitUpdateSchema.safeParse(request.body);
            if (!parsed.success) return reply.status(400).send({ success: false, error: 'Validation failed', details: parsed.error.flatten() });
            const permit = await fleetService.updatePermit(id, parsed.data as any, user);
            return { success: true, data: permit };
        } catch (err: any) {
            return reply.status(400).send({ success: false, error: err.message });
        }
    });

    // ========================================
    // FINES
    // ========================================

    app.get('/fleet/fines', {
        preHandler: [app.authenticate, requireAbility('read', 'Fine')],
    }, async (request, reply) => {
        const { page, limit, vehicleId, driverId, status } = request.query as any;
        const result = await fleetService.listFines(
            { vehicleId, driverId, status },
            { page: Number(page), limit: Number(limit) },
        );
        return { success: true, data: result.data, ...result.pagination };
    });

    app.post('/fleet/fines', {
        preHandler: [app.authenticate, requireAbility('create', 'Fine')],
    }, async (request, reply) => {
        try {
            const user = request.user as { userId: string; roles: string[] };
            const parsed = FineCreateSchema.safeParse(request.body);
            if (!parsed.success) return reply.status(400).send({ success: false, error: 'Validation failed', details: parsed.error.flatten() });
            const fine = await fleetService.createFine(parsed.data as any, user);
            return reply.status(201).send({ success: true, data: fine });
        } catch (err: any) {
            return reply.status(400).send({ success: false, error: err.message });
        }
    });

    app.put('/fleet/fines/:id', {
        preHandler: [app.authenticate, requireAbility('update', 'Fine')],
    }, async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            const user = request.user as { userId: string; roles: string[] };
            const parsed = FineUpdateSchema.safeParse(request.body);
            if (!parsed.success) return reply.status(400).send({ success: false, error: 'Validation failed', details: parsed.error.flatten() });
            const fine = await fleetService.updateFine(id, parsed.data as any, user);
            return { success: true, data: fine };
        } catch (err: any) {
            return reply.status(400).send({ success: false, error: err.message });
        }
    });

    // Fines analytics
    app.get('/fleet/fines/analytics', {
        preHandler: [app.authenticate, requireAbility('read', 'Fine')],
    }, async (request, reply) => {
        const { vehicleId, driverId } = request.query as any;
        const result = await fleetService.finesAnalytics({ vehicleId, driverId });
        return { success: true, data: result };
    });
}
