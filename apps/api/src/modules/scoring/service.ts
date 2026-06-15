// ============================================================
// Wave 5 — Driver scoring v0.
// Композитный балл (0-100) считается on-demand из существующих
// данных (trips, route_points, temperature_readings, fines,
// tachograph_records).
//
// Формула:
//   start = 100
//   - 5 за каждый RTO breach (день, где вождение > 9ч)
//   - 3 за каждый cold-chain breach
//   - 2 за каждый штраф ГИБДД
//   - 10 если on-time < 80%
// Минимум 0, максимум 100.
// ============================================================
import { db } from '../../db/connection.js';
import {
    trips,
    routePoints,
    temperatureReadings,
    fines,
    drivers,
    tachographRecords,
} from '../../db/schema.js';
import { and, eq, ne, gte, lte, inArray, isNotNull } from 'drizzle-orm';

export interface DriverScoreBreakdown {
    tripCount: number;
    completedTripCount: number;
    onTimeTripCount: number;
    onTimeTripsTotal: number; // знаменатель: рейсы с окнами
    onTimeRatio: number | null; // 0..1 или null если нет рейсов с окнами
    coldChainBreachCount: number;
    rtoBreachCount: number;
    finesCount: number;
}

export interface DriverScoreResult {
    driverId: string;
    from: string;
    to: string;
    score: number; // 0..100
    breakdown: DriverScoreBreakdown;
    deductions: Array<{ reason: string; points: number }>;
}

const DAY_DRIVING_LIMIT_MIN = 9 * 60;

function clampScore(s: number): number {
    if (s < 0) return 0;
    if (s > 100) return 100;
    return Math.round(s);
}

function defaultRange(from?: Date, to?: Date): { from: Date; to: Date } {
    const now = to ?? new Date();
    const fromDate = from ?? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { from: fromDate, to: now };
}

export async function computeDriverScore(
    driverId: string,
    fromInput?: Date,
    toInput?: Date,
): Promise<DriverScoreResult> {
    const { from, to } = defaultRange(fromInput, toInput);

    // 1. Trips for driver in window (по дате создания/планового выезда)
    const tripsRows = await db
        .select({
            id: trips.id,
            status: trips.status,
            actualCompletionAt: trips.actualCompletionAt,
        })
        .from(trips)
        .where(and(
            eq(trips.driverId, driverId),
            gte(trips.createdAt, from),
            lte(trips.createdAt, to),
        ));

    const tripIds = tripsRows.map((t) => t.id);
    const completedTrips = tripsRows.filter((t) => t.status === 'completed');

    // 2. On-time deliveries: считаем только рейсы где у всех route_points
    //    есть windowTo и completedAt. Рейс on-time, если каждая точка
    //    completedAt <= windowTo.
    let onTimeTripsTotal = 0;
    let onTimeTripCount = 0;
    if (completedTrips.length > 0) {
        const completedTripIds = completedTrips.map((t) => t.id);
        const points = await db
            .select({
                tripId: routePoints.tripId,
                windowTo: routePoints.windowTo,
                windowEnd: routePoints.windowEnd,
                completedAt: routePoints.completedAt,
            })
            .from(routePoints)
            .where(inArray(routePoints.tripId, completedTripIds));

        const byTrip = new Map<string, typeof points>();
        for (const p of points) {
            const list = byTrip.get(p.tripId) ?? [];
            list.push(p);
            byTrip.set(p.tripId, list);
        }

        for (const trip of completedTrips) {
            const list = byTrip.get(trip.id) ?? [];
            // считаем только рейсы у которых хотя бы одна точка имеет окно
            const windowedPoints = list.filter((p) => p.windowTo ?? p.windowEnd);
            if (windowedPoints.length === 0) continue;
            // P3 #683 (код-аудит 2026-06-14): пропуск данных — windowed-точка без
            // completedAt — это НЕ опоздание, а неполнота телеметрии. Раньше такой
            // рейс молча считался опоздавшим (completedAt отсутствует → late),
            // занижая балл из-за дыр в данных. Теперь исключаем рейс с пробелом из
            // знаменателя on-time целиком (не штрафуем за то, чего не измерили).
            const hasDataGap = windowedPoints.some((p) => !p.completedAt);
            if (hasDataGap) continue;
            onTimeTripsTotal += 1;
            const allOnTime = windowedPoints.every((p) => {
                const w = (p.windowTo ?? p.windowEnd) as Date;
                return new Date(p.completedAt as Date) <= new Date(w);
            });
            if (allOnTime) onTimeTripCount += 1;
        }
    }

    // 3. Cold-chain breaches across this driver's trips in window.
    // P3 #681 (код-аудит 2026-06-14): окно скоринга задаётся ОДНИМ источником —
    // trip.createdAt (см. выборку tripsRows выше). Все суб-метрики (on-time,
    // cold-chain, штрафы) считаются по этому набору рейсов. Раньше cold-chain
    // дополнительно фильтровал замеры по recordedAt ∈ [from,to] — рейс попадал в
    // окно по createdAt, но его breach-замеры с чуть иным таймштампом молча
    // выпадали (рассинхрон полей). Скоупим только по tripIds окна.
    let coldChainBreachCount = 0;
    if (tripIds.length > 0) {
        const breaches = await db
            .select({ id: temperatureReadings.id })
            .from(temperatureReadings)
            .where(and(
                inArray(temperatureReadings.tripId, tripIds),
                eq(temperatureReadings.breach, true),
            ));
        coldChainBreachCount = breaches.length;
    }

    // 4. RTO breaches: дни с drivingMinutes > 9*60 (DAY_DRIVING_LIMIT_MIN).
    const tacho = await db
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
    const dayMin: Record<string, number> = {};
    for (const row of tacho) {
        const key = row.date.toISOString().slice(0, 10);
        dayMin[key] = (dayMin[key] ?? 0) + (row.drivingMinutes ?? 0);
    }
    const rtoBreachCount = Object.values(dayMin).filter((m) => m > DAY_DRIVING_LIMIT_MIN).length;

    // 5. Fines for this driver in window (created_at).
    const driverFines = await db
        .select({ id: fines.id })
        .from(fines)
        .where(and(
            eq(fines.driverId, driverId),
            gte(fines.violationDate, from),
            lte(fines.violationDate, to),
            // P3 (код-аудит 2026-06-14): не штрафуем за ОБЖАЛОВАННЫЕ штрафы (appealed).
            ne(fines.status, 'appealed'),
        ));
    const finesCount = driverFines.length;

    const onTimeRatio = onTimeTripsTotal > 0 ? onTimeTripCount / onTimeTripsTotal : null;

    // Composite score
    let score = 100;
    const deductions: Array<{ reason: string; points: number }> = [];
    if (rtoBreachCount > 0) {
        const pts = rtoBreachCount * 5;
        deductions.push({ reason: `RTO breaches × ${rtoBreachCount}`, points: pts });
        score -= pts;
    }
    if (coldChainBreachCount > 0) {
        const pts = coldChainBreachCount * 3;
        deductions.push({ reason: `Cold-chain breaches × ${coldChainBreachCount}`, points: pts });
        score -= pts;
    }
    if (finesCount > 0) {
        const pts = finesCount * 2;
        deductions.push({ reason: `Fines × ${finesCount}`, points: pts });
        score -= pts;
    }
    if (onTimeRatio !== null && onTimeRatio < 0.8) {
        deductions.push({ reason: 'On-time delivery < 80%', points: 10 });
        score -= 10;
    }

    return {
        driverId,
        from: from.toISOString(),
        to: to.toISOString(),
        score: clampScore(score),
        breakdown: {
            tripCount: tripsRows.length,
            completedTripCount: completedTrips.length,
            onTimeTripCount,
            onTimeTripsTotal,
            onTimeRatio,
            coldChainBreachCount,
            rtoBreachCount,
            finesCount,
        },
        deductions,
    };
}

