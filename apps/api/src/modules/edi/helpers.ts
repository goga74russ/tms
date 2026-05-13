// ============================================================
// EDI / ЭДО — pure state-machine helpers.
// Encodes the transitions that `progressEdiManually()` enforces
// inside service.ts so they can be unit-tested without DB.
// ============================================================

export type EdiStatus =
    | 'not_sent'
    | 'sent'
    | 'signed_by_carrier'
    | 'signed_by_client'
    | 'rejected';

export type EdiProvider = 'diadoc' | 'sbis' | 'kontur';

export type EdiManualTarget = 'signed_by_carrier' | 'signed_by_client' | 'rejected';

export type TransitionGuard =
    | { ok: true }
    | { ok: false; error: string };

/**
 * Reject `to`-transition attempts that contradict `service.ts`:
 *   - cannot progress a `not_sent` document
 *   - cannot progress a `rejected` document
 *   - cannot move backward from `signed_by_client` unless to `rejected`
 */
export function checkManualTransition(
    from: EdiStatus | null | undefined,
    to: EdiManualTarget,
): TransitionGuard {
    if (!from || from === 'not_sent') {
        return { ok: false, error: 'Документ ещё не отправлен в EDI' };
    }
    if (from === 'rejected') {
        return { ok: false, error: 'Документ уже отклонён в EDI' };
    }
    if (from === 'signed_by_client' && to !== 'rejected') {
        return { ok: false, error: 'Документ уже подписан клиентом' };
    }
    return { ok: true };
}

/**
 * The expected predecessor status for an automated progression stage
 * (used by `processEdiProgressionJob`). Returning the wrong source is
 * how the worker stays idempotent — no-op if status drifted.
 */
export function expectedStageSource(stage: 'carrier' | 'client'): EdiStatus {
    return stage === 'carrier' ? 'sent' : 'signed_by_carrier';
}

export function targetForStage(stage: 'carrier' | 'client'): EdiStatus {
    return stage === 'carrier' ? 'signed_by_carrier' : 'signed_by_client';
}

/**
 * Normalise a webhook event payload from a provider into our
 * internal `EdiEventType`. Real adapters' `handleCallback()` will
 * call this before persisting.
 */
export type EdiEventType = 'sent' | 'signed' | 'rejected';

export function normalizeWebhookEvent(input: {
    eventType?: string | null;
    status?: string | null;
}): EdiEventType | null {
    const raw = (input.eventType ?? input.status ?? '').toString().toLowerCase().trim();
    if (raw === 'sent' || raw === 'delivered') return 'sent';
    if (raw === 'signed' || raw === 'signature' || raw === 'signed_by_carrier' || raw === 'signed_by_client') {
        return 'signed';
    }
    if (raw === 'rejected' || raw === 'refused' || raw === 'declined') return 'rejected';
    return null;
}

/** Title-cross-validation: titles 01-08 must be present and sequential. */
export const VALID_TITLE_CODES = ['01', '02', '03', '04', '05', '06', '07', '08'] as const;
export type TitleCode = typeof VALID_TITLE_CODES[number];

export function validateTitleSequence(titles: ReadonlyArray<string>): {
    ok: boolean;
    missing: string[];
    unknown: string[];
} {
    const present = new Set(titles);
    const missing: string[] = [];
    const unknown: string[] = [];
    for (const c of VALID_TITLE_CODES) {
        if (!present.has(c)) missing.push(c);
    }
    for (const t of titles) {
        if (!(VALID_TITLE_CODES as ReadonlyArray<string>).includes(t)) unknown.push(t);
    }
    return { ok: missing.length === 0 && unknown.length === 0, missing, unknown };
}
