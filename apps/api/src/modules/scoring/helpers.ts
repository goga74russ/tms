// ============================================================
// Driver scoring — route-layer pure helpers.
// Tier classification + period aggregation. Service-layer logic
// (composite score with DB) lives in service.ts + service.test.ts.
// ============================================================

export type ScoreTier = 'bronze' | 'silver' | 'gold' | 'platinum';

/**
 * Map a 0-100 score onto a discrete tier.
 *
 *   0–49   → bronze
 *   50–74  → silver
 *   75–89  → gold
 *   90–100 → platinum
 *
 * Scores outside [0, 100] are clamped at the nearest edge so this
 * remains total — UI never sees `undefined`.
 */
export function scoreToTier(score: number): ScoreTier {
    if (!Number.isFinite(score)) return 'bronze';
    const clamped = Math.max(0, Math.min(100, score));
    if (clamped >= 90) return 'platinum';
    if (clamped >= 75) return 'gold';
    if (clamped >= 50) return 'silver';
    return 'bronze';
}

/** Default window when neither `from` nor `to` is provided. */
export const DEFAULT_SCORING_WINDOW_DAYS = 30;

export interface ScoringWindow {
    from: Date;
    to: Date;
}

/**
 * Resolve from/to inputs to a concrete `[from, to]` window. Used by
 * routes before calling `computeDriverScore`. Mirrors the
 * `defaultRange()` helper inside `service.ts` so tests can assert
 * the routes-layer behaviour independently.
 */
export function resolveScoringWindow(
    from: Date | undefined,
    to: Date | undefined,
    now: Date = new Date(),
): ScoringWindow {
    const toDate = to ?? now;
    const fromDate = from ?? new Date(toDate.getTime() - DEFAULT_SCORING_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    return { from: fromDate, to: toDate };
}

/** Clamp + validate the scoreboard `limit` query param. */
export function clampScoreboardLimit(input: number | undefined): number {
    if (input === undefined || input === null) return 10;
    if (!Number.isFinite(input)) return 10;
    return Math.min(200, Math.max(1, Math.floor(input)));
}

/** Aggregate per-driver scores across a period to a single tier breakdown. */
export interface TierBreakdown {
    bronze: number;
    silver: number;
    gold: number;
    platinum: number;
}

export function aggregateTiers(scores: ReadonlyArray<number>): TierBreakdown {
    const out: TierBreakdown = { bronze: 0, silver: 0, gold: 0, platinum: 0 };
    for (const s of scores) out[scoreToTier(s)]++;
    return out;
}
