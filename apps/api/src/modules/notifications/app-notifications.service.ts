// ============================================================
// In-app уведомления (колокольчик). Отдельный канал от Telegram.
// Маршрутизация адресатов ЭТрН-подписи — по ПРАВУ ПОДПИСИ (МЧД),
// а не по ярлыку роли: активная непросроченная МЧД (grantee по ИНН)
// = фактический подписант; диспетчер/логист — оформители рейса.
// ============================================================
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import { appNotifications, users } from '../../db/schema.js';

export type NotificationType = 'etrn_sign_required';

// Роли-подписанты ЭТрН. По-хорошему адресовать надо ДЕРЖАТЕЛЮ активной МЧД
// (право подписи), но users не хранит личный ИНН → джойн mchd.granteeInn↔user
// пока невозможен. Роль-фолбэк по рекомендации Jurist: диспетчер + логист +
// admin (для малого парка/ИП admin = собственник-держатель МЧД).
// TODO(mchd-routing): добавить users.inn (или связь user↔mchd) и таргетировать
// именно держателя активной непросроченной МЧД в рамках организации.
const SIGNER_ROLES = ['dispatcher', 'logist', 'admin'];

/**
 * Адресаты уведомления «нужно подписать ЭТрН» в рамках организации.
 * Distinct userId по ролям-подписантам.
 */
export async function resolveEtrnSignRecipients(organizationId: string): Promise<string[]> {
    const orgUsers = await db
        .select({ id: users.id, roles: users.roles })
        .from(users)
        .where(eq(users.organizationId, organizationId));

    const recipients = new Set<string>();
    for (const u of orgUsers) {
        const roles = (u.roles as string[]) ?? [];
        if (roles.some((r) => SIGNER_ROLES.includes(r))) recipients.add(u.id);
    }
    return [...recipients];
}

export async function createNotifications(params: {
    organizationId: string;
    userIds: string[];
    type: NotificationType;
    title: string;
    message: string;
    tripId?: string | null;
    meta?: Record<string, unknown>;
}): Promise<number> {
    const { organizationId, userIds, type, title, message, tripId, meta } = params;
    if (userIds.length === 0) return 0;
    await db.insert(appNotifications).values(
        userIds.map((userId) => ({
            organizationId,
            userId,
            type,
            title,
            message,
            tripId: tripId ?? null,
            meta: meta ?? {},
        })),
    );
    return userIds.length;
}

export async function listNotifications(userId: string, limit = 30) {
    return db
        .select()
        .from(appNotifications)
        .where(eq(appNotifications.userId, userId))
        .orderBy(desc(appNotifications.createdAt))
        .limit(limit);
}

export async function unreadCount(userId: string): Promise<number> {
    const [row] = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(appNotifications)
        .where(and(eq(appNotifications.userId, userId), isNull(appNotifications.readAt)));
    return row?.c ?? 0;
}

export async function markRead(userId: string, id: string): Promise<void> {
    await db
        .update(appNotifications)
        .set({ readAt: new Date() })
        .where(and(
            eq(appNotifications.id, id),
            eq(appNotifications.userId, userId),
            isNull(appNotifications.readAt),
        ));
}

export async function markAllRead(userId: string): Promise<void> {
    await db
        .update(appNotifications)
        .set({ readAt: new Date() })
        .where(and(eq(appNotifications.userId, userId), isNull(appNotifications.readAt)));
}
