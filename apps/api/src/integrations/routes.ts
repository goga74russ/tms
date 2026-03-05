// ============================================================
// Integration Routes — Manual sync triggers & status
// ============================================================
import { FastifyInstance } from 'fastify';
import { triggerWialonSync, triggerFinesSync, wialonSyncQueue, finesSyncQueue } from './queues.js';
import * as DaDataMock from './mocks/dadata.mock.js';
import * as FuelCardMock from './mocks/fuel-card.mock.js';
import { db } from '../db/connection.js';
import { vehicles } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { requireAbility } from '../auth/rbac.js';

export default async function integrationRoutes(app: FastifyInstance) {

    // ──────────────────────────────────────────────
    // POST /integrations/wialon/sync — manual trigger
    // ──────────────────────────────────────────────
    app.post('/integrations/wialon/sync', {
        preHandler: [app.authenticate, requireAbility('manage', 'Settings')],
    }, async (request, reply) => {
        try {
            const jobId = await triggerWialonSync();
            return { success: true, data: { jobId, message: 'Wialon sync job queued' } };
        } catch (error: any) {
            app.log.error(error);
            return reply.status(500).send({ success: false, error: error.message });
        }
    });

    // ──────────────────────────────────────────────
    // POST /integrations/fines/sync — manual trigger
    // ──────────────────────────────────────────────
    app.post('/integrations/fines/sync', {
        preHandler: [app.authenticate, requireAbility('manage', 'Settings')],
    }, async (request, reply) => {
        try {
            const jobId = await triggerFinesSync();
            return { success: true, data: { jobId, message: 'Fines sync job queued' } };
        } catch (error: any) {
            app.log.error(error);
            return reply.status(500).send({ success: false, error: error.message });
        }
    });

    // ──────────────────────────────────────────────
    // GET /integrations/status — worker health
    // ──────────────────────────────────────────────
    app.get('/integrations/status', {
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
        preHandler: [app.authenticate],
    }, async (request, reply) => {
        const { inn } = request.params as { inn: string };

        if (!/^\d{10}(\d{2})?$/.test(inn)) {
            return reply.status(400).send({
                success: false,
                error: 'ИНН должен содержать 10 или 12 цифр',
            });
        }

        const company = DaDataMock.findByInn(inn);
        if (!company) {
            return reply.status(404).send({ success: false, error: 'Компания не найдена' });
        }

        return { success: true, data: company };
    });

    // ──────────────────────────────────────────────
    // GET /integrations/dadata/suggest-address — address suggestions
    // ──────────────────────────────────────────────
    app.get('/integrations/dadata/suggest-address', {
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
        preHandler: [app.authenticate],
    }, async (request, reply) => {
        const { vehicleId } = request.params as { vehicleId: string };
        const { days } = request.query as { days?: string };

        const [vehicle] = await db
            .select({
                plateNumber: vehicles.plateNumber,
                currentOdometerKm: vehicles.currentOdometerKm,
            })
            .from(vehicles)
            .where(eq(vehicles.id, vehicleId))
            .limit(1);

        if (!vehicle) {
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
}

// Queue name constants (avoid circular import issues)
const QUEUE_WIALON_SYNC_NAME = 'wialon-sync';
const QUEUE_FINES_SYNC_NAME = 'fines-sync';
