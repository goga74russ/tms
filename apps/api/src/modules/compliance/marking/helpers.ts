// ============================================================
// Marking (ЦРПТ / Честный знак) — pure helpers extracted so unit
// tests can exercise them without booting a DB connection or the
// Fastify app. Keep behaviour aligned with service.ts + routes.ts.
// ============================================================
import type { MarkingVerifyResult } from '../../../providers/marking/interface.js';

/**
 * Best-effort GTIN+serial extraction from a Честный знак code.
 *
 * Real ЦРПТ codes are GS1-style: first 14 chars = GTIN (numeric),
 * next 13 chars = serial. Codes shorter than 14 are not standards-
 * compliant and we return `null` so callers can flag them.
 */
export interface ParsedMarkingCode {
    gtin: string;
    serial: string;
}

export function parseGtinSerial(code: string): ParsedMarkingCode | null {
    if (typeof code !== 'string') return null;
    if (code.length < 14) return null;
    const gtin = code.slice(0, 14);
    if (!/^\d{14}$/.test(gtin)) return null;
    const serial = code.slice(14, 27);
    if (serial.length === 0) return null;
    return { gtin, serial };
}

/** Tri-state shape classifier for a single code. */
export type CodeShape = 'valid' | 'malformed' | 'empty';

export function classifyCodeShape(code: unknown): CodeShape {
    if (code === null || code === undefined) return 'empty';
    if (typeof code !== 'string') return 'malformed';
    const trimmed = code.trim();
    if (trimmed.length === 0) return 'empty';
    return parseGtinSerial(trimmed) ? 'valid' : 'malformed';
}

/**
 * Verification state machine — the persisted status that downstream
 * UI/dashboards key off. We accept rows from the provider response
 * (`MarkingVerifyResult`) and project them to a uniform 3-state.
 */
export type MarkingVerificationState = 'accepted' | 'rejected' | 'sent';

export function classifyVerification(r: MarkingVerifyResult): MarkingVerificationState {
    if (r.valid === true) return 'accepted';
    if (r.valid === false) return 'rejected';
    return 'sent';
}

/** Summary aggregator for a verification batch — used by route response. */
export interface VerifySummary {
    total: number;
    valid: number;
    invalid: number;
}

export function summarizeVerify(results: ReadonlyArray<MarkingVerifyResult>): VerifySummary {
    let valid = 0;
    let invalid = 0;
    for (const r of results) {
        if (r.valid) valid++;
        else invalid++;
    }
    return { total: results.length, valid, invalid };
}
