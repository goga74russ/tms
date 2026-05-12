// ============================================================
// A-P0-12 / A-P2: audit-log query helpers, extracted for unit-testing.
// The route handler in `routes.ts` consumes these. Pure logic only — no DB.
// ============================================================
import { and, eq, gte, ilike, lte, type SQL } from 'drizzle-orm';
import { events } from '../../db/schema.js';

export interface AuditQueryFilters {
    from?: string;
    to?: string;
    entity_type?: string;
    entity_id?: string;
    author_id?: string;
    event_type?: string;
    search?: string;
}

/**
 * A-P2: escape `%`, `_` and `\` in user-provided search strings before they
 * go into an `ILIKE` pattern. Without escaping, a string of `%`s causes
 * Postgres to do unbounded backtracking across M+ rows.
 */
export function escapeAuditSearch(raw: string): string {
    return raw.replace(/[%_\\]/g, (c) => `\\${c}`);
}

export interface AuditScopeResult {
    /**
     * `null` when the user has no organizationId — caller should short-circuit
     * to an empty result with `note: 'no_organization_in_token'` instead of
     * running an unscoped query (A-P0-12).
     */
    where: SQL | undefined | null;
    /** True when caller should return empty result + note. */
    empty: boolean;
}

/**
 * Build the WHERE clause for the audit-log list endpoint, tenant-scoped to
 * the caller's organizationId. Returns `{ empty: true, where: null }` when
 * the user has no org (seed admins) — caller serves an empty response with
 * `no_organization_in_token` so dashboards keep rendering.
 */
export function buildAuditConditions(
    organizationId: string | null | undefined,
    filters: AuditQueryFilters,
): AuditScopeResult {
    if (!organizationId) {
        return { where: null, empty: true };
    }
    const conditions: SQL[] = [eq(events.organizationId, organizationId)];
    if (filters.from) conditions.push(gte(events.timestamp, new Date(filters.from)));
    if (filters.to) conditions.push(lte(events.timestamp, new Date(filters.to)));
    if (filters.entity_type) conditions.push(eq(events.entityType, filters.entity_type));
    if (filters.entity_id) conditions.push(eq(events.entityId, filters.entity_id));
    if (filters.author_id) conditions.push(eq(events.authorId, filters.author_id));
    if (filters.event_type) conditions.push(eq(events.eventType, filters.event_type));
    if (filters.search) {
        conditions.push(ilike(events.eventType, `%${escapeAuditSearch(filters.search)}%`));
    }
    return {
        where: conditions.length > 0 ? and(...conditions) : undefined,
        empty: false,
    };
}
