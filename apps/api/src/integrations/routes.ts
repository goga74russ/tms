// ============================================================
// Integration Routes — Manual sync triggers & status
// ============================================================
import { FastifyInstance } from 'fastify';
import { triggerWialonSync, triggerFinesSync, wialonSyncQueue, finesSyncQueue } from './queues.js';
import * as DaDataMock from './mocks/dadata.mock.js';
import * as FuelCardMock from './mocks/fuel-card.mock.js';
import * as WialonMockRunner from './mocks/wialon-mock-runner.js';
import { db } from '../db/connection.js';
import { vehicles, vehiclePositions, fuelRecords } from '../db/schema.js';
import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { requireAbility } from '../auth/rbac.js';
import { recordEvent } from '../events/journal.js';
import { z } from 'zod';
import { safeClientError } from '../utils/safe-error.js';

export default async function integrationRoutes(app: FastifyInstance) {

    // PROV-P1-7: mock-симуляторы (wialon-mock/*, fuel-card-mock/sync) пишут
    // синтетику в реальные таблицы. В production открыты — гейтим за явным
    // env-флагом (оператор включает только для демо/наладки). Возвращаем 404
    // (не 403), чтобы не раскрывать существование mock-эндпоинтов.
    const mocksEnabled = process.env.NODE_ENV !== 'production'
        || process.env.INTEGRATION_MOCKS_ENABLED === 'true';
    function mockGate(reply: import('fastify').FastifyReply): boolean {
        if (mocksEnabled) return true;
        reply.status(404).send({ success: false, error: 'Ресурс не найден' });
        return false;
    }
    // PROV-P1-7: org-scope vehicleId — без него любой залогиненный мог
    // стартовать симуляцию / читать позиции / лить топливо на ЧУЖОЕ ТС.
    // Возвращает true, если ТС существует и принадлежит орг пользователя
    // (orgId null/глобал-роль → пропускаем). false → вызывающий шлёт 404.
    async function vehicleInOrg(vehicleId: string, orgId?: string): Promise<boolean> {
        const [v] = await db.select({ org: vehicles.organizationId })
            .from(vehicles).where(eq(vehicles.id, vehicleId)).limit(1);
        if (!v) return false;
        if (orgId && v.org && v.org !== orgId) return false;
        return true;
    }

    // ──────────────────────────────────────────────
    // POST /integrations/wialon/sync — manual trigger
    // ──────────────────────────────────────────────
    app.post('/integrations/wialon/sync', {
        schema: { tags: ['Интеграции'], summary: 'Синхронизация Wialon', description: 'Ручной запуск синхронизации GPS-позиций из Wialon/ГЛОНАСС.' },
        preHandler: [app.authenticate, requireAbility('manage', 'Settings')],
    }, async (request, reply) => {
        try {
            const jobId = await triggerWialonSync();
            return { success: true, data: { jobId, message: 'Wialon sync job queued' } };
        } catch (error: any) {
            app.log.error(error);
            return reply.status(500).send({ success: false, error: safeClientError(error, 'Внутренняя ошибка сервера') });
        }
    });

    // ──────────────────────────────────────────────
    // POST /integrations/fines/sync — manual trigger
    // ──────────────────────────────────────────────
    app.post('/integrations/fines/sync', {
        schema: { tags: ['Интеграции'], summary: 'Синхронизация штрафов', description: 'Ручной запуск проверки штрафов ГИБДД.' },
        preHandler: [app.authenticate, requireAbility('manage', 'Settings')],
    }, async (request, reply) => {
        try {
            const jobId = await triggerFinesSync();
            return { success: true, data: { jobId, message: 'Fines sync job queued' } };
        } catch (error: any) {
            app.log.error(error);
            return reply.status(500).send({ success: false, error: safeClientError(error, 'Внутренняя ошибка сервера') });
        }
    });

    // ──────────────────────────────────────────────
    // GET /integrations/status — worker health
    // ──────────────────────────────────────────────
    app.get('/integrations/status', {
        schema: { tags: ['Интеграции'], summary: 'Статус очередей', description: 'Здоровье BullMQ воркеров: ожидание, активные, завершённые, ошибки.' },
        preHandler: [app.authenticate],
    }, async () => {
        const [wialonWaiting, wialonActive, wialonCompleted, wialonFailed] = await Promise.all([
            wialonSyncQueue.getWaitingCount(),
            wialonSyncQueue.getActiveCount(),
            wialonSyncQueue.getCompletedCount(),
            wialonSyncQueue.getFailedCount(),
        ]);

        const [finesWaiting, finesActive, finesCompleted, finesFailed] = await Promise.all([
            finesSyncQueue.getWaitingCount(),
            finesSyncQueue.getActiveCount(),
            finesSyncQueue.getCompletedCount(),
            finesSyncQueue.getFailedCount(),
        ]);

        return {
            success: true,
            data: {
                wialon: {
                    queue: QUEUE_WIALON_SYNC_NAME,
                    waiting: wialonWaiting,
                    active: wialonActive,
                    completed: wialonCompleted,
                    failed: wialonFailed,
                },
                fines: {
                    queue: QUEUE_FINES_SYNC_NAME,
                    waiting: finesWaiting,
                    active: finesActive,
                    completed: finesCompleted,
                    failed: finesFailed,
                },
                timestamp: new Date().toISOString(),
            },
        };
    });

    // ──────────────────────────────────────────────
    // GET /integrations/dadata/lookup/:inn — DaData lookup
    // ──────────────────────────────────────────────
    app.get('/integrations/dadata/lookup/:inn', {
        schema: { tags: ['Интеграции'], summary: 'Поиск по ИНН', description: 'Поиск компании в DaData по ИНН (10 или 12 цифр).' },
        preHandler: [app.authenticate],
    }, async (request, reply) => {
        const { inn } = request.params as { inn: string };

        if (!/^\d{10}(\d{2})?$/.test(inn)) {
            return reply.status(400).send({
                success: false,
                error: 'ИНН должен содержать 10 или 12 цифр',
            });
        }

        const company = await DaDataMock.findByInn(inn);
        if (!company) {
            return reply.status(404).send({ success: false, error: 'Компания не найдена' });
        }

        return { success: true, data: company };
    });

    // ──────────────────────────────────────────────
    // GET /integrations/dadata/suggest-address — address suggestions
    // ──────────────────────────────────────────────
    app.get('/integrations/dadata/suggest-address', {
        schema: { tags: ['Интеграции'], summary: 'Подсказки адресов', description: 'Автодополнение адресов через DaData.' },
        preHandler: [app.authenticate],
    }, async (request) => {
        const { query } = request.query as { query?: string };
        const suggestions = DaDataMock.suggestAddress(query || '');
        return { success: true, data: suggestions };
    });

    // ──────────────────────────────────────────────
    // GET /integrations/fuel/transactions/:vehicleId — fuel card data
    // ──────────────────────────────────────────────
    app.get('/integrations/fuel/transactions/:vehicleId', {
        schema: { tags: ['Интеграции'], summary: 'Транзакции топливных карт', description: 'Заправки ТС за последние N дней с итогами по расходу.' },
        preHandler: [app.authenticate],
    }, async (request, reply) => {
        const { vehicleId } = request.params as { vehicleId: string };
        const { days } = request.query as { days?: string };
        const orgId = (request.user as { organizationId?: string }).organizationId;

        const [vehicle] = await db
            .select({
                plateNumber: vehicles.plateNumber,
                currentOdometerKm: vehicles.currentOdometerKm,
                organizationId: vehicles.organizationId,
            })
            .from(vehicles)
            .where(eq(vehicles.id, vehicleId))
            .limit(1);

        // PROV-P1-7: org-scope — чужое ТС → 404 (не раскрываем существование).
        if (!vehicle || (orgId && vehicle.organizationId && vehicle.organizationId !== orgId)) {
            return reply.status(404).send({ success: false, error: 'ТС не найдено' });
        }

        const daysBack = days ? parseInt(days, 10) : 30;
        const transactions = FuelCardMock.getTransactions(
            vehicle.plateNumber,
            vehicle.currentOdometerKm,
            daysBack,
        );
        const summary = FuelCardMock.getFuelSummary(
            vehicle.plateNumber,
            vehicle.currentOdometerKm,
            daysBack,
        );

        return {
            success: true,
            data: { transactions, summary },
        };
    });

    // ──────────────────────────────────────────────
    // Wave 3: Wialon-mock реалистичный трек-симулятор
    // ──────────────────────────────────────────────
    const StartSchema = z.object({
        vehicleId: z.string().uuid(),
        tripId: z.string().uuid().optional(),
        intervalMs: z.number().int().min(1000).max(60_000).optional(),
        seed: z.number().int().optional(),
    });

    app.post('/integrations/wialon-mock/start', {
        schema: { tags: ['Интеграции'], summary: 'Старт mock-трека Wialon', description: 'Запускает фоновый симулятор: каждые ~10 с пишет позицию ТС в vehicle_positions.' },
        preHandler: [app.authenticate, requireAbility('manage', 'Settings')],
    }, async (request, reply) => {
        if (!mockGate(reply)) return;
        const user = request.user as { userId: string; roles: string[]; organizationId?: string };
        const parsed = StartSchema.safeParse(request.body ?? {});
        if (!parsed.success) {
            return reply.status(400).send({ success: false, error: 'Ошибка валидации данных', details: parsed.error.flatten() });
        }
        if (!(await vehicleInOrg(parsed.data.vehicleId, user.organizationId))) {
            return reply.status(404).send({ success: false, error: 'ТС не найдено' });
        }
        try {
            const status = await WialonMockRunner.startSimulation(parsed.data.vehicleId, parsed.data.tripId, {
                intervalMs: parsed.data.intervalMs,
                seed: parsed.data.seed,
            });
            await recordEvent({
                authorId: user.userId,
                authorRole: user.roles[0] ?? 'admin',
                eventType: 'wialon-mock.start',
                entityType: 'vehicle',
                entityId: parsed.data.vehicleId,
                data: { tripId: status.tripId, samplesPlanned: status.samplesPlanned },
            });
            return { success: true, data: status };
        } catch (err: any) {
            return reply.status(400).send({ success: false, error: safeClientError(err, 'Внутренняя ошибка сервера') });
        }
    });

    const StopSchema = z.object({ vehicleId: z.string().uuid() });

    app.post('/integrations/wialon-mock/stop', {
        schema: { tags: ['Интеграции'], summary: 'Остановить mock-трек Wialon', description: 'Останавливает фоновый симулятор для ТС.' },
        preHandler: [app.authenticate, requireAbility('manage', 'Settings')],
    }, async (request, reply) => {
        if (!mockGate(reply)) return;
        const user = request.user as { userId: string; roles: string[]; organizationId?: string };
        const parsed = StopSchema.safeParse(request.body ?? {});
        if (!parsed.success) {
            return reply.status(400).send({ success: false, error: 'Ошибка валидации данных', details: parsed.error.flatten() });
        }
        if (!(await vehicleInOrg(parsed.data.vehicleId, user.organizationId))) {
            return reply.status(404).send({ success: false, error: 'ТС не найдено' });
        }
        const stopped = await WialonMockRunner.stopSimulation(parsed.data.vehicleId);
        await recordEvent({
            authorId: user.userId,
            authorRole: user.roles[0] ?? 'admin',
            eventType: 'wialon-mock.stop',
            entityType: 'vehicle',
            entityId: parsed.data.vehicleId,
            data: { stopped },
        });
        return { success: true, data: { vehicleId: parsed.data.vehicleId, stopped } };
    });

    const PositionsQuerySchema = z.object({
        vehicleId: z.string().uuid(),
        since: z.string().datetime().optional(),
        limit: z.coerce.number().int().min(1).max(1000).optional(),
    });

    app.get('/integrations/wialon-mock/positions', {
        schema: { tags: ['Интеграции'], summary: 'История позиций ТС (mock)', description: 'Читает vehicle_positions для ТС, опционально начиная с since (ISO).' },
        preHandler: [app.authenticate, requireAbility('read', 'Vehicle')],
    }, async (request, reply) => {
        const parsed = PositionsQuerySchema.safeParse(request.query ?? {});
        if (!parsed.success) {
            return reply.status(400).send({ success: false, error: 'Ошибка валидации данных', details: parsed.error.flatten() });
        }
        const orgId = (request.user as { organizationId?: string }).organizationId;
        if (!(await vehicleInOrg(parsed.data.vehicleId, orgId))) {
            return reply.status(404).send({ success: false, error: 'ТС не найдено' });
        }
        const where = parsed.data.since
            ? and(eq(vehiclePositions.vehicleId, parsed.data.vehicleId), gte(vehiclePositions.recordedAt, new Date(parsed.data.since)))
            : eq(vehiclePositions.vehicleId, parsed.data.vehicleId);
        const rows = await db
            .select()
            .from(vehiclePositions)
            .where(where)
            .orderBy(desc(vehiclePositions.recordedAt))
            .limit(parsed.data.limit ?? 200);
        return {
            success: true,
            data: {
                vehicleId: parsed.data.vehicleId,
                positions: rows,
                isSimulating: WialonMockRunner.isSimulationActive(parsed.data.vehicleId),
            },
        };
    });

    // ──────────────────────────────────────────────
    // Wave 6: POST /integrations/fuel-card-mock/sync
    // Generates synthetic fuel-card transactions for [fromDate, toDate]
    // and inserts them into fuel_records with source='fuel_card_mock'.
    // Admin-only.
    // ──────────────────────────────────────────────
    const FuelCardSyncSchema = z.object({
        vehicleId: z.string().uuid(),
        fromDate: z.string().datetime(),
        toDate: z.string().datetime(),
    });

    app.post('/integrations/fuel-card-mock/sync', {
        schema: {
            tags: ['Интеграции'],
            summary: 'Mock-синхронизация топливной карты',
            description: 'Генерирует синтетические транзакции АЗС за период и записывает в fuel_records (source=fuel_card_mock).',
        },
        preHandler: [app.authenticate, requireAbility('manage', 'Settings')],
    }, async (request, reply) => {
        if (!mockGate(reply)) return;
        const user = request.user as { userId: string; roles: string[]; organizationId?: string };
        const parsed = FuelCardSyncSchema.safeParse(request.body ?? {});
        if (!parsed.success) {
            return reply.status(400).send({ success: false, error: 'Ошибка валидации данных', details: parsed.error.flatten() });
        }
        const { vehicleId, fromDate, toDate } = parsed.data;
        const from = new Date(fromDate);
        const to = new Date(toDate);
        if (to.getTime() <= from.getTime()) {
            return reply.status(400).send({ success: false, error: 'toDate must be after fromDate' });
        }

        const [vehicle] = await db
            .select({
                id: vehicles.id,
                fuelTankLiters: vehicles.fuelTankLiters,
                organizationId: vehicles.organizationId,
                currentOdometerKm: vehicles.currentOdometerKm,
            })
            .from(vehicles)
            .where(eq(vehicles.id, vehicleId))
            .limit(1);

        // PROV-P1-7: org-scope — нельзя лить топливо на чужое ТС.
        if (!vehicle || (user.organizationId && vehicle.organizationId && vehicle.organizationId !== user.organizationId)) {
            return reply.status(404).send({ success: false, error: 'ТС не найдено' });
        }

        const txns = FuelCardMock.generateTransactionsInRange(vehicleId, from, to, {
            tankLiters: vehicle.fuelTankLiters,
        });

        if (txns.length === 0) {
            return { success: true, data: { inserted: 0 } };
        }

        const rows = txns.map((t) => ({
            vehicleId,
            recordedAt: new Date(t.timestamp),
            liters: t.liters,
            costPerLiter: t.pricePerLiter,
            totalCost: t.totalCost,
            fuelType: FuelCardMock.mapFuelTypeToEnum(t.fuelType),
            station: t.stationName,
            odometerAtFill: vehicle.currentOdometerKm,
            tripId: null,
            driverId: null,
            organizationId: vehicle.organizationId,
            source: 'fuel_card_mock',
            createdBy: user.userId,
        }));

        // P2 (код-аудит 2026-06-14): идемпотентность — повторный sync на тот же период
        // не плодит дубли. Удаляем прежние mock-записи этого ТС в диапазоне [from,to]
        // и пере-вставляем (re-sync семантика).
        await db.delete(fuelRecords).where(and(
            eq(fuelRecords.vehicleId, vehicleId),
            eq(fuelRecords.source, 'fuel_card_mock'),
            gte(fuelRecords.recordedAt, from),
            lte(fuelRecords.recordedAt, to),
        ));
        await db.insert(fuelRecords).values(rows);

        await recordEvent({
            authorId: user.userId,
            authorRole: user.roles[0] ?? 'admin',
            eventType: 'fuel-card-mock.sync',
            entityType: 'vehicle',
            entityId: vehicleId,
            data: { inserted: rows.length, fromDate, toDate },
        });

        return { success: true, data: { inserted: rows.length } };
    });

    app.get('/integrations/wialon-mock/status', {
        schema: { tags: ['Интеграции'], summary: 'Активные mock-симуляции', description: 'Возвращает список активных Wialon-mock симуляторов.' },
        preHandler: [app.authenticate, requireAbility('manage', 'Settings')],
    }, async (_request, reply) => {
        if (!mockGate(reply)) return;
        return { success: true, data: { simulations: WialonMockRunner.listSimulations() } };
    });
}

// Queue name constants (avoid circular import issues)
const QUEUE_WIALON_SYNC_NAME = 'wialon-sync';
const QUEUE_FINES_SYNC_NAME = 'fines-sync';
