// ============================================================
// Wave 3 — РТО (режим труда и отдыха) агрегатор.
// Базовые нормы РФ: 9 ч / день вождения, 56 ч / неделя.
// Источник данных: tachograph_records (driver_id + drivingMinutes/date).
// ============================================================
import { db } from '../../db/connection.js';
import { tachographRecords } from '../../db/schema.js';
import { and, eq, gte, lte } from 'drizzle-orm';

// Лимиты по умолчанию (в минутах)
export const DAY_DRIVING_LIMIT_MIN = 9 * 60;   // 9 часов
export const WEEK_DRIVING_LIMIT_MIN = 56 * 60; // 56 часов
const MIN_PER_HOUR = 60;

// P2 (код-аудит 2026-06-14): агрегируем РТО по МСК-дате (UTC+3), а не UTC — иначе
// записи у границы суток (РФ-водители в МСК+) попадали не в тот день. Все вызовы
// dateOnlyIso согласованы (todayDate + бакеты по одной шкале).
const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;
function dateOnlyIso(date: Date): string {
    return new Date(date.getTime() + MSK_OFFSET_MS).toISOString().slice(0, 10);
}

function minutesToHours(minutes: number): number {
    return Number((minutes / MIN_PER_HOUR).toFixed(2));
}

export interface DailyHoursMap {
    [dateIso: string]: number; // часы (десятичные)
}

export interface RtoBreach {
    date: string; // YYYY-MM-DD (для недельного — 'week')
    dayHours: number;
    limit: number;
    /** P2 — тип превышения: дневное (по умолчанию) или недельное (56 ч). */
    kind?: 'daily' | 'weekly';
}

export interface DriverHoursSummary {
    driverId: string;
    from: string;
    to: string;
    dailyHours: DailyHoursMap;
    weeklyHours: number; // суммарно за период (или за rolling-7d при null)
    dayLimit: number;
    weekLimit: number;
    breaches: RtoBreach[];
}

/**
 * Агрегирует часы вождения по тахографу за период.
 * `from`, `to` — ISO-даты включительно.
 */
export async function getDriverHoursSummary(
    driverId: string,
    from: Date,
    to: Date,
): Promise<DriverHoursSummary> {
    const rows = await db
        .select({
            date: tachographRecords.date,
            drivingMinutes: tachographRecords.drivingMinutes,
        })
        .from(tachographRecords)
        .where(and(
            eq(tachographRecords.driverId, driverId),
            gte(tachographRecords.date, from),
            lte(tachographRecords.date, to),
        ));

    const dailyMin: Record<string, number> = {};
    for (const row of rows) {
        const key = dateOnlyIso(row.date);
        dailyMin[key] = (dailyMin[key] ?? 0) + (row.drivingMinutes ?? 0);
    }

    const dailyHours: DailyHoursMap = {};
    const breaches: RtoBreach[] = [];
    let totalMin = 0;

    for (const [date, min] of Object.entries(dailyMin)) {
        const hours = minutesToHours(min);
        dailyHours[date] = hours;
        totalMin += min;
        if (min > DAY_DRIVING_LIMIT_MIN) {
            breaches.push({
                date,
                dayHours: hours,
                limit: DAY_DRIVING_LIMIT_MIN / MIN_PER_HOUR,
                kind: 'daily',
            });
        }
    }

    // P2 (код-аудит 2026-06-14): недельный лимit (56 ч) раньше не детектился —
    // breaches содержал только дневные. Добавляем недельное превышение.
    if (totalMin > WEEK_DRIVING_LIMIT_MIN) {
        breaches.push({
            date: 'week',
            dayHours: minutesToHours(totalMin),
            limit: WEEK_DRIVING_LIMIT_MIN / MIN_PER_HOUR,
            kind: 'weekly',
        });
    }

    return {
        driverId,
        from: from.toISOString(),
        to: to.toISOString(),
        dailyHours,
        weeklyHours: minutesToHours(totalMin),
        dayLimit: DAY_DRIVING_LIMIT_MIN / MIN_PER_HOUR,
        weekLimit: WEEK_DRIVING_LIMIT_MIN / MIN_PER_HOUR,
        breaches,
    };
}

export interface DriverHosStatus {
    driverId: string;
    asOf: string;
    todayDate: string;
    dayHours: number;
    weekHours: number;
    dayLimit: number;
    weekLimit: number;
    breach: boolean;
    breachReasons: string[];
}

/**
 * Текущий статус РТО водителя на сегодня + rolling 7-day window.
 */
export async function getDriverHosStatus(
    driverId: string,
    asOf?: Date,
): Promise<DriverHosStatus> {
    const now = asOf ?? new Date();
    const todayDate = dateOnlyIso(now);

    // Окно за последние 7 дней (включая сегодня)
    const startOfToday = new Date(now);
    startOfToday.setUTCHours(0, 0, 0, 0);
    const endOfToday = new Date(now);
    endOfToday.setUTCHours(23, 59, 59, 999);

    const startOfWeek = new Date(startOfToday);
    startOfWeek.setUTCDate(startOfWeek.getUTCDate() - 6); // последние 7 суток

    const rows = await db
        .select({
            date: tachographRecords.date,
            drivingMinutes: tachographRecords.drivingMinutes,
        })
        .from(tachographRecords)
        .where(and(
            eq(tachographRecords.driverId, driverId),
            gte(tachographRecords.date, startOfWeek),
            lte(tachographRecords.date, endOfToday),
        ));

    let dayMin = 0;
    let weekMin = 0;
    for (const row of rows) {
        const min = row.drivingMinutes ?? 0;
        weekMin += min;
        if (dateOnlyIso(row.date) === todayDate) {
            dayMin += min;
        }
    }

    const breachReasons: string[] = [];
    if (dayMin > DAY_DRIVING_LIMIT_MIN) {
        breachReasons.push(`day_limit_exceeded:${minutesToHours(dayMin)}h>${DAY_DRIVING_LIMIT_MIN / MIN_PER_HOUR}h`);
    }
    if (weekMin > WEEK_DRIVING_LIMIT_MIN) {
        breachReasons.push(`week_limit_exceeded:${minutesToHours(weekMin)}h>${WEEK_DRIVING_LIMIT_MIN / MIN_PER_HOUR}h`);
    }

    return {
        driverId,
        asOf: now.toISOString(),
        todayDate,
        dayHours: minutesToHours(dayMin),
        weekHours: minutesToHours(weekMin),
        dayLimit: DAY_DRIVING_LIMIT_MIN / MIN_PER_HOUR,
        weekLimit: WEEK_DRIVING_LIMIT_MIN / MIN_PER_HOUR,
        breach: breachReasons.length > 0,
        breachReasons,
    };
}
