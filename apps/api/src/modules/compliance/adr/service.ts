// ============================================================
// ADR strict-mode wrapper around the existing
// `validateAdrCompatibility` (Wave 5).
//
// We intentionally do NOT reach into trips/service.ts. Instead the
// wrapper is exposed as a hard-mode validator and a strict-mode
// flag toggle. Trips can adopt the wrapper later by importing
// `validateAdrHard` at the existing assignment hook.
// ============================================================
import { and, eq, isNotNull } from 'drizzle-orm';
import { db } from '../../../db/connection.js';
import { organizations, orders } from '../../../db/schema.js';
import {
    validateAdrCompatibility,
    type AdrValidationResult,
} from '../../adr/service.js';

export interface AdrHardResult extends AdrValidationResult {
    strictMode: boolean;
    blocked: boolean;
}

/**
 * Hard-mode validation. When the org has `adr_strict_mode = true`
 * AND the order has any ADR errors, the helper returns blocked=true
 * so callers can throw a 400 instead of just warning.
 */
export async function validateAdrHard(
    organizationId: string | null | undefined,
    orderId: string,
    vehicleId: string,
    driverId: string,
    nowDate: Date = new Date(),
): Promise<AdrHardResult> {
    const baseline = await validateAdrCompatibility(orderId, vehicleId, driverId, nowDate);
    let strictMode = false;
    if (organizationId) {
        const [org] = await db
            .select({ adrStrictMode: organizations.adrStrictMode })
            .from(organizations)
            .where(eq(organizations.id, organizationId))
            .limit(1);
        strictMode = Boolean(org?.adrStrictMode);
    }
    const blocked = strictMode && !baseline.ok;
    return { ...baseline, strictMode, blocked };
}

export async function setAdrStrictMode(
    organizationId: string,
    enabled: boolean,
): Promise<{ adrStrictMode: boolean }> {
    await db
        .update(organizations)
        .set({ adrStrictMode: enabled })
        .where(eq(organizations.id, organizationId));
    return { adrStrictMode: enabled };
}

export async function getAdrStrictMode(organizationId: string): Promise<boolean> {
    const [org] = await db
        .select({ adrStrictMode: organizations.adrStrictMode })
        .from(organizations)
        .where(eq(organizations.id, organizationId))
        .limit(1);
    return Boolean(org?.adrStrictMode);
}

/** List recent orders flagged as ADR (for the dashboard tab). */
export async function listAdrOrders(organizationId: string, isSuperAdmin = false) {
    // C3 (механизм «а»): org-фильтр обязателен — раньше параметр игнорировался и
    // отдавались ADR-заявки ВСЕХ тенантов. super-admin — кросс-tenant; прочий org-less → пусто.
    if (!organizationId && !isSuperAdmin) return [];
    const where = organizationId
        ? and(eq(orders.organizationId, organizationId), isNotNull(orders.adrClass))
        : isNotNull(orders.adrClass);
    return db
        .select({
            id: orders.id,
            number: orders.number,
            adrClass: orders.adrClass,
            adrUnNumber: orders.adrUnNumber,
            status: orders.status,
        })
        .from(orders)
        .where(where)
        .limit(200);
}
