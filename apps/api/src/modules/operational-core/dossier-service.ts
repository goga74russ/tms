import { and, eq } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import { documentDossierItems } from '../../db/schema.js';

type TransportDoc = {
    id: string;
    artifactKind?: string | null;
    documentType?: string | null;
    titleType?: string | null;
    status: string;
    sourceStatus?: string | null;
    providerName?: string | null;
    providerStatus?: string | null;
    error?: string | null;
    metadata?: Record<string, unknown> | null;
};

type DossierItem = typeof documentDossierItems.$inferSelect;
type DossierItemStatus = DossierItem['status'];

type DossierCloseGateSeverity = 'blocking' | 'warning';

type DossierCloseGateItem = {
    id: string;
    documentType: string;
    status: DossierItemStatus;
    required: boolean;
    sourceDocumentId: string | null;
    sourceDocumentKind: string | null;
    blockedReason: string | null;
    dueAt: Date | null;
    completedAt: Date | null;
    metadata: Record<string, unknown>;
    severity: DossierCloseGateSeverity;
    reason: string;
};

type DossierDocumentQueueItem = {
    id: string;
    documentType: string;
    status: DossierItemStatus;
    bucket: 'missing' | 'overdue' | 'exceptioned';
    severity: DossierCloseGateSeverity;
    dueAt: Date | null;
    responsibleRole: 'dispatcher' | 'driver' | 'accounting';
    action: string;
    printUrl: string | null;
    printLabel: string | null;
    reason: string;
};

export type DossierCloseGate = {
    tripId: string;
    canClose: boolean;
    generatedAt: string;
    blockingItems: DossierCloseGateItem[];
    warningItems: DossierCloseGateItem[];
    documentQueue: DossierDocumentQueueItem[];
    etrn: {
        required: boolean;
        present: boolean;
        missing: boolean;
        exceptioned: boolean;
        paperException: boolean;
    };
    summary: {
        totalItems: number;
        requiredItems: number;
        completedItems: number;
        exceptionedItems: number;
        blockingItems: number;
        warningItems: number;
    };
};

const COMPLETED_DOSSIER_STATUSES = new Set<DossierItemStatus>(['signed', 'received', 'accepted']);
const BLOCKING_DOSSIER_STATUSES = new Set<DossierItemStatus>(['missing', 'rejected']);
const WARNING_DOSSIER_STATUSES = new Set<DossierItemStatus>(['draft', 'sent', 'exceptioned']);

function mapTransportDocumentType(doc: TransportDoc): string {
    const raw = (doc.documentType || doc.titleType || doc.artifactKind || '').toLowerCase();
    if (raw.includes('waybill')) return 'waybill';
    if (raw.includes('etrn') || raw.includes('transport')) return 'etrn';
    if (raw.includes('ttn')) return 'ttn';
    if (raw.includes('upd')) return 'upd';
    if (raw.includes('act')) return 'act';
    return raw || 'transport_document';
}

function mapDossierStatus(status: string): 'missing' | 'draft' | 'sent' | 'signed' | 'received' | 'accepted' | 'rejected' | 'exceptioned' {
    const normalized = status.toLowerCase();
    if (['accepted', 'completed', 'closed', 'corrected'].includes(normalized)) return 'accepted';
    if (['received', 'delivered'].includes(normalized)) return 'received';
    if (['signed'].includes(normalized)) return 'signed';
    if (['sent', 'acknowledged', 'queued', 'pending'].includes(normalized)) return 'sent';
    if (['rejected', 'failed', 'error'].includes(normalized)) return 'rejected';
    if (['draft', 'generated', 'ready'].includes(normalized)) return 'draft';
    if (['overdue'].includes(normalized)) return 'missing';
    return 'draft';
}

