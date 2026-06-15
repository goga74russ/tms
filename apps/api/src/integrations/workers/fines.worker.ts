// ============================================================
// Fines Sync Worker — BullMQ processor
// Periodically imports fines from ГИБДД mock API
// ============================================================
import { Worker, Job } from 'bullmq';
import type { FastifyBaseLogger } from 'fastify';
import { redisConnectionConfig } from '../redis.js';
import { QUEUE_FINES_SYNC } from '../queues.js';
import { db } from '../../db/connection.js';
import { vehicles, fines } from '../../db/schema.js';
import { eq, and, inArray } from 'drizzle-orm';
import { recordEvent } from '../../events/journal.js';
import * as GibddMock from '../mocks/gibdd.mock.js';

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

export async function processFinesSync(job: Job): Promise<{
    imported: number;
    duplicates: number;
    errors: number;
    details: Array<{ plateNumber: string; resolutionNumber: string; amount: number }>;
}> {
    job.log('Starting ГИБДД fines import...');

    // 1. Fetch all non-archived vehicles
    const vehicleList = await db
        .select({
            id: vehicles.id,
            plateNumber: vehicles.plateNumber,
            organizationId: vehicles.organizationId,
        })
        .from(vehicles)
        .where(eq(vehicles.isArchived, false));

    job.log(`Checking fines for ${vehicleList.length} vehicles`);

    // Pre-fetch all existing fines for these vehicles to avoid N+1 queries (H-7)
    const existingFinesSet = new Set<string>();
    if (vehicleList.length > 0) {
        const vehicleIds = vehicleList.map(v => v.id);
        const allExisting = await db
            .select({ vehicleId: fines.vehicleId, resolutionNumber: fines.resolutionNumber })
            .from(fines)
            .where(inArray(fines.vehicleId, vehicleIds));

        for (const f of allExisting) {
            if (f.resolutionNumber) {
                existingFinesSet.add(`${f.vehicleId}:${f.resolutionNumber}`);
            }
        }
    }

    let imported = 0;
    let duplicates = 0;
    let errors = 0;
    const details: Array<{ plateNumber: string; resolutionNumber: string; amount: number }> = [];

    for (const v of vehicleList) {
        try {
            // 2. Lookup fines from mock ГИБДД
            const foundFines = GibddMock.lookupFines(v.plateNumber);

            for (const f of foundFines) {
                // 3. Deduplicate by resolutionNumber using O(1) Set lookup
                const fineKey = `${v.id}:${f.resolutionNumber}`;
                if (existingFinesSet.has(fineKey)) {
                    duplicates++;
                    continue;
                }

                // 4. Insert new fine.
                // P3 #701 (код-аудит 2026-06-14): дедуп был только на уровне приложения
                // (in-memory Set), плюс Set не обновлялся после вставок → один и тот же
                // resolutionNumber в одном прогоне мог вставиться дважды, а параллельные
                // прогоны не имели БД-защиты. Добавлен partial-unique индекс
                // idx_fines_vehicle_resolution (миграция 0057) + onConflictDoNothing:
                // при гонке/повторе INSERT тихо ничего не делает (returning пуст).
                const [newFine] = await db.insert(fines).values({
                    vehicleId: v.id,
                    organizationId: v.organizationId, // C3 «в» (миг.0042): прямой org-скоуп
                    violationDate: new Date(f.violationDate),
                    violationType: f.violationType,
                    amount: f.amount,
                    resolutionNumber: f.resolutionNumber,
                    status: 'new',
                }).onConflictDoNothing().returning();

                if (!newFine) {
                    // Конфликт по unique (вставил параллельный прогон) — считаем дублем.
                    duplicates++;
                    if (f.resolutionNumber) existingFinesSet.add(fineKey);
                    continue;
                }
                // Обновляем in-memory Set, чтобы дубль в пределах этого же прогона не прошёл.
                if (f.resolutionNumber) existingFinesSet.add(fineKey);

                details.push({
                    plateNumber: v.plateNumber,
                    resolutionNumber: f.resolutionNumber,
                    amount: f.amount,
                });

                // 5. Record event
                await recordEvent({
                    authorId: SYSTEM_USER_ID,
                    authorRole: 'system',
                    // F-21b: привязываем system-событие к орг ТС (а не null от
                    // system-автора), иначе org-scoped аудит-лог его не показывает.
                    organizationId: v.organizationId,
                    eventType: 'fine.auto_imported',
                    entityType: 'fine',
                    entityId: newFine.id,
                    data: {
                        source: 'gibdd_sync',
                        vehicleId: v.id,
                        plateNumber: v.plateNumber,
                        resolutionNumber: f.resolutionNumber,
                        amount: f.amount,
                        violationType: f.violationType,
                    },
                });

                imported++;
            }
        } catch (err: any) {
            errors++;
            job.log(`Error checking fines for ${v.plateNumber}: ${err.message}`);
        }
    }

    // 6. Summary event
    if (imported > 0 || duplicates > 0) {
        await recordEvent({
            authorId: SYSTEM_USER_ID,
            authorRole: 'system',
            eventType: 'integration.fines_sync',
            entityType: 'fine',
            entityId: SYSTEM_USER_ID,
            data: {
                imported,
                duplicates,
                errors,
                vehiclesChecked: vehicleList.length,
                manual: job.data?.manual ?? false,
            },
        });
    }

    job.log(`Fines sync complete: ${imported} imported, ${duplicates} duplicates, ${errors} errors`);
    return { imported, duplicates, errors, details };
}

let finesWorker: Worker | null = null;

export function startFinesWorker(logger: FastifyBaseLogger): Worker {
    finesWorker = new Worker(QUEUE_FINES_SYNC, processFinesSync, {
        connection: redisConnectionConfig,
        concurrency: 1,
        limiter: { max: 1, duration: 300000 }, // max 1 job per 5 minutes
    });

    finesWorker.on('completed', (job) => {
        logger.info({ jobId: job.id }, 'Fines sync job completed');
    });

    finesWorker.on('failed', (job, err) => {
        logger.error({ err, jobId: job?.id }, 'Fines sync job failed');
    });

    logger.info('Fines sync worker started');
    return finesWorker;
}

export async function stopFinesWorker(): Promise<void> {
    if (finesWorker) {
        await finesWorker.close();
        finesWorker = null;
    }
}
