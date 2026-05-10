// ============================================================
// Wave 4: ETA Computation
// Вычисляет ожидаемое время прибытия на следующую точку маршрута
// по последней позиции ТС из vehicle_positions.
// Скорость — упрощённая модель: 50 км/ч плоско.
// ============================================================
import { db } from '../../db/connection.js';
import { trips, routePoints, vehiclePositions } from '../../db/schema.js';
import { and, asc, desc, eq } from 'drizzle-orm';

const FLAT_AVG_SPEED_KMH = 50;
const EARTH_RADIUS_KM = 6371;

export interface TripEtaResult {
    etaIso: string;
    distanceKm: number;
    currentLatLng: { lat: number; lon: number };
    nextPointId: string;
    source: 'mock';
}

/**
 * Расчёт расстояния между двумя GPS-точками (haversine, км).
 */
export function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const sinDLat = Math.sin(dLat / 2);
    const sinDLon = Math.sin(dLon / 2);
    const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
    return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Вычислить ETA для рейса.
 * Возвращает null, если у рейса нет ТС, нет последней GPS-позиции
 * или нет ожидающих точек маршрута.
 */
export async function computeTripEta(tripId: string): Promise<TripEtaResult | null> {
    const [trip] = await db
        .select({ id: trips.id, vehicleId: trips.vehicleId })
        .from(trips)
        .where(eq(trips.id, tripId))
        .limit(1);
    if (!trip || !trip.vehicleId) return null;

    // Последняя позиция ТС.
    const [lastPosition] = await db
        .select({
            latitude: vehiclePositions.latitude,
            longitude: vehiclePositions.longitude,
            recordedAt: vehiclePositions.recordedAt,
        })
        .from(vehiclePositions)
        .where(eq(vehiclePositions.vehicleId, trip.vehicleId))
        .orderBy(desc(vehiclePositions.recordedAt))
        .limit(1);
    if (!lastPosition) return null;

    // Ближайшая ожидающая точка маршрута (по sequence).
    const [nextPoint] = await db
        .select({
            id: routePoints.id,
            lat: routePoints.lat,
            lon: routePoints.lon,
        })
        .from(routePoints)
        .where(and(eq(routePoints.tripId, tripId), eq(routePoints.status, 'pending')))
        .orderBy(asc(routePoints.sequenceNumber))
        .limit(1);
    if (!nextPoint || nextPoint.lat == null || nextPoint.lon == null) return null;

    const current = { lat: Number(lastPosition.latitude), lon: Number(lastPosition.longitude) };
    const target = { lat: Number(nextPoint.lat), lon: Number(nextPoint.lon) };
    const distanceKm = haversineKm(current, target);
    const etaSeconds = (distanceKm / FLAT_AVG_SPEED_KMH) * 3600;
    const eta = new Date(Date.now() + etaSeconds * 1000);

    return {
        etaIso: eta.toISOString(),
        distanceKm: Math.round(distanceKm * 100) / 100,
        currentLatLng: current,
        nextPointId: nextPoint.id,
        source: 'mock',
    };
}

/**
 * Найти все рейсы (in_transit), у которых указанное ТС — текущее.
 * Используется ETA-вотчером после insert в vehicle_positions.
 */
export async function findActiveTripsForVehicle(vehicleId: string): Promise<string[]> {
    const rows = await db
        .select({ id: trips.id })
        .from(trips)
        .where(and(eq(trips.vehicleId, vehicleId), eq(trips.status, 'in_transit')));
    return rows.map((r) => r.id);
}
