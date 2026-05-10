// ============================================================
// Wave 3 — Реалистичный генератор треков Wialon-mock.
// Интерполирует движение между waypoints с шагом ~10 с,
// варьирует скорость, добавляет джиттер, замедляется у точек.
// ============================================================

export interface TrackWaypoint {
    lat: number;
    lon: number;
    /** Радиус "около waypoint" в метрах для замедления */
    slowdownRadiusMeters?: number;
}

export interface TrackSample {
    timestamp: string;
    latitude: number;
    longitude: number;
    speedKmh: number;
    headingDeg: number;
}

export interface SimulateTrackOptions {
    /** Начало симуляции (ISO/Date) */
    startedAt?: Date;
    /** Шаг между сэмплами (мс), по умолчанию 10 000 */
    intervalMs?: number;
    /** Крейсерская скорость на сегменте, км/ч (default 60) */
    cruiseSpeedKmh?: number;
    /** Скорость у точки, км/ч (default 8) */
    waypointSpeedKmh?: number;
    /** Радиус "около waypoint" в метрах */
    slowdownRadiusMeters?: number;
    /** Сид джиттера (стабильность тестов) */
    seed?: number;
    /** Максимальное число сэмплов (cap) */
    maxSamples?: number;
}

const EARTH_RADIUS_M = 6_371_000;

function toRad(deg: number): number { return (deg * Math.PI) / 180; }
function toDeg(rad: number): number { return (rad * 180) / Math.PI; }

/** Метров между двумя точками (haversine) */
export function haversineMeters(a: TrackWaypoint, b: TrackWaypoint): number {
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(x)));
}

/** Bearing в градусах (0–360) */
function bearingDeg(a: TrackWaypoint, b: TrackWaypoint): number {
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const dLon = toRad(b.lon - a.lon);
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Линейная интерполяция в географических координатах (приближение для коротких отрезков ОК) */
function lerpLatLon(a: TrackWaypoint, b: TrackWaypoint, t: number): { lat: number; lon: number } {
    return {
        lat: a.lat + (b.lat - a.lat) * t,
        lon: a.lon + (b.lon - a.lon) * t,
    };
}

/** Простой LCG для воспроизводимого джиттера */
function mulberry32(seed: number): () => number {
    let s = seed | 0;
    return () => {
        s = (s + 0x6D2B79F5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Генерирует последовательность позиций по маршруту.
 * Скорость 50–80 км/ч на сегментах, 5–10 у waypoint, шаг ~10 с, маленький GPS-джиттер.
 */
export function simulateTrack(
    waypoints: TrackWaypoint[],
    options: SimulateTrackOptions = {},
): TrackSample[] {
    if (waypoints.length < 2) return [];
    const startedAt = options.startedAt ?? new Date();
    const intervalMs = options.intervalMs ?? 10_000;
    const cruise = options.cruiseSpeedKmh ?? 60;
    const wp = options.waypointSpeedKmh ?? 8;
    const slowR = options.slowdownRadiusMeters ?? 250;
    const maxSamples = options.maxSamples ?? 5_000;
    const rand = mulberry32(options.seed ?? 1337);

    const samples: TrackSample[] = [];
    let t = startedAt.getTime();

    for (let i = 0; i < waypoints.length - 1; i++) {
        const a = waypoints[i]!;
        const b = waypoints[i + 1]!;
        const distM = haversineMeters(a, b);
        if (distM <= 0) continue;
        const heading = bearingDeg(a, b);
        const radius = a.slowdownRadiusMeters ?? slowR;

        // Расстояние, пройденное по сегменту, в метрах
        let travelled = 0;
        // Ставим стартовый сэмпл (с малой скоростью у точки)
        if (samples.length === 0) {
            samples.push(makeSample(a.lat, a.lon, wp + rand() * 2, heading, t, rand));
            t += intervalMs;
        }

        while (travelled < distM && samples.length < maxSamples) {
            // Скорость зависит от близости к waypoint
            const distToA = travelled;
            const distToB = distM - travelled;
            const nearWp = Math.min(distToA, distToB) < radius;
            // вариация ±10 в крейсерском режиме (50–70), ±2 у точки (6–10)
            const baseSpeed = nearWp ? wp : cruise;
            const variance = nearWp ? 4 : 20;
            const speedKmh = Math.max(1, baseSpeed - variance / 2 + rand() * variance);
            const speedMs = (speedKmh * 1000) / 3600;
            const stepM = speedMs * (intervalMs / 1000);
            travelled = Math.min(distM, travelled + stepM);
            const tFraction = travelled / distM;
            const { lat, lon } = lerpLatLon(a, b, tFraction);
            samples.push(makeSample(lat, lon, speedKmh, heading, t, rand));
            t += intervalMs;
        }

        if (samples.length >= maxSamples) break;
    }

    // Финальный сэмпл — последний waypoint
    if (samples.length < maxSamples) {
        const last = waypoints[waypoints.length - 1]!;
        const prevHeading = samples[samples.length - 1]?.headingDeg ?? 0;
        samples.push(makeSample(last.lat, last.lon, wp / 2, prevHeading, t, rand));
    }

    return samples;
}

function makeSample(
    lat: number,
    lon: number,
    speedKmh: number,
    headingDeg: number,
    t: number,
    rand: () => number,
): TrackSample {
    // GPS-джиттер ~3–5 м: ≈ 0.00003–0.00005°
    const jitter = (rand() - 0.5) * 0.00006;
    return {
        timestamp: new Date(t).toISOString(),
        latitude: Number((lat + jitter).toFixed(6)),
        longitude: Number((lon + jitter).toFixed(6)),
        speedKmh: Number(speedKmh.toFixed(1)),
        headingDeg: Number(headingDeg.toFixed(1)),
    };
}

/**
 * Stateful симулятор: на каждый "tick" возвращает следующий сэмпл по маршруту.
 * Используется живым воркером, который периодически пишет в vehicle_positions.
 */
export class TrackSimulator {
    private samples: TrackSample[];
    private cursor = 0;

    constructor(waypoints: TrackWaypoint[], options: SimulateTrackOptions = {}) {
        this.samples = simulateTrack(waypoints, options);
    }

    next(): TrackSample | null {
        if (this.cursor >= this.samples.length) return null;
        return this.samples[this.cursor++] ?? null;
    }

    isComplete(): boolean {
        return this.cursor >= this.samples.length;
    }

    reset(): void {
        this.cursor = 0;
    }

    get totalSamples(): number {
        return this.samples.length;
    }
}
