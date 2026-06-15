// ============================================================
// Wave 2 — Cold chain v0: SLA resolution, breach detection,
// reading insertion, summary aggregation.
// ============================================================
import { and, asc, desc, eq, gte, lte, or, sql } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import { incidents, orders, temperatureReadings, tripOrders, trips } from '../../db/schema.js';
import { recordEvent } from '../../events/journal.js';

export interface SlaBounds {
    minC: number | null;
    maxC: number | null;
}

export interface ReadingInput {
    tripId: string;
    orderId?: string | null;
    tempC: number;
    recordedAt?: string;
    sensorId?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    source?: 'sensor' | 'manual' | 'mock';
}

export interface InsertedReading {
    id: string;
    breach: boolean;
    slaMinC: number | null;
    slaMaxC: number | null;
    recordedAt: Date;
    tempC: number;
    incidentId?: string;
}

/**
 * Tightens trip-level SLA bounds across every order linked to a trip.
 * Multi-lot trips use the strictest min/max so a single SLA violation
 * is enough to flag a breach for the whole reading.
 *
 * Both `orders.tripId` (legacy direct link) and `trip_orders` (m:n
 * junction) are scanned to stay compatible with existing flows.
 */
export async function resolveTripSla(tripId: string, orderId?: string | null): Promise<SlaBounds> {
    if (orderId) {
        // C9-sec: раньше orderId не проверялся на принадлежность tripId → можно было
        // подсунуть orderId чужого рейса/тенанта и подменить SLA breach-детекции.
        // Гейтим: заявка должна быть привязана к рейсу (legacy orders.tripId ИЛИ junction).
        const [row] = await db
            .select({
                minC: orders.temperatureMinC,
                maxC: orders.temperatureMaxC,
            })
            .from(orders)
            .leftJoin(tripOrders, eq(tripOrders.orderId, orders.id))
            .where(and(
                eq(orders.id, orderId),
                or(eq(orders.tripId, tripId), eq(tripOrders.tripId, tripId)),
            ))
            .limit(1);
        if (row && (row.minC != null || row.maxC != null)) {
            return {
                minC: row.minC == null ? null : Number(row.minC),
                maxC: row.maxC == null ? null : Number(row.maxC),
            };
        }
    }

    const rows = await db
        .selectDistinct({
            minC: orders.temperatureMinC,
            maxC: orders.temperatureMaxC,
        })
        .from(orders)
        .leftJoin(tripOrders, eq(tripOrders.orderId, orders.id))
        .where(or(eq(orders.tripId, tripId), eq(tripOrders.tripId, tripId)));

    let minC: number | null = null;
    let maxC: number | null = null;
    for (const row of rows) {
        if (row.minC != null) {
            const v = Number(row.minC);
            if (minC == null || v > minC) minC = v;
        }
        if (row.maxC != null) {
            const v = Number(row.maxC);
            if (maxC == null || v < maxC) maxC = v;
        }
    }
    return { minC, maxC };
}

export function detectBreach(tempC: number, sla: SlaBounds): boolean {
    if (sla.minC != null && tempC < sla.minC) return true;
    if (sla.maxC != null && tempC > sla.maxC) return true;
    return false;
}

export function severityForBreach(tempC: number, sla: SlaBounds): 'medium' | 'critical' {
    let delta = 0;
    if (sla.minC != null && tempC < sla.minC) {
        delta = Math.max(delta, sla.minC - tempC);
    }
    if (sla.maxC != null && tempC > sla.maxC) {
        delta = Math.max(delta, tempC - sla.maxC);
    }
    return delta > 5 ? 'critical' : 'medium';
}

export async function recordReading(
    input: ReadingInput,
    author: { userId: string; role: string },
): Promise<InsertedReading> {
    const sla = await resolveTripSla(input.tripId, input.orderId ?? null);
    const breach = detectBreach(input.tempC, sla);
    const recordedAt = input.recordedAt ? new Date(input.recordedAt) : new Date();

    // A-P2: stamp organization_id on every reading directly, instead of
    // relying on consumer queries to join through trips. Closes the
    // cross-tenant leak risk in any future query that forgets the join.
    const [tripRow] = await db
        .select({ organizationId: trips.organizationId })
        .from(trips)
        .where(eq(trips.id, input.tripId))
        .limit(1);
    const organizationId = tripRow?.organizationId ?? null;

    // P2 (код-аудит 2026-06-14): если указан orderId — проверяем, что заявка
    // относится к этому рейсу (orders.tripId или junction tripOrders). Раньше
    // input.orderId штамповался на замер без проверки принадлежности рейсу.
    if (input.orderId) {
        const [linked] = await db
            .select({ id: orders.id })
            .from(orders)
            .leftJoin(tripOrders, eq(tripOrders.orderId, orders.id))
            .where(and(
                eq(orders.id, input.orderId),
                or(eq(orders.tripId, input.tripId), eq(tripOrders.tripId, input.tripId)),
            ))
            .limit(1);
        if (!linked) throw new Error('Указанная заявка не относится к этому рейсу');
    }

    const result = await db.transaction(async (tx) => {
        const [reading] = await tx
            .insert(temperatureReadings)
            .values({
                tripId: input.tripId,
                orderId: input.orderId ?? null,
                organizationId,
                recordedAt,
                tempC: input.tempC,
                sensorId: input.sensorId ?? null,
                latitude: input.latitude ?? null,
                longitude: input.longitude ?? null,
                source: input.source ?? 'manual',
                breach,
                breachMinC: breach ? sla.minC : null,
                breachMaxC: breach ? sla.maxC : null,
            })
            .returning();

        let incidentId: string | undefined;
        if (breach) {
            const severity = severityForBreach(input.tempC, sla);
            const slaText = `SLA ${sla.minC ?? '−∞'}…${sla.maxC ?? '+∞'} °C, замер ${input.tempC} °C`;
            const [incident] = await tx
                .insert(incidents)
                .values({
                    type: 'cargo',
                    severity,
                    description: `Нарушение температурного режима. ${slaText}.`,
                    tripId: input.tripId,
                    createdBy: author.userId,
                    organizationId, // C3 «в» (миг.0042): org рейса (загружен выше)
                })
                .returning();
            incidentId = incident?.id;
        }

        return {
            id: reading.id,
            breach,
            slaMinC: sla.minC,
            slaMaxC: sla.maxC,
            recordedAt: reading.recordedAt,
            tempC: Number(reading.tempC),
            incidentId,
            readingSource: reading.source,
        };
    });

    // P2 (код-аудит 2026-06-14): события пишем ПОСЛЕ коммита транзакции. recordEvent
    // делает SELECT users + сетевой enqueue (timeout до 3с) — внутри tx это держало
    // блокировку до ~6с/замер. Журналирование best-effort, атомарность с insert не нужна.
    await recordEvent({
        authorId: author.userId,
        authorRole: author.role,
        eventType: 'temperature.recorded',
        entityType: 'trip',
        entityId: input.tripId,
        data: {
            readingId: result.id,
            tempC: input.tempC,
            source: result.readingSource,
            breach: result.breach,
            slaMinC: sla.minC,
            slaMaxC: sla.maxC,
        },
    });

    if (result.breach) {
        await recordEvent({
            authorId: author.userId,
            authorRole: author.role,
            eventType: 'temperature.breach',
            entityType: 'trip',
            entityId: input.tripId,
            data: {
                readingId: result.id,
                tempC: input.tempC,
                slaMinC: sla.minC,
                slaMaxC: sla.maxC,
                incidentId: result.incidentId,
            },
        });
    }

    return result;
}

