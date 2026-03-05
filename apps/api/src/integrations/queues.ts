// ============================================================
// BullMQ Queue Definitions
// ============================================================
import { Queue } from 'bullmq';
import { redisConnectionConfig } from './redis.js';

// --- Queue names ---
export const QUEUE_WIALON_SYNC = 'wialon-sync';
export const QUEUE_FINES_SYNC = 'fines-sync';

// --- Queue instances ---
export const wialonSyncQueue = new Queue(QUEUE_WIALON_SYNC, {
    connection: redisConnectionConfig,
    defaultJobOptions: {
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 20 },
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
    },
});

export const finesSyncQueue = new Queue(QUEUE_FINES_SYNC, {
    connection: redisConnectionConfig,
    defaultJobOptions: {
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 20 },
        attempts: 3,
        backoff: { type: 'exponential', delay: 10000 },
    },
});

/**
 * Set up repeatable (cron) jobs.
 * - Wialon sync: every 15 minutes
 * - Fines sync: once a day at 03:00 MSK
 */
export async function setupRepeatableJobs(): Promise<void> {
    // Remove old repeatables first to avoid duplicates on restart
    const wialonReps = await wialonSyncQueue.getRepeatableJobs();
    for (const job of wialonReps) {
        await wialonSyncQueue.removeRepeatableByKey(job.key);
    }

    const finesReps = await finesSyncQueue.getRepeatableJobs();
    for (const job of finesReps) {
        await finesSyncQueue.removeRepeatableByKey(job.key);
    }

    // Add new repeatables
    await wialonSyncQueue.add('sync-odometers', {}, {
        repeat: { pattern: '*/15 * * * *' }, // every 15 min
    });

    await finesSyncQueue.add('sync-fines', {}, {
        repeat: { pattern: '0 3 * * *' }, // daily at 03:00
    });

    console.log('📋 Repeatable jobs configured: Wialon (*/15min), Fines (daily 03:00)');
}

/**
 * Add a one-time sync job (for manual triggers).
 */
export async function triggerWialonSync(): Promise<string> {
    const job = await wialonSyncQueue.add('manual-sync-odometers', { manual: true });
    return job.id ?? 'unknown';
}

export async function triggerFinesSync(): Promise<string> {
    const job = await finesSyncQueue.add('manual-sync-fines', { manual: true });
    return job.id ?? 'unknown';
}
