// ============================================================
// Trips — pure state machine + assignment helpers extracted from
// service.ts so they can be unit-tested without booting Drizzle.
//
// All exports are behaviour-preserving wrappers — service.ts and
// route handlers should import these to avoid drift.
// ============================================================
import { TRIP_STATE_TRANSITIONS, TripStatus, VehicleStatus } from '@tms/shared';

export type TripStatusName = string;

/** Returns true when `from` → `to` is in the canonical TRIP_STATE_TRANSITIONS map. */
export function canTransitionTrip(from: TripStatusName, to: TripStatusName): boolean {
    return TRIP_STATE_TRANSITIONS[from]?.includes(to) ?? false;
}

/** All legal next-states for a given trip status (empty for terminal states). */
export function nextTripStatuses(from: TripStatusName): TripStatusName[] {
    return TRIP_STATE_TRANSITIONS[from] ?? [];
}

/** Terminal statuses — no further transitions allowed. */
export function isTerminalTripStatus(status: TripStatusName): boolean {
    return nextTripStatuses(status).length === 0;
}

// ============================================================
// Aggregations across linked orders (cargo / distance)
// ============================================================

export interface OrderLike {
    cargoWeightKg?: number | null;
    cargoVolumeM3?: number | null;
    cargoPlaces?: number | null;
    adrClass?: string | null;
    coldChainRequired?: boolean | null;
    temperatureMinC?: number | null;
    temperatureMaxC?: number | null;
}

export interface CargoAggregate {
    totalWeightKg: number;
    totalVolumeM3: number;
    totalPlaces: number;
    hasAdr: boolean;
    hasColdChain: boolean;
    /** Tightest required temperature range across all cold-chain orders (null when none). */
    requiredTempMinC: number | null;
    requiredTempMaxC: number | null;
}

/** Aggregates cargo across all linked orders for a trip. Pure. */
export function aggregateCargo(orders: OrderLike[]): CargoAggregate {
    let totalWeightKg = 0;
    let totalVolumeM3 = 0;
    let totalPlaces = 0;
    let hasAdr = false;
    let hasColdChain = false;
    let requiredTempMinC: number | null = null;
    let requiredTempMaxC: number | null = null;

    for (const order of orders) {
        totalWeightKg += Number(order.cargoWeightKg ?? 0) || 0;
        totalVolumeM3 += Number(order.cargoVolumeM3 ?? 0) || 0;
        totalPlaces += Number(order.cargoPlaces ?? 0) || 0;
        if (order.adrClass) hasAdr = true;
        if (order.coldChainRequired) {
            hasColdChain = true;
            if (typeof order.temperatureMinC === 'number') {
                // Tightest min = highest value across orders.
                requiredTempMinC = requiredTempMinC === null
                    ? order.temperatureMinC
                    : Math.max(requiredTempMinC, order.temperatureMinC);
            }
            if (typeof order.temperatureMaxC === 'number') {
                // Tightest max = lowest value across orders.
                requiredTempMaxC = requiredTempMaxC === null
                    ? order.temperatureMaxC
                    : Math.min(requiredTempMaxC, order.temperatureMaxC);
            }
        }
    }

    return {
        totalWeightKg,
        totalVolumeM3,
        totalPlaces,
        hasAdr,
        hasColdChain,
        requiredTempMinC,
        requiredTempMaxC,
    };
}

// ============================================================
// Distance aggregation
// ============================================================

/** Returns actualDistanceKm when present, else plannedDistanceKm, else 0. */
export function effectiveTripDistanceKm(trip: {
    actualDistanceKm?: number | null;
    plannedDistanceKm?: number | null;
}): number {
    if (typeof trip.actualDistanceKm === 'number' && trip.actualDistanceKm > 0) {
        return trip.actualDistanceKm;
    }
    if (typeof trip.plannedDistanceKm === 'number' && trip.plannedDistanceKm > 0) {
        return trip.plannedDistanceKm;
    }
    return 0;
}

// ============================================================
// Vehicle / driver eligibility (pure pre-checks)
// ============================================================

export interface VehicleEligibilityInput {
    status?: string | null;
    payloadCapacityKg?: number | null;
    bodyType?: string | null;
    adrClasses?: string[] | null;
}

export interface EligibilityIssue {
    type: 'hard' | 'soft';
    code: string;
    message: string;
}

/**
 * Pure vehicle eligibility check vs. an aggregated cargo profile.
 * Does NOT touch the DB — caller passes the loaded vehicle row + cargo.
 */
