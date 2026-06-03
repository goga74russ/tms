import { and, eq, inArray } from 'drizzle-orm';
import {
    TransportDocumentExchangeDirection,
    TransportDocumentExchangeStatus,
    TransportDocumentReceiptType,
    TransportDocumentStatus,
    type TransportDocument,
    type TransportDocumentBundle,
    type TransportDocumentExchange,
    type TransportDocumentExchangeState,
    type TransportDocumentHistoryEvent,
    type TransportDocumentReceipt,
} from '@tms/shared';
import { db } from '../../db/connection.js';
import {
    deliveryConfirmations,
    documentReturns,
    transportDocumentEvents,
    transportDocumentExchanges,
    transportDocumentReceipts,
    transportDocuments,
} from '../../db/schema.js';
import { buildTransportDocumentBundleFromDocuments, getTransportDocumentsForDossier } from './transport-documents.js';
import { resolveEtrnProviderAdapter } from './etrn-provider.js';
import { getTransportDossier } from './service.js';

type PersistedDocumentRow = typeof transportDocuments.$inferSelect;
type PersistedEventRow = typeof transportDocumentEvents.$inferSelect;
type PersistedExchangeRow = typeof transportDocumentExchanges.$inferSelect;
type PersistedReceiptRow = typeof transportDocumentReceipts.$inferSelect;
type TripDossier = NonNullable<Awaited<ReturnType<typeof getTransportDossier>>>;

const STATUS_RANK: Record<string, number> = {
    [TransportDocumentStatus.DRAFT]: 0,
    [TransportDocumentStatus.READY]: 1,
    [TransportDocumentStatus.PENDING]: 2,
    [TransportDocumentStatus.SENT]: 3,
    [TransportDocumentStatus.ACCEPTED]: 4,
    [TransportDocumentStatus.RECEIVED]: 4,
    [TransportDocumentStatus.CORRECTED]: 5,
    [TransportDocumentStatus.COMPLETED]: 6,
    [TransportDocumentStatus.OVERDUE]: 3,
    [TransportDocumentStatus.REJECTED]: 3,
    [TransportDocumentStatus.ERROR]: 3,
};

function toIso(value: Date | string | null | undefined) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function mergeStatus(current: string, source: string) {
    if (!current) return source as TransportDocumentStatus;
    if (current === source) return current as TransportDocumentStatus;
    if (current === TransportDocumentStatus.PENDING && source !== TransportDocumentStatus.ERROR) {
        return source as TransportDocumentStatus;
    }
    if ((STATUS_RANK[source] ?? 0) >= (STATUS_RANK[current] ?? 0)) {
        return source as TransportDocumentStatus;
    }
    return current as TransportDocumentStatus;
}

function exchangeStatusToDocumentStatus(status: TransportDocumentExchangeStatus): TransportDocumentStatus {
    switch (status) {
        case TransportDocumentExchangeStatus.QUEUED:
        case TransportDocumentExchangeStatus.ACKNOWLEDGED:
            return TransportDocumentStatus.PENDING;
        case TransportDocumentExchangeStatus.SENT:
            return TransportDocumentStatus.SENT;
        case TransportDocumentExchangeStatus.ACCEPTED:
            return TransportDocumentStatus.ACCEPTED;
        case TransportDocumentExchangeStatus.DELIVERED:
            return TransportDocumentStatus.COMPLETED;
        case TransportDocumentExchangeStatus.REJECTED:
        case TransportDocumentExchangeStatus.FAILED:
            return TransportDocumentStatus.REJECTED;
        default:
            return TransportDocumentStatus.PENDING;
    }
}

function serializeHistoryEvent(row: PersistedEventRow): TransportDocumentHistoryEvent {
    return {
        id: row.id,
        documentId: row.documentId,
        eventType: row.eventType,
        title: row.title,
        fromStatus: (row.fromStatus as TransportDocumentHistoryEvent['fromStatus']) ?? null,
        toStatus: (row.toStatus as TransportDocumentHistoryEvent['toStatus']) ?? null,
        severity: row.severity,
        message: row.message ?? null,
        errorCode: row.errorCode ?? null,
        payload: (row.payload as Record<string, unknown> | null) ?? {},
        createdBy: row.createdBy ?? null,
        at: toIso(row.createdAt) ?? new Date().toISOString(),
    };
}

function serializeExchange(row: PersistedExchangeRow): TransportDocumentExchange {
    return {
        id: row.id,
        documentId: row.documentId,
        tripId: row.tripId,
        providerName: row.providerName,
        direction: row.direction,
        operation: row.operation,
        status: row.status,
        requestId: row.requestId ?? null,
        providerDocumentId: row.providerDocumentId ?? null,
        providerMessageId: row.providerMessageId ?? null,
        providerEventId: row.providerEventId ?? null,
        providerStatus: row.providerStatus ?? null,
        attemptNumber: row.attemptNumber ?? 1,
        errorCode: row.errorCode ?? null,
        errorMessage: row.errorMessage ?? null,
        requestPayload: (row.requestPayload as Record<string, unknown> | null) ?? {},
        responsePayload: (row.responsePayload as Record<string, unknown> | null) ?? {},
        initiatedBy: row.initiatedBy ?? null,
        initiatedAt: toIso(row.initiatedAt) ?? new Date().toISOString(),
        completedAt: toIso(row.completedAt),
        nextRetryAt: toIso(row.nextRetryAt),
    };
}

function serializeReceipt(row: PersistedReceiptRow): TransportDocumentReceipt {
    return {
        id: row.id,
        documentId: row.documentId,
        tripId: row.tripId,
        exchangeId: row.exchangeId ?? null,
        receiptType: row.receiptType,
        providerReceiptId: row.providerReceiptId ?? null,
        providerEventId: row.providerEventId ?? null,
        providerStatus: row.providerStatus ?? null,
        title: row.title,
        message: row.message ?? null,
        payload: (row.payload as Record<string, unknown> | null) ?? {},
        receivedAt: toIso(row.receivedAt) ?? new Date().toISOString(),
        processedAt: toIso(row.processedAt),
        createdBy: row.createdBy ?? null,
    };
}

