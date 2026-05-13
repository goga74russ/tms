// ============================================================
// Wave 2 — Cold chain v0: REST endpoints for temperature readings.
// ============================================================
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { assertTripAccess } from '../../auth/guards.js';
import { generateMockReading } from './mock-sensor.js';
import {
    listReadings,
    recordReading,
    resolveTripSla,
    summarizeReadings,
} from './service.js';

const uuidSchema = z.string().uuid();

const ReadingCreateSchema = z.object({
    tempC: z.number().min(-50).max(50),
    recordedAt: z.string().datetime().optional(),
    sensorId: z.string().min(1).max(255).optional(),
    orderId: uuidSchema.optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    source: z.enum(['sensor', 'manual', 'mock']).optional(),
});

const ListQuerySchema = z.object({
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    limit: z.coerce.number().int().min(1).max(1000).optional(),
});

interface AuthUser {
    userId: string;
    roles: string[];
    organizationId?: string | null;
}

function isAdmin(user: AuthUser): boolean {
    return user.roles.includes('admin');
}

const coldChainRoutes: FastifyPluginAsync = async (app) => {
    // --- POST /trips/:tripId/temperature-readings ---
    app.post('/trips/:tripId/temperature-readings', {
        schema: {
            tags: ['Холодовая цепь'],
            summary: 'Записать показание температуры',
            description: 'Регистрирует замер температуры по рейсу. При нарушении SLA создаёт инцидент типа cargo.',
        },
        preHandler: [app.authenticate],
    }, async (request, reply) => {
        const user = request.user as AuthUser;
        const { tripId } = request.params as { tripId: string };

        await assertTripAccess(tripId, user);

        const parsed = ReadingCreateSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({
                success: false,
                error: 'Ошибка валидации',
                details: parsed.error.flatten().fieldErrors,
            });
        }

        const reading = await recordReading(
            {
                tripId,
                orderId: parsed.data.orderId ?? null,
                tempC: parsed.data.tempC,
                recordedAt: parsed.data.recordedAt,
                sensorId: parsed.data.sensorId ?? null,
                latitude: parsed.data.latitude ?? null,
                longitude: parsed.data.longitude ?? null,
                source: parsed.data.source ?? 'manual',
            },
            { userId: user.userId, role: user.roles[0] ?? 'unknown' },
        );

        return reply.status(201).send({
            success: true,
            data: {
                id: reading.id,
                breach: reading.breach,
                slaMinC: reading.slaMinC,
                slaMaxC: reading.slaMaxC,
                recordedAt: reading.recordedAt,
                tempC: reading.tempC,
                incidentId: reading.incidentId ?? null,
            },
        });
    });

    // --- GET /trips/:tripId/temperature-readings ---
    app.get('/trips/:tripId/temperature-readings', {
        schema: {
            tags: ['Холодовая цепь'],
            summary: 'Список показаний температуры',
            description: 'Возвращает замеры по рейсу в обратном хронологическом порядке + список нарушений.',
        },
        preHandler: [app.authenticate],
    }, async (request, reply) => {
        const user = request.user as AuthUser;
        const { tripId } = request.params as { tripId: string };

        await assertTripAccess(tripId, user);

        const parsed = ListQuerySchema.safeParse(request.query);
        if (!parsed.success) {
            return reply.status(400).send({
                success: false,
                error: 'Ошибка валидации',
                details: parsed.error.flatten().fieldErrors,
            });
        }

        const readings = await listReadings(tripId, parsed.data, user.organizationId ?? null);
        const breaches = readings.filter((r) => r.breach);

        return { success: true, data: readings, breaches };
    });

    // --- GET /trips/:tripId/temperature-summary ---
    app.get('/trips/:tripId/temperature-summary', {
        schema: {
            tags: ['Холодовая цепь'],
            summary: 'Сводка по температуре рейса',
            description: 'Min/max/avg, количество замеров и нарушений, границы SLA.',
        },
        preHandler: [app.authenticate],
    }, async (request) => {
        const user = request.user as AuthUser;
        const { tripId } = request.params as { tripId: string };

        await assertTripAccess(tripId, user);

        const summary = await summarizeReadings(tripId, user.organizationId ?? null);
        return { success: true, data: summary };
    });

    // --- POST /trips/:tripId/temperature-mock-tick (admin) ---
    app.post('/trips/:tripId/temperature-mock-tick', {
        schema: {
            tags: ['Холодовая цепь'],
            summary: 'Сгенерировать имитационный замер (admin)',
            description: 'Создаёт один синтетический замер для отладки. Доступно только admin.',
        },
        preHandler: [app.authenticate],
    }, async (request, reply) => {
        const user = request.user as AuthUser;
        const { tripId } = request.params as { tripId: string };

        if (!isAdmin(user)) {
            return reply.status(403).send({ success: false, error: 'Только администратор' });
        }

        await assertTripAccess(tripId, user);

        const sla = await resolveTripSla(tripId);
        const mock = generateMockReading(sla.minC, sla.maxC);

        const reading = await recordReading(
            {
                tripId,
                tempC: mock.tempC,
                source: mock.source,
            },
            { userId: user.userId, role: user.roles[0] ?? 'admin' },
        );

        return reply.status(201).send({
            success: true,
            data: {
                id: reading.id,
                breach: reading.breach,
                slaMinC: reading.slaMinC,
                slaMaxC: reading.slaMaxC,
                recordedAt: reading.recordedAt,
                tempC: reading.tempC,
                source: mock.source,
                incidentId: reading.incidentId ?? null,
            },
        });
    });
};

export default coldChainRoutes;
