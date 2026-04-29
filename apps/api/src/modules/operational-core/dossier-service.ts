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