function buildExchangeState(
    row: PersistedDocumentRow,
    exchanges: TransportDocumentExchange[],
    receipts: TransportDocumentReceipt[],
): TransportDocumentExchangeState | undefined {
    const latestExchange = [...exchanges].sort((a, b) => new Date(b.initiatedAt).getTime() - new Date(a.initiatedAt).getTime())[0];
    const latestReceipt = [...receipts].sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())[0];
    if (!latestExchange
        && !latestReceipt
        && row.providerName === 'internal'
        && !row.providerStatus
        && !row.providerDocumentId
        && !row.providerMessageId) {
        return undefined;
    }
    const hasBlockingProblem = row.status === TransportDocumentStatus.ERROR
        || row.status === TransportDocumentStatus.REJECTED
        || latestExchange?.status === TransportDocumentExchangeStatus.REJECTED
        || latestExchange?.status === TransportDocumentExchangeStatus.FAILED
        || latestReceipt?.receiptType === TransportDocumentReceiptType.REJECTION
        || latestReceipt?.receiptType === TransportDocumentReceiptType.CORRECTION_REQUIRED;

    let status: TransportDocumentExchangeState['status'] = TransportDocumentExchangeStatus.QUEUED;
    if (latestReceipt?.receiptType === TransportDocumentReceiptType.REJECTION) status = TransportDocumentExchangeStatus.REJECTED;
    else if (latestReceipt?.receiptType === TransportDocumentReceiptType.ACCEPTANCE) status = TransportDocumentExchangeStatus.ACCEPTED;
    else if (latestReceipt?.receiptType === TransportDocumentReceiptType.DELIVERY) status = TransportDocumentExchangeStatus.DELIVERED;
    else if (latestReceipt?.receiptType) status = TransportDocumentExchangeStatus.ACKNOWLEDGED;
    else if (latestExchange?.status) status = latestExchange.status;
    else if (row.status === TransportDocumentStatus.SENT) status = TransportDocumentExchangeStatus.SENT;
    else if (row.status === TransportDocumentStatus.ERROR || row.status === TransportDocumentStatus.REJECTED) status = TransportDocumentExchangeStatus.FAILED;

    let nextAction = 'prepare_and_send';
    if (hasBlockingProblem) nextAction = row.nextRetryAt ? 'fix_and_retry' : 'review_provider_rejection';
    else if (status === TransportDocumentExchangeStatus.SENT || status === TransportDocumentExchangeStatus.ACKNOWLEDGED) nextAction = 'await_provider_receipt';
    else if (status === TransportDocumentExchangeStatus.ACCEPTED) nextAction = 'await_delivery_or_completion';
    else if (status === TransportDocumentExchangeStatus.DELIVERED) nextAction = 'archive_exchange';

    return {
        status,
        nextAction,
        hasBlockingProblem,
        providerName: latestExchange?.providerName ?? row.providerName ?? 'sandbox_edo',
        providerStatus: latestReceipt?.providerStatus ?? latestExchange?.providerStatus ?? row.providerStatus ?? null,
        providerDocumentId: latestReceipt?.providerReceiptId ?? latestExchange?.providerDocumentId ?? row.providerDocumentId ?? null,
        providerMessageId: latestReceipt?.providerEventId ?? latestExchange?.providerMessageId ?? row.providerMessageId ?? null,
        lastError: row.error ?? latestExchange?.errorMessage ?? latestReceipt?.message ?? null,
        attemptCount: exchanges.length,
        receiptCount: receipts.length,
        lastAttemptAt: latestExchange?.initiatedAt ?? null,
        lastReceiptAt: latestReceipt?.receivedAt ?? null,
        nextRetryAt: toIso(row.nextRetryAt),
    };
}

function getExchangeMetadataSnapshot(metadata: Record<string, unknown> | null | undefined) {
    return (metadata?.exchange as Record<string, unknown> | undefined) ?? {};
}

function serializeDocument(
    row: PersistedDocumentRow,
    history: TransportDocumentHistoryEvent[],
    exchanges: TransportDocumentExchange[],
    receipts: TransportDocumentReceipt[],
): TransportDocument {
    return {
        id: row.id,
        sourceKey: row.sourceKey,
        correlationId: row.correlationId,
        fingerprint: row.snapshotId,
        version: row.version ?? 1,
        generatedAt: toIso(row.lastSyncedAt ?? row.updatedAt) ?? new Date().toISOString(),
        type: row.documentType as TransportDocument['type'],
        titleType: row.titleType ?? null,
        titleNumber: row.titleNumber ?? null,
        sourceStatus: (row.sourceStatus ?? row.status) as TransportDocument['status'],
        status: row.status as TransportDocument['status'],
        externalId: row.externalId,
        providerName: row.providerName,
        providerDocumentId: row.providerDocumentId ?? null,
        providerMessageId: row.providerMessageId ?? null,
        providerStatus: row.providerStatus ?? null,
        error: row.error ?? null,
        tripId: row.tripId,
        waybillId: row.waybillId ?? null,
        orderIds: row.orderIds ?? [],
        retryCount: row.retryCount ?? 0,
        lastRetryAt: toIso(row.lastRetryAt),
        nextRetryAt: toIso(row.nextRetryAt),
        lastSyncedAt: toIso(row.lastSyncedAt),
        createdAt: toIso(row.createdAt) ?? new Date().toISOString(),
        updatedAt: toIso(row.updatedAt) ?? new Date().toISOString(),
        issuedAt: toIso(row.issuedAt),
        sentAt: toIso(row.sentAt),
        acceptedAt: toIso(row.acceptedAt),
        rejectedAt: toIso(row.rejectedAt),
        completedAt: toIso(row.completedAt),
        payload: (row.payload as Record<string, unknown> | null) ?? {},
        metadata: (row.metadata as Record<string, unknown> | null) ?? {},
        history,
        exchanges,
        receipts,
        exchange: buildExchangeState(row, exchanges, receipts),
    };
}

async function loadPersistedState(tripId: string) {
    const rows = await db.select().from(transportDocuments).where(eq(transportDocuments.tripId, tripId));
    const ids = rows.map((row) => row.id);
    const [eventRows, exchangeRows, receiptRows] = ids.length > 0
        ? await Promise.all([
            db.select().from(transportDocumentEvents).where(inArray(transportDocumentEvents.documentId, ids)),
            db.select().from(transportDocumentExchanges).where(inArray(transportDocumentExchanges.documentId, ids)),
            db.select().from(transportDocumentReceipts).where(inArray(transportDocumentReceipts.documentId, ids)),
        ])
        : [[], [], []];

    return { rows, eventRows, exchangeRows, receiptRows };
}

