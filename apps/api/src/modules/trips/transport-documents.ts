import { createHash } from 'node:crypto';
import { db } from '../../db/connection.js';
import { deliveryConfirmations, documentReturns } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import {
    EtrnTitleStatus,
    EtrnTitleType,
    EtrnWorkflowStatus,
    TransportDocumentStatus,
    TransportDocumentType,
    type EtrnTimelineEvent,
    type EtrnTitle,
    type EtrnWorkflow,
    type EtrnWorkflowSummary,
    type TransportDocument,
    type TransportDocumentBundle,
    type TransportDocumentLifecycle,
    type TransportDocumentListResponse,
    type TransportDocumentProblem,
    type TransportDocumentTimelineEvent,
} from '@tms/shared';
import { getTransportDossier } from './service.js';

type TripDossier = NonNullable<Awaited<ReturnType<typeof getTransportDossier>>>;

const TRIP_STAGE_RANK: Record<string, number> = {
    planning: 0,
    assigned: 1,
    waybill_draft: 2,
    inspection: 3,
    waybill_issued: 4,
    loading: 5,
    in_transit: 6,
    completed: 7,
    billed: 8,
    cancelled: 9,
};

const COMPLETED_DOCUMENT_STATUSES = new Set<TransportDocumentBundle['documents'][number]['status']>([
    TransportDocumentStatus.COMPLETED,
    TransportDocumentStatus.ACCEPTED,
    TransportDocumentStatus.RECEIVED,
    TransportDocumentStatus.CORRECTED,
]);

const ETRN_REQUIRED_TITLES: EtrnTitleType[] = [
    EtrnTitleType.TITLE_01,
    EtrnTitleType.TITLE_02,
    EtrnTitleType.TITLE_05,
    EtrnTitleType.TITLE_06,
];

const ETRN_TITLE_ORDER: EtrnTitleType[] = [
    EtrnTitleType.TITLE_01,
    EtrnTitleType.TITLE_02,
    EtrnTitleType.TITLE_03,
    EtrnTitleType.TITLE_04,
    EtrnTitleType.TITLE_05,
    EtrnTitleType.TITLE_06,
    EtrnTitleType.TITLE_07,
    EtrnTitleType.TITLE_08,
];

const ETRN_TITLE_LABELS: Record<EtrnTitleType, string> = {
    [EtrnTitleType.TITLE_01]: 'ETRN Title 01 - Shipper initiation',
    [EtrnTitleType.TITLE_02]: 'ETRN Title 02 - Carrier acceptance',
    [EtrnTitleType.TITLE_03]: 'ETRN Title 03 - Readdressing',
    [EtrnTitleType.TITLE_04]: 'ETRN Title 04 - Vehicle or driver replacement',
    [EtrnTitleType.TITLE_05]: 'ETRN Title 05 - Consignee acceptance',
    [EtrnTitleType.TITLE_06]: 'ETRN Title 06 - Carrier delivery',
    [EtrnTitleType.TITLE_07]: 'ETRN Title 07 - Carrier PUD',
    [EtrnTitleType.TITLE_08]: 'ETRN Title 08 - Shipper PUD confirmation',
};

const ETRN_TITLE_NUMBERS: Record<EtrnTitleType, string> = {
    [EtrnTitleType.TITLE_01]: '01',
    [EtrnTitleType.TITLE_02]: '02',
    [EtrnTitleType.TITLE_03]: '03',
    [EtrnTitleType.TITLE_04]: '04',
    [EtrnTitleType.TITLE_05]: '05',
    [EtrnTitleType.TITLE_06]: '06',
    [EtrnTitleType.TITLE_07]: '07',
    [EtrnTitleType.TITLE_08]: '08',
};

function toIso(value: Date | string | null | undefined) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function ensureIso(value: Date | string | null | undefined, fallback: string) {
    return toIso(value) ?? fallback;
}

function hashPayload(payload: unknown) {
    return createHash('sha1').update(JSON.stringify(payload)).digest('hex');
}

function makeKey(type: TransportDocumentType | string, sourceId: string) {
    return `${type}:${sourceId}`;
}

function buildFingerprint(payload: unknown) {
    return hashPayload(payload);
}

function getTripStageRank(status: string) {
    return TRIP_STAGE_RANK[status] ?? 0;
}

function baseContext(dossier: TripDossier) {
    const orderIds = (dossier.orders ?? []).map((order: any) => order.id).filter(Boolean);
    const orderNumbers = (dossier.orders ?? []).map((order: any) => order.number).filter(Boolean);
    return { orderIds, orderNumbers };
}

function addTimelineEvent(
    events: TransportDocumentTimelineEvent[],
    params: Omit<TransportDocumentTimelineEvent, 'id'> & { id?: string },
) {
    events.push({
        id: params.id ?? makeKey(params.documentType, `${params.documentId}:${params.at}:${params.status}`),
        ...params,
    });
}

function documentTypeLabel(type: TransportDocumentType) {
    switch (type) {
        case TransportDocumentType.WAYBILL:
            return 'Путевой лист';
        case TransportDocumentType.DELIVERY_CONFIRMATION:
            return 'Подтверждение доставки';
        case TransportDocumentType.DOCUMENT_RETURN:
            return 'Возврат оригиналов';
        default:
            return type;
    }
}

function buildWaybillDocument(dossier: TripDossier): TransportDocument {
    const { trip, waybill } = dossier;
    const { orderIds } = baseContext(dossier);
    const hasWaybill = Boolean(waybill);
    const sourceKey = `trip:${trip.id}`;
    const sourceId = sourceKey;
    const generatedAt = new Date().toISOString();
    const createdAt = hasWaybill ? waybill!.issuedAt ?? trip.createdAt : trip.createdAt;
    const updatedAt = hasWaybill ? waybill!.closedAt ?? waybill!.issuedAt ?? trip.updatedAt : trip.updatedAt;
    const tripStage = getTripStageRank(trip.status);

    let status: TransportDocument['status'] = TransportDocumentStatus.DRAFT;
    let error: string | null = null;

    if (!hasWaybill) {
        status = tripStage >= getTripStageRank('waybill_issued')
            ? TransportDocumentStatus.ERROR
            : TransportDocumentStatus.DRAFT;
        error = tripStage >= getTripStageRank('waybill_issued')
            ? 'Trip has progressed to the waybill stage, but no waybill exists yet'
            : 'Waybill has not been issued yet';
    } else if (waybill!.status === 'closed') {
        status = TransportDocumentStatus.COMPLETED;
    } else if (waybill!.departureAt || tripStage >= getTripStageRank('in_transit')) {
        status = TransportDocumentStatus.SENT;
    } else if (waybill!.status === 'issued') {
        status = TransportDocumentStatus.READY;
    } else {
        status = TransportDocumentStatus.DRAFT;
    }

    if (hasWaybill && tripStage >= getTripStageRank('in_transit') && !waybill!.departureAt) {
        error = 'Trip is already in transit, but the waybill has no departure timestamp';
        status = TransportDocumentStatus.ERROR;
    }

    return {
        id: makeKey(TransportDocumentType.WAYBILL, sourceId),
        sourceKey,
        correlationId: sourceKey,
        fingerprint: buildFingerprint({
            type: TransportDocumentType.WAYBILL,
            sourceKey,
            externalId: hasWaybill ? waybill!.number : `WB-DRAFT-${trip.number}`,
            status,
            error,
            createdAt: toIso(createdAt) ?? null,
            updatedAt: toIso(updatedAt) ?? null,
            issuedAt: toIso(hasWaybill ? waybill!.issuedAt : null),
            sentAt: toIso(hasWaybill ? waybill!.departureAt : null),
            completedAt: toIso(hasWaybill ? waybill!.closedAt : null),
            orderIds,
            tripStatus: trip.status,
        }),
        version: 1,
        generatedAt,
        type: TransportDocumentType.WAYBILL,
        titleType: null,
        titleNumber: null,
        sourceStatus: status,
        status,
        externalId: hasWaybill ? waybill!.number : `WB-DRAFT-${trip.number}`,
        providerName: 'internal',
        providerDocumentId: null,
        providerMessageId: null,
        providerStatus: null,
        error,
        tripId: trip.id,
        waybillId: hasWaybill ? waybill!.id : null,
        orderIds,
        retryCount: 0,
        lastRetryAt: null,
        nextRetryAt: null,
        lastSyncedAt: generatedAt,
        createdAt: toIso(createdAt) ?? new Date().toISOString(),
        updatedAt: toIso(updatedAt) ?? new Date().toISOString(),
        issuedAt: toIso(hasWaybill ? waybill!.issuedAt : null),
        sentAt: toIso(hasWaybill ? waybill!.departureAt : null),
        acceptedAt: toIso(hasWaybill ? waybill!.closedAt : null),
        rejectedAt: null,
        completedAt: toIso(hasWaybill ? waybill!.closedAt : null),
        payload: {},
        metadata: {
            tripNumber: trip.number,
            tripStatus: trip.status,
            transportServiceType: hasWaybill ? waybill!.transportServiceType ?? null : null,
            transportMode: hasWaybill ? waybill!.transportMode ?? null : null,
            odometerOut: hasWaybill ? waybill!.odometerOut ?? null : null,
            odometerIn: hasWaybill ? waybill!.odometerIn ?? null : null,
        },
        history: [],
        exchanges: [],
        receipts: [],
    };
}

