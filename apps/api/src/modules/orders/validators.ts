// ============================================================
// Orders — pure validators extracted from service.ts / routes.ts.
//
// State machine + cargo bounds + temperature range + address
// parsing helpers. Behaviour-preserving.
// ============================================================
import { ORDER_STATE_TRANSITIONS } from '@tms/shared';

// ============================================================
// State machine
// ============================================================

export function canTransitionOrder(from: string, to: string): boolean {
    return ORDER_STATE_TRANSITIONS[from]?.includes(to) ?? false;
}

export function nextOrderStatuses(from: string): string[] {
    return ORDER_STATE_TRANSITIONS[from] ?? [];
}

// ============================================================
// Cargo bounds
// ============================================================

export interface CargoBoundsInput {
    cargoWeightKg?: number | null;
    cargoVolumeM3?: number | null;
    cargoPlaces?: number | null;
}

export interface CargoBoundsResult {
    ok: boolean;
    reasons: string[];
}

/**
 * Validate cargo bounds:
 *   - weight must be > 0 and ≤ 25_000 kg (single road train limit).
 *   - volume must be ≥ 0 and ≤ 120 m3 (megaliner upper bound).
 *   - places must be ≥ 0.
 */
export function validateCargoBounds(input: CargoBoundsInput): CargoBoundsResult {
    const reasons: string[] = [];
    const weight = Number(input.cargoWeightKg ?? 0);
    const volume = Number(input.cargoVolumeM3 ?? 0);
    const places = Number(input.cargoPlaces ?? 0);

    if (!Number.isFinite(weight) || weight <= 0) {
        reasons.push('Cargo weight must be > 0 kg');
    } else if (weight > 25_000) {
        reasons.push('Cargo weight exceeds 25 000 kg single-vehicle limit');
    }

    if (!Number.isFinite(volume) || volume < 0) {
        reasons.push('Cargo volume must be ≥ 0 m3');
    } else if (volume > 120) {
        reasons.push('Cargo volume exceeds 120 m3 megaliner limit');
    }

    if (!Number.isFinite(places) || places < 0) {
        reasons.push('Cargo places must be ≥ 0');
    }

    return { ok: reasons.length === 0, reasons };
}

// ============================================================
// Temperature range (for coldChainRequired orders)
// ============================================================

export interface TemperatureRangeInput {
    coldChainRequired?: boolean | null;
    temperatureMinC?: number | null;
    temperatureMaxC?: number | null;
}

export interface TemperatureValidationResult {
    ok: boolean;
    reason?: 'missing_range' | 'inverted_range' | 'out_of_bounds';
    message?: string;
}

/**
 * Validates the temperature range for cold-chain orders:
 *   - both bounds required.
 *   - min ≤ max.
 *   - bounds within reasonable refrigerated transport range (-30…+30 °C).
 *
 * Returns { ok: true } when coldChain is not required (range is optional).
 */
export function validateTemperatureRange(input: TemperatureRangeInput): TemperatureValidationResult {
    if (!input.coldChainRequired) return { ok: true };

    const min = input.temperatureMinC;
    const max = input.temperatureMaxC;

    if (typeof min !== 'number' || typeof max !== 'number') {
        return {
            ok: false,
            reason: 'missing_range',
            message: 'Cold-chain orders require both temperatureMinC and temperatureMaxC',
        };
    }
    if (min > max) {
        return {
            ok: false,
            reason: 'inverted_range',
            message: `Temperature min (${min}°C) must be ≤ max (${max}°C)`,
        };
    }
    if (min < -30 || max > 30) {
        return {
            ok: false,
            reason: 'out_of_bounds',
            message: `Temperature range [${min}..${max}]°C outside refrigerated transport bounds [-30..30]`,
        };
    }
    return { ok: true };
}

// ============================================================
// Address parsing helpers
// ============================================================

export interface ParsedAddress {
    raw: string;
    /** Heuristic city extraction from the leading "г. <city>," or first comma-segment. */
    city?: string;
    /** True when the address looks structured (has at least a comma). */
    isStructured: boolean;
}

const CITY_PREFIX_RE = /^\s*(?:г\.?|город)\s+([^\s,]+(?:\s+[^\s,]+)*?)\s*[,\s]/i;

/**
 * Lightweight address parser — used for kanban grouping + map snapping.
 * Not a geocoder; just extracts a city hint and detects structured input.
 */
export function parseAddress(raw: string | null | undefined): ParsedAddress {
    const text = String(raw ?? '').trim();
    if (!text) return { raw: '', isStructured: false };

    const cityMatch = CITY_PREFIX_RE.exec(text);
    if (cityMatch) {
        return { raw: text, city: cityMatch[1].trim(), isStructured: true };
    }

    const parts = text.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
        return { raw: text, city: parts[0], isStructured: true };
    }
    return { raw: text, isStructured: false };
}

// ============================================================
// Confirmation mode
// ============================================================

export type ConfirmationMode = 'none' | 'optional' | 'required';

export function isValidConfirmationMode(value: unknown): value is ConfirmationMode {
    return value === 'none' || value === 'optional' || value === 'required';
}

// ============================================================
// Soft-delete / archive eligibility
// ============================================================

/**
 * Decide whether an order may be soft-deleted.
 * Rule: only draft / cancelled orders can be archived; assigned / in-transit
 * orders must be cancelled first so trip linkage is unwound.
 */
export function canArchiveOrder(order: { status: string; tripId?: string | null }): {
    ok: boolean;
    reason?: string;
} {
    if (order.tripId) {
        return { ok: false, reason: 'Order is linked to a trip; cancel the order first' };
    }
    if (order.status === 'draft' || order.status === 'cancelled') {
        return { ok: true };
    }
    return { ok: false, reason: `Order status "${order.status}" is not archivable` };
}
