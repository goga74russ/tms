// ============================================================
// WebSocket — pure filter helpers (no Fastify, no sockets).
// Extracted from websocket.ts so the org-scoping rules can be
// tested in isolation. broadcastPositions / broadcastEvent in
// the main module delegate the "is this client allowed to see
// this payload?" decision to shouldDeliverToClient below.
// ============================================================

/**
 * Subscription metadata stored alongside each connected socket.
 * organizationId === null means "global / admin" (no scope filter).
 */
export interface ClientSubscription {
    organizationId?: string | null;
}

/**
 * A position payload as broadcast by broadcastPositions. Only
 * organizationId matters for filtering — everything else is opaque.
 */
export interface ScopedPosition {
    organizationId?: string | null;
}

/**
 * Decide whether a single position record should be delivered to a
 * subscribing client.
 *
 *   - subscription with no org (admin / observer) → sees everything.
 *   - subscription scoped to an org → only sees positions whose
 *     organizationId matches exactly.
 *   - position without an organizationId is treated as "system" and
 *     only delivered to unscoped (admin) subscriptions.
 */
export function shouldDeliverPosition(
    position: ScopedPosition,
    subscription: ClientSubscription,
): boolean {
    if (!subscription.organizationId) {
        return true;
    }
    return position.organizationId === subscription.organizationId;
}

/**
 * Filter an array of positions for one subscription. Returns a new
 * array with the organizationId stripped (the wire format omits it).
 */
export function filterPositionsForSubscription<T extends ScopedPosition>(
    positions: T[],
    subscription: ClientSubscription,
): Array<Omit<T, 'organizationId'>> {
    const visible = positions.filter((p) => shouldDeliverPosition(p, subscription));
    return visible.map(({ organizationId: _organizationId, ...rest }) => rest as Omit<T, 'organizationId'>);
}

/**
 * Decide whether a generic event payload (broadcastEvent) should reach
 * a subscriber.
 *   - if payload has no org → FAIL-CLOSED: не доставляем никому (P2 код-аудит
 *     2026-06-14: раньше «нет org → всем» делало любое событие без org
 *     cross-tenant утечкой. Все реальные вызовы broadcastEvent передают org;
 *     система-wide событий без org сейчас нет — безопаснее не доставлять, чем
 *     протекать. Если понадобится явный system-wide broadcast — добавить отдельный
 *     путь, не дефолт.)
 *   - if subscriber has no org → admin (super-admin мониторинг) видит всё
 *   - else strict equality
 */
export function shouldDeliverEvent(
    payloadOrgId: string | null | undefined,
    subscriberOrgId: string | null | undefined,
): boolean {
    if (!payloadOrgId) return false;
    if (!subscriberOrgId) return true;
    return payloadOrgId === subscriberOrgId;
}