function buildDeliveryConfirmationDocument(dossier: TripDossier, row: typeof deliveryConfirmations.$inferSelect): TransportDocument {
    const { trip, waybill } = dossier;
    const { orderIds, orderNumbers } = baseContext(dossier);
    const confirmedAt = ensureIso(row.confirmedAt, trip.updatedAt instanceof Date ? trip.updatedAt.toISOString() : new Date(trip.updatedAt).toISOString());
    const sourceKey = `trip:${trip.id}:delivery:${row.id}`;
    const generatedAt = new Date().toISOString();

    return {
        id: makeKey(TransportDocumentType.DELIVERY_CONFIRMATION, sourceKey),
        sourceKey,
        correlationId: `trip:${trip.id}`,
        fingerprint: buildFingerprint({
            type: TransportDocumentType.DELIVERY_CONFIRMATION,
            sourceKey,
            externalId: `DC-${row.id.slice(0, 8).toUpperCase()}`,
            status: row.forcedByDispatcher ? TransportDocumentStatus.CORRECTED : TransportDocumentStatus.ACCEPTED,
            confirmedAt,
            orderIds: row.orderId ? [row.orderId] : orderIds,
            forcedByDispatcher: row.forcedByDispatcher,
            forcedReason: row.forcedReason ?? null,
            cargoCondition: row.cargoCondition,
            notes: row.notes ?? null,
        }),
        version: 1,
        generatedAt,
        type: TransportDocumentType.DELIVERY_CONFIRMATION,
        titleType: null,
        titleNumber: null,
        sourceStatus: row.forcedByDispatcher ? TransportDocumentStatus.CORRECTED : TransportDocumentStatus.ACCEPTED,
        status: row.forcedByDispatcher ? TransportDocumentStatus.CORRECTED : TransportDocumentStatus.ACCEPTED,
        externalId: `DC-${row.id.slice(0, 8).toUpperCase()}`,
        providerName: 'internal',
        providerDocumentId: null,
        providerMessageId: null,
        providerStatus: null,
        error: row.forcedByDispatcher ? 'Delivery confirmation was forced by dispatcher' : null,
        tripId: trip.id,
        waybillId: waybill?.id ?? null,
        orderIds: row.orderId ? [row.orderId] : orderIds,
        retryCount: 0,
        lastRetryAt: null,
        nextRetryAt: null,
        lastSyncedAt: generatedAt,
        createdAt: confirmedAt,
        updatedAt: confirmedAt,
        issuedAt: null,
        sentAt: null,
        acceptedAt: confirmedAt,
        rejectedAt: null,
        completedAt: confirmedAt,
        payload: {},
        metadata: {
            recipientName: row.recipientName,
            recipientPosition: row.recipientPosition ?? null,
            recipientDocument: row.recipientDocument ?? null,
            cargoCondition: row.cargoCondition,
            sealNumbers: row.sealNumbers ?? [],
            packagingCondition: row.packagingCondition ?? null,
            notes: row.notes ?? null,
            forcedByDispatcher: row.forcedByDispatcher,
            forcedReason: row.forcedReason ?? null,
            orderNumbers,
        },
        history: [],
        exchanges: [],
        receipts: [],
    };
}

function buildDocumentReturnDocument(dossier: TripDossier, row: typeof documentReturns.$inferSelect): TransportDocument {
    const { trip, waybill } = dossier;
    const { orderIds, orderNumbers } = baseContext(dossier);
    const createdAt = ensureIso(row.createdAt, new Date().toISOString());
    const updatedAt = ensureIso(row.updatedAt, createdAt);
    const sourceKey = `trip:${trip.id}:return:${row.docType}`;
    const generatedAt = new Date().toISOString();
    const statusMap: Record<string, TransportDocument['status']> = {
        pending: TransportDocumentStatus.PENDING,
        received: TransportDocumentStatus.RECEIVED,
        overdue: TransportDocumentStatus.OVERDUE,
    };

    return {
        id: makeKey(TransportDocumentType.DOCUMENT_RETURN, sourceKey),
        sourceKey,
        correlationId: `trip:${trip.id}`,
        fingerprint: buildFingerprint({
            type: TransportDocumentType.DOCUMENT_RETURN,
            sourceKey,
            externalId: `DR-${row.docType.toUpperCase()}-${trip.number}`,
            status: statusMap[row.status] ?? TransportDocumentStatus.PENDING,
            createdAt,
            updatedAt,
            receivedAt: row.receivedAt ? toIso(row.receivedAt) : null,
            notes: row.notes ?? null,
        }),
        version: 1,
        generatedAt,
        type: TransportDocumentType.DOCUMENT_RETURN,
        titleType: null,
        titleNumber: null,
        sourceStatus: statusMap[row.status] ?? TransportDocumentStatus.PENDING,
        status: statusMap[row.status] ?? TransportDocumentStatus.PENDING,
        externalId: `DR-${row.docType.toUpperCase()}-${trip.number}`,
        providerName: 'internal',
        providerDocumentId: null,
        providerMessageId: null,
        providerStatus: null,
        error: row.status === 'overdue' ? 'Original document return is overdue' : null,
        tripId: trip.id,
        waybillId: waybill?.id ?? null,
        orderIds,
        retryCount: 0,
        lastRetryAt: null,
        nextRetryAt: null,
        lastSyncedAt: generatedAt,
        createdAt,
        updatedAt,
        issuedAt: null,
        sentAt: null,
        acceptedAt: row.receivedAt ? toIso(row.receivedAt) : null,
        rejectedAt: null,
        completedAt: row.receivedAt ? toIso(row.receivedAt) : null,
        payload: {},
        metadata: {
            docType: row.docType,
            notes: row.notes ?? null,
            receivedAt: toIso(row.receivedAt),
            orderNumbers,
        },
        history: [],
        exchanges: [],
        receipts: [],
    };
}

