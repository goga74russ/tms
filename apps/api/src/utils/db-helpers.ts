import { db } from '../db/connection.js';
import { incidents, routePoints } from '../db/schema.js';
import { and, eq, inArray, sql } from 'drizzle-orm';

export function shouldUseForUpdate(query: any) {
    return typeof query?.for === 'function';
}

export async function lockRowForUpdate<T>(query: T): Promise<T> {
    if (shouldUseForUpdate(query)) {
        return await (query as any).for('update');
    }
    return query;
}

export async function getBlockingIncidents(params: {
    tripId?: string;
    vehicleId?: string;
    driverId?: string;
}) {
    const scopes = [];
    if (params.tripId) scopes.push(eq(incidents.tripId, params.tripId));
    if (params.vehicleId) scopes.push(eq(incidents.vehicleId, params.vehicleId));
    if (params.driverId) scopes.push(eq(incidents.driverId, params.driverId));

    if (scopes.length === 0) return [];

    const scopeCondition = scopes.length === 1
        ? scopes[0]
        : sql`(${sql.join(scopes, sql` OR `)})`;

    return db.select({
        id: incidents.id,
        type: incidents.type,
        description: incidents.description,
        status: incidents.status,
    }).from(incidents).where(and(
        eq(incidents.blocksRelease, true),
        inArray(incidents.status, ['open', 'investigating']),
        scopeCondition,
    ));
}

export async function getIncompleteRoutePoints(tripId: string) {
    return db
        .select({
            id: routePoints.id,
            type: routePoints.type,
            status: routePoints.status,
            sequenceNumber: routePoints.sequenceNumber,
        })
        .from(routePoints)
        .where(and(
            eq(routePoints.tripId, tripId),
            sql`${routePoints.status} <> 'completed'`,
        ))
        .limit(1000);
}
