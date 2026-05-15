// ============================================================
// Wave 5 — EDI / Diadoc / SBIS / Kontur (mock).
// Реальной интеграции нет — отправка эмулируется прогрессией статусов:
// sent → signed_by_carrier (5s) → signed_by_client (10s).
//
// D20 (Round 3C): Mock progression теперь идёт через BullMQ delayed
// jobs вместо setTimeout. Преимущества:
//   - Переживает рестарт сервера (Redis хранит pending jobs).
//   - Идемпотентен: повторный запуск worker'а просто проверит статус
//     и no-op, если уже продвинут вручную.
//   - Job ID детерминирован (`edi:{documentId}:{stage}`), что позволяет
//     отменять pending переходы при ручной прогрессии.
// ============================================================
import { db } from '../../db/connection.js';
import { transportDocuments, ediEvents } from '../../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { ediProgressionQueue } from '../../integrations/queues.js';
import { validateETrNXml, type ETrNTitleType } from '../../lib/xsd-validator.js';
import { XsdValidationError } from '../../lib/xsd-validator-gate.js';

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

type ProgressionStage = 'carrier' | 'client';

export interface EdiProgressionJobData {
    documentId: string;
    provider: EdiProvider;
    stage: ProgressionStage;
}

function progressionJobId(documentId: string, stage: ProgressionStage): string {
    return `edi:${documentId}:${stage}`;
}

async function cancelScheduled(documentId: string): Promise<void> {
    // Best-effort cancellation. Missing Redis or already-removed jobs are not
    // an error — they just mean the timer cannot fire any more.
    for (const stage of ['carrier', 'client'] as const) {
        try {
            const id = progressionJobId(documentId, stage);
            const job = await ediProgressionQueue.getJob(id);
            if (job) await job.remove();
        } catch {
            // ignore — best-effort
        }
    }
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

/**
 * Worker entry point — invoked from `integrations/workers/edi.worker.ts`.
 * Idempotent: if the document is no longer in the expected source state
 * (e.g. a manual progression already moved it forward), this is a no-op.
 */
export async function processEdiProgressionJob(data: EdiProgressionJobData): Promise<{ progressed: boolean }> {
    const { documentId, provider, stage } = data;
    const expectedFrom: EdiStatus = stage === 'carrier' ? 'sent' : 'signed_by_carrier';
    const target: EdiStatus = stage === 'carrier' ? 'signed_by_carrier' : 'signed_by_client';

    const [current] = await db
        .select({ ediStatus: transportDocuments.ediStatus })
        .from(transportDocuments)
        .where(eq(transportDocuments.id, documentId))
        .limit(1);
    if (!current || current.ediStatus !== expectedFrom) {
        return { progressed: false };
    }
    await setEdiStatus(documentId, target);
    await insertEvent(documentId, provider, 'signed', { by: stage, mock: true });
    return { progressed: true };
}

export interface SendDocumentResult {
    documentId: string;
    provider: EdiProvider;
    ediStatus: EdiStatus;
    ediExternalId: string;
    ediSentAt: Date;
}

/** Mapping from DB `title_type` (e.g. `title_02`) → validator title enum. */
const DB_TITLE_TYPE_TO_VALIDATOR: Record<string, ETrNTitleType> = {
    title_01: 'T01',
    title_02: 'T02',
    title_05: 'T05',
    title_06: 'T06',
};

export async function sendDocumentToEdi(
    documentId: string,
    provider: EdiProvider,
): Promise<SendDocumentResult> {
    const [doc] = await db
        .select({
            id: transportDocuments.id,
            titleType: transportDocuments.titleType,
            payload: transportDocuments.payload,
        })
        .from(transportDocuments)
        .where(eq(transportDocuments.id, documentId))
        .limit(1);
    if (!doc) {
        throw new Error('Документ не найден');
    }

    // Gate: structural XSD validation for ETrN titles before mutating state.
    // payload here is the persisted JSON snapshot; the XML may be embedded
    // under `xml` / `xmlContent` keys depending on the generator pathway.
    // TODO: replace with real XSD validation once ФНС schemas at
    //   docs/etrn/schemas/ are loaded into runtime.
    const titleType = doc.titleType ? DB_TITLE_TYPE_TO_VALIDATOR[doc.titleType] : undefined;
    if (titleType) {
        const payloadRecord = (doc.payload ?? {}) as Record<string, unknown>;
        const xml =
            typeof payloadRecord['xml'] === 'string' ? (payloadRecord['xml'] as string)
            : typeof payloadRecord['xmlContent'] === 'string' ? (payloadRecord['xmlContent'] as string)
            : null;
        if (xml) {
            const result = validateETrNXml(xml, titleType);
            if (!result.valid) {
                throw new XsdValidationError(result.errors);
            }
            console.log(`[edi] XSD-валидация ${titleType} OK для документа ${documentId}`);
        }
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

    // D20: schedule durable mock progression via BullMQ. Cancel any prior
    // jobs first so a re-send doesn't double-fire transitions.
    await cancelScheduled(documentId);
    try {
        await ediProgressionQueue.add(
            'edi.progress.carrier',
            { documentId, provider, stage: 'carrier' },
            {
                jobId: progressionJobId(documentId, 'carrier'),
                delay: SIGN_BY_CARRIER_DELAY_MS,
            },
        );
        await ediProgressionQueue.add(
            'edi.progress.client',
            { documentId, provider, stage: 'client' },
            {
                jobId: progressionJobId(documentId, 'client'),
                delay: SIGN_BY_CLIENT_DELAY_MS,
            },
        );
    } catch {
        // If Redis is down we silently degrade — the document still goes to
        // 'sent' and admins can use mock-progress endpoints to advance it.
    }

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

    // Cancel pending mock-progression jobs — admin принял решение вручную.
    await cancelScheduled(documentId);

    await setEdiStatus(documentId, to);
    if (to === 'rejected') {
        await insertEvent(documentId, provider, 'rejected', { manual: true });
    } else {
        const by = to === 'signed_by_carrier' ? 'carrier' : 'client';
        await insertEvent(documentId, provider, 'signed', { by, manual: true });
    }

    return { documentId, ediStatus: to };
}