function buildDocumentTimeline(documents: TransportDocument[]) {
    const events: TransportDocumentTimelineEvent[] = [];

    for (const document of documents) {
        if (document.history && document.history.length > 0) {
            for (const historyEvent of document.history) {
                addTimelineEvent(events, {
                    id: historyEvent.id,
                    documentId: document.id,
                    documentType: document.type,
                    status: historyEvent.toStatus ?? document.status,
                    title: historyEvent.title,
                    at: historyEvent.at,
                    severity: historyEvent.severity,
                    isProblem: historyEvent.severity === 'critical' || Boolean(historyEvent.errorCode),
                    message: historyEvent.message ?? undefined,
                });
            }
            continue;
        }

        addTimelineEvent(events, {
            documentId: document.id,
            documentType: document.type,
            status: document.status,
            title: `${documentTypeLabel(document.type)} created`,
            at: document.createdAt,
            severity: document.status === TransportDocumentStatus.ERROR ? 'critical' : 'info',
            isProblem: document.status === TransportDocumentStatus.ERROR,
            message: document.error ?? undefined,
        });

        if (document.issuedAt) {
            addTimelineEvent(events, {
                documentId: document.id,
                documentType: document.type,
                status: document.status,
                title: `${documentTypeLabel(document.type)} issued`,
                at: document.issuedAt,
                severity: 'info',
                isProblem: false,
            });
        }

        if (document.sentAt) {
            addTimelineEvent(events, {
                documentId: document.id,
                documentType: document.type,
                status: document.status,
                title: `${documentTypeLabel(document.type)} sent`,
                at: document.sentAt,
                severity: 'info',
                isProblem: false,
            });
        }

        if (document.acceptedAt) {
            addTimelineEvent(events, {
                documentId: document.id,
                documentType: document.type,
                status: document.status,
                title: `${documentTypeLabel(document.type)} accepted`,
                at: document.acceptedAt,
                severity: document.status === TransportDocumentStatus.CORRECTED ? 'warning' : 'info',
                isProblem: document.status === TransportDocumentStatus.CORRECTED,
                message: document.status === TransportDocumentStatus.CORRECTED
                    ? 'Confirmation was registered with dispatcher override'
                    : undefined,
            });
        }

        if (document.rejectedAt) {
            addTimelineEvent(events, {
                documentId: document.id,
                documentType: document.type,
                status: document.status,
                title: `${documentTypeLabel(document.type)} rejected`,
                at: document.rejectedAt,
                severity: 'critical',
                isProblem: true,
                message: document.error ?? 'Document was rejected',
            });
        }

        if (document.completedAt) {
            addTimelineEvent(events, {
                documentId: document.id,
                documentType: document.type,
                status: document.status,
                title: `${documentTypeLabel(document.type)} completed`,
                at: document.completedAt,
                severity: 'info',
                isProblem: false,
            });
        }
    }

    events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
    return events;
}

function buildLifecycle(
    dossier: TripDossier,
    documents: TransportDocument[],
    problems: TransportDocumentProblem[],
    summary: ReturnType<typeof buildSummary>,
): TransportDocumentLifecycle {
    const waybillRecord = dossier.waybill;
    const waybillDocument = documents.find((document) => document.type === TransportDocumentType.WAYBILL);
    const deliveryConfirmation = documents.find((document) => document.type === TransportDocumentType.DELIVERY_CONFIRMATION);
    const documentReturns = documents.filter((document) => document.type === TransportDocumentType.DOCUMENT_RETURN);
    const requiredDocumentTypes: TransportDocumentType[] = [TransportDocumentType.WAYBILL];

    if (getTripStageRank(dossier.trip.status) >= getTripStageRank('in_transit')) {
        requiredDocumentTypes.push(TransportDocumentType.DELIVERY_CONFIRMATION);
    }
    if (getTripStageRank(dossier.trip.status) >= getTripStageRank('completed')) {
        requiredDocumentTypes.push(TransportDocumentType.DOCUMENT_RETURN);
    }

    const missingDocumentTypes = requiredDocumentTypes.filter((type) => {
        if (type === TransportDocumentType.WAYBILL) return !waybillDocument || waybillDocument.status === TransportDocumentStatus.ERROR;
        if (type === TransportDocumentType.DELIVERY_CONFIRMATION) return !deliveryConfirmation;
        if (type === TransportDocumentType.DOCUMENT_RETURN) {
            return documentReturns.length === 0 || documentReturns.every((document) => document.status === TransportDocumentStatus.PENDING);
        }
        return false;
    });

    const hasBlockingProblems = problems.some((problem) => problem.severity === 'critical');
    const hasWarnings = problems.some((problem) => problem.severity === 'warning');

    let documentPhase: TransportDocumentLifecycle['documentPhase'] = 'planning';
    if (hasBlockingProblems) {
        documentPhase = 'blocked';
    } else if (dossier.trip.status === 'completed' || dossier.trip.status === 'billed') {
        documentPhase = missingDocumentTypes.length > 0 || hasWarnings ? 'closing' : 'closed';
    } else if (dossier.trip.status === 'in_transit' || dossier.trip.status === 'loading') {
        documentPhase = 'in_transit';
    } else if (waybillDocument?.status === TransportDocumentStatus.READY || waybillDocument?.status === TransportDocumentStatus.SENT) {
        documentPhase = 'preparation';
    }

    return {
        tripStatus: dossier.trip.status,
        waybillStatus: waybillRecord?.status ?? null,
        documentPhase,
        requiredDocumentTypes,
        missingDocumentTypes,
        hasBlockingProblems,
        hasWarnings,
        lastEventAt: summary.latestActivityAt ?? null,
        nextActionLabel: summary.nextAction,
    };
}

function buildLifecycleEvents(dossier: TripDossier, documents: TransportDocument[]) {
    const events: TransportDocumentTimelineEvent[] = [];
    const waybill = documents.find((document) => document.type === TransportDocumentType.WAYBILL);
    const deliveryConfirmation = documents.find((document) => document.type === TransportDocumentType.DELIVERY_CONFIRMATION);

    addTimelineEvent(events, {
        documentId: `trip:${dossier.trip.id}`,
        documentType: TransportDocumentType.WAYBILL,
        status: waybill?.status ?? TransportDocumentStatus.DRAFT,
        title: 'Trip created',
        at: ensureIso(dossier.trip.createdAt, new Date().toISOString()),
        severity: 'info',
        isProblem: false,
    });

    if (dossier.trip.vehicleId || dossier.trip.driverId) {
        addTimelineEvent(events, {
            documentId: `trip:${dossier.trip.id}`,
            documentType: TransportDocumentType.WAYBILL,
            status: waybill?.status ?? TransportDocumentStatus.DRAFT,
            title: 'Trip assigned',
            at: ensureIso(dossier.trip.updatedAt, new Date().toISOString()),
            severity: 'info',
            isProblem: false,
        });
    }

    if (waybill?.issuedAt) {
        addTimelineEvent(events, {
            documentId: waybill.id,
            documentType: waybill.type,
            status: waybill.status,
            title: 'Waybill issued',
            at: waybill.issuedAt,
            severity: 'info',
            isProblem: false,
        });
    }

    if (waybill?.sentAt || dossier.trip.actualDepartureAt) {
        addTimelineEvent(events, {
            documentId: waybill?.id ?? `trip:${dossier.trip.id}`,
            documentType: TransportDocumentType.WAYBILL,
            status: waybill?.status ?? TransportDocumentStatus.SENT,
            title: 'Trip departed',
            at: waybill?.sentAt ?? ensureIso(dossier.trip.actualDepartureAt, new Date().toISOString()),
            severity: 'info',
            isProblem: false,
        });
    }

    if (deliveryConfirmation) {
        addTimelineEvent(events, {
            documentId: deliveryConfirmation.id,
            documentType: deliveryConfirmation.type,
            status: deliveryConfirmation.status,
            title: 'Delivery confirmed',
            at: deliveryConfirmation.completedAt ?? deliveryConfirmation.updatedAt,
            severity: deliveryConfirmation.status === TransportDocumentStatus.CORRECTED ? 'warning' : 'info',
            isProblem: deliveryConfirmation.status === TransportDocumentStatus.CORRECTED,
            message: deliveryConfirmation.status === TransportDocumentStatus.CORRECTED
                ? 'Confirmation registered with dispatcher override'
                : undefined,
        });
    }

    if (dossier.trip.actualCompletionAt || waybill?.completedAt) {
        addTimelineEvent(events, {
            documentId: waybill?.id ?? `trip:${dossier.trip.id}`,
            documentType: TransportDocumentType.WAYBILL,
            status: waybill?.status ?? TransportDocumentStatus.COMPLETED,
            title: 'Trip completed',
            at: waybill?.completedAt ?? ensureIso(dossier.trip.actualCompletionAt, new Date().toISOString()),
            severity: 'info',
            isProblem: false,
        });
    }

    if (dossier.trip.originalDocumentsReceived) {
        addTimelineEvent(events, {
            documentId: `trip:${dossier.trip.id}`,
            documentType: TransportDocumentType.DOCUMENT_RETURN,
            status: TransportDocumentStatus.RECEIVED,
            title: 'Original documents received',
            at: ensureIso(dossier.trip.actualCompletionAt ?? dossier.trip.updatedAt, new Date().toISOString()),
            severity: 'info',
            isProblem: false,
        });
    }

    events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
    return events;
}