async function appendHistoryEvent(params: {
    documentId: string;
    eventType: string;
    title: string;
    fromStatus?: string | null;
    toStatus?: string | null;
    severity?: 'info' | 'warning' | 'critical';
    message?: string | null;
    errorCode?: string | null;
    payload?: Record<string, unknown>;
    createdBy?: string | null;
}, tx?: any) {
    await (tx ?? db).insert(transportDocumentEvents).values({
        documentId: params.documentId,
        eventType: params.eventType,
        title: params.title,
        fromStatus: params.fromStatus ?? null,
        toStatus: params.toStatus ?? null,
        severity: params.severity ?? 'info',
        message: params.message ?? null,
        errorCode: params.errorCode ?? null,
        payload: params.payload ?? {},
        createdBy: params.createdBy ?? null,
    });
}

async function appendExchangeRecord(params: {
    documentId: string;
    tripId: string;
    providerName?: string | null;
    direction?: TransportDocumentExchange['direction'];
    operation: string;
    status: TransportDocumentExchange['status'];
    requestId?: string | null;
    providerDocumentId?: string | null;
    providerMessageId?: string | null;
    providerEventId?: string | null;
    providerStatus?: string | null;
    attemptNumber?: number;
    errorCode?: string | null;
    errorMessage?: string | null;
    requestPayload?: Record<string, unknown>;
    responsePayload?: Record<string, unknown>;
    initiatedBy?: string | null;
    nextRetryAt?: string | null;
}) {
    const [row] = await db.insert(transportDocumentExchanges).values({
        documentId: params.documentId,
        tripId: params.tripId,
        providerName: params.providerName ?? 'sandbox_edo',
        direction: params.direction ?? TransportDocumentExchangeDirection.OUTBOUND,
        operation: params.operation,
        status: params.status,
        requestId: params.requestId ?? null,
        providerDocumentId: params.providerDocumentId ?? null,
        providerMessageId: params.providerMessageId ?? null,
        providerEventId: params.providerEventId ?? null,
        providerStatus: params.providerStatus ?? null,
        attemptNumber: params.attemptNumber ?? 1,
        errorCode: params.errorCode ?? null,
        errorMessage: params.errorMessage ?? null,
        requestPayload: params.requestPayload ?? {},
        responsePayload: params.responsePayload ?? {},
        initiatedBy: params.initiatedBy ?? null,
        nextRetryAt: params.nextRetryAt ? new Date(params.nextRetryAt) : null,
        completedAt: params.status === TransportDocumentExchangeStatus.QUEUED ? null : new Date(),
    }).returning();
    return row;
}

async function appendReceiptRecord(params: {
    documentId: string;
    tripId: string;
    exchangeId?: string | null;
    receiptType: TransportDocumentReceipt['receiptType'];
    providerReceiptId?: string | null;
    providerEventId?: string | null;
    providerStatus?: string | null;
    title: string;
    message?: string | null;
    payload?: Record<string, unknown>;
    createdBy?: string | null;
}, tx?: any) {
    const [row] = await (tx ?? db).insert(transportDocumentReceipts).values({
        documentId: params.documentId,
        tripId: params.tripId,
        exchangeId: params.exchangeId ?? null,
        receiptType: params.receiptType,
        providerReceiptId: params.providerReceiptId ?? null,
        providerEventId: params.providerEventId ?? null,
        providerStatus: params.providerStatus ?? null,
        title: params.title,
        message: params.message ?? null,
        payload: params.payload ?? {},
        createdBy: params.createdBy ?? null,
        processedAt: new Date(),
    }).returning();
    return row;
}

