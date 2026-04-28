// ================================================================
// Distance Calculation Service
// Haversine formula + distance matrix for route planning
// ================================================================

export interface GeoPoint {
    lat: number;
    lon: number;
}

const EARTH_RADIUS_KM = 6371;

/**
 * Calculate great-circle distance between two points using the Haversine formula.
 * Returns distance in kilometers.
 */
export function haversineDistance(p1: GeoPoint, p2: GeoPoint): number {
    const dLat = toRadians(p2.lat - p1.lat);
    const dLon = toRadians(p2.lon - p1.lon);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRadians(p1.lat)) * Math.cos(toRadians(p2.lat)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return EARTH_RADIUS_KM * c;
}

/**
 * Calculate a distance matrix between all pairs of points.
 * Returns an NxN matrix where matrix[i][j] = distance from point i to point j.
 */
export function calculateDistanceMatrix(points: GeoPoint[]): number[][] {
    const n = points.length;
    const matrix: number[][] = [];

    for (let i = 0; i < n; i++) {
        const row: number[] = [];
        for (let j = 0; j < n; j++) {
            if (i === j) {
                row.push(0);
            } else {
                row.push(Math.round(haversineDistance(points[i], points[j]) * 100) / 100);
            }
        }
        matrix.push(row);
    }

    return matrix;
}

/**
 * Calculate total route distance along an ordered sequence of points.
 * Returns total distance in kilometers.
 */
export function calculateRouteDistance(points: GeoPoint[]): number {
    if (points.length < 2) return 0;

    let total = 0;
    for (let i = 1; i < points.length; i++) {
        total += haversineDistance(points[i - 1], points[i]);
    }

    return Math.round(total * 100) / 100;
}

/**
 * Find the nearest point from a list to a given reference point.
 * Returns the index and distance.
 */
export function findNearest(
    reference: GeoPoint,
    candidates: GeoPoint[],
): { index: number; distance: number } | null {
    if (candidates.length === 0) return null;

    let bestIndex = 0;
    let bestDistance = haversineDistance(reference, candidates[0]);

    for (let i = 1; i < candidates.length; i++) {
        const dist = haversineDistance(reference, candidates[i]);
        if (dist < bestDistance) {
            bestDistance = dist;
            bestIndex = i;
        }
    }

    return { index: bestIndex, distance: Math.round(bestDistance * 100) / 100 };
}

/**
 * Estimate driving distance from straight-line (Haversine) distance.
 * Uses a detour factor of 1.3 (typical for road networks).
 */
export function estimateDrivingDistance(straightLineKm: number): number {
    const DETOUR_FACTOR = 1.3;
    return Math.round(straightLineKm * DETOUR_FACTOR * 100) / 100;
}

// ================================================================
// Helpers
// ================================================================

function toRadians(degrees: number): number {
    return (degrees * Math.PI) / 180;
}