function buildProblems(dossier: TripDossier, documents: TransportDocument[]): TransportDocumentProblem[] {
    const problems: TransportDocumentProblem[] = [];
    const tripStage = getTripStageRank(dossier.trip.status);
    const tripUpdatedAt: string = toIso(dossier.trip.updatedAt) ?? new Date().toISOString();
    const tripCompletedAt: string = toIso(dossier.trip.actualCompletionAt) ?? tripUpdatedAt;
    const waybill = documents.find((document) => document.type === TransportDocumentType.WAYBILL);
    const confirmations = documents.filter((document) => document.type === TransportDocumentType.DELIVERY_CONFIRMATION);
    const returnDocs = documents.filter((document) => document.type === TransportDocumentType.DOCUMENT_RETURN);

    if (!waybill || waybill.status === TransportDocumentStatus.ERROR) {
        const problemAt: string = ensureIso(waybill?.updatedAt, tripUpdatedAt);
        problems.push({
            code: !waybill ? 'waybill_missing' : 'waybill_error',
            severity: 'critical',
            message: !waybill
                ? 'Waybill is missing for this trip'
                : waybill.error ?? 'Waybill is in an error state',
            documentId: waybill?.id,
            documentType: TransportDocumentType.WAYBILL,
            at: problemAt,
        });
    } else if (tripStage >= getTripStageRank('waybill_issued') && waybill.status === TransportDocumentStatus.DRAFT) {
        problems.push({
            code: 'waybill_not_issued',
            severity: 'critical',
            message: 'Trip has entered the waybill stage, but waybill is still draft',
            documentId: waybill.id,
            documentType: TransportDocumentType.WAYBILL,
            at: waybill.updatedAt,
        });
    }

    if (tripStage >= getTripStageRank('in_transit') && !waybill?.sentAt) {
        const problemAt: string = ensureIso(waybill?.updatedAt, tripUpdatedAt);
        problems.push({
            code: 'departure_not_recorded',
            severity: 'warning',
            message: 'Trip is in transit, but the waybill departure timestamp is missing',
            documentId: waybill?.id,
            documentType: TransportDocumentType.WAYBILL,
            at: problemAt,
        });
    }

    if (tripStage >= getTripStageRank('completed') && confirmations.length === 0) {
        problems.push({
            code: 'delivery_confirmation_missing',
            severity: 'critical',
            message: 'Trip is completed, but no delivery confirmation has been recorded',
            documentType: TransportDocumentType.DELIVERY_CONFIRMATION,
            at: tripCompletedAt,
        });
    }

    for (const confirmation of confirmations) {
        if (confirmation.status === TransportDocumentStatus.CORRECTED) {
            const problemAt: string = ensureIso(confirmation.updatedAt, tripUpdatedAt);
            problems.push({
                code: 'delivery_forced',
                severity: 'warning',
                message: 'Delivery confirmation was completed via dispatcher override',
                documentId: confirmation.id,
                documentType: TransportDocumentType.DELIVERY_CONFIRMATION,
                at: problemAt,
            });
        }
        if (confirmation.error) {
            const problemAt: string = ensureIso(confirmation.updatedAt, tripUpdatedAt);
            problems.push({
                code: 'delivery_error',
                severity: 'critical',
                message: confirmation.error,
                documentId: confirmation.id,
                documentType: TransportDocumentType.DELIVERY_CONFIRMATION,
                at: problemAt,
            });
        }
    }

    for (const documentReturn of returnDocs) {
        if (documentReturn.status === TransportDocumentStatus.OVERDUE) {
            const problemAt: string = ensureIso(documentReturn.updatedAt, tripUpdatedAt);
            problems.push({
                code: 'document_return_overdue',
                severity: 'warning',
                message: 'Original document return is overdue',
                documentId: documentReturn.id,
                documentType: TransportDocumentType.DOCUMENT_RETURN,
                at: problemAt,
            });
        }
    }

    for (const document of documents) {
        if (!document.exchange?.hasBlockingProblem) continue;

        const problemAt = document.exchange.lastReceiptAt
            ?? document.exchange.lastAttemptAt
            ?? document.updatedAt;
        problems.push({
            code: `exchange_blocking_${document.type}`,
            severity: 'critical',
            message: document.exchange.lastError
                ?? `${documentTypeLabel(document.type)} exchange has a blocking problem`,
            documentId: document.id,
            documentType: document.type,
            at: problemAt ?? tripUpdatedAt,
        });

        if (document.exchange.status === 'rejected' || document.exchange.status === 'failed') {
            problems.push({
                code: `exchange_retry_${document.type}`,
                severity: 'warning',
                message: `Retry is required for ${documentTypeLabel(document.type)} exchange`,
                documentId: document.id,
                documentType: document.type,
                at: problemAt ?? tripUpdatedAt,
            });
        }
    }

    return problems;
}

function buildSummary(dossier: TripDossier, documents: TransportDocument[], problems: TransportDocumentProblem[]) {
    const byType: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    let latestActivityAt: string | null = null;
    let completedDocuments = 0;
    let exchangeProblemCount = 0;
    let retryableDocumentCount = 0;

    for (const document of documents) {
        byType[document.type] = (byType[document.type] ?? 0) + 1;
        byStatus[document.status] = (byStatus[document.status] ?? 0) + 1;
        if (COMPLETED_DOCUMENT_STATUSES.has(document.status)) {
            completedDocuments += 1;
        }
        if (document.exchange?.hasBlockingProblem) {
            exchangeProblemCount += 1;
        }
        if (document.exchange?.status === 'rejected' || document.exchange?.status === 'failed') {
            retryableDocumentCount += 1;
        }

        const times = [document.createdAt, document.updatedAt, document.issuedAt, document.sentAt, document.acceptedAt, document.completedAt]
            .filter(Boolean)
            .map((value) => new Date(value as string).getTime())
            .filter((value) => !Number.isNaN(value));

        if (times.length > 0) {
            const currentLatest = new Date(Math.max(...times)).toISOString();
            if (!latestActivityAt || currentLatest > latestActivityAt) {
                latestActivityAt = currentLatest;
            }
        }
    }

    const problemCount = problems.length;
    const criticalProblemCount = problems.filter((problem) => problem.severity === 'critical').length;
    const warningProblemCount = problems.filter((problem) => problem.severity === 'warning').length;
    const activeDocuments = Math.max(0, documents.length - completedDocuments);

    let nextAction = 'monitor';
    const waybill = documents.find((document) => document.type === TransportDocumentType.WAYBILL);
    const deliveryConfirmation = documents.find((document) => document.type === TransportDocumentType.DELIVERY_CONFIRMATION);
    const overdueReturn = documents.find(
        (document) => document.type === TransportDocumentType.DOCUMENT_RETURN && document.status === TransportDocumentStatus.OVERDUE,
    );
    const exchangeFailure = documents.find((document) => document.exchange?.hasBlockingProblem);
    const exchangeAwaitingReceipt = documents.find((document) => document.exchange?.status === 'sent' || document.exchange?.status === 'acknowledged');

    if (exchangeFailure) {
        nextAction = 'retry_exchange';
    } else if (exchangeAwaitingReceipt) {
        nextAction = 'await_provider_receipt';
    } else if (!waybill || waybill.status === TransportDocumentStatus.ERROR || waybill.status === TransportDocumentStatus.DRAFT) {
        nextAction = 'issue_waybill';
    } else if (dossier.trip.status === 'in_transit' && !deliveryConfirmation) {
        nextAction = 'capture_delivery_confirmation';
    } else if (overdueReturn) {
        nextAction = 'resolve_document_return';
    } else if (dossier.trip.status === 'completed' && problemCount === 0) {
        nextAction = 'close_dossier';
    }

    return {
        tripId: dossier.trip.id,
        totalDocuments: documents.length,
        completedDocuments,
        activeDocuments,
        problemCount,
        criticalProblemCount,
        warningProblemCount,
        exchangeProblemCount,
        retryableDocumentCount,
        byType,
        byStatus,
        latestActivityAt,
        nextAction,
    };
}