async function syncPersistedRows(
    dossier: TripDossier,
    derivedDocuments: TransportDocument[],
    createdBy?: string | null,
) {
    const [existingRows, persistedState] = await Promise.all([
        db.select().from(transportDocuments).where(eq(transportDocuments.tripId, dossier.trip.id)),
        loadPersistedState(dossier.trip.id),
    ]);
    const existingMap = new Map(existingRows.map((row) => [row.sourceKey, row]));
    const exchangeMap = new Map<string, TransportDocumentExchange[]>();
    const receiptMap = new Map<string, TransportDocumentReceipt[]>();

    for (const row of persistedState.exchangeRows) {
        const bucket = exchangeMap.get(row.documentId) ?? [];
        bucket.push(serializeExchange(row));
        exchangeMap.set(row.documentId, bucket);
    }
    for (const row of persistedState.receiptRows) {
        const bucket = receiptMap.get(row.documentId) ?? [];
        bucket.push(serializeReceipt(row));
        receiptMap.set(row.documentId, bucket);
    }
    const now = new Date();

    for (const document of derivedDocuments) {
        const existing = existingMap.get(document.sourceKey);
        const persistedExchange = existing
            ? buildExchangeState(existing, exchangeMap.get(existing.id) ?? [], receiptMap.get(existing.id) ?? [])
            : undefined;
        const exchange = document.exchange ?? persistedExchange;
        const existingExchange = getExchangeMetadataSnapshot(existing?.metadata as Record<string, unknown> | null);
        const incomingExchange = getExchangeMetadataSnapshot(document.metadata as Record<string, unknown> | null);
        const metadata = {
            ...((existing?.metadata as Record<string, unknown> | null) ?? {}),
            ...(document.metadata ?? {}),
        };
        if (exchange) {
            metadata.exchange = {
                ...existingExchange,
                ...incomingExchange,
                ...exchange,
            };
        }

        if (!existing) {
            const [created] = await db.insert(transportDocuments).values({
                artifactId: `${document.type}:${document.sourceKey}`,
                artifactKind: 'transport_document',
                tripId: document.tripId,
                waybillId: document.waybillId ?? null,
                documentType: document.type,
                titleType: document.titleType ?? null,
                titleNumber: document.titleNumber ?? null,
                sourceKey: document.sourceKey,
                correlationId: document.correlationId,
                snapshotId: document.fingerprint,
                version: 1,
                sourceStatus: document.status,
                status: document.status,
                externalId: document.externalId,
                providerName: document.providerName ?? 'internal',
                providerDocumentId: document.providerDocumentId ?? null,
                providerMessageId: document.providerMessageId ?? null,
                providerStatus: document.providerStatus ?? null,
                orderIds: document.orderIds ?? [],
                retryCount: document.retryCount ?? 0,
                lastAttemptAt: now,
                lastRetryAt: document.lastRetryAt ? new Date(document.lastRetryAt) : null,
                nextRetryAt: document.nextRetryAt ? new Date(document.nextRetryAt) : null,
                error: document.error ?? null,
                lastErrorAt: document.error ? now : null,
                payload: document.payload ?? {},
                history: document.history ?? [],
                timeline: [],
                metadata,
                createdAt: new Date(document.createdAt),
                updatedAt: new Date(document.updatedAt),
                issuedAt: document.issuedAt ? new Date(document.issuedAt) : null,
                sentAt: document.sentAt ? new Date(document.sentAt) : null,
                acceptedAt: document.acceptedAt ? new Date(document.acceptedAt) : null,
                rejectedAt: document.rejectedAt ? new Date(document.rejectedAt) : null,
                completedAt: document.completedAt ? new Date(document.completedAt) : null,
                lastSyncedAt: now,
            }).returning();

            await appendHistoryEvent({
                documentId: created.id,
                eventType: 'registered',
                title: 'Document registered',
                toStatus: document.status,
                severity: document.status === TransportDocumentStatus.ERROR ? 'critical' : 'info',
                message: document.error ?? null,
                createdBy: createdBy ?? null,
                payload: {
                    sourceKey: document.sourceKey,
                    externalId: document.externalId,
                    fingerprint: document.fingerprint,
                },
            });
            continue;
        }

        const nextStatus = mergeStatus(existing.status, document.status);
        const version = existing.snapshotId !== document.fingerprint ? (existing.version ?? 1) + 1 : existing.version;

        await db.update(transportDocuments).set({
            waybillId: document.waybillId ?? null,
            documentType: document.type,
            titleType: document.titleType ?? null,
            titleNumber: document.titleNumber ?? null,
            correlationId: document.correlationId,
            snapshotId: document.fingerprint,
            version,
            sourceStatus: document.status,
            status: nextStatus,
            externalId: document.externalId,
            providerName: document.providerName && document.providerName !== 'internal'
                ? document.providerName
                : existing.providerName ?? document.providerName ?? 'internal',
            providerDocumentId: document.providerDocumentId ?? existing.providerDocumentId ?? null,
            providerMessageId: document.providerMessageId ?? existing.providerMessageId ?? null,
            providerStatus: document.providerStatus ?? existing.providerStatus ?? null,
            orderIds: document.orderIds ?? [],
            error: document.error ?? existing.error ?? null,
            lastAttemptAt: now,
            lastErrorAt: document.error ? now : existing.lastErrorAt ?? null,
            payload: document.payload ?? (existing.payload as Record<string, unknown> | null) ?? {},
            metadata,
            updatedAt: new Date(document.updatedAt),
            issuedAt: document.issuedAt ? new Date(document.issuedAt) : null,
            sentAt: document.sentAt ? new Date(document.sentAt) : null,
            acceptedAt: document.acceptedAt ? new Date(document.acceptedAt) : null,
            rejectedAt: document.rejectedAt ? new Date(document.rejectedAt) : null,
            completedAt: document.completedAt ? new Date(document.completedAt) : null,
            lastSyncedAt: now,
        }).where(eq(transportDocuments.id, existing.id));

        if (existing.status !== nextStatus) {
            await appendHistoryEvent({
                documentId: existing.id,
                eventType: 'status_changed',
                title: 'Document status changed',
                fromStatus: existing.status,
                toStatus: nextStatus,
                severity: nextStatus === TransportDocumentStatus.ERROR ? 'critical' : 'info',
                message: document.error ?? null,
                createdBy: createdBy ?? null,
                payload: {
                    sourceStatus: document.status,
                    fingerprint: document.fingerprint,
                },
            });
        } else if (existing.snapshotId !== document.fingerprint || existing.sourceStatus !== document.status) {
            await appendHistoryEvent({
                documentId: existing.id,
                eventType: 'synced',
                title: 'Document synchronized',
                fromStatus: existing.sourceStatus,
                toStatus: document.status,
                severity: document.status === TransportDocumentStatus.ERROR ? 'warning' : 'info',
                message: document.error ?? null,
                createdBy: createdBy ?? null,
                payload: {
                    previousFingerprint: existing.snapshotId,
                    fingerprint: document.fingerprint,
                },
            });
        }
    }
}

async function buildPersistedBundle(dossier: TripDossier): Promise<TransportDocumentBundle> {
    const [{ rows, eventRows, exchangeRows, receiptRows }, deliveryRows, returnRows] = await Promise.all([
        loadPersistedState(dossier.trip.id),
        db.select().from(deliveryConfirmations).where(eq(deliveryConfirmations.tripId, dossier.trip.id)),
        db.select().from(documentReturns).where(eq(documentReturns.tripId, dossier.trip.id)),
    ]);

    const eventMap = new Map<string, TransportDocumentHistoryEvent[]>();
    const exchangeMap = new Map<string, TransportDocumentExchange[]>();
    const receiptMap = new Map<string, TransportDocumentReceipt[]>();

    for (const row of eventRows) {
        const historyEvent = serializeHistoryEvent(row);
        const bucket = eventMap.get(row.documentId) ?? [];
        bucket.push(historyEvent);
        eventMap.set(row.documentId, bucket);
    }

    for (const row of exchangeRows) {
        const exchange = serializeExchange(row);
        const bucket = exchangeMap.get(row.documentId) ?? [];
        bucket.push(exchange);
        exchangeMap.set(row.documentId, bucket);
    }

    for (const row of receiptRows) {
        const receipt = serializeReceipt(row);
        const bucket = receiptMap.get(row.documentId) ?? [];
        bucket.push(receipt);
        receiptMap.set(row.documentId, bucket);
    }

    const documents = rows.map((row) => serializeDocument(
        row,
        (eventMap.get(row.id) ?? []).sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()),
        (exchangeMap.get(row.id) ?? []).sort((a, b) => new Date(a.initiatedAt).getTime() - new Date(b.initiatedAt).getTime()),
        (receiptMap.get(row.id) ?? []).sort((a, b) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime()),
    ));

    return buildTransportDocumentBundleFromDocuments(dossier, documents, deliveryRows, returnRows);
}

