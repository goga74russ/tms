// ============================================================
// РТО (Hours of Service) — pure route-layer helpers.
// Window validation + schedule formatting.
// Service-layer aggregation tests live in service.test.ts.
// ============================================================
// Constants duplicated from `service.ts` to keep this module DB-free
// (service.ts pulls the drizzle connection). They MUST stay in sync —
// service.ts is the source of truth, this mirror exists for tests.
const DAY_DRIVING_LIMIT_MIN = 9 * 60;   // 9 ч/день
const WEEK_DRIVING_LIMIT_MIN = 56 * 60; // 56 ч/неделя

export type WindowGuard =
    | { ok: true; from: Date; to: Date }
    | { ok: false; error: string };

/** Parse + validate an ISO date range. Mirrors routes.ts ordering. */
export function validateWindow(fromIso: string, toIso: string): WindowGuard {
    const from = new Date(fromIso);
    const to = new Date(toIso);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
        return { ok: false, error: 'Invalid ISO date' };
    }
    if (from > to) {
        return { ok: false, error: 'from > to' };
    }
    return { ok: true, from, to };
}

/** Tier classification for a HOS day-driving total (in minutes). */
export type RtoSeverity = 'normal' | 'warning' | 'breach';

const WARNING_THRESHOLD_PCT = 0.9;

export function classifyDayDrivingSeverity(drivingMinutes: number): RtoSeverity {
    if (drivingMinutes > DAY_DRIVING_LIMIT_MIN) return 'breach';
    if (drivingMinutes >= DAY_DRIVING_LIMIT_MIN * WARNING_THRESHOLD_PCT) return 'warning';
    return 'normal';
}

export function classifyWeekDrivingSeverity(drivingMinutes: number): RtoSeverity {
    if (drivingMinutes > WEEK_DRIVING_LIMIT_MIN) return 'breach';
    if (drivingMinutes >= WEEK_DRIVING_LIMIT_MIN * WARNING_THRESHOLD_PCT) return 'warning';
    return 'normal';
}

/** Format a day-driving total as a human-readable Russian label. */
export function formatHoursLabel(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes - hours * 60);
    if (hours === 0) return `${mins} мин`;
    if (mins === 0) return `${hours} ч`;
    return `${hours} ч ${mins} мин`;
}