function makeEtrnTitleId(tripId: string, titleType: EtrnTitleType) {
    return `etrn:title:${tripId}:${titleType}`;
}

function makeEtrnWorkflowId(tripId: string) {
    return `etrn:workflow:${tripId}`;
}

function addEtrnTimelineEvent(
    events: EtrnTimelineEvent[],
    params: Omit<EtrnTimelineEvent, 'id'> & { id?: string },
) {
    events.push({
        id: params.id ?? `etrn:${params.titleType}:${params.status}:${params.at}`,
        ...params,
    });
}

function getEtrnTitleStatus(
    dossier: TripDossier,
    waybill: TripDossier['waybill'],
    deliveryRow: typeof deliveryConfirmations.$inferSelect | undefined,
    returnRow: typeof documentReturns.$inferSelect | undefined,
    titleType: EtrnTitleType,
): Omit<EtrnTitle, 'id' | 'titleType' | 'titleNumber' | 'titleLabel' | 'tripId' | 'waybillId' | 'externalId' | 'createdAt' | 'updatedAt'> & {
    createdAt: string;
    updatedAt: string;
    documentId: string | null;
    documentType: TransportDocumentType | null;
    error: string | null;
} {
    const trip = dossier.trip;
    const tripStage = getTripStageRank(trip.status);
    const hasWaybill = Boolean(waybill);
    const completedAtFallback = ensureIso(trip.actualCompletionAt ?? trip.updatedAt, new Date().toISOString());
    const waybillDocumentId = waybill ? makeKey(TransportDocumentType.WAYBILL, `trip:${trip.id}`) : null;
    const deliveryDocumentId = deliveryRow ? makeKey(TransportDocumentType.DELIVERY_CONFIRMATION, `trip:${trip.id}:delivery:${deliveryRow.id}`) : null;
    const returnDocumentId = returnRow ? makeKey(TransportDocumentType.DOCUMENT_RETURN, `trip:${trip.id}:return:${returnRow.docType}`) : null;

    switch (titleType) {
        case EtrnTitleType.TITLE_01: {
            if (!hasWaybill) {
                return {
                    status: tripStage >= getTripStageRank('waybill_issued') ? EtrnTitleStatus.BLOCKED : EtrnTitleStatus.DRAFT,
                    isRequired: true,
                    isApplicable: true,
                    documentId: null,
                    documentType: null,
                    error: tripStage >= getTripStageRank('waybill_issued')
                        ? 'Waybill has not been issued yet'
                        : null,
                    issuedAt: null,
                    sentAt: null,
                    acceptedAt: null,
                    rejectedAt: null,
                    completedAt: null,
                    metadata: {
                        tripStatus: trip.status,
                        missingWaybill: true,
                    },
                    createdAt: ensureIso(trip.createdAt, completedAtFallback),
                    updatedAt: ensureIso(trip.updatedAt, completedAtFallback),
                    history: [],
                };
            }

            const status = waybill?.status === 'closed'
                ? EtrnTitleStatus.COMPLETED
                : waybill?.departureAt || tripStage >= getTripStageRank('in_transit')
                    ? EtrnTitleStatus.SENT
                    : waybill?.issuedAt
                        ? EtrnTitleStatus.READY
                        : EtrnTitleStatus.DRAFT;

            const issuedAt = toIso(waybill.issuedAt) ?? toIso(trip.createdAt);
            const sentAt = toIso(waybill.departureAt);
            const completedAt = toIso(waybill.closedAt) ?? toIso(trip.actualCompletionAt);

            return {
                status,
                isRequired: true,
                isApplicable: true,
                documentId: waybillDocumentId,
                documentType: TransportDocumentType.WAYBILL,
                error: null,
                issuedAt,
                sentAt,
                acceptedAt: status === EtrnTitleStatus.COMPLETED ? completedAt : null,
                rejectedAt: null,
                completedAt: status === EtrnTitleStatus.COMPLETED ? completedAt ?? completedAtFallback : null,
                metadata: {
                    waybillNumber: waybill.number,
                    tripStatus: trip.status,
                    transportServiceType: waybill.transportServiceType ?? null,
                    transportMode: waybill.transportMode ?? null,
                },
                history: [],
                createdAt: ensureIso(waybill.issuedAt ?? trip.createdAt, completedAtFallback),
                updatedAt: ensureIso(waybill.closedAt ?? waybill.departureAt ?? waybill.issuedAt ?? trip.updatedAt, completedAtFallback),
            };
        }
        case EtrnTitleType.TITLE_02: {
            if (!hasWaybill) {
                return {
                    status: tripStage >= getTripStageRank('waybill_issued') ? EtrnTitleStatus.BLOCKED : EtrnTitleStatus.MISSING,
                    isRequired: true,
                    isApplicable: true,
                    documentId: null,
                    documentType: null,
                    error: 'Carrier acceptance cannot be formed without a waybill',
                    issuedAt: null,
                    sentAt: null,
                    acceptedAt: null,
                    rejectedAt: null,
                    completedAt: null,
                    metadata: {
                        tripStatus: trip.status,
                        missingWaybill: true,
                    },
                    createdAt: ensureIso(trip.createdAt, completedAtFallback),
                    updatedAt: ensureIso(trip.updatedAt, completedAtFallback),
                    history: [],
                };
            }

            const status = waybill?.status === 'closed'
                ? EtrnTitleStatus.COMPLETED
                : waybill?.departureAt || tripStage >= getTripStageRank('in_transit')
                    ? EtrnTitleStatus.ACCEPTED
                    : waybill?.issuedAt
                        ? EtrnTitleStatus.READY
                        : EtrnTitleStatus.DRAFT;

            return {
                status,
                isRequired: true,
                isApplicable: true,
                documentId: waybillDocumentId,
                documentType: TransportDocumentType.WAYBILL,
                error: null,
                issuedAt: toIso(waybill.issuedAt),
                sentAt: toIso(waybill.departureAt),
                acceptedAt: status === EtrnTitleStatus.ACCEPTED || status === EtrnTitleStatus.COMPLETED
                    ? toIso(waybill.departureAt ?? waybill.closedAt)
                    : null,
                rejectedAt: null,
                completedAt: status === EtrnTitleStatus.COMPLETED ? toIso(waybill.closedAt) ?? completedAtFallback : null,
                metadata: {
                    waybillNumber: waybill.number,
                    tripStatus: trip.status,
                    departureAt: toIso(waybill.departureAt),
                },
                history: [],
                createdAt: ensureIso(waybill.issuedAt ?? trip.createdAt, completedAtFallback),
                updatedAt: ensureIso(waybill.closedAt ?? waybill.departureAt ?? waybill.issuedAt ?? trip.updatedAt, completedAtFallback),
                };
        }
        case EtrnTitleType.TITLE_03:
        case EtrnTitleType.TITLE_04:
            return {
                status: EtrnTitleStatus.NOT_APPLICABLE,
                isRequired: false,
                isApplicable: false,
                documentId: null,
                documentType: null,
                error: null,
                issuedAt: null,
                sentAt: null,
                acceptedAt: null,
                rejectedAt: null,
                completedAt: null,
                metadata: {
                    reason: 'Unsupported by current runtime foundation',
                    tripStatus: trip.status,
                },
                history: [],
                createdAt: ensureIso(trip.createdAt, completedAtFallback),
                updatedAt: ensureIso(trip.updatedAt, completedAtFallback),
                };
        case EtrnTitleType.TITLE_05: {
            if (!deliveryRow) {
                const blocked = tripStage >= getTripStageRank('completed');
                return {
                    status: blocked ? EtrnTitleStatus.BLOCKED : EtrnTitleStatus.DRAFT,
                    isRequired: true,
                    isApplicable: true,
                    documentId: null,
                    documentType: null,
                    error: blocked ? 'Delivery confirmation is missing after trip completion' : null,
                    issuedAt: null,
                    sentAt: null,
                    acceptedAt: null,
                    rejectedAt: null,
                    completedAt: null,
                    metadata: {
                        tripStatus: trip.status,
                        missingDeliveryConfirmation: true,
                    },
                    createdAt: ensureIso(trip.createdAt, completedAtFallback),
                    updatedAt: ensureIso(trip.updatedAt, completedAtFallback),
                    history: [],
                };
            }

            const status = deliveryRow.forcedByDispatcher
                ? EtrnTitleStatus.CORRECTED
                : EtrnTitleStatus.COMPLETED;
            const confirmedAt = ensureIso(deliveryRow.confirmedAt, completedAtFallback);

            return {
                status,
                isRequired: true,
                isApplicable: true,
                documentId: deliveryDocumentId,
                documentType: TransportDocumentType.DELIVERY_CONFIRMATION,
                error: deliveryRow.forcedByDispatcher
                    ? 'Delivery confirmation was registered with dispatcher override'
                    : null,
                issuedAt: null,
                sentAt: null,
                acceptedAt: confirmedAt,
                rejectedAt: null,
                completedAt: confirmedAt,
                metadata: {
                    recipientName: deliveryRow.recipientName,
                    recipientPosition: deliveryRow.recipientPosition ?? null,
                    recipientDocument: deliveryRow.recipientDocument ?? null,
                    cargoCondition: deliveryRow.cargoCondition,
                    sealNumbers: deliveryRow.sealNumbers ?? [],
                    packagingCondition: deliveryRow.packagingCondition ?? null,
                    notes: deliveryRow.notes ?? null,
                    forcedByDispatcher: deliveryRow.forcedByDispatcher,
                    forcedReason: deliveryRow.forcedReason ?? null,
                },
                history: [],
                createdAt: confirmedAt,
                updatedAt: confirmedAt,
            };
        }
        case EtrnTitleType.TITLE_06: {
            if (!hasWaybill) {
                return {
                    status: tripStage >= getTripStageRank('waybill_issued') ? EtrnTitleStatus.BLOCKED : EtrnTitleStatus.MISSING,
                    isRequired: true,
                    isApplicable: true,
                    documentId: null,
                    documentType: null,
                    error: 'Carrier delivery cannot be formed without a waybill',
                    issuedAt: null,
                    sentAt: null,
                    acceptedAt: null,
                    rejectedAt: null,
                    completedAt: null,
                    metadata: {
                        tripStatus: trip.status,
                        missingWaybill: true,
                    },
                    createdAt: ensureIso(trip.createdAt, completedAtFallback),
                    updatedAt: ensureIso(trip.updatedAt, completedAtFallback),
                    history: [],
                };
            }

            const sentAt = toIso(waybill.departureAt) ?? (trip.status === 'in_transit' ? ensureIso(trip.actualDepartureAt ?? trip.updatedAt, completedAtFallback) : null);
            const completedAt = toIso(waybill.closedAt ?? trip.actualCompletionAt);
            const status = completedAt
                ? EtrnTitleStatus.COMPLETED
                : sentAt
                    ? EtrnTitleStatus.ACCEPTED
                    : waybill.issuedAt
                        ? EtrnTitleStatus.READY
                        : EtrnTitleStatus.DRAFT;

            return {
                status,
                isRequired: true,
                isApplicable: true,
                documentId: waybillDocumentId,
                documentType: TransportDocumentType.WAYBILL,
                error: status === EtrnTitleStatus.DRAFT && tripStage >= getTripStageRank('in_transit')
                    ? 'Carrier delivery is pending while the trip is already in transit'
                    : null,
                issuedAt: toIso(waybill.issuedAt),
                sentAt,
                acceptedAt: status === EtrnTitleStatus.ACCEPTED || status === EtrnTitleStatus.COMPLETED ? sentAt : null,
                rejectedAt: null,
                completedAt,
                metadata: {
                    waybillNumber: waybill.number,
                    tripStatus: trip.status,
                    departureAt: toIso(waybill.departureAt),
                    tripCompletionAt: toIso(trip.actualCompletionAt),
                },
                history: [],
                createdAt: ensureIso(waybill.issuedAt ?? trip.createdAt, completedAtFallback),
                updatedAt: ensureIso(waybill.closedAt ?? waybill.departureAt ?? waybill.issuedAt ?? trip.updatedAt, completedAtFallback),
            };
        }
        case EtrnTitleType.TITLE_07: {
            const status = returnRow
                ? (returnRow.status === 'received'
                    ? EtrnTitleStatus.COMPLETED
                    : returnRow.status === 'overdue'
                        ? EtrnTitleStatus.BLOCKED
                        : EtrnTitleStatus.READY)
                : (trip.status === 'completed' || trip.status === 'billed'
                    ? EtrnTitleStatus.READY
                    : EtrnTitleStatus.NOT_APPLICABLE);

            return {
                status,
                isRequired: false,
                isApplicable: status !== EtrnTitleStatus.NOT_APPLICABLE,
                documentId: returnDocumentId,
                documentType: returnRow ? TransportDocumentType.DOCUMENT_RETURN : null,
                error: status === EtrnTitleStatus.BLOCKED
                    ? 'Original document return is overdue'
                    : null,
                issuedAt: null,
                sentAt: null,
                acceptedAt: returnRow?.status === 'received' ? ensureIso(returnRow.updatedAt ?? returnRow.createdAt, completedAtFallback) : null,
                rejectedAt: null,
                completedAt: returnRow?.status === 'received' ? ensureIso(returnRow.receivedAt ?? returnRow.updatedAt, completedAtFallback) : null,
                metadata: {
                    documentReturnStatus: returnRow?.status ?? null,
                    notes: returnRow?.notes ?? null,
                    tripStatus: trip.status,
                },
                history: [],
                createdAt: ensureIso(returnRow?.createdAt ?? trip.updatedAt, completedAtFallback),
                updatedAt: ensureIso(returnRow?.updatedAt ?? trip.updatedAt, completedAtFallback),
            };
        }
        case EtrnTitleType.TITLE_08: {
            const status = trip.originalDocumentsReceived
                ? EtrnTitleStatus.COMPLETED
                : trip.status === 'completed' || trip.status === 'billed'
                    ? EtrnTitleStatus.READY
                    : EtrnTitleStatus.NOT_APPLICABLE;

            return {
                status,
                isRequired: false,
                isApplicable: status !== EtrnTitleStatus.NOT_APPLICABLE,
                documentId: waybillDocumentId,
                documentType: waybill ? TransportDocumentType.WAYBILL : null,
                error: status === EtrnTitleStatus.READY && !trip.originalDocumentsReceived
                    ? 'Original documents receipt is pending'
                    : null,
                issuedAt: null,
                sentAt: null,
                acceptedAt: trip.originalDocumentsReceived ? ensureIso(trip.actualCompletionAt ?? trip.updatedAt, completedAtFallback) : null,
                rejectedAt: null,
                completedAt: trip.originalDocumentsReceived ? ensureIso(trip.actualCompletionAt ?? trip.updatedAt, completedAtFallback) : null,
                metadata: {
                    tripStatus: trip.status,
                    originalDocumentsReceived: Boolean(trip.originalDocumentsReceived),
                },
                history: [],
                createdAt: ensureIso(trip.actualCompletionAt ?? trip.updatedAt, completedAtFallback),
                updatedAt: ensureIso(trip.actualCompletionAt ?? trip.updatedAt, completedAtFallback),
            };
        }
        default:
            return {
                status: EtrnTitleStatus.MISSING,
                isRequired: false,
                isApplicable: false,
                documentId: null,
                documentType: null,
                error: null,
                issuedAt: null,
                sentAt: null,
                acceptedAt: null,
                rejectedAt: null,
                completedAt: null,
                metadata: {
                    reason: 'Unknown title type',
                },
                history: [],
                createdAt: ensureIso(trip.createdAt, completedAtFallback),
                updatedAt: ensureIso(trip.updatedAt, completedAtFallback),
            };
    }
}