export async function syncTransportDocumentsForTrip(tripId: string, createdBy?: string | null) {
    const dossier = await getTransportDossier(tripId);
    if (!dossier) return null;

    const derivedBundle = await getTransportDocumentsForDossier(dossier);
    await syncPersistedRows(dossier, derivedBundle.documents, createdBy);
    return buildPersistedBundle(dossier);
}

export async function getPersistedTransportDocumentsForTrip(tripId: string) {
    const dossier = await getTransportDossier(tripId);
    if (!dossier) return null;
    return buildPersistedBundle(dossier);
}

export async function getPersistedTransportDocumentById(tripId: string, documentId: string) {
    const bundle = await getPersistedTransportDocumentsForTrip(tripId);
    if (!bundle) return null;
    return bundle.documents.find((document) => document.id === documentId) ?? null;
}

export async function sendTransportDocumentToProvider(params: {
    tripId: string;
    documentId: string;
    createdBy?: string | null;
    providerName?: string | null;
    direction?: TransportDocumentExchange['direction'];
    status?: TransportDocumentExchange['status'];
    requestId?: string | null;
    providerDocumentId?: string | null;
    providerMessageId?: string | null;
    providerEventId?: string | null;
    providerStatus?: string | null;
    requestPayload?: Record<string, unknown>;
    responsePayload?: Record<string, unknown>;
    errorCode?: string | null;
    errorMessage?: string | null;
    nextRetryAt?: string | null;
}) {
    const [row] = await db.select().from(transportDocuments).where(and(
        eq(transportDocuments.id, params.documentId),
        eq(transportDocuments.tripId, params.tripId),
    ));
    if (!row) return null;

    const now = new Date();
    const requestId = params.requestId ?? `req-${row.id.slice(0, 8)}-${now.getTime()}`;
    const attemptNumber = Math.max((row.retryCount ?? 0) + 1, 1);
    const payload = params.requestPayload ?? (row.payload as Record<string, unknown> | null) ?? {};
    const shouldUseMockProvider = !params.providerDocumentId
        && !params.providerMessageId
        && !params.providerEventId
        && !params.providerStatus
        && !params.responsePayload
        && !params.errorCode
        && !params.errorMessage;
    const providerResult = shouldUseMockProvider
        ? await resolveEtrnProviderAdapter(params.providerName ?? row.providerName).submitDocument({
            tripId: params.tripId,
            document: row as unknown as TransportDocument,
            requestId,
            attemptNumber,
            payload,
            providerName: params.providerName ?? row.providerName,
            submittedAt: now,
        })
        : null;
    const providerMessageId = params.providerMessageId ?? providerResult?.providerMessageId ?? `msg-${row.id.slice(0, 8)}-${now.getTime()}`;
    const providerDocumentId = params.providerDocumentId ?? providerResult?.providerDocumentId ?? row.providerDocumentId ?? null;
    const providerEventId = params.providerEventId ?? providerResult?.providerEventId ?? null;
    const providerStatus = params.providerStatus ?? providerResult?.providerStatus ?? 'sent_to_provider';
    const providerName = providerResult?.providerName ?? params.providerName ?? row.providerName ?? 'sandbox_edo';
    const nextRetryAt = params.nextRetryAt ?? new Date(now.getTime() + 15 * 60 * 1000).toISOString();
    const exchangeStatus = params.status ?? providerResult?.exchangeStatus ?? TransportDocumentExchangeStatus.SENT;
    const documentStatus = exchangeStatusToDocumentStatus(exchangeStatus);

    const patch: Partial<typeof transportDocuments.$inferInsert> = {
        status: documentStatus,
        providerName,
        providerStatus,
        providerDocumentId,
        providerMessageId,
        lastAttemptAt: now,
        updatedAt: now,
        nextRetryAt: params.nextRetryAt ? new Date(params.nextRetryAt) : row.status === TransportDocumentStatus.ERROR || row.status === TransportDocumentStatus.REJECTED
            ? new Date(nextRetryAt)
            : row.nextRetryAt ?? null,
        error: params.errorMessage ?? row.error ?? null,
    };
    if (documentStatus === TransportDocumentStatus.SENT) patch.sentAt = row.sentAt ?? now;
    if (documentStatus === TransportDocumentStatus.ACCEPTED || documentStatus === TransportDocumentStatus.RECEIVED) patch.acceptedAt = now;
    if (documentStatus === TransportDocumentStatus.REJECTED || documentStatus === TransportDocumentStatus.ERROR) patch.rejectedAt = now;
    if (documentStatus === TransportDocumentStatus.COMPLETED || documentStatus === TransportDocumentStatus.CORRECTED) patch.completedAt = now;

    await db.update(transportDocuments).set(patch).where(eq(transportDocuments.id, row.id));

    const exchange = await appendExchangeRecord({
        documentId: row.id,
        tripId: params.tripId,
        providerName,
        direction: params.direction ?? TransportDocumentExchangeDirection.OUTBOUND,
        operation: row.retryCount > 0 ? 'resubmit' : 'submit',
        status: exchangeStatus,
        requestId,
        providerDocumentId,
        providerMessageId,
        providerEventId,
        providerStatus,
        attemptNumber,
        requestPayload: payload,
        responsePayload: params.responsePayload ?? providerResult?.responsePayload ?? { acceptedForProcessing: true },
        initiatedBy: params.createdBy ?? null,
        nextRetryAt,
        errorCode: params.errorCode ?? null,
        errorMessage: params.errorMessage ?? null,
    });

    const receipt = providerResult
        ? await appendReceiptRecord({
            documentId: row.id,
            tripId: params.tripId,
            exchangeId: exchange.id,
            receiptType: providerResult.receipt.receiptType,
            providerReceiptId: providerResult.receipt.providerReceiptId,
            providerEventId: providerResult.receipt.providerEventId,
            providerStatus: providerResult.receipt.providerStatus,
            title: providerResult.receipt.title,
            message: providerResult.receipt.message,
            payload: providerResult.receipt.payload,
            createdBy: params.createdBy ?? null,
        })
        : null;

    await appendHistoryEvent({
        documentId: row.id,
        eventType: 'provider_send',
        title: providerResult ? 'Document sent to mock ETRN provider' : 'Document sent to external provider',
        fromStatus: row.status,
        toStatus: documentStatus,
        severity: exchangeStatus === TransportDocumentExchangeStatus.REJECTED || exchangeStatus === TransportDocumentExchangeStatus.FAILED ? 'critical' : 'info',
        message: params.errorMessage ?? (providerResult ? providerResult.receipt.message : `Outbound exchange ${exchange.id} created`),
        createdBy: params.createdBy ?? null,
        payload: {
            exchangeId: exchange.id,
            receiptId: receipt?.id ?? null,
            requestId,
            providerMessageId,
            providerDocumentId,
            providerEventId,
            providerStatus,
            providerName,
        },
    });

    return getPersistedTransportDocumentById(params.tripId, params.documentId);
}

