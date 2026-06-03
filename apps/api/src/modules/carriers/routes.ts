// ============================================================
// Wave 4: Carrier Subcontracting v0
// API для перевозчиков-субподрядчиков.
// UI отсутствует (web-агент сделает в W4-web).
// ============================================================
import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import { contractors, carrierContracts, trips } from '../../db/schema.js';
import { requireAbility } from '../../auth/rbac.js';

function num(v: unknown): number | null {
    if (v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

function serializeContract<T extends { defaultRatePerKm: unknown; defaultRatePerTon: unknown }>(c: T) {
    return {
        ...c,
        defaultRatePerKm: num(c.defaultRatePerKm),
        defaultRatePerTon: num(c.defaultRatePerTon),
    };
}

const carriersRoutes: FastifyPluginAsync = async (app) => {
    // --- GET /carriers — список контрагентов с is_carrier=true + активный договор ---
    app.get('/carriers', {
        schema: {
            tags: ['Финансы'],
            summary: 'Перевозчики-субподрядчики',
            description: 'Список контрагентов с is_carrier=true и их активным договором (если есть).',
        },
        preHandler: [app.authenticate, requireAbility('read', 'Contractor')],
    }, async (request) => {
        const user = request.user as { roles: string[]; organizationId?: string | null };

        const conditions = [eq(contractors.isCarrier, true), eq(contractors.isArchived, false)];
        if (user.organizationId) {
            conditions.push(eq(contractors.organizationId, user.organizationId));
        }

        const carriers = await db
            .select()
            .from(contractors)
            .where(and(...conditions))
            .orderBy(asc(contractors.name));

        if (carriers.length === 0) return { success: true, data: [] };

        const carrierIds = carriers.map((c) => c.id);
        const activeContracts = await db
            .select()
            .from(carrierContracts)
            .where(and(
                inArray(carrierContracts.contractorId, carrierIds),
                eq(carrierContracts.status, 'active'),
            ))
            .orderBy(desc(carrierContracts.startDate));

        const byContractor = new Map<string, typeof activeContracts[number]>();
        for (const ct of activeContracts) {
            if (!byContractor.has(ct.contractorId)) byContractor.set(ct.contractorId, ct);
        }

        const data = carriers.map((c) => ({
            ...c,
            activeContract: byContractor.has(c.id) ? serializeContract(byContractor.get(c.id)!) : null,
        }));

        return { success: true, data };
    });

    // --- POST /carriers/:id/promote — флипнуть is_carrier=true ---
    app.post<{ Params: { id: string } }>('/carriers/:id/promote', {
        schema: {
            tags: ['Финансы'],
            summary: 'Назначить контрагента перевозчиком',
            description: 'Включает is_carrier=true. Доступно только admin.',
        },
        preHandler: [app.authenticate],
    }, async (request, reply) => {
        const user = request.user as { roles: string[]; organizationId?: string | null };
        if (!user.roles.includes('admin')) {
            return reply.code(403).send({ success: false, error: 'Только admin может назначать перевозчиков' });
        }
        const { id } = request.params;

        const conditions = [eq(contractors.id, id)];
        if (user.organizationId) {
            conditions.push(eq(contractors.organizationId, user.organizationId));
        }

        const [updated] = await db
            .update(contractors)
            .set({ isCarrier: true, updatedAt: new Date() })
            .where(and(...conditions))
            .returning();
        if (!updated) {
            return reply.code(404).send({ success: false, error: 'Контрагент не найден' });
        }
        return { success: true, data: updated };
    });

    // --- POST /carrier-contracts — создать draft-договор с перевозчиком ---
    app.post('/carrier-contracts', {
        schema: {
            tags: ['Финансы'],
            summary: 'Создать договор с перевозчиком',
            description: 'Создаёт договор с перевозчиком в статусе draft. Контрагент должен иметь is_carrier=true.',
        },
        preHandler: [app.authenticate, requireAbility('create', 'Contract')],
    }, async (request, reply) => {
        const user = request.user as { roles: string[]; organizationId?: string | null };
        const parsed = z.object({
            contractorId: z.string().uuid(),
            number: z.string().min(1).max(100),
            startDate: z.string().datetime(),
            endDate: z.string().datetime().nullable().optional(),
            defaultRatePerKm: z.number().nonnegative().nullable().optional(),
            defaultRatePerTon: z.number().nonnegative().nullable().optional(),
        }).safeParse(request.body ?? {});
        if (!parsed.success) {
            return reply.code(422).send({ success: false, error: parsed.error.flatten() });
        }

        // Контрагент должен иметь is_carrier=true.
        const conditions = [eq(contractors.id, parsed.data.contractorId)];
        if (user.organizationId) {
            conditions.push(eq(contractors.organizationId, user.organizationId));
        }
        const [contractor] = await db
            .select({ id: contractors.id, isCarrier: contractors.isCarrier })
            .from(contractors)
            .where(and(...conditions))
            .limit(1);
        if (!contractor) {
            return reply.code(404).send({ success: false, error: 'Контрагент не найден' });
        }
        if (!contractor.isCarrier) {
            return reply.code(400).send({ success: false, error: 'Контрагент не является перевозчиком (is_carrier=false). Сначала /carriers/:id/promote.' });
        }

        const [created] = await db
            .insert(carrierContracts)
            .values({
                contractorId: parsed.data.contractorId,
                number: parsed.data.number,
                startDate: new Date(parsed.data.startDate),
                endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : null,
                defaultRatePerKm: parsed.data.defaultRatePerKm ?? null,
                defaultRatePerTon: parsed.data.defaultRatePerTon ?? null,
                status: 'draft',
                organizationId: user.organizationId ?? null,
            })
            .returning();

        return reply.code(201).send({ success: true, data: serializeContract(created) });
    });

    // --- POST /trips/:id/assign-carrier — назначить рейс субподрядчику ---
    app.post<{ Params: { id: string } }>('/trips/:id/assign-carrier', {
        schema: {
            tags: ['Рейсы'],
            summary: 'Назначить субподрядчика на рейс',
            description: 'Сохраняет trip.carrier_contractor_id. Допускается только до старта рейса (planning/assigned).',
        },
        preHandler: [app.authenticate, requireAbility('update', 'Trip')],
    }, async (request, reply) => {
        const user = request.user as { roles: string[]; organizationId?: string | null };
        const parsed = z.object({
            carrierContractorId: z.string().uuid(),
        }).safeParse(request.body ?? {});
        if (!parsed.success) {
            return reply.code(422).send({ success: false, error: parsed.error.flatten() });
        }

        const { id } = request.params;
        const tripConditions = [eq(trips.id, id)];
        if (user.organizationId) {
            tripConditions.push(eq(trips.organizationId, user.organizationId));
        }

        const [trip] = await db
            .select({ id: trips.id, status: trips.status })
            .from(trips)
            .where(and(...tripConditions))
            .limit(1);
        if (!trip) {
            return reply.code(404).send({ success: false, error: 'Рейс не найден' });
        }
        if (!['planning', 'assigned'].includes(trip.status as string)) {
            return reply.code(409).send({
                success: false,
                error: `Назначение перевозчика возможно только до старта рейса (текущий статус: ${trip.status})`,
            });
        }

        // Контрагент должен быть carrier.
        const carrierConditions = [
            eq(contractors.id, parsed.data.carrierContractorId),
            eq(contractors.isCarrier, true),
        ];
        if (user.organizationId) {
            carrierConditions.push(eq(contractors.organizationId, user.organizationId));
        }
        const [carrier] = await db
            .select({ id: contractors.id })
            .from(contractors)
            .where(and(...carrierConditions))
            .limit(1);
        if (!carrier) {
            return reply.code(400).send({ success: false, error: 'Контрагент не является перевозчиком' });
        }

        // C5: финальный UPDATE раньше шёл по `eq(trips.id, id)` — без org-фильтра
        // и без re-check статуса (TOCTOU: статус мог уйти из planning/assigned между
        // проверкой и записью). Переиспользуем tripConditions (id + org) + re-check
        // статуса оптимистичной блокировкой. Пустой результат → гонка/вне доступа.
        const [updated] = await db
            .update(trips)
            .set({ carrierContractorId: parsed.data.carrierContractorId, updatedAt: new Date() })
            .where(and(...tripConditions, inArray(trips.status, ['planning', 'assigned'])))
            .returning();
        if (!updated) {
            return reply.code(409).send({ success: false, error: 'Рейс изменился параллельно (статус или доступ)' });
        }
        return { success: true, data: updated };
    });
};

export default carriersRoutes;
