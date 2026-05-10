// ============================================================
// Wave 5 — EDI / Diadoc / SBIS / Kontur (mock).
// Реальной интеграции нет — отправка эмулируется setTimeout
// прогрессией: sent → signed_by_carrier (5s) → signed_by_client (10s).
// ============================================================
import { db } from '../../db/connection.js';
import { transportDocuments, ediEvents } from '../../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export type EdiProvider = 'diadoc' | 'sbis' | 'kontur';
export type EdiStatus =
    | 'not_sent'
    | 'sent'
    | 'signed_by_carrier'
    | 'signed_by_client'
    | 'rejected';

export type EdiEventType = 'sent' | 'signed' | 'rejected';

const SIGN_BY_CARRIER_DELAY_MS = 5000;
const SIGN_BY_CLIENT_DELAY_MS = 10000;

interface ScheduleHandle {
    timers: NodeJS.Timeout[];
}

const scheduledByDocument = new Map<string, ScheduleHandle>();

function cancelScheduled(documentId: string) {
    const handle = scheduledByDocument.get(documentId);
    if (!handle) return;
    for (const t of handle.timers) clearTimeout(t);
    scheduledByDocument.delete(documentId);
}

async function insertEvent(
    documentId: string,
    provider: EdiProvider,
    eventType: EdiEventType,
    payload: Record<string, unknown> = {},
) {
    await db.insert(ediEvents).values({
        documentId,
        provider,
        eventType,
        payload,
    });
}

async function setEdiStatus(documentId: string, status: EdiStatus) {
    await db
        .update(transportDocuments)
        .set({ ediStatus: status, updatedAt: new Date() })
        .where(eq(transportDocuments.id, documentId));
}

async function progressToCarrierSigned(documentId: string, provider: EdiProvider) {
    // Только если документ всё ещё в статусе 'sent' — иначе кто-то
    // уже продвинул вручную (например через mock-progress).
    const [current] = await db
        .select({ ediStatus: transportDocuments.ediStatus })
        .from(transportDocuments)
        .where(eq(transportDocuments.id, documentId))
        .limit(1);
    if (!current || current.ediStatus !== 'sent') return;
    await setEdiStatus(documentId, 'signed_by_carrier');
    await insertEvent(documentId, provider, 'signed', { by: 'carrier', mock: true });
}

async function progressToClientSigned(documentId: string, provider: EdiProvider) {
    const [current] = await db
        .select({ ediStatus: transportDocuments.ediStatus })
        .from(transportDocuments)
        .where(eq(transportDocuments.id, documentId))
        .limit(1);
    if (!current || current.ediStatus !== 'signed_by_carrier') return;
    await setEdiStatus(documentId, 'signed_by_client');
    await insertEvent(documentId, provider, 'signed', { by: 'client', mock: true });
}

export interface SendDocumentResult {
    documentId: string;
    provider: EdiProvider;
    ediStatus: EdiStatus;
    ediExternalId: string;
    ediSentAt: Date;
}

export async function sendDocumentToEdi(
    documentId: string,
    provider: EdiProvider,
): Promise<SendDocumentResult> {
    const [doc] = await db
        .select({ id: transportDocuments.id })
        .from(transportDocuments)
        .where(eq(transportDocuments.id, documentId))
        .limit(1);
    if (!doc) {
        throw new Error('Документ не найден');
    }

    const externalId = `mock-${nanoid(12)}`;
    const sentAt = new Date();

    await db
        .update(transportDocuments)
        .set({
            ediStatus: 'sent',
            ediProvider: provider,
            ediExternalId: externalId,
            ediSentAt: sentAt,
            updatedAt: sentAt,
        })
        .where(eq(transportDocuments.id, documentId));

    await insertEvent(documentId, provider, 'sent', {
        externalId,
        sentAt: sentAt.toISOString(),
        mock: true,
    });

    // Reset any prior schedule and arm new mock progression timers.
    cancelScheduled(documentId);
    const timers: NodeJS.Timeout[] = [];
    timers.push(setTimeout(() => {
        progressToCarrierSigned(documentId, provider).catch(() => undefined);
    }, SIGN_BY_CARRIER_DELAY_MS));
    timers.push(setTimeout(() => {
        progressToClientSigned(documentId, provider).catch(() => undefined);
    }, SIGN_BY_CLIENT_DELAY_MS));
    // Don't keep the event loop alive for these mock timers in tests/CLI.
    for (const t of timers) {
        if (typeof (t as any).unref === 'function') (t as any).unref();
    }
    scheduledByDocument.set(documentId, { timers });

    return {
        documentId,
        provider,
        ediStatus: 'sent',
        ediExternalId: externalId,
        ediSentAt: sentAt,
    };
}

export async function getEdiHistory(documentId: string) {
    const [doc] = await db
        .select({
            id: transportDocuments.id,
            ediStatus: transportDocuments.ediStatus,
            ediProvider: transportDocuments.ediProvider,
            ediExternalId: transportDocuments.ediExternalId,
            ediSentAt: transportDocuments.ediSentAt,
        })
        .from(transportDocuments)
        .where(eq(transportDocuments.id, documentId))
        .limit(1);
    if (!doc) {
        throw new Error('Документ не найден');
    }

    const events = await db
        .select()
        .from(ediEvents)
        .where(eq(ediEvents.documentId, documentId))
        .orderBy(desc(ediEvents.createdAt));

    return {
        document: doc,
        events,
    };
}

export async function progressEdiManually(
    documentId: string,
    to: 'signed_by_carrier' | 'signed_by_client' | 'rejected',
): Promise<{ documentId: string; ediStatus: EdiStatus }> {
    const [doc] = await db
        .select({
            id: transportDocuments.id,
            ediProvider: transportDocuments.ediProvider,
            ediStatus: transportDocuments.ediStatus,
        })
        .from(transportDocuments)
        .where(eq(transportDocuments.id, documentId))
        .limit(1);
    if (!doc) {
        throw new Error('Документ не найден');
    }
    if (!doc.ediStatus || doc.ediStatus === 'not_sent') {
        throw new Error('Документ ещё не отправлен в EDI');
    }
    if (doc.ediStatus === 'rejected') {
        throw new Error('Документ уже отклонён в EDI');
    }
    if (doc.ediStatus === 'signed_by_client' && to !== 'rejected') {
        throw new Error('Документ уже подписан клиентом');
    }

    const provider = (doc.ediProvider ?? 'diadoc') as EdiProvider;

    // Cancel any pending timers — admin принял решение вручную.
    cancelScheduled(documentId);

    await setEdiStatus(documentId, to);
    if (to === 'rejected') {
        await insertEvent(documentId, provider, 'rejected', { manual: true });
    } else {
        const by = to === 'signed_by_carrier' ? 'carrier' : 'client';
        await insertEvent(documentId, provider, 'signed', { by, manual: true });
    }

    return { documentId, ediStatus: to };
}
