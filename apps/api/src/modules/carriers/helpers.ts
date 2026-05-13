// ============================================================
// Carriers / subcontracting — pure helpers extracted from routes.
// Trip-status guard + numeric coercion + contract serializer +
// classic RU corporate-identifier validators.
// ============================================================

/** Coerce a DB-fetched numeric column (string | null) to a finite number. */
export function num(v: unknown): number | null {
    if (v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

/** Project a `carrier_contracts` row to its API shape — numerics as `number`. */
export function serializeContract<
    T extends { defaultRatePerKm: unknown; defaultRatePerTon: unknown },
>(c: T): T & { defaultRatePerKm: number | null; defaultRatePerTon: number | null } {
    return {
        ...c,
        defaultRatePerKm: num(c.defaultRatePerKm),
        defaultRatePerTon: num(c.defaultRatePerTon),
    };
}

/**
 * Trip-status gate for `POST /trips/:id/assign-carrier`. A carrier
 * may only be assigned BEFORE the trip starts (planning/assigned).
 */
const TRIP_STATUSES_OPEN_FOR_CARRIER = new Set(['planning', 'assigned']);

export function canAssignCarrier(tripStatus: string | null | undefined): boolean {
    if (!tripStatus) return false;
    return TRIP_STATUSES_OPEN_FOR_CARRIER.has(tripStatus);
}

/**
 * Russian INN check (10 or 12 digits, format only). Checksum-based
 * validators live in `modules/fleet/validators.ts`; this is the
 * format check used in route-layer Zod schemas.
 */
export function isInnShape(inn: string | null | undefined): boolean {
    if (!inn) return false;
    return /^\d{10}(\d{2})?$/.test(inn);
}

/** Russian КПП — 9 digits. */
export function isKppShape(kpp: string | null | undefined): boolean {
    if (!kpp) return false;
    return /^\d{9}$/.test(kpp);
}

/**
 * Russian ОГРН — 13 digits for legal entities, 15 for individual
 * entrepreneurs (ОГРНИП).
 */
export function isOgrnShape(ogrn: string | null | undefined): boolean {
    if (!ogrn) return false;
    return /^\d{13}(\d{2})?$/.test(ogrn);
}

/**
 * Validate a draft carrier-contract date period. Returns the first
 * error or null if accepted. Rate columns are also validated to be
 * non-negative if provided.
 */
export interface ContractDraftInput {
    startDate: Date | string;
    endDate?: Date | string | null;
    defaultRatePerKm?: number | null;
    defaultRatePerTon?: number | null;
}

export function validateContractDraft(d: ContractDraftInput): string | null {
    const start = new Date(d.startDate);
    if (Number.isNaN(start.getTime())) return 'startDate должна быть валидной датой';
    if (d.endDate !== null && d.endDate !== undefined) {
        const end = new Date(d.endDate);
        if (Number.isNaN(end.getTime())) return 'endDate должна быть валидной датой';
        if (end < start) return 'endDate должна быть позже startDate';
    }
    if (d.defaultRatePerKm !== null && d.defaultRatePerKm !== undefined && d.defaultRatePerKm < 0) {
        return 'defaultRatePerKm должна быть неотрицательной';
    }
    if (d.defaultRatePerTon !== null && d.defaultRatePerTon !== undefined && d.defaultRatePerTon < 0) {
        return 'defaultRatePerTon должна быть неотрицательной';
    }
    return null;
}

/**
 * Aggregate per-month balance entries to a single net balance.
 * Used by carrier-financial dashboards (debit positive, credit negative).
 */
export interface BalanceEntry {
    type: 'debit' | 'credit';
    amount: number;
}

export function computeBalance(entries: ReadonlyArray<BalanceEntry>): number {
    let net = 0;
    for (const e of entries) {
        const amt = Number(e.amount);
        if (!Number.isFinite(amt)) continue;
        net += e.type === 'debit' ? amt : -amt;
    }
    return Math.round(net * 100) / 100;
}