export const createTransportDocumentExchangeAttempt = sendTransportDocumentToProvider;

export async function retryTransportDocument(tripId: string, documentId: string, createdBy?: string | null) {
    const [row] = await db.select().from(transportDocuments).where(and(
        eq(transportDocuments.id, documentId),
        eq(transportDocuments.tripId, tripId),
    ));
    if (!row) return null;

    const now = new Date();
    const nextStatus = row.status === TransportDocumentStatus.ERROR || row.status === TransportDocumentStatus.REJECTED
        ? TransportDocumentStatus.PENDING
        : row.status;

    await db.update(transportDocuments).set({
        status: nextStatus,
        retryCount: (row.retryCount ?? 0) + 1,
        lastAttemptAt: now,
        lastRetryAt: now,
        nextRetryAt: null,
        providerStatus: 'retry_requested',
        updatedAt: now,
    }).where(eq(transportDocuments.id, row.id));

    await appendHistoryEvent({
        documentId: row.id,
        eventType: 'retry_requested',
        title: 'Retry requested',
        fromStatus: row.status,
        toStatus: nextStatus,
        severity: 'warning',
        message: row.error ?? 'Manual retry requested for transport document',
        createdBy: createdBy ?? null,
    });

    await appendExchangeRecord({
        documentId: row.id,
        tripId,
        providerName: row.providerName,
        operation: 'retry',
        status: TransportDocumentExchangeStatus.QUEUED,
        attemptNumber: (row.retryCount ?? 0) + 1,
        providerDocumentId: row.providerDocumentId ?? null,
        providerMessageId: row.providerMessageId ?? null,
        providerStatus: 'retry_requested',
        initiatedBy: createdBy ?? null,
    });

    return getPersistedTransportDocumentById(tripId, documentId);
}
export async function registerTransportDocumentProviderCallback(params: {
    tripId: string;
    documentId: string;
    createdBy?: string | null;
    receiptType: TransportDocumentReceipt['receiptType'];
    title?: string | null;
    message?: string | null;
    providerStatus?: string | null;
    providerReceiptId?: string | null;
    providerEventId?: string | null;
    providerDocumentId?: string | null;
    providerMessageId?: string | null;
    payload?: Record<string, unknown>;
}) {
    const [row] = await db.select().from(transportDocuments).where(and(
        eq(transportDocuments.id, params.documentId),
        eq(transportDocuments.tripId, params.tripId),
    ));
    if (!row) return null;

    const targetStatus = params.receiptType === TransportDocumentReceiptType.REJECTION
        ? TransportDocumentStatus.REJECTED
        : params.receiptType === TransportDocumentReceiptType.ACCEPTANCE
            ? TransportDocumentStatus.ACCEPTED
        : params.receiptType === TransportDocumentReceiptType.DELIVERY
                ? TransportDocumentStatus.COMPLETED
                : params.receiptType === TransportDocumentReceiptType.CORRECTION_REQUIRED
                    ? TransportDocumentStatus.ERROR
                    : TransportDocumentStatus.PENDING;

    const exchangeStatus = params.receiptType === TransportDocumentReceiptType.REJECTION
        ? TransportDocumentExchangeStatus.REJECTED
        : params.receiptType === TransportDocumentReceiptType.ACCEPTANCE
            ? TransportDocumentExchangeStatus.ACCEPTED
        : params.receiptType === TransportDocumentReceiptType.DELIVERY
                ? TransportDocumentExchangeStatus.DELIVERED
                : params.receiptType === TransportDocumentReceiptType.CORRECTION_REQUIRED
                    ? TransportDocumentExchangeStatus.REJECTED
                    : TransportDocumentExchangeStatus.ACKNOWLEDGED;

    const now = new Date();
    const exchange = await appendExchangeRecord({
        documentId: row.id,
        tripId: params.tripId,
        providerName: row.providerName ?? 'sandbox_edo',
        direction: TransportDocumentExchangeDirection.INBOUND,
        operation: 'provider_callback',
        status: exchangeStatus,
        providerDocumentId: params.providerDocumentId ?? row.providerDocumentId ?? null,
        providerMessageId: params.providerMessageId ?? row.providerMessageId ?? null,
        providerEventId: params.providerEventId ?? null,
        providerStatus: params.providerStatus ?? exchangeStatus,
        initiatedBy: params.createdBy ?? null,
        responsePayload: params.payload ?? {},
    });

    const receipt = await appendReceiptRecord({
        documentId: row.id,
        tripId: params.tripId,
        exchangeId: exchange.id,
        receiptType: params.receiptType,
        providerReceiptId: params.providerReceiptId ?? null,
        providerEventId: params.providerEventId ?? null,
        providerStatus: params.providerStatus ?? exchangeStatus,
        title: params.title ?? `Provider ${params.receiptType} receipt`,
        message: params.message ?? null,
        payload: params.payload ?? {},
        createdBy: params.createdBy ?? null,
    });

    const patch: Partial<typeof transportDocuments.$inferInsert> = {
        status: targetStatus,
        providerStatus: params.providerStatus ?? exchangeStatus,
        providerDocumentId: params.providerDocumentId ?? row.providerDocumentId ?? null,
        providerMessageId: params.providerMessageId ?? row.providerMessageId ?? null,
        lastAttemptAt: now,
        updatedAt: now,
        nextRetryAt: targetStatus === TransportDocumentStatus.REJECTED ? row.nextRetryAt ?? null : null,
        error: targetStatus === TransportDocumentStatus.REJECTED ? (params.message ?? row.error ?? 'Rejected by external provider') : null,
    };
    if (targetStatus === TransportDocumentStatus.ACCEPTED) patch.acceptedAt = now;
    if (targetStatus === TransportDocumentStatus.REJECTED) patch.rejectedAt = now;
    if (targetStatus === TransportDocumentStatus.COMPLETED) patch.completedAt = now;

    await db.update(transportDocuments).set(patch).where(eq(transportDocuments.id, row.id));

    await appendHistoryEvent({
        documentId: row.id,
        eventType: 'provider_callback',
        title: params.title ?? 'Provider callback received',
        fromStatus: row.status,
        toStatus: targetStatus,
        severity: targetStatus === TransportDocumentStatus.REJECTED ? 'critical' : 'info',
        message: params.message ?? null,
        errorCode: targetStatus === TransportDocumentStatus.REJECTED ? 'provider_rejection' : null,
        createdBy: params.createdBy ?? null,
        payload: {
            exchangeId: exchange.id,
            receiptId: receipt.id,
            receiptType: params.receiptType,
            providerEventId: params.providerEventId ?? null,
        },
    });

    return getPersistedTransportDocumentById(params.tripId, params.documentId);
}