async function upsertItem(tx: any, params: {
    organizationId?: string | null;
    scopeId: string;
    documentType: string;
    status: ReturnType<typeof mapDossierStatus>;
    sourceDocumentId?: string | null;
    metadata?: Record<string, unknown>;
}) {
    const conditions = [
        eq(documentDossierItems.scopeType, 'trip'),
        eq(documentDossierItems.scopeId, params.scopeId),
        eq(documentDossierItems.documentType, params.documentType),
    ];
    if (params.sourceDocumentId) conditions.push(eq(documentDossierItems.sourceDocumentId, params.sourceDocumentId));

    const [existing] = await tx.select().from(documentDossierItems).where(and(...conditions)).limit(1);
    const completed = ['signed', 'received', 'accepted', 'exceptioned'].includes(params.status) ? new Date() : null;

    if (existing) {
        const [updated] = await tx.update(documentDossierItems).set({
            organizationId: params.organizationId ?? existing.organizationId,
            status: params.status,
            sourceDocumentId: params.sourceDocumentId ?? existing.sourceDocumentId,
            sourceDocumentKind: params.sourceDocumentId ? 'transport_document' : existing.sourceDocumentKind,
            completedAt: completed,
            metadata: params.metadata ?? existing.metadata ?? {},
            updatedAt: new Date(),
        }).where(eq(documentDossierItems.id, existing.id)).returning();
        return updated;
    }

    const [created] = await tx.insert(documentDossierItems).values({
        organizationId: params.organizationId ?? null,
        scopeType: 'trip',
        scopeId: params.scopeId,
        documentType: params.documentType,
        required: true,
        status: params.status,
        sourceDocumentId: params.sourceDocumentId ?? null,
        sourceDocumentKind: params.sourceDocumentId ? 'transport_document' : null,
        completedAt: completed,
        metadata: params.metadata ?? {},
    }).returning();
    return created;
}

function isEtrnDossierItem(item: DossierItem) {
    return item.documentType.toLowerCase() === 'etrn';
}

function isStaleEtrnPlaceholder(item: DossierItem, hasConcreteEtrn: boolean) {
    return hasConcreteEtrn
        && isEtrnDossierItem(item)
        && !item.sourceDocumentId
        && item.status === 'missing';
}

function closeGateReason(item: DossierItem, severity: DossierCloseGateSeverity) {
    if (item.status === 'missing') return `${item.documentType} is required but missing`;
    if (item.status === 'rejected') return item.blockedReason ?? `${item.documentType} was rejected`;
    if (item.status === 'exceptioned') return item.blockedReason ?? `${item.documentType} is covered by a manual paper exception`;
    if (severity === 'warning') return `${item.documentType} is not fully completed yet`;
    return item.blockedReason ?? `${item.documentType} blocks trip close`;
}

function toCloseGateItem(item: DossierItem, severity: DossierCloseGateSeverity): DossierCloseGateItem {
    return {
        id: item.id,
        documentType: item.documentType,
        status: item.status,
        required: item.required,
        sourceDocumentId: item.sourceDocumentId ?? null,
        sourceDocumentKind: item.sourceDocumentKind ?? null,
        blockedReason: item.blockedReason ?? null,
        dueAt: item.dueAt ?? null,
        completedAt: item.completedAt ?? null,
        metadata: item.metadata ?? {},
        severity,
        reason: closeGateReason(item, severity),
    };
}

function queueBucket(item: DossierItem): DossierDocumentQueueItem['bucket'] | null {
    if (item.status === 'exceptioned' || item.status === 'rejected') return 'exceptioned';
    if (item.dueAt && item.dueAt.getTime() < Date.now() && !COMPLETED_DOSSIER_STATUSES.has(item.status)) return 'overdue';
    if (item.status === 'missing') return 'missing';
    return null;
}

function queueAction(item: DossierItem, bucket: DossierDocumentQueueItem['bucket']): string {
    if (bucket === 'overdue') return 'Escalate owner and request original document';
    if (bucket === 'exceptioned' && item.sourceDocumentKind === 'transport_document') return 'Review refusal/rejection evidence and attach paper act';
    if (bucket === 'exceptioned') return 'Review exception reason and close paper trail';
    if (item.documentType.toLowerCase() === 'etrn') return 'Create ETRN or register paper exception';
    if (item.documentType.toLowerCase() === 'waybill') return 'Issue waybill before close';
    return 'Request or upload missing document';
}

function queueResponsibleRole(item: DossierItem): DossierDocumentQueueItem['responsibleRole'] {
    const type = item.documentType.toLowerCase();
    if (type === 'upd' || type === 'invoice') return 'accounting';
    if (type === 'delivery_confirmation') return 'driver';
    return 'dispatcher';
}

function queuePrintLink(item: DossierItem) {
    if (
        item.sourceDocumentId
        && item.sourceDocumentKind === 'transport_document'
        && (item.status === 'rejected' || item.status === 'exceptioned')
    ) {
        return {
            printUrl: `/print/signature-refusal/${item.scopeId}?documentId=${item.sourceDocumentId}`,
            printLabel: 'Signature refusal act',
        };
    }

    return { printUrl: null, printLabel: null };
}

function buildDocumentQueue(items: DossierItem[]): DossierDocumentQueueItem[] {
    return items
        .map((item) => {
            const bucket = queueBucket(item);
            if (!bucket) return null;
            const print = queuePrintLink(item);
            const severity: DossierCloseGateSeverity = bucket === 'missing' || bucket === 'overdue' ? 'blocking' : 'warning';
            return {
                id: item.id,
                documentType: item.documentType,
                status: item.status,
                bucket,
                severity,
                dueAt: item.dueAt ?? null,
                responsibleRole: queueResponsibleRole(item),
                action: queueAction(item, bucket),
                ...print,
                reason: closeGateReason(item, severity),
            };
        })
        .filter(Boolean) as DossierDocumentQueueItem[];
}

