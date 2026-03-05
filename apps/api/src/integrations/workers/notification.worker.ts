// ============================================================
// Notifications Queue + Worker — BullMQ
// Processes Telegram notifications asynchronously
// ============================================================
import { Queue, Worker, Job } from 'bullmq';
import { redisConnectionConfig } from '../redis.js';
import { sendMessage, formatEventMessage, isNotifiableEvent } from '../telegram.service.js';
import { db } from '../../db/connection.js';
import { notificationSubscriptions } from '../../db/schema.js';
import { eq, sql } from 'drizzle-orm';

export const QUEUE_NOTIFICATIONS = 'notifications';

// --- Queue instance ---
export const notificationsQueue = new Queue(QUEUE_NOTIFICATIONS, {
    connection: redisConnectionConfig,
    defaultJobOptions: {
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 50 },
        attempts: 3,
        backoff: { type: 'exponential', delay: 3000 },
    },
});

// --- Job data interface ---
interface NotificationJobData {
    eventType: string;
    entityType: string;
    entityId: string;
    data: Record<string, any>;
    authorId: string;
    authorRole: string;
}

// --- Worker ---
async function processNotification(job: Job<NotificationJobData>) {
    const { eventType, entityType, entityId, data } = job.data;

    // Skip non-notifiable events
    if (!isNotifiableEvent(eventType)) {
        return { skipped: true, reason: 'not_notifiable' };
    }

    // Get all active subscriptions that include this event type
    const subs = await db.select()
        .from(notificationSubscriptions)
        .where(eq(notificationSubscriptions.isActive, true));

    const message = formatEventMessage(eventType, entityType, entityId, data);
    let sent = 0;
    let failed = 0;

    for (const sub of subs) {
        // Check if subscriber wants this event type
        const subscribedEvents = sub.eventTypes as string[];
        if (subscribedEvents.length > 0 && !subscribedEvents.includes(eventType) && !subscribedEvents.includes('*')) {
            continue;
        }

        try {
            const result = await sendMessage(sub.telegramChatId, message);
            if (result.ok) {
                sent++;
            } else {
                failed++;
                job.log(`Failed to send to ${sub.telegramChatId}: ${result.description}`);
            }
        } catch (err: any) {
            failed++;
            job.log(`Error sending to ${sub.telegramChatId}: ${err.message}`);
        }
    }

    return { sent, failed, eventType };
}

let notificationWorker: Worker | null = null;

export function startNotificationWorker(): Worker {
    notificationWorker = new Worker(QUEUE_NOTIFICATIONS, processNotification, {
        connection: redisConnectionConfig,
        concurrency: 3,
        limiter: { max: 30, duration: 1000 }, // Telegram rate limit: 30 msg/sec
    });

    notificationWorker.on('completed', (job) => {
        const result = job.returnvalue;
        if (result && !result.skipped) {
            console.log(`📨 Notification sent: ${result.eventType} → ${result.sent} recipients`);
        }
    });

    notificationWorker.on('failed', (job, err) => {
        console.error(`❌ Notification job ${job?.id} failed:`, err.message);
    });

    console.log('📨 Notification worker started');
    return notificationWorker;
}

export async function stopNotificationWorker(): Promise<void> {
    if (notificationWorker) {
        await notificationWorker.close();
        notificationWorker = null;
    }
}

/**
 * Enqueue a notification for an event.
 * Called from recordEvent hook.
 */
export async function enqueueNotification(params: NotificationJobData): Promise<void> {
    try {
        await notificationsQueue.add(params.eventType, params, {
            priority: getEventPriority(params.eventType),
        });
    } catch {
        // Silently fail — notifications are best-effort
    }
}

function getEventPriority(eventType: string): number {
    // Lower = higher priority
    if (eventType.startsWith('trip.cancelled') || eventType.includes('critical')) return 1;
    if (eventType.startsWith('repair.created')) return 2;
    if (eventType.startsWith('trip.')) return 3;
    if (eventType.startsWith('invoice.')) return 4;
    return 5;
}
