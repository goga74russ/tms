// ============================================================
// Append-only Event Journal Service (Приложение Б ТЗ)
// ============================================================
import { db } from '../db/connection.js';
import { events } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import type { EventType, UserRole } from '@tms/shared';

interface CreateEventParams {
    authorId: string;
    authorRole: string;
    eventType: string;
    entityType: string;
    entityId: string;
    data: Record<string, unknown>;
    offlineCreatedAt?: string;
    /** Optional idempotency key — prevents duplicate events on retries */
    externalId?: string;
}

/**
 * Записывает неизменяемое событие в журнал.
 * Идемпотентность: если передан externalId и событие с таким ID уже есть — игнорируется.
 */
export async function recordEvent(params: CreateEventParams, tx?: any) {
    const dbInstance = tx || db;
    const values: Record<string, unknown> = {
        authorId: params.authorId,
        authorRole: params.authorRole,
        eventType: params.eventType,
        entityType: params.entityType,
        entityId: params.entityId,
        data: params.data,
        offlineCreatedAt: params.offlineCreatedAt ? new Date(params.offlineCreatedAt) : undefined,
    };

    // If externalId provided, set it for idempotency
    if (params.externalId) {
        values.externalId = params.externalId;
    }

    const result = await dbInstance.insert(events).values(values)
        .onConflictDoNothing() // Safe: if externalId unique constraint hit, skip silently
        .returning();

    // Sprint 6: Enqueue Telegram notification (best-effort, non-blocking)
    if (result[0]) {
        // Use a timeout to prevent hanging when Redis is unavailable
        const notifyPromise = (async () => {
            try {
                const { enqueueNotification } = await import('../integrations/workers/notification.worker.js');
                await enqueueNotification({
                    eventType: params.eventType,
                    entityType: params.entityType,
                    entityId: params.entityId,
                    data: params.data,
                    authorId: params.authorId,
                    authorRole: params.authorRole,
                });
            } catch {
                // Silently ignore — notifications are best-effort
            }
        })();
        const timeout = new Promise((resolve) => setTimeout(resolve, 3000));
        await Promise.race([notifyPromise, timeout]);
    }

    return result[0] ?? null; // null = duplicate, was ignored
}

/**
 * Получает историю событий по сущности.
 */
export async function getEntityEvents(entityType: string, entityId: string, limit = 100) {
    return db
        .select()
        .from(events)
        .where(
            and(
                eq(events.entityType, entityType),
                eq(events.entityId, entityId),
            ),
        )
        .orderBy(desc(events.timestamp))
        .limit(limit);
}

/**
 * Получает последние N событий (для дашбордов).
 */
export async function getRecentEvents(limit = 100) {
    return db
        .select()
        .from(events)
        .orderBy(desc(events.timestamp))
        .limit(limit);
}

/**
 * Помечает событие как конфликтное (для оффлайн-синхронизации).
 * Примечание: это единственная разрешённая модификация — пометка конфликта.
 */
export async function markEventConflict(eventId: string) {
    return db
        .update(events)
        .set({ conflict: true })
        .where(eq(events.id, eventId))
        .returning();
}