export interface ScoreboardEntry {
    driverId: string;
    fullName: string;
    score: number;
    tripCount: number;
}

export async function computeScoreboard(
    fromInput?: Date,
    toInput?: Date,
    limit = 10,
    organizationId?: string | null,
): Promise<{ from: string; to: string; entries: ScoreboardEntry[] }> {
    const { from, to } = defaultRange(fromInput, toInput);

    // 1. Список активных водителей (org-scoped когда задано).
    const driverRows = await db
        .select({ id: drivers.id, fullName: drivers.fullName })
        .from(drivers)
        .where(organizationId
            ? and(eq(drivers.isActive, true), eq(drivers.organizationId, organizationId))
            : eq(drivers.isActive, true));

    // C9 (perf): раньше N водителей × ~5 запросов считались СТРОГО последовательно
    // (for await) → 50 водителей = 250 round-trip'ов подряд. Параллелим батчами
    // (bounded concurrency, чтобы не исчерпать пул max=40). Фильтрация/вывод те же.
    // TODO(perf): дальняя оптимизация — единый аггрегат-SQL вместо per-driver.
    const CONCURRENCY = 8;
    const entries: ScoreboardEntry[] = [];
    for (let i = 0; i < driverRows.length; i += CONCURRENCY) {
        const batch = driverRows.slice(i, i + CONCURRENCY);
        const results = await Promise.all(batch.map(async (d) => {
            const result = await computeDriverScore(d.id, from, to);
            // включаем только водителей которые что-то делали в окне
            if (result.breakdown.tripCount === 0
                && result.breakdown.rtoBreachCount === 0
                && result.breakdown.finesCount === 0) {
                return null;
            }
            return {
                driverId: d.id,
                fullName: d.fullName,
                score: result.score,
                tripCount: result.breakdown.tripCount,
            } satisfies ScoreboardEntry;
        }));
        for (const r of results) {
            if (r) entries.push(r);
        }
    }

    entries.sort((a, b) => b.score - a.score);
    const trimmed = entries.slice(0, Math.max(1, limit));

    return {
        from: from.toISOString(),
        to: to.toISOString(),
        entries: trimmed,
    };
}

// Suppress unused-import warning when isNotNull becomes unused in future edits
void isNotNull;
