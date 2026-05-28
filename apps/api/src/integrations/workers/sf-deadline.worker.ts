// ============================================================
// T-14 (2/3) — SF deadline scan worker (invoice-spec.md §6).
//
// Раз в сутки сканит доставленные заявки плательщиков НДС, по которым ещё НЕ
// выпущен СФ/УПД, и приближается/просрочен 5-дневный срок (ст. 168 ч. 3 НК).
// На каждую находку пишет событие в журнал — recordEvent сам ставит
// Telegram-уведомление в очередь. Идемпотентность по externalId: каждое
// напоминание (approach / overdue) по заявке отправляется один раз.
// ============================================================
import { Worker, Job } from 'bullmq';
import type { FastifyBaseLogger } from 'fastify';
import { and, eq, ne, lte, isNotNull, inArray, notInArray } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import { orders, organizations, invoices, invoiceOrders } from '../../db/schema.js';
import { VAT_PAYING_REGIMES, SF_ISSUE_DEADLINE_DAYS } from '@tms/shared';
import { redisConnectionConfig } from '../redis.js';
import { QUEUE_SF_DEADLINE } from '../queues.js';
import { recordEvent } from '../../events/journal.js';

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';
const MS_PER_DAY = 24 * 60 * 60 * 1000;
// Начинаем напоминать за 2 дня до дедлайна (т.е. с 3-го дня после реализации).
const APPROACH_FROM_DAYS = SF_ISSUE_DEADLINE_DAYS - 2;

export interface SfDeadlineFinding {
    orderId: string;
    orderNumber: string;
    organizationId: string;
    realizationDate: string;
    deadlineDate: string;
    daysSinceRealization: number;
    daysLate: number;
    overdue: boolean;
}

/**
 * Находит заявки, по которым приближается/просрочен срок выпуска СФ.
 * Чистая выборка (без побочных эффектов) — тестируемо отдельно от воркера.
 */
export async function scanSfDeadlines(now: Date = new Date()): Promise<SfDeadlineFinding[]> {
    // Заявки, уже покрытые выпущенным (не draft/cancelled) СФ или УПД.
    const coveredOrderIds = db
        .select({ orderId: invoiceOrders.orderId })
        .from(invoiceOrders)
        .innerJoin(invoices, eq(invoices.id, invoiceOrders.invoiceId))
        .where(and(
            inArray(invoices.type, ['sf', 'upd']),
            ne(invoices.status, 'draft'),
            ne(invoices.status, 'cancelled'),
        ));

    const cutoff = new Date(now.getTime() - APPROACH_FROM_DAYS * MS_PER_DAY);

    const rows = await db
        .select({
            id: orders.id,
            number: orders.number,
            unloadingDate: orders.unloadingDate,
            organizationId: orders.organizationId,
        })
        .from(orders)
        .innerJoin(organizations, eq(organizations.id, orders.organizationId))
        .where(and(
            eq(orders.status, 'delivered'),
            isNotNull(orders.unloadingDate),
            lte(orders.unloadingDate, cutoff),
            inArray(organizations.taxRegime, VAT_PAYING_REGIMES),
            notInArray(orders.id, coveredOrderIds),
        ));

    const out: SfDeadlineFinding[] = [];
    for (const r of rows) {
        if (!r.unloadingDate || !r.organizationId) continue;
        const realization = r.unloadingDate;
        const days = Math.floor((now.getTime() - realization.getTime()) / MS_PER_DAY);
        const daysLate = Math.max(0, days - SF_ISSUE_DEADLINE_DAYS);
        out.push({
            orderId: r.id,
            orderNumber: r.number,
            organizationId: r.organizationId,
            realizationDate: realization.toISOString(),
            deadlineDate: new Date(realization.getTime() + SF_ISSUE_DEADLINE_DAYS * MS_PER_DAY).toISOString(),
            daysSinceRealization: days,
            daysLate,
            overdue: daysLate > 0,
        });
    }
    return out;
}

export async function processSfDeadlineScan(job: Job): Promise<{ scanned: number; notified: number }> {
    job.log('Starting sf-deadline scan...');
    const findings = await scanSfDeadlines();
    let notified = 0;
    for (const f of findings) {
        // recordEvent сам ставит Telegram-уведомление в очередь (best-effort).
        // externalId делает напоминание идемпотентным: approach и overdue по
        // одной заявке отправляются максимум по одному разу.
        const created = await recordEvent({
            authorId: SYSTEM_USER_ID,
            authorRole: 'system',
            organizationId: f.organizationId,
            eventType: f.overdue ? 'invoice.sf_overdue' : 'invoice.sf_deadline_approaching',
            entityType: 'order',
            entityId: f.orderId,
            data: {
                orderNumber: f.orderNumber,
                daysSinceRealization: f.daysSinceRealization,
                daysLate: f.daysLate,
                realizationDate: f.realizationDate,
                deadlineDate: f.deadlineDate,
            },
            externalId: `sf-deadline:${f.orderId}:${f.overdue ? 'overdue' : 'approach'}`,
        });
        if (created) notified += 1;
    }
    job.log(`sf-deadline scan complete: ${findings.length} found, ${notified} new reminders`);
    return { scanned: findings.length, notified };
}

let sfDeadlineWorker: Worker | null = null;

export function startSfDeadlineWorker(logger: FastifyBaseLogger): Worker {
    sfDeadlineWorker = new Worker(QUEUE_SF_DEADLINE, processSfDeadlineScan, {
        connection: redisConnectionConfig,
        concurrency: 1,
        limiter: { max: 1, duration: 60_000 },
    });
    sfDeadlineWorker.on('completed', (jobItem) => {
        logger.info({ jobId: jobItem.id }, 'sf-deadline scan completed');
    });
    sfDeadlineWorker.on('failed', (jobItem, err) => {
        logger.error({ err, jobId: jobItem?.id }, 'sf-deadline scan failed');
    });
    logger.info('SF deadline worker started');
    return sfDeadlineWorker;
}

export async function stopSfDeadlineWorker(): Promise<void> {
    if (sfDeadlineWorker) {
        await sfDeadlineWorker.close();
        sfDeadlineWorker = null;
    }
}