export const recordTransportDocumentProviderReceipt = registerTransportDocumentProviderCallback;

export async function updatePersistedTransportDocumentStatus(params: {
    tripId: string;
    documentId: string;
    status: TransportDocumentStatus;
    createdBy?: string | null;
    message?: string | null;
    providerStatus?: string | null;
    providerDocumentId?: string | null;
    providerMessageId?: string | null;
    externalId?: string | null;
    nextRetryAt?: string | null;
    error?: string | null;
}) {
    const [row] = await db.select().from(transportDocuments).where(and(
        eq(transportDocuments.id, params.documentId),
        eq(transportDocuments.tripId, params.tripId),
    ));
    if (!row) return null;

    const now = new Date();
    const patch: Partial<typeof transportDocuments.$inferInsert> = {
        status: params.status,
        providerStatus: params.providerStatus ?? row.providerStatus ?? null,
        providerDocumentId: params.providerDocumentId ?? row.providerDocumentId ?? null,
        providerMessageId: params.providerMessageId ?? row.providerMessageId ?? null,
        externalId: params.externalId ?? row.externalId,
        nextRetryAt: params.nextRetryAt ? new Date(params.nextRetryAt) : null,
        error: params.error ?? row.error ?? null,
        lastAttemptAt: now,
        lastErrorAt: params.error ? now : row.lastErrorAt ?? null,
        updatedAt: now,
    };

    if (params.status === TransportDocumentStatus.SENT) patch.sentAt = now;
    if (params.status === TransportDocumentStatus.ACCEPTED || params.status === TransportDocumentStatus.RECEIVED) patch.acceptedAt = now;
    if (params.status === TransportDocumentStatus.REJECTED || params.status === TransportDocumentStatus.ERROR) patch.rejectedAt = now;
    if (params.status === TransportDocumentStatus.COMPLETED || params.status === TransportDocumentStatus.CORRECTED) patch.completedAt = now;

    await db.update(transportDocuments).set(patch).where(eq(transportDocuments.id, row.id));

    await appendHistoryEvent({
        documentId: row.id,
        eventType: 'status_updated',
        title: 'Document status updated',
        fromStatus: row.status,
        toStatus: params.status,
        severity: params.status === TransportDocumentStatus.ERROR || params.status === TransportDocumentStatus.REJECTED ? 'critical' : 'info',
        message: params.message ?? params.error ?? null,
        errorCode: params.status === TransportDocumentStatus.ERROR ? 'manual_error' : null,
        createdBy: params.createdBy ?? null,
        payload: {
            providerStatus: params.providerStatus ?? null,
            providerDocumentId: params.providerDocumentId ?? null,
            providerMessageId: params.providerMessageId ?? null,
        },
    });

    await appendExchangeRecord({
        documentId: row.id,
        tripId: params.tripId,
        providerName: row.providerName ?? 'sandbox_edo',
        operation: 'manual_status_update',
        status: params.status === TransportDocumentStatus.REJECTED || params.status === TransportDocumentStatus.ERROR
            ? TransportDocumentExchangeStatus.FAILED
            : params.status === TransportDocumentStatus.ACCEPTED || params.status === TransportDocumentStatus.RECEIVED
                ? TransportDocumentExchangeStatus.ACCEPTED
                : params.status === TransportDocumentStatus.COMPLETED || params.status === TransportDocumentStatus.CORRECTED
                    ? TransportDocumentExchangeStatus.DELIVERED
                    : params.status === TransportDocumentStatus.SENT
                        ? TransportDocumentExchangeStatus.SENT
                        : TransportDocumentExchangeStatus.ACKNOWLEDGED,
        providerDocumentId: params.providerDocumentId ?? row.providerDocumentId ?? null,
        providerMessageId: params.providerMessageId ?? row.providerMessageId ?? null,
        providerStatus: params.providerStatus ?? params.status,
        errorCode: params.status === TransportDocumentStatus.ERROR ? 'manual_error' : null,
        errorMessage: params.message ?? params.error ?? null,
        initiatedBy: params.createdBy ?? null,
        responsePayload: {
            status: params.status,
            message: params.message ?? null,
        },
        nextRetryAt: params.nextRetryAt ?? null,
    });

    if (params.status === TransportDocumentStatus.ACCEPTED || params.status === TransportDocumentStatus.REJECTED || params.status === TransportDocumentStatus.CORRECTED) {
        await appendReceiptRecord({
            documentId: row.id,
            tripId: params.tripId,
            receiptType: params.status === TransportDocumentStatus.ACCEPTED
                ? TransportDocumentReceiptType.ACCEPTANCE
                : params.status === TransportDocumentStatus.REJECTED
                    ? TransportDocumentReceiptType.REJECTION
                    : TransportDocumentReceiptType.CORRECTION_REQUIRED,
            providerStatus: params.providerStatus ?? params.status,
            title: params.status === TransportDocumentStatus.ACCEPTED
                ? 'Manual acceptance receipt'
                : params.status === TransportDocumentStatus.REJECTED
                    ? 'Manual rejection receipt'
                    : 'Manual correction required receipt',
            message: params.message ?? params.error ?? null,
            createdBy: params.createdBy ?? null,
        });
    }

    return getPersistedTransportDocumentById(params.tripId, params.documentId);
}

