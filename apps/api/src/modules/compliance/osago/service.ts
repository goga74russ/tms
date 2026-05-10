// ============================================================
// OSAGO compliance service — calls the active OSAGO adapter and
// persists results into `osago_checks`.
// ============================================================
import { eq, and, sql } from 'drizzle-orm';
import { db } from '../../../db/connection.js';
import { osagoChecks, vehicles } from '../../../db/schema.js';
import { getOsagoAdapter, type OsagoCredentials } from '../../../providers/index.js';

export interface OsagoCheckRow {
    id: string;
    vehicleId: string;
    valid: boolean;
    expiresAt: Date | null;
    insurer: string | null;
    policyNumber: string | null;
    checkedAt: Date;
    providerName: string;
}

/** Run a single OSAGO check and persist the result. */
export async function runOsagoCheck(args: {
    organizationId: string | null;
    vehicleId: string;
    plate: string;
    vin?: string | null;
    creds?: OsagoCredentials;
    providerName?: string;
}): Promise<OsagoCheckRow> {
    const adapter = getOsagoAdapter(args.providerName);
    const status = await adapter.checkStatus(
        args.creds ?? {},
        args.plate,
        args.vin ?? undefined,
    );

    const [row] = await db.insert(osagoChecks).values({
        organizationId: args.organizationId ?? null,
        vehicleId: args.vehicleId,
        valid: status.valid,
        expiresAt: status.expiresAt ?? null,
        insurer: status.insurer ?? null,
        policyNumber: status.policyNumber ?? null,
        rawResponse: status.raw ?? null,
        providerName: adapter.name,
    }).returning();

    return {
        id: row!.id,
        vehicleId: row!.vehicleId,
        valid: row!.valid,
        expiresAt: row!.expiresAt,
        insurer: row!.insurer,
        policyNumber: row!.policyNumber,
        checkedAt: row!.checkedAt,
        providerName: row!.providerName,
    };
}

/** Run OSAGO checks for every vehicle in the org. */
export async function runOrgOsagoSync(organizationId: string): Promise<{
    checked: number;
    valid: number;
    expired: number;
    results: OsagoCheckRow[];
}> {
    const orgVehicles = await db
        .select({ id: vehicles.id, plate: vehicles.plateNumber, vin: vehicles.vin })
        .from(vehicles)
        .where(and(
            eq(vehicles.organizationId, organizationId),
            eq(vehicles.isArchived, false),
        ));

    const results: OsagoCheckRow[] = [];
    let valid = 0;
    let expired = 0;
    for (const v of orgVehicles) {
        const r = await runOsagoCheck({
            organizationId,
            vehicleId: v.id,
            plate: v.plate,
            vin: v.vin,
        });
        results.push(r);
        if (r.valid) valid++;
        else expired++;
    }
    return { checked: orgVehicles.length, valid, expired, results };
}

/** Latest OSAGO snapshot per vehicle for the dashboard. */
export async function listLatestOsagoStatuses(organizationId: string): Promise<Array<{
    vehicleId: string;
    plate: string;
    vin: string;
    valid: boolean | null;
    expiresAt: Date | null;
    insurer: string | null;
    policyNumber: string | null;
    checkedAt: Date | null;
}>> {
    // Pull latest osago_checks row per vehicle via a window function.
    const rows = await db.execute<{
        vehicle_id: string;
        plate_number: string;
        vin: string;
        valid: boolean | null;
        expires_at: Date | null;
        insurer: string | null;
        policy_number: string | null;
        checked_at: Date | null;
    }>(sql`
        SELECT v.id AS vehicle_id, v.plate_number, v.vin,
               c.valid, c.expires_at, c.insurer, c.policy_number, c.checked_at
        FROM vehicles v
        LEFT JOIN LATERAL (
            SELECT valid, expires_at, insurer, policy_number, checked_at
            FROM osago_checks
            WHERE vehicle_id = v.id
            ORDER BY checked_at DESC
            LIMIT 1
        ) c ON true
        WHERE v.organization_id = ${organizationId}
          AND v.is_archived = false
        ORDER BY v.plate_number ASC
    `);

    return rows.map(r => ({
        vehicleId: r.vehicle_id,
        plate: r.plate_number,
        vin: r.vin,
        valid: r.valid,
        expiresAt: r.expires_at,
        insurer: r.insurer,
        policyNumber: r.policy_number,
        checkedAt: r.checked_at,
    }));
}
