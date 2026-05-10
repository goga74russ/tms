// ============================================================
// Wave 3 — Активный симулятор Wialon-mock.
// Управляет per-vehicle интервалами: каждые 10 с пишет
// очередной TrackSample в vehicle_positions.
// ============================================================
import { db } from '../../db/connection.js';
import { routePoints, trips, vehicles, vehiclePositions } from '../../db/schema.js';
import { and, eq } from 'drizzle-orm';
import { TrackSimulator, type TrackWaypoint } from './wialon-track-generator.js';

interface RunnerEntry {
    timer: ReturnType<typeof setInterval>;
    simulator: TrackSimulator;
    vehicleId: string;
    tripId?: string | null;
    startedAt: Date;
}

const runners = new Map<string, RunnerEntry>();

const DEFAULT_INTERVAL_MS = 10_000;

async function loadWaypointsForTrip(tripId: string): Promise<TrackWaypoint[]> {
    const points = await db
        .select({ lat: routePoints.lat, lon: routePoints.lon })
        .from(routePoints)
        .where(eq(routePoints.tripId, tripId))
        .orderBy(routePoints.sequenceNumber);

    return points
        .filter((p) => p.lat != null && p.lon != null)
        .map((p) => ({ lat: p.lat as number, lon: p.lon as number }));
}

async function fallbackWaypoints(): Promise<TrackWaypoint[]> {
    // Базовая Москва: МКАД→центр→МКАД (если ничего нет)
    return [
        { lat: 55.78, lon: 37.50 },
        { lat: 55.75, lon: 37.62 },
        { lat: 55.72, lon: 37.74 },
    ];
}

export interface StartSimulationOptions {
    intervalMs?: number;
    seed?: number;
}

export interface SimulationStatus {
    vehicleId: string;
    tripId?: string | null;
    startedAt: string;
    samplesPlanned: number;
    isActive: boolean;
}

export async function startSimulation(
    vehicleId: string,
    tripId?: string | null,
    options: StartSimulationOptions = {},
): Promise<SimulationStatus> {
    if (runners.has(vehicleId)) {
        await stopSimulation(vehicleId);
    }

    // Проверить ТС
    const [vehicle] = await db.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.id, vehicleId)).limit(1);
    if (!vehicle) throw new Error('Vehicle not found');

    let waypoints: TrackWaypoint[] = [];
    let resolvedTripId: string | null = tripId ?? null;

    if (resolvedTripId) {
        // Проверить существование рейса
        const [trip] = await db.select({ id: trips.id }).from(trips).where(eq(trips.id, resolvedTripId)).limit(1);
        if (!trip) throw new Error('Trip not found');
        waypoints = await loadWaypointsForTrip(resolvedTripId);
    } else {
        // Активный рейс этого ТС?
        const [activeTrip] = await db
            .select({ id: trips.id })
            .from(trips)
            .where(and(eq(trips.vehicleId, vehicleId), eq(trips.status, 'in_transit')))
            .limit(1);
        if (activeTrip) {
            resolvedTripId = activeTrip.id;
            waypoints = await loadWaypointsForTrip(activeTrip.id);
        }
    }

    if (waypoints.length < 2) {
        waypoints = await fallbackWaypoints();
    }

    const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
    const simulator = new TrackSimulator(waypoints, {
        startedAt: new Date(),
        intervalMs,
        seed: options.seed,
    });

    const startedAt = new Date();
    const timer = setInterval(async () => {
        try {
            const sample = simulator.next();
            if (!sample) {
                await stopSimulation(vehicleId);
                return;
            }
            await db.insert(vehiclePositions).values({
                vehicleId,
                recordedAt: new Date(sample.timestamp),
                latitude: sample.latitude,
                longitude: sample.longitude,
                speedKmh: sample.speedKmh,
                headingDeg: sample.headingDeg,
                source: 'mock',
            });
        } catch (err) {
            // Лог через console — у нас нет fastify-инстанса в этом контексте
            console.error('[wialon-mock] tick error', (err as Error).message);
        }
    }, intervalMs);

    runners.set(vehicleId, {
        timer,
        simulator,
        vehicleId,
        tripId: resolvedTripId,
        startedAt,
    });

    return {
        vehicleId,
        tripId: resolvedTripId,
        startedAt: startedAt.toISOString(),
        samplesPlanned: simulator.totalSamples,
        isActive: true,
    };
}

export async function stopSimulation(vehicleId: string): Promise<boolean> {
    const entry = runners.get(vehicleId);
    if (!entry) return false;
    clearInterval(entry.timer);
    runners.delete(vehicleId);
    return true;
}

export function listSimulations(): SimulationStatus[] {
    return Array.from(runners.values()).map((e) => ({
        vehicleId: e.vehicleId,
        tripId: e.tripId,
        startedAt: e.startedAt.toISOString(),
        samplesPlanned: e.simulator.totalSamples,
        isActive: !e.simulator.isComplete(),
    }));
}

export function isSimulationActive(vehicleId: string): boolean {
    return runners.has(vehicleId);
}

export async function stopAllSimulations(): Promise<void> {
    for (const id of Array.from(runners.keys())) {
        await stopSimulation(id);
    }
}