export async function getDossierItemsForTrip(params: {
    tripId: string;
    organizationId?: string | null;
}) {
    const conditions = [
        eq(documentDossierItems.scopeType, 'trip'),
        eq(documentDossierItems.scopeId, params.tripId),
    ];
    if (params.organizationId) conditions.push(eq(documentDossierItems.organizationId, params.organizationId));
    return db.select().from(documentDossierItems).where(and(...conditions));
}

export function evaluateDossierCloseGate(params: {
    tripId: string;
    dossierItems: DossierItem[];
}): DossierCloseGate {
    const etrnItems = params.dossierItems.filter(isEtrnDossierItem);
    const concreteEtrnItems = etrnItems.filter((item) => Boolean(item.sourceDocumentId));
    const hasConcreteEtrn = concreteEtrnItems.length > 0;
    const effectiveItems = params.dossierItems.filter((item) => !isStaleEtrnPlaceholder(item, hasConcreteEtrn));
    const effectiveEtrnItems = effectiveItems.filter(isEtrnDossierItem);
    const etrnExceptioned = effectiveEtrnItems.some((item) => item.status === 'exceptioned');
    const etrnPresent = effectiveEtrnItems.some((item) => item.status !== 'missing' && item.status !== 'exceptioned');
    const etrnMissing = effectiveEtrnItems.length === 0
        || effectiveEtrnItems.every((item) => item.status === 'missing');

    const blockingItems: DossierCloseGateItem[] = [];
    const warningItems: DossierCloseGateItem[] = [];

    for (const item of effectiveItems) {
        if (!item.required && item.status !== 'rejected') continue;
        if (BLOCKING_DOSSIER_STATUSES.has(item.status)) {
            blockingItems.push(toCloseGateItem(item, item.required ? 'blocking' : 'warning'));
            continue;
        }
        if (WARNING_DOSSIER_STATUSES.has(item.status)) {
            warningItems.push(toCloseGateItem(item, 'warning'));
        }
    }

    const hardBlockingItems = blockingItems.filter((item) => item.severity === 'blocking');
    const softWarningItems = [
        ...blockingItems.filter((item) => item.severity === 'warning'),
        ...warningItems,
    ];

    return {
        tripId: params.tripId,
        canClose: hardBlockingItems.length === 0,
        generatedAt: new Date().toISOString(),
        blockingItems: hardBlockingItems,
        warningItems: softWarningItems,
        documentQueue: buildDocumentQueue(effectiveItems),
        etrn: {
            required: true,
            present: etrnPresent,
            missing: etrnMissing,
            exceptioned: etrnExceptioned,
            paperException: etrnExceptioned,
        },
        summary: {
            totalItems: effectiveItems.length,
            requiredItems: effectiveItems.filter((item) => item.required).length,
            completedItems: effectiveItems.filter((item) => COMPLETED_DOSSIER_STATUSES.has(item.status)).length,
            exceptionedItems: effectiveItems.filter((item) => item.status === 'exceptioned').length,
            blockingItems: hardBlockingItems.length,
            warningItems: softWarningItems.length,
        },
    };
}

export async function syncDossierItemsForTrip(params: {
    tripId: string;
    organizationId?: string | null;
    transportDocuments: TransportDoc[];
}) {
    return db.transaction(async (tx) => {
        const synced = [];
        let hasEtrn = false;

        for (const doc of params.transportDocuments) {
            const documentType = mapTransportDocumentType(doc);
            if (documentType === 'etrn') hasEtrn = true;
            synced.push(await upsertItem(tx, {
                organizationId: params.organizationId ?? null,
                scopeId: params.tripId,
                documentType,
                status: mapDossierStatus(doc.status),
                sourceDocumentId: doc.id,
                metadata: {
                    artifactKind: doc.artifactKind,
                    documentType: doc.documentType,
                    titleType: doc.titleType,
                    sourceStatus: doc.sourceStatus,
                    providerName: doc.providerName,
                    providerStatus: doc.providerStatus,
                    error: doc.error,
                },
            }));
        }

        if (!hasEtrn) {
            synced.push(await upsertItem(tx, {
                organizationId: params.organizationId ?? null,
                scopeId: params.tripId,
                documentType: 'etrn',
                status: 'missing',
                metadata: { source: 'etrn_required_projection' },
            }));
        }

        return synced;
    });
}
