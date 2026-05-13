// ============================================================
// D20 (Round 3C) — EDI mock progression BullMQ worker.
// Consumes delayed jobs scheduled by `sendDocumentToEdi`.
// Idempotent: if the document was already advanced manually,
// the job becomes a no-op.
// ============================================================
import { Worker, Job } from 'bullmq';
import type { FastifyBaseLogger } from 'fastify';
import { redisConnectionConfig } from '../redis.js';
import { QUEUE_EDI_PROGRESSION } from '../queues.js';
import { processEdiProgressionJob, type EdiProgressionJobData } from '../../modules/edi/service.js';

let ediWorker: Worker | null = null;

export async function processEdiJob(job: Job<EdiProgressionJobData>): Promise<{ progressed: boolean }> {
    const { documentId, stage } = job.data;
    job.log(`EDI progression: doc=${documentId} stage=${stage}`);
    try {
        const result = await processEdiProgressionJob(job.data);
        job.log(`EDI progression result: progressed=${result.progressed}`);
        return result;
    } catch (err: any) {
        job.log(`EDI progression failed: ${err?.message ?? 'unknown'}`);
        throw err;
    }
}

export function startEdiWorker(logger: FastifyBaseLogger): Worker {
    ediWorker = new Worker(QUEUE_EDI_PROGRESSION, processEdiJob, {
        connection: redisConnectionConfig,
        concurrency: 5,
    });

    ediWorker.on('completed', (job) => {
        logger.info({ jobId: job.id, data: job.data }, 'EDI progression job completed');
    });

    ediWorker.on('failed', (job, err) => {
        logger.error({ err, jobId: job?.id, data: job?.data }, 'EDI progression job failed');
    });

    logger.info('EDI progression worker started');
    return ediWorker;
}

export async function stopEdiWorker(): Promise<void> {
    if (ediWorker) {
        await ediWorker.close();
        ediWorker = null;
    }
}
