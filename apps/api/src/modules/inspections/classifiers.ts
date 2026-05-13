// ============================================================
// Inspections — pure classifiers extracted from service.ts.
//
// Tech / Med inspection result classification, critical-fault
// detection, repair-request trigger evaluation, and append-only
// comment validation (post migration 0025).
// ============================================================

export type InspectionDecisionLabel = 'approved' | 'rejected';

export interface InspectionItem {
    name: string;
    result: 'ok' | 'fault';
    comment?: string | null;
    photoUrl?: string | null;
    /** When true, a fault on this item is a critical (immediate-block) fault. */
    critical?: boolean;
}

export interface TechInspectionClassification {
    decision: InspectionDecisionLabel;
    faultCount: number;
    criticalFaultCount: number;
    faultItems: string[];
    /** True when at least one fault item is flagged critical. */
    hasCriticalFault: boolean;
    /** True when the inspection should auto-block the vehicle (rejected decision OR critical fault). */
    shouldBlockVehicle: boolean;
    /** True when an auto repair request should be created. */
    shouldCreateRepairRequest: boolean;
}

/**
 * Classifies a tech inspection. The decision label is preserved as-is
 * (we don't override mechanic judgement) but auxiliary flags drive the
 * downstream cascades (block vehicle / create repair request).
 */
export function classifyTechInspection(
    decision: InspectionDecisionLabel,
    items: InspectionItem[],
): TechInspectionClassification {
    const faultItems = items.filter((i) => i.result === 'fault');
    const criticalFaults = faultItems.filter((i) => i.critical === true);
    const hasCriticalFault = criticalFaults.length > 0;

    return {
        decision,
        faultCount: faultItems.length,
        criticalFaultCount: criticalFaults.length,
        faultItems: faultItems.map((i) => i.name),
        hasCriticalFault,
        shouldBlockVehicle: decision === 'rejected' || hasCriticalFault,
        shouldCreateRepairRequest: decision === 'rejected',
    };
}

// ============================================================
// Med inspection vitals classifier
// ============================================================

export interface MedVitals {
    systolicBp: number;
    diastolicBp: number;
    heartRate: number;
    temperature: number;
    alcoholTest: 'negative' | 'positive';
}

export interface MedClassification {
    decision: InspectionDecisionLabel;
    /** True if vitals fall outside the normal range — informational. */
    abnormalVitals: boolean;
    /** True if the alcohol test was positive — always hard block. */
    alcoholPositive: boolean;
    /** True when the driver should be blocked from this trip. */
    shouldBlockDriver: boolean;
}

/**
 * Classifies a med inspection. Like the tech version, decision label
 * is preserved verbatim; auxiliary flags drive cascades.
 */
export function classifyMedInspection(
    decision: InspectionDecisionLabel,
    vitals: MedVitals,
): MedClassification {
    // Loose "normal range" used for visual flags in the UI.
    // Hypertension stage 1 starts at ~140/90; severe fever ≥ 38°C; HR > 100 = tachy.
    const abnormalVitals =
        vitals.systolicBp >= 140
        || vitals.diastolicBp >= 90
        || vitals.heartRate > 100
        || vitals.heartRate < 50
        || vitals.temperature >= 37.5
        || vitals.temperature < 35;

    const alcoholPositive = vitals.alcoholTest === 'positive';

    return {
        decision,
        abnormalVitals,
        alcoholPositive,
        // Positive alcohol always blocks regardless of medic decision.
        shouldBlockDriver: decision === 'rejected' || alcoholPositive,
    };
}

// ============================================================
// Append-only decision/comment validation (migration 0025)
// ============================================================

/**
 * Build the new `comment` field for an inspection decision update.
 * Append-only: existing comment text is preserved verbatim.
 * Empty `note` returns the existing comment unchanged.
 */
export function buildAppendedComment(existing: string | null | undefined, note: string | null | undefined): string | null {
    const trimmedNote = (note ?? '').trim();
    if (!trimmedNote) return existing ?? null;
    if (!existing) return trimmedNote;
    return `${existing}\n${trimmedNote}`;
}

export interface DecisionUpdateValidation {
    ok: boolean;
    reason?: 'unknown_decision' | 'note_required_on_reject';
    message?: string;
}

/**
 * Validate a decision-update payload.
 * - decision must be approved or rejected.
 * - on rejection, a note is required (so reviewers can read why).
 */
export function validateDecisionUpdate(payload: {
    decision: string;
    notes?: string | null;
}): DecisionUpdateValidation {
    if (payload.decision !== 'approved' && payload.decision !== 'rejected') {
        return {
            ok: false,
            reason: 'unknown_decision',
            message: `Decision must be "approved" or "rejected"`,
        };
    }
    if (payload.decision === 'rejected') {
        const note = (payload.notes ?? '').trim();
        if (!note) {
            return {
                ok: false,
                reason: 'note_required_on_reject',
                message: 'A note is required when rejecting an inspection',
            };
        }
    }
    return { ok: true };
}

// ============================================================
// Document expiry traffic light
// ============================================================

export type TrafficLightStatus = 'green' | 'yellow' | 'red' | 'unknown';

export function getDocumentTrafficLight(
    expiry: Date | string | null | undefined,
    options: { now?: Date; yellowDays?: number } = {},
): TrafficLightStatus {
    if (!expiry) return 'unknown';
    const now = options.now ?? new Date();
    const yellowDays = options.yellowDays ?? 30;
    const yellowThreshold = new Date(now.getTime() + yellowDays * 24 * 60 * 60 * 1000);
    const expiryDate = expiry instanceof Date ? expiry : new Date(expiry);
    if (Number.isNaN(expiryDate.getTime())) return 'unknown';
    if (expiryDate < now) return 'red';
    if (expiryDate < yellowThreshold) return 'yellow';
    return 'green';
}
