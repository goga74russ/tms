import { and, desc, eq, inArray, isNotNull, like } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import { events, shipmentFacts, trips } from '../../db/schema.js';
import { claimsService } from '../claims/service.js';
import { getTripCompatibility } from '../operational-core/compatibility-service.js';
import {
    evaluateDossierCloseGate,
    getDossierItemsForTrip,
    syncDossierItemsForTrip,
} from '../operational-core/dossier-service.js';
import { syncTransportDocumentsForTrip } from '../trips/transport-documents-store.js';

export type OperationExceptionSeverity = 'blocking' | 'warning' | 'info';

export type OperationExceptionType =
    | 'compatibility'
    | 'missing_document'
    | 'etrn_blocking'
    | 'document_warning'
    | 'open_claim'
    | 'shipment_discrepancy'
    | 'execution_event';

export type OperationException = {
    id: string;
    type: OperationExceptionType;
    severity: OperationExceptionSeverity;
    title: string;
    message: string;
    tripId: string;
    tripNumber: string;
    orderId?: string | null;
    source: string;
    sourceId?: string | null;
    createdAt?: string | null;
    data?: Record<string, unknown>;
};

export type ListOperationExceptionsParams = {
    organizationId?: string | null;
    tripId?: string;
    severity?: OperationExceptionSeverity;
    limit?: number;
    includeInfo?: boolean;
    actorId?: string | null;
};

const ACTIVE_TRIP_STATUSES = ['planning', 'assigned', 'waybill_draft', 'inspection', 'waybill_issued', 'loading', 'in_transit'] as const;
const EXECUTION_EVENT_TYPES = ['trip.execution.delay', 'trip.execution.downtime', 'trip.execution.disruption', 'trip.execution.correction', 'trip.execution.photo_placeholder'] as const;

function iso(value: Date | string | null | undefined) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function makeId(parts: Array<string | null | undefined>) {
    return parts.filter(Boolean).join(':');
}

function severityRank(severity: OperationExceptionSeverity) {
    if (severity === 'blocking') return 0;
    if (severity === 'warning') return 1;
    return 2;
}

function matchesSeverity(item: OperationException, severity?: OperationExceptionSeverity) {
    return !severity || item.severity === severity;
}

function eventSeverity(eventType: string): OperationExceptionSeverity {
    if (eventType.endsWith('.disruption')) return 'blocking';
    if (eventType.endsWith('.delay') || eventType.endsWith('.downtime')) return 'warning';
    return 'info';
}

function eventTitle(eventType: string) {
    if (eventType.endsWith('.disruption')) return 'Trip disruption';
    if (eventType.endsWith('.delay')) return 'Trip delay';
    if (eventType.endsWith('.downtime')) return 'Trip downtime';
    if (eventType.endsWith('.correction')) return 'Manual correction';
    if (eventType.endsWith('.photo_placeholder')) return 'Pending photo evidence';
    return 'Execution event';
}

