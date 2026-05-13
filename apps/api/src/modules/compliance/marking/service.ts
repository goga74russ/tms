// ============================================================
// Честный знак (ЦРПТ) verification service.
// Calls the active marking adapter (mock by default) and persists
// each verification into `marking_verifications` for audit and
// dashboards.
// ============================================================
import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../../../db/connection.js';
import { markingVerifications } from '../../../db/schema.js';
import {
    selectAdapter, loadCredentials,
} from '../../../providers/base.js';
import { getDefaultRegistry } from '../../../providers/index.js';
import type { MarkingProvider, MarkingCredentials } from '../../../providers/marking/interface.js';

async function pickMarkingAdapter(organizationId: string | null): Promise<{
    adapter: MarkingProvider;
    creds: MarkingCredentials;
}> {
    const reg = getDefaultRegistry();
    if (!organizationId) {
        return { adapter: reg.marking[0]!, creds: {} };
    }
    const adapter = await selectAdapter(reg.marking, organizationId, 'marking');
    const loaded = await loadCredentials(organizationId, 'marking', adapter.name);
    return {
        adapter,
        creds: (loaded?.credentials as MarkingCredentials | undefined) ?? {},
    };
}

export interface VerifyOptions {
    organizationId: string | null;
    lotId?: string | null;
    codes: string[];
}

export async function verifyCodes(opts: VerifyOptions) {
    const { adapter, creds } = await pickMarkingAdapter(opts.organizationId);
    const results = await adapter.bulkVerify(creds, opts.codes);

    const inserted = await db.insert(markingVerifications).values(
        results.map(r => ({
            organizationId: opts.organizationId ?? null,
            lotId: opts.lotId ?? null,
            code: r.code,
            valid: r.valid,
            category: r.category ?? null,
            productName: r.productName ?? null,
            gtin: r.gtin ?? null,
            serial: r.serial ?? null,
            rawResponse: r.raw ?? null,
            providerName: adapter.name,
        })),
    ).returning();

    return {
        providerName: adapter.name,
        results,
        inserted,
    };
}

export async function listVerificationsByLot(lotId: string, organizationId: string | null) {
    const where = organizationId
        ? and(eq(markingVerifications.lotId, lotId), eq(markingVerifications.organizationId, organizationId))
        : eq(markingVerifications.lotId, lotId);
    return db
        .select()
        .from(markingVerifications)
        .where(where)
        .orderBy(desc(markingVerifications.verifiedAt));
}

export async function listRecentVerifications(organizationId: string, limit = 100) {
    return db
        .select()
        .from(markingVerifications)
        .where(eq(markingVerifications.organizationId, organizationId))
        .orderBy(desc(markingVerifications.verifiedAt))
        .limit(limit);
}

export async function categorySummary(organizationId: string): Promise<Array<{
    category: string;
    total: number;
    valid: number;
    invalid: number;
}>> {
    const rows = await db.execute<{
        category: string | null;
        total: number;
        valid: number;
        invalid: number;
    }>(sql`
        SELECT
            COALESCE(category, 'unknown') AS category,
            COUNT(*)::int AS total,
            SUM(CASE WHEN valid THEN 1 ELSE 0 END)::int AS valid,
            SUM(CASE WHEN NOT valid THEN 1 ELSE 0 END)::int AS invalid
        FROM marking_verifications
        WHERE organization_id = ${organizationId}
        GROUP BY 1
        ORDER BY total DESC
    `);
    return rows.map(r => ({
        category: r.category ?? 'unknown',
        total: r.total,
        valid: r.valid,
        invalid: r.invalid,
    }));
}
