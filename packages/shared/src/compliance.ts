// ============================================================
// Round 2A — Compliance shared types.
// Mirrors the API responses for ОСАГО / тахограф / Честный знак / ADR
// so the web client can consume them with no any-casts.
// ============================================================

export interface OsagoStatusRow {
    vehicleId: string;
    plate: string;
    vin: string;
    valid: boolean | null;
    expiresAt: string | null;
    insurer: string | null;
    policyNumber: string | null;
    checkedAt: string | null;
}

export interface OsagoCheckResult {
    id: string;
    vehicleId: string;
    valid: boolean;
    expiresAt: string | null;
    insurer: string | null;
    policyNumber: string | null;
    checkedAt: string;
    providerName: string;
}

export interface TachographUploadRow {
    id: string;
    driverId: string | null;
    driverFullName: string | null;
    driverCardNumber: string | null;
    vehicleVin: string | null;
    periodFrom: string | null;
    periodTo: string | null;
    fileName: string | null;
    recordsInserted: number;
    totalDrivingMinutes: number;
    uploadedAt: string;
    parseWarnings: string[] | null;
}

export interface TachographUploadResponse {
    uploadId: string;
    driverId: string | null;
    recordsInserted: number;
    period: { from: string | null; to: string | null };
    totalDrivingHours: number;
    vehicleVin: string | null;
    driverCardNumber: string | null;
    warnings: string[];
}

export interface MarkingVerificationRow {
    id: string;
    organizationId: string | null;
    lotId: string | null;
    code: string;
    verifiedAt: string;
    valid: boolean;
    category: string | null;
    productName: string | null;
    gtin: string | null;
    serial: string | null;
    providerName: string;
}

export interface MarkingCategorySummary {
    category: string;
    total: number;
    valid: number;
    invalid: number;
}

export interface AdrStrictModeStatus {
    enabled: boolean;
}

export interface AdrHardValidationResult {
    ok: boolean;
    errors: string[];
    adrClass?: string | null;
    adrUnNumber?: string | null;
    strictMode: boolean;
    blocked: boolean;
}

/** Three-band classification used by the dashboard for OSAGO expiry. */
export type OsagoBand = 'green' | 'yellow' | 'red' | 'unknown';

export function classifyOsagoExpiry(
    valid: boolean | null,
    expiresAt: string | null,
    nowIso: string = new Date().toISOString(),
): OsagoBand {
    if (valid === null) return 'unknown';
    if (!valid) return 'red';
    if (!expiresAt) return 'yellow';
    const days = (new Date(expiresAt).getTime() - new Date(nowIso).getTime()) / 86400000;
    if (days <= 0) return 'red';
    if (days <= 30) return 'yellow';
    return 'green';
}