export function checkVehicleEligibility(
    vehicle: VehicleEligibilityInput,
    cargo: CargoAggregate,
    options: { requiredBodyType?: string | null; requiredAdrClass?: string | null } = {},
): EligibilityIssue[] {
    const issues: EligibilityIssue[] = [];

    if (vehicle.status && vehicle.status !== VehicleStatus.AVAILABLE) {
        issues.push({
            type: 'hard',
            code: 'VEHICLE_NOT_AVAILABLE',
            message: `Vehicle not available (status: ${vehicle.status})`,
        });
    }

    if (cargo.totalWeightKg > 0
        && typeof vehicle.payloadCapacityKg === 'number'
        && vehicle.payloadCapacityKg < cargo.totalWeightKg) {
        issues.push({
            type: 'hard',
            code: 'OVERWEIGHT',
            message: `Overweight: cargo ${cargo.totalWeightKg} kg > capacity ${vehicle.payloadCapacityKg} kg`,
        });
    }

    if (options.requiredBodyType && vehicle.bodyType) {
        const want = options.requiredBodyType.trim().toLowerCase();
        const have = vehicle.bodyType.trim().toLowerCase();
        if (want && have && !have.includes(want)) {
            issues.push({
                type: 'soft',
                code: 'BODY_TYPE_MISMATCH',
                message: `Body type "${vehicle.bodyType}" may not match required "${options.requiredBodyType}"`,
            });
        }
    }

    if (options.requiredAdrClass) {
        const allowed = vehicle.adrClasses ?? [];
        if (!allowed.includes(options.requiredAdrClass)) {
            issues.push({
                type: 'hard',
                code: 'ADR_CLASS_NOT_PERMITTED',
                message: `Vehicle is not permitted for ADR class ${options.requiredAdrClass}`,
            });
        }
    }

    if (cargo.hasAdr && (!vehicle.adrClasses || vehicle.adrClasses.length === 0)) {
        issues.push({
            type: 'hard',
            code: 'ADR_VEHICLE_REQUIRED',
            message: 'Cargo requires ADR-certified vehicle',
        });
    }

    return issues;
}

export interface DriverEligibilityInput {
    isActive?: boolean | null;
    licenseExpiry?: Date | string | null;
    medCertificateExpiry?: Date | string | null;
    licenseCategories?: string[] | null;
}

export interface DriverEligibilityOptions {
    requiredLicenseCategory?: string | null;
    /** Optional reference "now"; defaults to current time. Useful for deterministic tests. */
    now?: Date;
}

export function checkDriverEligibility(
    driver: DriverEligibilityInput,
    options: DriverEligibilityOptions = {},
): EligibilityIssue[] {
    const issues: EligibilityIssue[] = [];
    const now = options.now ?? new Date();

    if (driver.isActive === false) {
        issues.push({
            type: 'hard',
            code: 'DRIVER_INACTIVE',
            message: 'Driver is not active',
        });
    }

    if (driver.licenseExpiry) {
        const expiry = driver.licenseExpiry instanceof Date
            ? driver.licenseExpiry
            : new Date(driver.licenseExpiry);
        if (!Number.isNaN(expiry.getTime()) && expiry < now) {
            issues.push({
                type: 'hard',
                code: 'LICENSE_EXPIRED',
                message: 'Driver license expired',
            });
        }
    }

    if (driver.medCertificateExpiry) {
        const expiry = driver.medCertificateExpiry instanceof Date
            ? driver.medCertificateExpiry
            : new Date(driver.medCertificateExpiry);
        if (!Number.isNaN(expiry.getTime()) && expiry < now) {
            issues.push({
                type: 'hard',
                code: 'MED_CERTIFICATE_EXPIRED',
                message: 'Medical certificate expired',
            });
        }
    }

    if (options.requiredLicenseCategory) {
        const cats = driver.licenseCategories ?? [];
        if (!cats.includes(options.requiredLicenseCategory)) {
            issues.push({
                type: 'hard',
                code: 'LICENSE_CATEGORY_MISSING',
                message: `Driver lacks required license category ${options.requiredLicenseCategory}`,
            });
        }
    }

    return issues;
}

// ============================================================
// HOS (hours of service) checker — wraps tachograph daily record
// ============================================================

export interface HosDailyRecord {
    drivingMinutes?: number | null;
    continuousDrivingMinutes?: number | null;
    weeklyRestMinutes?: number | null;
}

export function checkHosCompliance(record: HosDailyRecord | null | undefined): EligibilityIssue[] {
    if (!record) return [];
    const issues: EligibilityIssue[] = [];

    if ((record.continuousDrivingMinutes ?? 0) > 270) {
        issues.push({
            type: 'soft',
            code: 'RTO_CONTINUOUS_DRIVING_EXCEEDED',
            message: 'Continuous driving exceeded 4.5 h',
        });
    }
    if ((record.drivingMinutes ?? 0) > 600) {
        issues.push({
            type: 'soft',
            code: 'RTO_DAILY_DRIVING_EXCEEDED',
            message: 'Daily driving exceeded 10 h',
        });
    }
    if (record.weeklyRestMinutes !== null
        && record.weeklyRestMinutes !== undefined
        && record.weeklyRestMinutes < 2640) {
        issues.push({
            type: 'soft',
            code: 'RTO_WEEKLY_REST_INSUFFICIENT',
            message: 'Weekly rest below 44 h',
        });
    }

    return issues;
}

// Re-export for convenience.
export { TripStatus };
