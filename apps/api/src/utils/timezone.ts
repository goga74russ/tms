// ============================================================
// Business Day Utility — Timezone-aware "today" boundaries
// Fixes timezone-dependent inspection/waybill gating
// ============================================================

/**
 * APP_TIMEZONE defines the operational timezone for "business day".
 * In Docker containers (UTC), this ensures "today" matches the
 * business reality (e.g., Russia/Moscow = UTC+3).
 */
const APP_TIMEZONE = process.env.APP_TIMEZONE || 'Europe/Moscow';

/**
 * Get the start and end of the current business day in the configured timezone.
 * Returns Date objects in UTC that represent the timezone-aware boundaries.
 *
 * Example: if APP_TIMEZONE=Europe/Moscow and it's 2026-03-05 02:30 UTC:
 *   - Business day in Moscow is 2026-03-05 (05:30 local)        
 *   - todayStart = 2026-03-04T21:00:00.000Z (midnight Moscow = 21:00 UTC)
 *   - todayEnd   = 2026-03-05T20:59:59.999Z (23:59:59.999 Moscow)
 */
export function getBusinessDayBounds(): { todayStart: Date; todayEnd: Date } {
    // Get current date string in the business timezone
    const now = new Date();
    const dateInTz = now.toLocaleDateString('en-CA', { timeZone: APP_TIMEZONE }); // YYYY-MM-DD format

    // Create start of day in the timezone
    // We construct the date string and parse it relative to the timezone offset
    const todayStart = new Date(
        new Date(dateInTz + 'T00:00:00').toLocaleString('en-US', { timeZone: APP_TIMEZONE })
    );

    const todayEnd = new Date(
        new Date(dateInTz + 'T23:59:59.999').toLocaleString('en-US', { timeZone: APP_TIMEZONE })
    );

    return { todayStart, todayEnd };
}

/**
 * Get the current app timezone string.
 */
export function getAppTimezone(): string {
    return APP_TIMEZONE;
}
