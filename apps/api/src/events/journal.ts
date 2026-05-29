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
    /**
     * A-P0-12: tenant scope. The audit-log reader filters by this. Optional
     * because some system-generated events (cron jobs, system tasks) legitimately
     * have no org. Production code paths should always pass it.
     */
    organizationId?: string | null;
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
    // A-P0-12: if caller didn't pass organizationId explicitly, look it up
    // from the author's user record. This keeps backwards compatibility with
    // all existing call sites while ensuring no event lands with null org
    // unless the author also has none.
    let orgId: string | null | undefined = params.organizationId;
    if (orgId === undefined && params.authorId) {
        try {
            const { users } = await import('../db/schema.js');
            const [row] = await dbInstance
                .select({ organizationId: users.organizationId })
                .from(users)
                .where(eq(users.id, params.authorId))
                .limit(1);
            orgId = row?.organizationId ?? null;
        } catch {
            orgId = null;
        }
    }

    const values: Record<string, unknown> = {
        organizationId: orgId ?? null,
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
                    // P0-S2: org-scope рассылки — берём резолвнутый orgId события.
                    organizationId: orgId ?? null,
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
 *
 * T-2 (cross-tenant event-leak): `organizationId` обязателен. Раньше фильтра по
 * org не было — любой, кто знает/угадает entityId (UUID) чужого тенанта, мог
 * прочитать его журнал. Теперь читаем только события своей организации.
 * Передать `null` можно ТОЛЬКО осознанно для system/super-admin
 * cross-tenant-чтения (нет привязки к одной орг).
 */
export async function getEntityEvents(
    entityType: string,
    entityId: string,
    organizationId: string | null,
    limit = 100,
) {
    const conditions = [
        eq(events.entityType, entityType),
        eq(events.entityId, entityId),
    ];
    if (organizationId !== null) {
        conditions.push(eq(events.organizationId, organizationId));
    }
    return db
        .select()
        .from(events)
        .where(and(...conditions))
        .orderBy(desc(events.timestamp))
        .limit(limit);
}

/**
 * Получает последние N событий (для дашбордов).
 *
 * T-2: `organizationId` обязателен — без него запрос возвращал последние события
 * по ВСЕМ организациям (явная межтенантная утечка). `null` — только для
 * system/super-admin (осознанный cross-tenant дашборд).
 */
export async function getRecentEvents(organizationId: string | null, limit = 100) {
    const base = db.select().from(events);
    const scoped = organizationId !== null
        ? base.where(eq(events.organizationId, organizationId))
        : base;
    return scoped.orderBy(desc(events.timestamp)).limit(limit);
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
