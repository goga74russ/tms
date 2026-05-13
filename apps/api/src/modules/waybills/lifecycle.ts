// ============================================================
// Waybills — pure helpers extracted from service.ts.
//
// Status state machine, odometer validation, ETRN/title status
// aggregation, compliance snapshot builder, and dossier readiness
// classification. All behaviour-preserving.
// ============================================================
import { WaybillStatus } from '@tms/shared';

// ============================================================
// Status state machine
// (draft → medical_check | technical_check → issued → closed)
// ============================================================

export const WAYBILL_STATE_TRANSITIONS: Record<string, string[]> = {
    [WaybillStatus.DRAFT]: [WaybillStatus.MEDICAL_CHECK, WaybillStatus.TECHNICAL_CHECK, WaybillStatus.ISSUED],
    [WaybillStatus.MEDICAL_CHECK]: [WaybillStatus.ISSUED, WaybillStatus.TECHNICAL_CHECK],
    [WaybillStatus.TECHNICAL_CHECK]: [WaybillStatus.ISSUED, WaybillStatus.MEDICAL_CHECK],
    [WaybillStatus.ISSUED]: [WaybillStatus.CLOSED],
    [WaybillStatus.CLOSED]: [],
};

export function canTransitionWaybill(from: string, to: string): boolean {
    return WAYBILL_STATE_TRANSITIONS[from]?.includes(to) ?? false;
}

export function nextWaybillStatuses(from: string): string[] {
    return WAYBILL_STATE_TRANSITIONS[from] ?? [];
}

/**
 * Classify the waybill status implied by the current pre-trip state.
 * Mirrors getTripPreTripState in service.ts.
 */
export function classifyPreTripWaybillStatus(state: {
    hasTechApproval: boolean;
    hasMedApproval: boolean;
    hasBlockingIncidents: boolean;
}): 'draft' | 'medical_check' | 'technical_check' | 'issued' {
    if (state.hasTechApproval && state.hasMedApproval && !state.hasBlockingIncidents) {
        return 'issued';
    }
    if (state.hasTechApproval) return 'medical_check';
    if (state.hasMedApproval) return 'technical_check';
    return 'draft';
}

// ============================================================
// Odometer validation
// ============================================================

export interface OdometerValidationResult {
    ok: boolean;
    reason?: 'rollback' | 'unrealistic_delta' | 'invalid_value';
    deltaKm?: number;
    message?: string;
}

/**
 * Validates a closing odometer reading against an opening reading.
 * - Closing must be ≥ opening.
 * - Delta must be ≤ maxDeltaKm (defaults to 5000 km in a single waybill).
 */
export function validateOdometerReadings(
    openingKm: number | null | undefined,
    closingKm: number | null | undefined,
    options: { maxDeltaKm?: number } = {},
): OdometerValidationResult {
    const maxDelta = options.maxDeltaKm ?? 5000;
    if (typeof openingKm !== 'number' || !Number.isFinite(openingKm) || openingKm < 0) {
        return { ok: false, reason: 'invalid_value', message: 'Opening odometer invalid' };
    }
    if (typeof closingKm !== 'number' || !Number.isFinite(closingKm) || closingKm < 0) {
        return { ok: false, reason: 'invalid_value', message: 'Closing odometer invalid' };
    }
    if (closingKm < openingKm) {
        return {
            ok: false,
            reason: 'rollback',
            deltaKm: closingKm - openingKm,
            message: `Closing odometer (${closingKm}) is less than opening (${openingKm})`,
        };
    }
    const delta = closingKm - openingKm;
    if (delta > maxDelta) {
        return {
            ok: false,
            reason: 'unrealistic_delta',
            deltaKm: delta,
            message: `Odometer delta ${delta} km exceeds sanity threshold ${maxDelta} km`,
        };
    }
    return { ok: true, deltaKm: delta };
}

// ============================================================
// ETRN title status aggregator
// ============================================================

export interface EtrnTitle {
    code: string;
    status: 'pending' | 'signed' | 'rejected' | 'expired' | string;
    /** Whether this title blocks waybill close when not in a green state. */
    blocking?: boolean;
}

export interface EtrnAggregate {
    /** Titles that are still blocking close (pending/rejected/expired and marked blocking). */
    blocking: EtrnTitle[];
    /** All non-signed titles regardless of blocking flag. */
    unresolved: EtrnTitle[];
    /** True if no titles are blocking close. */
    ready: boolean;
}

/**
 * Aggregate ETRN title statuses for a waybill. Returns which titles still
 * block the close-gate; consumers use `ready` as the boolean readiness check.
 */
export function aggregateEtrnTitles(titles: EtrnTitle[]): EtrnAggregate {
    const blocking: EtrnTitle[] = [];
    const unresolved: EtrnTitle[] = [];

    for (const t of titles) {
        if (t.status !== 'signed') {
            unresolved.push(t);
            if (t.blocking) blocking.push(t);
        }
    }

    return {
        blocking,
        unresolved,
        ready: blocking.length === 0,
    };
}

// ============================================================
// Compliance snapshot builder (close-gate)
// ============================================================

export interface ComplianceSnapshotInput {
    waybillStatus: string;
    odometer: OdometerValidationResult;
    etrn: EtrnAggregate;
    incompleteRoutePoints: number;
    hasBlockingIncidents: boolean;
}

export interface ComplianceSnapshot {
    canClose: boolean;
    reasons: string[];
}

/**
 * Decides whether a waybill is allowed to close.
 * Returns a list of human-readable reasons for the UI.
 */
export function buildCloseComplianceSnapshot(input: ComplianceSnapshotInput): ComplianceSnapshot {
    const reasons: string[] = [];

    if (input.waybillStatus !== WaybillStatus.ISSUED) {
        reasons.push(`Waybill must be in status "issued" (currently "${input.waybillStatus}")`);
    }
    if (!input.odometer.ok) {
        reasons.push(input.odometer.message ?? 'Odometer reading invalid');
    }
    if (!input.etrn.ready) {
        reasons.push(`Blocking ETRN titles: ${input.etrn.blocking.map((t) => t.code).join(', ')}`);
    }
    if (input.incompleteRoutePoints > 0) {
        reasons.push(`${input.incompleteRoutePoints} route point(s) not completed`);
    }
    if (input.hasBlockingIncidents) {
        reasons.push('Blocking incidents are open against this trip');
    }

    return {
        canClose: reasons.length === 0,
        reasons,
    };
}

// ============================================================
// Dossier readiness classifier
// ============================================================

export type DossierReadiness = 'ready' | 'partial' | 'blocked' | 'empty';

export interface DossierInput {
    hasWaybill: boolean;
    hasVehicle: boolean;
    hasDriver: boolean;
    hasOrders: boolean;
    hardIssueCount: number;
}

/**
 * Classifies the transport dossier readiness based on the available
 * documents and outstanding hard issues.
 */
export function classifyDossierReadiness(input: DossierInput): DossierReadiness {
    if (!input.hasWaybill && !input.hasVehicle && !input.hasDriver && !input.hasOrders) {
        return 'empty';
    }
    if (input.hardIssueCount > 0) return 'blocked';
    if (input.hasWaybill && input.hasVehicle && input.hasDriver && input.hasOrders) return 'ready';
    return 'partial';
}