export async function recordTransportDocumentSignature(params: {
    tripId: string;
    documentId: string;
    signerRole: string;
    signerName: string;
    signerInn?: string | null;
    authorityType?: string | null;
    certificateThumbprint?: string | null;
    powerOfAttorneyId?: string | null;
    signedAt?: string | null;
    createdBy?: string | null;
    notes?: string | null;
}) {
    // C5: read-modify-write metadata.signatures — в одной транзакции с SELECT ... FOR
    // UPDATE по документу. Раньше два параллельных POST .../signatures читали один и
    // тот же массив, каждый пушил свою подпись и перезаписывал → одна подпись терялась
    // (потеря юр-значимого факта подписи ЭТрН). FOR UPDATE сериализует подписантов.
    const found = await db.transaction(async (tx) => {
        const [row] = await tx.select().from(transportDocuments).where(and(
            eq(transportDocuments.id, params.documentId),
            eq(transportDocuments.tripId, params.tripId),
        )).for('update');
        if (!row) return false;

        const metadata = ((row.metadata as Record<string, unknown> | null) ?? {});
        const signatures = Array.isArray(metadata.signatures)
            ? [...metadata.signatures as Array<Record<string, unknown>>]
            : [];
        const signedAt = params.signedAt ? new Date(params.signedAt) : new Date();
        const signature = {
            signerRole: params.signerRole,
            signerName: params.signerName,
            signerInn: params.signerInn ?? null,
            authorityType: params.authorityType ?? 'manual',
            certificateThumbprint: params.certificateThumbprint ?? null,
            powerOfAttorneyId: params.powerOfAttorneyId ?? null,
            signedAt: signedAt.toISOString(),
            createdBy: params.createdBy ?? null,
            notes: params.notes ?? null,
        };
        signatures.push(signature);

        await tx.update(transportDocuments).set({
            metadata: {
                ...metadata,
                signatures,
                signatureState: {
                    status: 'partially_signed',
                    lastSignerRole: params.signerRole,
                    lastSignedAt: signedAt.toISOString(),
                },
            },
            providerStatus: `signed:${params.signerRole}`,
            updatedAt: new Date(),
        }).where(eq(transportDocuments.id, row.id));

        await appendHistoryEvent({
            documentId: row.id,
            eventType: 'signature_recorded',
            title: 'Document signature recorded',
            fromStatus: row.status,
            toStatus: row.status,
            severity: 'info',
            message: params.notes ?? `${params.signerRole} signed transport document`,
            createdBy: params.createdBy ?? null,
            payload: signature,
        }, tx);
        return true;
    });

    if (!found) return null;
    return getPersistedTransportDocumentById(params.tripId, params.documentId);
}

export async function recordTransportDocumentSignatureRefusal(params: {
    tripId: string;
    documentId: string;
    signerRole: string;
    signerName: string;
    reason: string;
    evidenceUrl?: string | null;
    refusedAt?: string | null;
    createdBy?: string | null;
    notes?: string | null;
}) {
    // C5: read-modify-write signatureRefusals — в транзакции с SELECT ... FOR UPDATE
    // (идентичный паттерн потери записи, что и у подписи). Сериализуем подписантов.
    const found = await db.transaction(async (tx) => {
        const [row] = await tx.select().from(transportDocuments).where(and(
            eq(transportDocuments.id, params.documentId),
            eq(transportDocuments.tripId, params.tripId),
        )).for('update');
        if (!row) return false;

        const metadata = ((row.metadata as Record<string, unknown> | null) ?? {});
        const refusals = Array.isArray(metadata.signatureRefusals)
            ? [...metadata.signatureRefusals as Array<Record<string, unknown>>]
            : [];
        const refusedAt = params.refusedAt ? new Date(params.refusedAt) : new Date();
        const refusal = {
            signerRole: params.signerRole,
            signerName: params.signerName,
            reason: params.reason,
            evidenceUrl: params.evidenceUrl ?? null,
            refusedAt: refusedAt.toISOString(),
            createdBy: params.createdBy ?? null,
            notes: params.notes ?? null,
        };
        refusals.push(refusal);

        await tx.update(transportDocuments).set({
            status: TransportDocumentStatus.REJECTED,
            rejectedAt: refusedAt,
            providerStatus: `signature_refused:${params.signerRole}`,
            error: params.reason,
            metadata: {
                ...metadata,
                signatureRefusals: refusals,
                signatureState: {
                    status: 'refused',
                    lastSignerRole: params.signerRole,
                    lastRefusedAt: refusedAt.toISOString(),
                },
            },
            updatedAt: new Date(),
        }).where(eq(transportDocuments.id, row.id));

        await appendHistoryEvent({
            documentId: row.id,
            eventType: 'signature_refused',
            title: 'Document signature refused',
            fromStatus: row.status,
            toStatus: TransportDocumentStatus.REJECTED,
            severity: 'critical',
            message: params.reason,
            errorCode: 'signature_refusal',
            createdBy: params.createdBy ?? null,
            payload: refusal,
        }, tx);

        await appendReceiptRecord({
            documentId: row.id,
            tripId: params.tripId,
            receiptType: TransportDocumentReceiptType.REJECTION,
            providerStatus: `signature_refused:${params.signerRole}`,
            title: 'Signature refusal receipt',
            message: params.reason,
            payload: refusal,
            createdBy: params.createdBy ?? null,
        }, tx);
        return true;
    });

    if (!found) return null;
    return getPersistedTransportDocumentById(params.tripId, params.documentId);
}