export interface ListFilters {
    from?: string;
    to?: string;
    limit?: number;
}

export async function listReadings(tripId: string, filters: ListFilters, orgId?: string | null) {
    const limit = Math.min(Math.max(filters.limit ?? 200, 1), 1000);
    const conditions = [eq(temperatureReadings.tripId, tripId)];
    if (filters.from) conditions.push(gte(temperatureReadings.recordedAt, new Date(filters.from)));
    if (filters.to) conditions.push(lte(temperatureReadings.recordedAt, new Date(filters.to)));
    // A-P2: defense-in-depth tenant filter. The route already calls
    // assertTripAccess, but stamping the org filter directly closes
    // any future query that forgets the trip-level guard.
    if (orgId) conditions.push(eq(temperatureReadings.organizationId, orgId));

    const rows = await db
        .select()
        .from(temperatureReadings)
        .where(and(...conditions))
        .orderBy(desc(temperatureReadings.recordedAt))
        .limit(limit);

    return rows.map((r) => ({
        ...r,
        tempC: Number(r.tempC),
        breachMinC: r.breachMinC == null ? null : Number(r.breachMinC),
        breachMaxC: r.breachMaxC == null ? null : Number(r.breachMaxC),
    }));
}

export async function summarizeReadings(tripId: string, orgId?: string | null) {
    // P2 (код-аудит 2026-06-14): при заданном orgId проверяем принадлежность рейса
    // тенанту ДО resolveTripSla — иначе SLA-границы (slaMinC/slaMaxC) чужого рейса
    // утекали (агрегаты фильтруются по org и =0, но SLA раскрывалась, в т.ч. через
    // copilot-инструмент summarizeReadings).
    if (orgId) {
        const [tripRow] = await db
            .select({ id: trips.id })
            .from(trips)
            .where(and(eq(trips.id, tripId), eq(trips.organizationId, orgId)))
            .limit(1);
        if (!tripRow) {
            return {
                minC: null, maxC: null, avgC: null, count: 0, breachCount: 0,
                slaMinC: null, slaMaxC: null, firstAt: null, lastAt: null,
            };
        }
    }

    const sla = await resolveTripSla(tripId);

    // A-P2: defense-in-depth tenant filter. Same rationale as listReadings.
    const baseWhere = orgId
        ? and(eq(temperatureReadings.tripId, tripId), eq(temperatureReadings.organizationId, orgId))
        : eq(temperatureReadings.tripId, tripId);

    const [agg] = await db
        .select({
            count: sql<number>`count(*)::int`,
            minC: sql<string | null>`min(${temperatureReadings.tempC})`,
            maxC: sql<string | null>`max(${temperatureReadings.tempC})`,
            avgC: sql<string | null>`avg(${temperatureReadings.tempC})`,
            breachCount: sql<number>`sum(case when ${temperatureReadings.breach} then 1 else 0 end)::int`,
        })
        .from(temperatureReadings)
        .where(baseWhere);

    const [first] = await db
        .select({ at: temperatureReadings.recordedAt })
        .from(temperatureReadings)
        .where(baseWhere)
        .orderBy(asc(temperatureReadings.recordedAt))
        .limit(1);

    const [last] = await db
        .select({ at: temperatureReadings.recordedAt })
        .from(temperatureReadings)
        .where(baseWhere)
        .orderBy(desc(temperatureReadings.recordedAt))
        .limit(1);

    return {
        minC: agg?.minC == null ? null : Number(agg.minC),
        maxC: agg?.maxC == null ? null : Number(agg.maxC),
        avgC: agg?.avgC == null ? null : Math.round(Number(agg.avgC) * 100) / 100,
        count: agg?.count ?? 0,
        breachCount: agg?.breachCount ?? 0,
        slaMinC: sla.minC,
        slaMaxC: sla.maxC,
        firstAt: first?.at ?? null,
        lastAt: last?.at ?? null,
    };
}
