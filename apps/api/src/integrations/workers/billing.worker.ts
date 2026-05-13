// ============================================================
// Wave 4: Billing Daily Worker — BullMQ processor
// Запускается ежедневно в 02:00 и вызывает bulk-generate
// для рейсов завершённых за прошедшие сутки.
// Идемпотентность гарантирует financeService:
// рейс с уже привязанным счётом будет пропущен.
// ============================================================
import { Worker, Job } from 'bullmq';
import type { FastifyBaseLogger } from 'fastify';
import { redisConnectionConfig } from '../redis.js';
import { QUEUE_BILLING } from '../queues.js';
import { recordEvent } from '../../events/journal.js';

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

interface BillingDailyResult {
    created: number;
    skipped: number;
    from: string;
    to: string;
}

export async function processBillingDaily(job: Job): Promise<BillingDailyResult> {
    job.log('Starting billing.daily run...');

    const now = new Date();
    const to = new Date(now);
    to.setUTCHours(0, 0, 0, 0); // начало текущего UTC-дня
    const from = new Date(to);
    from.setUTCDate(from.getUTCDate() - 1); // начало предыдущего дня

    const { financeService } = await import('../../modules/finance/finance.service.js');

    const result = await financeService.bulkGenerateInvoices(
        {
            from: from.toISOString(),
            to: to.toISOString(),
        },
        {
            authorId: SYSTEM_USER_ID,
            authorRole: 'system',
            organizationId: null,
        },
    );

    await recordEvent({
        authorId: SYSTEM_USER_ID,
        authorRole: 'system',
        eventType: 'integration.billing_daily',
        entityType: 'invoice',
        entityId: SYSTEM_USER_ID,
        data: {
            from: from.toISOString(),
            to: to.toISOString(),
            createdCount: result.created.length,
            skippedCount: result.skipped.length,
            createdInvoiceIds: result.created.map((c) => c.invoiceId),
            manual: job.data?.manual ?? false,
        },
    });

    job.log(`Billing daily complete: ${result.created.length} invoices created, ${result.skipped.length} skipped`);
    return {
        created: result.created.length,
        skipped: result.skipped.length,
        from: from.toISOString(),
        to: to.toISOString(),
    };
}

let billingWorker: Worker | null = null;

export function startBillingWorker(logger: FastifyBaseLogger): Worker {
    billingWorker = new Worker(QUEUE_BILLING, processBillingDaily, {
        connection: redisConnectionConfig,
        concurrency: 1,
        limiter: { max: 1, duration: 60_000 },
    });

    billingWorker.on('completed', (job) => {
        logger.info({ jobId: job.id }, 'Billing daily job completed');
    });

    billingWorker.on('failed', (job, err) => {
        logger.error({ err, jobId: job?.id }, 'Billing daily job failed');
    });

    logger.info('Billing daily worker started');
    return billingWorker;
}

export async function stopBillingWorker(): Promise<void> {
    if (billingWorker) {
        await billingWorker.close();
        billingWorker = null;
    }
}
