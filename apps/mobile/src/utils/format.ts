// ============================================================
// Pure formatting helpers used across mobile screens.
// Extracted from TemperatureLogScreen.tsx and TripDetailsScreen.tsx
// so the logic is testable without rendering native screens.
// ============================================================

/** "+1.5°C" / "-0.3°C" / "—" for nullish/NaN. */
export function formatTemp(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(value)) return '—';
    const sign = value > 0 ? '+' : '';
    return `${sign}${value.toFixed(1)}°C`;
}

/** "HH:MM:SS" from an ISO string in ru-RU; raw input on parse failure. */
export function formatTime(iso: string | null | undefined): string {
    if (!iso) return '—';
    try {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return iso;
        return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
        return iso;
    }
}

/** Russian label for a temperature reading source. */
export function temperatureSourceLabel(src?: string | null): string {
    switch (src) {
        case 'manual':
            return 'Ручной';
        case 'sensor':
            return 'Датчик';
        case 'mock':
            return 'Mock';
        default:
            return '—';
    }
}

/**
 * Format a trip window:
 *   "HH:MM – HH:MM · DD.MM" when at least one bound is valid,
 *   "— – HH:MM · DD.MM" / "HH:MM – —" for one-sided windows,
 *   null when both bounds are missing.
 */
export function formatWindow(fromIso?: string | null, toIso?: string | null): string | null {
    if (!fromIso && !toIso) return null;
    const fromD = fromIso ? new Date(fromIso) : null;
    const toD = toIso ? new Date(toIso) : null;
    const fmtTime = (d: Date) =>
        `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const fmtDate = (d: Date) =>
        `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
    const refDate =
        fromD && !Number.isNaN(fromD.getTime())
            ? fromD
            : toD && !Number.isNaN(toD.getTime())
              ? toD
              : null;
    const fromTime = fromD && !Number.isNaN(fromD.getTime()) ? fmtTime(fromD) : '—';
    const toTime = toD && !Number.isNaN(toD.getTime()) ? fmtTime(toD) : '—';
    const datePart = refDate ? ` · ${fmtDate(refDate)}` : '';
    return `${fromTime} – ${toTime}${datePart}`;
}

/** Stage index for a trip status — mirrors TripDetailsScreen.STAGE_BY_STATUS. */
export const TRIP_STAGE_BY_STATUS: Record<string, number> = {
    assigned: 0,
    waybill_draft: 1,
    inspection: 1,
    waybill_issued: 2,
    loading: 2,
    in_transit: 3,
    completed: 4,
    billed: 4,
};

export function tripStageForStatus(status: string | null | undefined): number {
    if (!status) return 0;
    return TRIP_STAGE_BY_STATUS[status] ?? 0;
}