function buildEtrnTitles(
    dossier: TripDossier,
    deliveryRows: Array<typeof deliveryConfirmations.$inferSelect>,
    returnRows: Array<typeof documentReturns.$inferSelect>,
): EtrnTitle[] {
    const waybill = dossier.waybill;
    const latestDeliveryRow = [...deliveryRows].sort((a, b) => {
        const left = new Date((a.confirmedAt ?? new Date()) as Date | string).getTime();
        const right = new Date((b.confirmedAt ?? new Date()) as Date | string).getTime();
        return right - left;
    })[0];
    const latestReturnRow = [...returnRows].sort((a, b) => {
        const left = new Date((a.receivedAt ?? a.updatedAt ?? a.createdAt) as Date | string).getTime();
        const right = new Date((b.receivedAt ?? b.updatedAt ?? b.createdAt) as Date | string).getTime();
        return right - left;
    })[0];

    return ETRN_TITLE_ORDER.map((titleType) => {
        const derived = getEtrnTitleStatus(dossier, waybill, latestDeliveryRow, latestReturnRow, titleType);
        const titleNumber = ETRN_TITLE_NUMBERS[titleType];
        const titleId = makeEtrnTitleId(dossier.trip.id, titleType);
        const externalId = `ETRN-${dossier.trip.number}-${titleNumber}`;

        return {
            id: titleId,
            titleType,
            titleNumber,
            titleLabel: ETRN_TITLE_LABELS[titleType],
            tripId: dossier.trip.id,
            waybillId: dossier.waybill?.id ?? null,
            externalId,
            ...derived,
        };
    });
}

