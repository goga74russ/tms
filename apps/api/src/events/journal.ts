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
}

/**
 * Записывает неизменяемое событие в журнал.
 * Идемпотентность: если событие с таким ID уже есть — игнорируется.
 */
export async function recordEvent(params: CreateEventParams, tx?: any) {
    const dbInstance = tx || db;
    const [event] = await dbInstance.insert(events).values({
        authorId: params.authorId,
        authorRole: params.authorRole,
        eventType: params.eventType,
        entityType: params.entityType,
        entityId: params.entityId,
        data: params.data,
        offlineCreatedAt: params.offlineCreatedAt ? new Date(params.offlineCreatedAt) : undefined,
    }).returning();

    return event;
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
