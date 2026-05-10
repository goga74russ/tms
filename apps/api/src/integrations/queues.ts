// ============================================================
// BullMQ Queue Definitions
// ============================================================
import { Queue } from 'bullmq';
import type { FastifyBaseLogger } from 'fastify';
import { redisConnectionConfig } from './redis.js';

// --- Queue names ---
export const QUEUE_WIALON_SYNC = 'wialon-sync';
export const QUEUE_FINES_SYNC = 'fines-sync';
export const QUEUE_BILLING = 'billing';

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

export const billingQueue = new Queue(QUEUE_BILLING, {
    connection: redisConnectionConfig,
    defaultJobOptions: {
        removeOnComplete: { count: 30 },
        removeOnFail: { count: 30 },
        attempts: 2,
        backoff: { type: 'exponential', delay: 30000 },
    },
});

/**
 * Set up repeatable (cron) jobs.
 * - Wialon sync: every 15 minutes
 * - Fines sync: once a day at 03:00 MSK
 * - Billing daily: bulk-generate за прошедшие сутки в 02:00
 */
export async function setupRepeatableJobs(logger?: FastifyBaseLogger): Promise<void> {
    // Remove old repeatables first to avoid duplicates on restart
    const wialonReps = await wialonSyncQueue.getRepeatableJobs();
    for (const job of wialonReps) {
        await wialonSyncQueue.removeRepeatableByKey(job.key);
    }

    const finesReps = await finesSyncQueue.getRepeatableJobs();
    for (const job of finesReps) {
        await finesSyncQueue.removeRepeatableByKey(job.key);
    }

    const billingReps = await billingQueue.getRepeatableJobs();
    for (const job of billingReps) {
        await billingQueue.removeRepeatableByKey(job.key);
    }

    // Add new repeatables
    await wialonSyncQueue.add('sync-odometers', {}, {
        repeat: { pattern: '*/15 * * * *' }, // every 15 min
    });

    await finesSyncQueue.add('sync-fines', {}, {
        repeat: { pattern: '0 3 * * *' }, // daily at 03:00
    });

    await billingQueue.add('billing.daily', {}, {
        repeat: { pattern: '0 2 * * *' }, // daily at 02:00
    });

    const msg = 'Repeatable jobs configured: Wialon (*/15min), Fines (daily 03:00), Billing (daily 02:00)';
    if (logger) {
        logger.info(msg);
    } else {
        // Bootstrap fallback only.
        console.info(`📋 ${msg}`);
    }
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

export async function triggerBillingDaily(): Promise<string> {
    const job = await billingQueue.add('billing.daily', { manual: true });
    return job.id ?? 'unknown';
}