function buildEtrnTimeline(titles: EtrnTitle[]): EtrnTimelineEvent[] {
    const events: EtrnTimelineEvent[] = [];

    for (const title of titles) {
        addEtrnTimelineEvent(events, {
            titleType: title.titleType,
            status: title.status,
            title: `${title.titleLabel} snapshot`,
            at: title.createdAt,
            severity: title.status === EtrnTitleStatus.BLOCKED || title.status === EtrnTitleStatus.REJECTED ? 'critical' : 'info',
            isProblem: title.status === EtrnTitleStatus.BLOCKED || title.status === EtrnTitleStatus.REJECTED,
            message: title.error ?? undefined,
        });

        if (title.issuedAt) {
            addEtrnTimelineEvent(events, {
                titleType: title.titleType,
                status: title.status,
                title: `${title.titleLabel} issued`,
                at: title.issuedAt,
                severity: 'info',
                isProblem: false,
            });
        }

        if (title.sentAt) {
            addEtrnTimelineEvent(events, {
                titleType: title.titleType,
                status: title.status,
                title: `${title.titleLabel} sent`,
                at: title.sentAt,
                severity: 'info',
                isProblem: false,
            });
        }

        if (title.acceptedAt) {
            addEtrnTimelineEvent(events, {
                titleType: title.titleType,
                status: title.status,
                title: `${title.titleLabel} accepted`,
                at: title.acceptedAt,
                severity: title.status === EtrnTitleStatus.CORRECTED ? 'warning' : 'info',
                isProblem: title.status === EtrnTitleStatus.CORRECTED,
                message: title.status === EtrnTitleStatus.CORRECTED
                    ? 'Snapshot reflects dispatcher override'
                    : undefined,
            });
        }

        if (title.rejectedAt) {
            addEtrnTimelineEvent(events, {
                titleType: title.titleType,
                status: title.status,
                title: `${title.titleLabel} rejected`,
                at: title.rejectedAt,
                severity: 'critical',
                isProblem: true,
                message: title.error ?? 'Title was rejected',
            });
        }

        if (title.completedAt) {
            addEtrnTimelineEvent(events, {
                titleType: title.titleType,
                status: title.status,
                title: `${title.titleLabel} completed`,
                at: title.completedAt,
                severity: 'info',
                isProblem: false,
            });
        }
    }

    events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
    return events;
}

function buildEtrnProblems(titles: EtrnTitle[], baseProblems: TransportDocumentProblem[]): TransportDocumentProblem[] {
    const problems = [...baseProblems];

    for (const title of titles) {
        if (title.status === EtrnTitleStatus.BLOCKED || title.status === EtrnTitleStatus.MISSING) {
            problems.push({
                code: `etrn_${title.titleType}_missing`,
                severity: 'critical',
                message: title.error ?? `${title.titleLabel} is not ready`,
                documentId: title.documentId ?? undefined,
                documentType: title.documentType ?? undefined,
                at: title.updatedAt,
            });
        }

        if (title.status === EtrnTitleStatus.CORRECTED) {
            problems.push({
                code: `etrn_${title.titleType}_corrected`,
                severity: 'warning',
                message: `${title.titleLabel} was registered with correction`,
                documentId: title.documentId ?? undefined,
                documentType: title.documentType ?? undefined,
                at: title.updatedAt,
            });
        }
    }

    return problems.sort((a, b) => new Date(a.at ?? '').getTime() - new Date(b.at ?? '').getTime());
}

function buildEtrnSummary(
    dossier: TripDossier,
    titles: EtrnTitle[],
    problems: TransportDocumentProblem[],
    timeline: EtrnTimelineEvent[],
): EtrnWorkflowSummary {
    const completedTitles = titles.filter((title) =>
        title.status === EtrnTitleStatus.COMPLETED
        || title.status === EtrnTitleStatus.ACCEPTED
        || title.status === EtrnTitleStatus.CORRECTED,
    ).length;
    const activeTitles = titles.filter((title) =>
        title.status !== EtrnTitleStatus.COMPLETED
        && title.status !== EtrnTitleStatus.NOT_APPLICABLE,
    ).length;
    const blockedTitles = titles.filter((title) => title.status === EtrnTitleStatus.BLOCKED).length;
    const missingTitles = titles.filter((title) => title.status === EtrnTitleStatus.MISSING).length;
    const requiredTitles = titles.filter((title) => title.isRequired).length;
    const latestActivityAt = timeline.length > 0 ? timeline[timeline.length - 1].at : null;
    const criticalProblemCount = problems.filter((problem) => problem.severity === 'critical').length;
    const warningProblemCount = problems.filter((problem) => problem.severity === 'warning').length;
    const problemCount = problems.length;
    const byStatus: Record<string, number> = {};
    const byType: Record<string, number> = {};
    const blockingTitleTypes: EtrnTitleType[] = [];
    const incompleteTitleTypes: EtrnTitleType[] = [];

    for (const title of titles) {
        byStatus[title.status] = (byStatus[title.status] ?? 0) + 1;
        byType[title.titleType] = (byType[title.titleType] ?? 0) + 1;
        if (title.status === EtrnTitleStatus.BLOCKED || title.status === EtrnTitleStatus.MISSING) {
            blockingTitleTypes.push(title.titleType);
        }
        if (
            title.status !== EtrnTitleStatus.COMPLETED
            && title.status !== EtrnTitleStatus.NOT_APPLICABLE
        ) {
            incompleteTitleTypes.push(title.titleType);
        }
    }

    let nextAction = 'monitor_etrn';
    const title01 = titles.find((title) => title.titleType === EtrnTitleType.TITLE_01);
    const title02 = titles.find((title) => title.titleType === EtrnTitleType.TITLE_02);
    const title05 = titles.find((title) => title.titleType === EtrnTitleType.TITLE_05);
    const title06 = titles.find((title) => title.titleType === EtrnTitleType.TITLE_06);
    const title08 = titles.find((title) => title.titleType === EtrnTitleType.TITLE_08);

    if (!title01 || title01.status === EtrnTitleStatus.MISSING || title01.status === EtrnTitleStatus.BLOCKED) {
        nextAction = 'prepare_etrn_title_01';
    } else if (!title02 || title02.status === EtrnTitleStatus.MISSING || title02.status === EtrnTitleStatus.BLOCKED) {
        nextAction = 'prepare_etrn_title_02';
    } else if ((title05?.status === EtrnTitleStatus.BLOCKED || title06?.status === EtrnTitleStatus.BLOCKED) && dossier.trip.status === 'completed') {
        nextAction = 'capture_delivery_confirmation';
    } else if (title08?.status === EtrnTitleStatus.READY && !dossier.trip.originalDocumentsReceived) {
        nextAction = 'receive_original_documents';
    } else if (dossier.trip.status === 'completed' && problemCount === 0) {
        nextAction = 'close_etrn';
    }

    return {
        totalTitles: titles.length,
        requiredTitles,
        completedTitles,
        activeTitles,
        blockedTitles,
        missingTitles,
        problemCount,
        criticalProblemCount,
        warningProblemCount,
        byStatus,
        byType,
        blockingTitleTypes,
        incompleteTitleTypes,
        latestActivityAt,
        nextAction,
    };
}