export async function listOperationExceptions(params: ListOperationExceptionsParams = {}) {
    const limit = Math.min(Math.max(params.limit ?? 50, 1), 100);
    const tripConditions = params.tripId
        ? [eq(trips.id, params.tripId)]
        : [inArray(trips.status, [...ACTIVE_TRIP_STATUSES])];
    if (params.organizationId) tripConditions.push(eq(trips.organizationId, params.organizationId));

    const tripRows = await db
        .select({
            id: trips.id,
            number: trips.number,
            status: trips.status,
            organizationId: trips.organizationId,
        })
        .from(trips)
        .where(and(...tripConditions))
        .orderBy(desc(trips.updatedAt))
        .limit(limit);

    const exceptions: OperationException[] = [];

    for (const trip of tripRows) {
        const compatibility = await getTripCompatibility(trip.id, params.organizationId);
        if (compatibility) {
            for (const check of compatibility.checks.filter((check) => check.status !== 'ok')) {
                exceptions.push({
                    id: makeId(['compatibility', trip.id, check.code]),
                    type: 'compatibility',
                    severity: check.status === 'blocking' ? 'blocking' : 'warning',
                    title: `Compatibility: ${check.code}`,
                    message: check.message,
                    tripId: trip.id,
                    tripNumber: trip.number,
                    source: 'compatibility',
                    sourceId: check.code,
                    data: check.details ?? {},
                });
            }
        }

        const transportDocuments = await syncTransportDocumentsForTrip(trip.id, params.actorId ?? null);
        await syncDossierItemsForTrip({
            tripId: trip.id,
            organizationId: params.organizationId,
            transportDocuments: transportDocuments?.documents ?? [],
        });
        const dossierItems = await getDossierItemsForTrip({ tripId: trip.id, organizationId: params.organizationId });
        const closeGate = evaluateDossierCloseGate({ tripId: trip.id, dossierItems });

        for (const item of closeGate.blockingItems) {
            exceptions.push({
                id: makeId(['dossier', trip.id, item.id]),
                type: item.documentType === 'etrn' ? 'etrn_blocking' : 'missing_document',
                severity: 'blocking',
                title: item.documentType === 'etrn' ? 'ETRN blocks trip close' : 'Document blocks trip close',
                message: item.reason,
                tripId: trip.id,
                tripNumber: trip.number,
                source: 'dossier_close_gate',
                sourceId: item.id,
                data: {
                    documentType: item.documentType,
                    status: item.status,
                    required: item.required,
                    etrn: closeGate.etrn,
                },
            });
        }

        for (const item of closeGate.warningItems) {
            exceptions.push({
                id: makeId(['dossier-warning', trip.id, item.id]),
                type: 'document_warning',
                severity: 'warning',
                title: 'Document warning',
                message: item.reason,
                tripId: trip.id,
                tripNumber: trip.number,
                source: 'dossier_close_gate',
                sourceId: item.id,
                data: {
                    documentType: item.documentType,
                    status: item.status,
                    required: item.required,
                },
            });
        }

        const exposure = await claimsService.exposure({
            tripId: trip.id,
            organizationId: params.organizationId,
            status: undefined,
        });
        for (const claim of exposure.claims.filter((claim) => claim.status === 'open' || claim.status === 'investigating')) {
            exceptions.push({
                id: makeId(['claim', trip.id, claim.id]),
                type: 'open_claim',
                severity: 'warning',
                title: 'Open claim',
                message: claim.description,
                tripId: trip.id,
                tripNumber: trip.number,
                orderId: claim.orderId ?? null,
                source: 'claims',
                sourceId: claim.id,
                createdAt: iso(claim.createdAt),
                data: {
                    status: claim.status,
                    type: claim.type,
                    cause: claim.cause,
                    effectiveExposureAmount: claim.effectiveExposureAmount,
                    exposureBasis: claim.exposureBasis,
                },
            });
        }
    }

    const tripIds = tripRows.map((trip) => trip.id);
    if (tripIds.length > 0) {
        const tripNumberById = new Map(tripRows.map((trip) => [trip.id, trip.number]));
        const factConditions = [
            inArray(shipmentFacts.tripId, tripIds),
            isNotNull(shipmentFacts.discrepancyCode),
        ];
        if (params.organizationId) factConditions.push(eq(shipmentFacts.organizationId, params.organizationId));

        const discrepantFacts = await db
            .select()
            .from(shipmentFacts)
            .where(and(...factConditions))
            .orderBy(desc(shipmentFacts.capturedAt))
            .limit(limit);

        for (const fact of discrepantFacts) {
            if (!fact.discrepancyCode) continue;
            exceptions.push({
                id: makeId(['shipment-fact', fact.tripId, fact.id]),
                type: 'shipment_discrepancy',
                severity: fact.discrepancyCode === 'damage' || fact.discrepancyCode === 'shortage' ? 'warning' : 'info',
                title: `Shipment discrepancy: ${fact.discrepancyCode}`,
                message: fact.notes ?? `Shipment fact has discrepancy ${fact.discrepancyCode}`,
                tripId: fact.tripId,
                tripNumber: tripNumberById.get(fact.tripId) ?? fact.tripId,
                orderId: fact.orderId,
                source: 'shipment_facts',
                sourceId: fact.id,
                createdAt: iso(fact.capturedAt),
                data: {
                    factType: fact.factType,
                    discrepancyCode: fact.discrepancyCode,
                    weightKg: fact.weightKg,
                    volumeM3: fact.volumeM3,
                    places: fact.places,
                },
            });
        }

        const eventRows = await db
            .select()
            .from(events)
            .where(and(
                eq(events.entityType, 'trip'),
                inArray(events.entityId, tripIds),
                like(events.eventType, 'trip.execution.%'),
            ))
            .orderBy(desc(events.timestamp))
            .limit(limit);

        for (const event of eventRows.filter((row) => (EXECUTION_EVENT_TYPES as readonly string[]).includes(row.eventType))) {
            const severity = eventSeverity(event.eventType);
            if (severity === 'info' && !params.includeInfo) continue;
            exceptions.push({
                id: makeId(['execution', event.entityId, event.id]),
                type: 'execution_event',
                severity,
                title: eventTitle(event.eventType),
                message: String((event.data as Record<string, unknown>)?.reason ?? (event.data as Record<string, unknown>)?.notes ?? event.eventType),
                tripId: event.entityId,
                tripNumber: tripNumberById.get(event.entityId) ?? event.entityId,
                orderId: ((event.data as Record<string, unknown>)?.orderId as string | null | undefined) ?? null,
                source: 'events',
                sourceId: event.id,
                createdAt: iso(event.timestamp),
                data: event.data as Record<string, unknown>,
            });
        }
    }

    const filtered = exceptions
        .filter((item) => matchesSeverity(item, params.severity))
        .sort((a, b) => {
            const severityDelta = severityRank(a.severity) - severityRank(b.severity);
            if (severityDelta !== 0) return severityDelta;
            return new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime();
        });

    return {
        generatedAt: new Date().toISOString(),
        filters: {
            tripId: params.tripId ?? null,
            severity: params.severity ?? null,
            includeInfo: params.includeInfo ?? false,
            limit,
        },
        summary: {
            tripCount: tripRows.length,
            total: filtered.length,
            blocking: filtered.filter((item) => item.severity === 'blocking').length,
            warning: filtered.filter((item) => item.severity === 'warning').length,
            info: filtered.filter((item) => item.severity === 'info').length,
            byType: filtered.reduce<Record<string, number>>((acc, item) => {
                acc[item.type] = (acc[item.type] ?? 0) + 1;
                return acc;
            }, {}),
        },
        exceptions: filtered,
    };
}
