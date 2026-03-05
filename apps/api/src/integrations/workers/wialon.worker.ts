// ============================================================
// Wialon Sync Worker — BullMQ processor
// Periodically fetches telemetry and updates vehicle odometer
// ============================================================
import { Worker, Job } from 'bullmq';
import { redisConnectionConfig } from '../redis.js';
import { QUEUE_WIALON_SYNC } from '../queues.js';
import { db } from '../../db/connection.js';
import { vehicles } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { recordEvent } from '../../events/journal.js';
import * as WialonMock from '../mocks/wialon.mock.js';

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

async function processWialonSync(job: Job): Promise<{
    synced: number;
    errors: number;
    details: Array<{ plateNumber: string; oldOdometer: number; newOdometer: number }>;
}> {
    job.log('Starting Wialon odometer sync...');

    // 1. Fetch all non-archived vehicles
    const vehicleList = await db
        .select({
            id: vehicles.id,
            plateNumber: vehicles.plateNumber,
            currentOdometerKm: vehicles.currentOdometerKm,
        })
        .from(vehicles)
        .where(eq(vehicles.isArchived, false));

    job.log(`Found ${vehicleList.length} active vehicles`);

    let synced = 0;
    let errors = 0;
    const details: Array<{ plateNumber: string; oldOdometer: number; newOdometer: number }> = [];

    const updatesData: Array<{ id: string; odometerKm: number; plateNumber: string; oldOdometer: number }> = [];

    for (const v of vehicleList) {
        try {
            // 2. Get telemetry from mock Wialon
            const telemetry = WialonMock.getVehicleTelemetry(
                v.plateNumber,
                v.currentOdometerKm,
            );

            // 3. Only update if odometer increased (sanity check)
            if (telemetry.odometerKm > v.currentOdometerKm) {
                updatesData.push({
                    id: v.id,
                    odometerKm: telemetry.odometerKm,
                    plateNumber: v.plateNumber,
                    oldOdometer: v.currentOdometerKm,
                });
            }
        } catch (err: any) {
            errors++;
            job.log(`Error syncing ${v.plateNumber}: ${err.message}`);
        }
    }

    // 3.1 Execute batch updates inside a single transaction (H-8 N+1 fix)
    if (updatesData.length > 0) {
        await db.transaction(async (tx) => {
            await Promise.all(
                updatesData.map((u) =>
                    tx.update(vehicles)
                        .set({
                            currentOdometerKm: u.odometerKm,
                            updatedAt: new Date(),
                        })
                        .where(eq(vehicles.id, u.id))
                )
            );
        });

        synced = updatesData.length;
        for (const u of updatesData) {
            details.push({
                plateNumber: u.plateNumber,
                oldOdometer: u.oldOdometer,
                newOdometer: u.odometerKm,
            });
        }
    }

    // 4. Record event for audit trail
    if (synced > 0) {
        await recordEvent({
            authorId: SYSTEM_USER_ID,
            authorRole: 'system',
            eventType: 'integration.wialon_sync',
            entityType: 'vehicle',
            entityId: SYSTEM_USER_ID, // system-level event
            data: {
                synced,
                errors,
                vehicleCount: vehicleList.length,
                manual: job.data?.manual ?? false,
            },
        });
    }

    job.log(`Wialon sync complete: ${synced} updated, ${errors} errors`);
    return { synced, errors, details };
}

let wialonWorker: Worker | null = null;

export function startWialonWorker(): Worker {
    wialonWorker = new Worker(QUEUE_WIALON_SYNC, processWialonSync, {
        connection: redisConnectionConfig,
        concurrency: 1, // one sync at a time
        limiter: { max: 1, duration: 60000 }, // max 1 job per minute
    });

    wialonWorker.on('completed', (job) => {
        console.log(`✅ Wialon sync job ${job.id} completed`);
    });

    wialonWorker.on('failed', (job, err) => {
        console.error(`❌ Wialon sync job ${job?.id} failed:`, err.message);
    });

    console.log('🛰️ Wialon sync worker started');
    return wialonWorker;
}

export async function stopWialonWorker(): Promise<void> {
    if (wialonWorker) {
        await wialonWorker.close();
        wialonWorker = null;
    }
}