function buildEtrnWorkflow(
    dossier: TripDossier,
    deliveryRows: Array<typeof deliveryConfirmations.$inferSelect>,
    returnRows: Array<typeof documentReturns.$inferSelect>,
    baseProblems: TransportDocumentProblem[],
    baseSummary: ReturnType<typeof buildSummary>,
): EtrnWorkflow {
    const titles = buildEtrnTitles(dossier, deliveryRows, returnRows);
    const timeline = buildEtrnTimeline(titles);
    const titlesWithHistory = titles.map((title) => ({
        ...title,
        history: timeline.filter((event) => event.titleType === title.titleType),
    }));
    const problems = buildEtrnProblems(titles, baseProblems);
    const summary = buildEtrnSummary(dossier, titles, problems, timeline);
    const status: EtrnWorkflowStatus = problems.some((problem) => problem.severity === 'critical')
        ? EtrnWorkflowStatus.BLOCKED
        : titles.every((title) =>
            title.status === EtrnTitleStatus.COMPLETED
            || title.status === EtrnTitleStatus.NOT_APPLICABLE,
        )
            ? EtrnWorkflowStatus.COMPLETE
            : titles.some((title) =>
                title.status === EtrnTitleStatus.READY
                || title.status === EtrnTitleStatus.SENT
                || title.status === EtrnTitleStatus.ACCEPTED
                || title.status === EtrnTitleStatus.CORRECTED,
            )
                ? EtrnWorkflowStatus.IN_PROGRESS
                : titles.some((title) => title.status === EtrnTitleStatus.DRAFT || title.status === EtrnTitleStatus.MISSING)
                    ? EtrnWorkflowStatus.PARTIAL
                    : EtrnWorkflowStatus.DRAFT;

    const snapshotId = buildFingerprint({
        tripId: dossier.trip.id,
        waybillId: dossier.waybill?.id ?? null,
        titles: titles.map((title) => ({
            id: title.id,
            status: title.status,
            updatedAt: title.updatedAt,
            error: title.error ?? null,
        })),
        problems: problems.map((problem) => ({
            code: problem.code,
            severity: problem.severity,
            at: problem.at ?? null,
            documentId: problem.documentId ?? null,
        })),
        timeline: timeline.map((event) => ({
            id: event.id,
            titleType: event.titleType,
            status: event.status,
            at: event.at,
            severity: event.severity,
        })),
        lifecycle: {
            tripStatus: dossier.trip.status,
            waybillStatus: dossier.waybill?.status ?? null,
            documentPhase: status,
            transportProblemCount: baseSummary.problemCount,
        },
    });

    const generatedAt = new Date().toISOString();

    return {
        tripId: dossier.trip.id,
        waybillId: dossier.waybill?.id ?? null,
        snapshotId,
        generatedAt,
        status,
        titles: titlesWithHistory,
        timeline,
        history: timeline,
        problems,
        summary,
    };
}

export function buildTransportDocumentBundleFromDocuments(
    dossier: TripDossier,
    documents: TransportDocument[],
    deliveryRows: Array<typeof deliveryConfirmations.$inferSelect>,
    returnRows: Array<typeof documentReturns.$inferSelect>,
): TransportDocumentBundle {
    const generatedAt = new Date().toISOString();
    const sortedDocuments = [...documents].sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());
    const documentTimeline = buildDocumentTimeline(sortedDocuments);
    const problems = buildProblems(dossier, sortedDocuments);
    const summary = buildSummary(dossier, sortedDocuments, problems);
    const lifecycle = buildLifecycle(dossier, sortedDocuments, problems, summary);
    const lifecycleTimeline = buildLifecycleEvents(dossier, sortedDocuments);
    const timeline = [...lifecycleTimeline, ...documentTimeline].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
    const etrn = buildEtrnWorkflow(dossier, deliveryRows, returnRows, problems, summary);
    const { orderIds } = baseContext(dossier);
    const snapshotId = buildFingerprint({
        tripId: dossier.trip.id,
        waybillId: dossier.waybill?.id ?? null,
        orderIds,
        documents: sortedDocuments.map((document) => ({
            id: document.id,
            fingerprint: document.fingerprint,
            status: document.status,
            updatedAt: document.updatedAt,
            retryCount: document.retryCount ?? 0,
            sourceStatus: document.sourceStatus ?? document.status,
        })),
        problems: problems.map((problem) => ({
            code: problem.code,
            severity: problem.severity,
            at: problem.at ?? null,
            documentId: problem.documentId ?? null,
        })),
        timeline: timeline.map((event) => ({
            id: event.id,
            documentId: event.documentId,
            status: event.status,
            at: event.at,
            severity: event.severity,
        })),
        lifecycle: {
            tripStatus: lifecycle.tripStatus,
            waybillStatus: lifecycle.waybillStatus ?? null,
            documentPhase: lifecycle.documentPhase,
            missingDocumentTypes: lifecycle.missingDocumentTypes,
        },
    });

    return {
        tripId: dossier.trip.id,
        waybillId: dossier.waybill?.id ?? null,
        orderIds,
        snapshotId,
        generatedAt,
        documents: sortedDocuments,
        timeline,
        problems,
        summary,
        lifecycle,
        etrn,
    };
}

export function buildTransportDocumentBundle(
    dossier: TripDossier,
    deliveryRows: Array<typeof deliveryConfirmations.$inferSelect>,
    returnRows: Array<typeof documentReturns.$inferSelect>,
): TransportDocumentBundle {
    const documents: TransportDocument[] = [
        buildWaybillDocument(dossier),
        ...deliveryRows.map((row) => buildDeliveryConfirmationDocument(dossier, row)),
        ...returnRows.map((row) => buildDocumentReturnDocument(dossier, row)),
    ];

    return buildTransportDocumentBundleFromDocuments(dossier, documents, deliveryRows, returnRows);
}

export async function getTransportDocumentsForDossier(dossier: TripDossier): Promise<TransportDocumentBundle> {
    const [deliveryRows, returnRows] = await Promise.all([
        db.select().from(deliveryConfirmations).where(eq(deliveryConfirmations.tripId, dossier.trip.id)),
        db.select().from(documentReturns).where(eq(documentReturns.tripId, dossier.trip.id)),
    ]);
    return buildTransportDocumentBundle(dossier, deliveryRows, returnRows);
}

export async function getTransportDocumentsForTrip(tripId: string): Promise<TransportDocumentListResponse | null> {
    const dossier = await getTransportDossier(tripId);
    if (!dossier) return null;
    return getTransportDocumentsForDossier(dossier);
}

export async function getTransportDocumentById(tripId: string, documentId: string): Promise<TransportDocument | null> {
    const bundle = await getTransportDocumentsForTrip(tripId);
    if (!bundle) return null;
    return bundle.documents.find((document: TransportDocument) => document.id === documentId) ?? null;
}
