// ============================================================
// Trips Module — Business Logic (§3.2, §4.2, Приложение Б.3)
// ============================================================
import { db } from '../../db/connection.js';
import {
    trips, orders, routePoints, vehicles, drivers, permits,
} from '../../db/schema.js';
import { eq, and, desc, sql, gte, lte, inArray } from 'drizzle-orm';
import { recordEvent } from '../../events/journal.js';
import { TripStatus, OrderStatus, VehicleStatus } from '@tms/shared';

// --- State machine transitions (§4.2) ---
const TRIP_TRANSITIONS: Record<string, string[]> = {
    [TripStatus.PLANNING]: [TripStatus.ASSIGNED, TripStatus.CANCELLED],
    [TripStatus.ASSIGNED]: [TripStatus.INSPECTION, TripStatus.CANCELLED],
    [TripStatus.INSPECTION]: [TripStatus.WAYBILL_ISSUED, TripStatus.CANCELLED],
    [TripStatus.WAYBILL_ISSUED]: [TripStatus.LOADING],
    [TripStatus.LOADING]: [TripStatus.IN_TRANSIT, TripStatus.CANCELLED],
    [TripStatus.IN_TRANSIT]: [TripStatus.COMPLETED],
    [TripStatus.COMPLETED]: [TripStatus.BILLED],
    [TripStatus.BILLED]: [],
    [TripStatus.CANCELLED]: [],
};

export function canTransition(from: string, to: string): boolean {
    return TRIP_TRANSITIONS[from]?.includes(to) ?? false;
}

// --- Sequential number: TRP-2026-00001 ---
// M-7: FOR UPDATE must run inside a transaction to hold the lock
async function generateTripNumber(tx: { execute: typeof db.execute }): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `TRP-${year}-`;

    const result = await tx.execute(
        sql`SELECT number FROM trips WHERE number LIKE ${prefix + '%'} ORDER BY number DESC LIMIT 1 FOR UPDATE`
    );

    let seq = 1;
    const rows = result as any[];
    if (rows.length > 0 && rows[0].number) {
        const parts = (rows[0].number as string).split('-');
        seq = parseInt(parts[2], 10) + 1;
    }

    return `${prefix}${String(seq).padStart(5, '0')}`;
}

// --- Types ---
export interface CreateTripInput {
    vehicleId?: string;
    driverId?: string;
    plannedDistanceKm?: number;
    plannedDepartureAt?: string;
    notes?: string;
    createdBy: string;
    orderIds?: string[]; // заявки для объединения в рейс
}

export interface TripFilters {
    status?: string;
    vehicleId?: string;
    driverId?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
}

export interface AssignmentWarning {
    type: 'hard' | 'soft';
    code: string;
    message: string;
}

// --- CRUD ---

export async function createTrip(
    input: CreateTripInput,
    author: { userId: string; role: string },
) {
    // Wrap number generation + INSERT in single transaction
    // so FOR UPDATE lock holds until INSERT completes
    const trip = await db.transaction(async (tx) => {
        const number = await generateTripNumber(tx);

        const [created] = await tx.insert(trips).values({
            number,
            status: 'planning',
            vehicleId: input.vehicleId,
            driverId: input.driverId,
            plannedDistanceKm: input.plannedDistanceKm,
            plannedDepartureAt: input.plannedDepartureAt
                ? new Date(input.plannedDepartureAt) : undefined,
            notes: input.notes,
            createdBy: input.createdBy,
        }).returning();

        return created;
    });

    if (input.orderIds?.length) {
        await linkOrdersToTrip(trip.id, input.orderIds, author); // Might need a tx variant, but outside for now or could just recordEvent inside
    }

    await recordEvent({
        authorId: author.userId,
        authorRole: author.role,
        eventType: 'trip.created',
        entityType: 'trip',
        entityId: trip.id,
        data: { number: trip.number, orderIds: input.orderIds },
    });

    return trip;
}

export async function getTrips(filters: TripFilters) {

    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions = [];

    if (filters.status) {
        conditions.push(eq(trips.status, filters.status as any));
    }
    if (filters.vehicleId) {
        conditions.push(eq(trips.vehicleId, filters.vehicleId));
    }
    if (filters.driverId) {
        conditions.push(eq(trips.driverId, filters.driverId));
    }
    if (filters.dateFrom) {
        conditions.push(gte(trips.createdAt, new Date(filters.dateFrom)));
    }
    if (filters.dateTo) {
        conditions.push(lte(trips.createdAt, new Date(filters.dateTo)));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [data, countResult] = await Promise.all([
        db.select()
            .from(trips)
            .where(where)
            .orderBy(desc(trips.createdAt))
            .limit(limit)
            .offset(offset),
        db.select({ count: sql<number>`count(*)::int` })
            .from(trips)
            .where(where),
    ]);

    const total = countResult[0]?.count ?? 0;
    return { data, total, page, limit };
}

export async function getTripById(id: string) {
    const [trip] = await db
        .select()
        .from(trips)
        .where(eq(trips.id, id))
        .limit(1);

    if (!trip) return null;

    // Fetch route points
    const points = await db
        .select()
        .from(routePoints)
        .where(eq(routePoints.tripId, id))
        .orderBy(routePoints.sequenceNumber);

    // Fetch linked orders
    const linkedOrders = await db
        .select()
        .from(orders)
        .where(eq(orders.tripId, id));

    return { ...trip, routePoints: points, orders: linkedOrders };
}

export async function updateTrip(
    id: string,
    updates: Partial<Omit<CreateTripInput, 'createdBy' | 'orderIds'>>,
) {
    const [trip] = await db
        .update(trips)
        .set({
            ...updates,
            plannedDepartureAt: updates.plannedDepartureAt
                ? new Date(updates.plannedDepartureAt) : undefined,
            updatedAt: new Date(),
        })
        .where(eq(trips.id, id))
        .returning();

    return trip ?? null;
}

// --- Assignment with Validation Checks (§3.2) ---

export async function assignTrip(
    tripId: string,
    vehicleId: string,
    driverId: string,
    author: { userId: string; role: string },
): Promise<{ trip: any; warnings: AssignmentWarning[] }> {
    const trip = await getTripById(tripId);
    if (!trip) throw new Error('Рейс не найден');
    if (trip.status !== TripStatus.PLANNING) {
        throw new Error('Назначение возможно только для рейсов в статусе "Планируется"');
    }

    const warnings: AssignmentWarning[] = [];

    // 1. Load vehicle
    const [vehicle] = await db
        .select()
        .from(vehicles)
        .where(eq(vehicles.id, vehicleId))
        .limit(1);
    if (!vehicle) throw new Error('ТС не найдено');

    // 2. Load driver
    const [driver] = await db
        .select()
        .from(drivers)
        .where(eq(drivers.id, driverId))
        .limit(1);
    if (!driver) throw new Error('Водитель не найден');

    // --- HARD BLOCKS ---

    // Check 1: Vehicle is available
    if (vehicle.status !== VehicleStatus.AVAILABLE) {
        warnings.push({
            type: 'hard',
            code: 'VEHICLE_NOT_AVAILABLE',
            message: `ТС ${vehicle.plateNumber} недоступно (статус: ${vehicle.status})`,
        });
    }

    // Check 2: Vehicle documents not expired
    const now = new Date();
    if (vehicle.techInspectionExpiry && new Date(vehicle.techInspectionExpiry) < now) {
        warnings.push({
            type: 'hard',
            code: 'TECH_INSPECTION_EXPIRED',
            message: `Техосмотр ТС ${vehicle.plateNumber} просрочен`,
        });
    }
    if (vehicle.osagoExpiry && new Date(vehicle.osagoExpiry) < now) {
        warnings.push({
            type: 'hard',
            code: 'OSAGO_EXPIRED',
            message: `ОСАГО ТС ${vehicle.plateNumber} просрочено`,
        });
    }

    // Check 3: Payload capacity >= total cargo weight
    const linkedOrders = trip.orders ?? [];
    const totalWeight = linkedOrders.reduce(
        (sum: number, o: any) => sum + (o.cargoWeightKg ?? 0), 0,
    );
    if (totalWeight > 0 && vehicle.payloadCapacityKg < totalWeight) {
        warnings.push({
            type: 'hard',
            code: 'OVERWEIGHT',
            message: `Перевес: груз ${totalWeight} кг > грузоподъёмность ${vehicle.payloadCapacityKg} кг`,
        });
    }

    // Check 4: Driver is active with valid license
    if (!driver.isActive) {
        warnings.push({
            type: 'hard',
            code: 'DRIVER_INACTIVE',
            message: `Водитель ${driver.fullName} неактивен`,
        });
    }
    if (new Date(driver.licenseExpiry) < now) {
        warnings.push({
            type: 'hard',
            code: 'LICENSE_EXPIRED',
            message: `Водительское удостоверение ${driver.fullName} просрочено`,
        });
    }

    // --- SOFT WARNINGS ---

    // Check 5: Permits for route (soft)
    const vehiclePermits = await db
        .select()
        .from(permits)
        .where(and(
            eq(permits.vehicleId, vehicleId),
            eq(permits.isActive, true),
        ));
    if (vehiclePermits.length === 0) {
        warnings.push({
            type: 'soft',
            code: 'NO_PERMITS',
            message: `У ТС ${vehicle.plateNumber} нет активных пропусков`,
        });
    }

    // Check 6: Tachograph calibration
    if (vehicle.tachographCalibrationExpiry
        && new Date(vehicle.tachographCalibrationExpiry) < now) {
        warnings.push({
            type: 'soft',
            code: 'TACHOGRAPH_EXPIRED',
            message: `Калибровка тахографа ТС ${vehicle.plateNumber} просрочена`,
        });
    }

    // Check 7: Med certificate expiry (soft)
    if (driver.medCertificateExpiry
        && new Date(driver.medCertificateExpiry) < now) {
        warnings.push({
            type: 'soft',
            code: 'MED_CERTIFICATE_EXPIRED',
            message: `Медсправка водителя ${driver.fullName} просрочена`,
        });
    }

    // --- Block on hard errors ---
    const hardBlocks = warnings.filter(w => w.type === 'hard');
    if (hardBlocks.length > 0) {
        return { trip, warnings };
    }

    // --- Proceed with assignment (in transaction) ---
    const updated = await db.transaction(async (tx) => {
        const [result] = await tx
            .update(trips)
            .set({
                vehicleId,
                driverId,
                status: 'assigned' as any,
                updatedAt: new Date(),
            })
            .where(eq(trips.id, tripId))
            .returning();

        // Update vehicle status
        await tx
            .update(vehicles)
            .set({ status: 'assigned' as any, updatedAt: new Date() })
            .where(eq(vehicles.id, vehicleId));

        await recordEvent({
            authorId: author.userId,
            authorRole: author.role,
            eventType: 'trip.assigned',
            entityType: 'trip',
            entityId: tripId,
            data: {
                vehicleId,
                driverId,
                vehiclePlate: vehicle.plateNumber,
                driverName: driver.fullName,
                warnings: warnings.filter(w => w.type === 'soft'),
            },
        }, tx);

        return result;
    });

    return { trip: updated, warnings };
}

// --- Status transitions ---

export async function changeTripStatus(
    id: string,
    newStatus: string,
    author: { userId: string; role: string },
    data?: Record<string, unknown>,
) {
    const tripData = await getTripById(id);
    if (!tripData) throw new Error('Рейс не найден');

    if (!canTransition(tripData.status, newStatus)) {
        throw new Error(`Невозможен переход: ${tripData.status} → ${newStatus}`);
    }

    const updateFields: Record<string, any> = {
        status: newStatus,
        updatedAt: new Date(),
    };

    // Additional fields based on status
    if (newStatus === TripStatus.IN_TRANSIT && data?.odometerStart) {
        updateFields.odometerStart = data.odometerStart;
        updateFields.actualDepartureAt = new Date();
    }
    if (newStatus === TripStatus.COMPLETED) {
        updateFields.actualCompletionAt = new Date();
        if (data?.odometerEnd) updateFields.odometerEnd = data.odometerEnd;
        if (data?.fuelEnd) updateFields.fuelEnd = data.fuelEnd;
    }

    // Wrap all mutations in transaction
    const updated = await db.transaction(async (tx) => {
        const [result] = await tx
            .update(trips)
            .set(updateFields)
            .where(eq(trips.id, id))
            .returning();

        // Update vehicle status on completion
        if (newStatus === TripStatus.COMPLETED && tripData.vehicleId) {
            await tx
                .update(vehicles)
                .set({ status: 'available' as any, updatedAt: new Date() })
                .where(eq(vehicles.id, tripData.vehicleId));
        }

        // Update linked orders on certain transitions
        if (newStatus === TripStatus.IN_TRANSIT && tripData.orders?.length) {
            for (const order of tripData.orders) {
                if (order.status === OrderStatus.ASSIGNED) {
                    await tx
                        .update(orders)
                        .set({ status: 'in_transit' as any, updatedAt: new Date() })
                        .where(eq(orders.id, order.id));
                }
            }
        }

        // Event mapping
        const eventMap: Record<string, string> = {
            [TripStatus.ASSIGNED]: 'trip.assigned',
            [TripStatus.INSPECTION]: 'trip.vehicle_cleared',
            [TripStatus.WAYBILL_ISSUED]: 'trip.waybill_issued',
            [TripStatus.LOADING]: 'trip.loading_complete',
            [TripStatus.IN_TRANSIT]: 'trip.departed',
            [TripStatus.COMPLETED]: 'trip.completed',
            [TripStatus.BILLED]: 'trip.closed',
            [TripStatus.CANCELLED]: 'trip.cancelled',
        };

        const eventType = eventMap[newStatus];
        if (eventType) {
            await recordEvent({
                authorId: author.userId,
                authorRole: author.role,
                eventType,
                entityType: 'trip',
                entityId: id,
                data: { previousStatus: tripData.status, newStatus, ...data },
            }, tx);
        }

        return result;
    });

    return updated;
}

// --- Link orders to trip ---

async function linkOrdersToTrip(
    tripId: string,
    orderIds: string[],
    author: { userId: string; role: string },
) {
    // C-5: Wrap entire loop in single transaction
    await db.transaction(async (tx) => {
        let seq = 1;

        for (const orderId of orderIds) {
            const [order] = await tx
                .select()
                .from(orders)
                .where(eq(orders.id, orderId))
                .limit(1);

            if (!order) continue;

            // Update order with tripId
            await tx
                .update(orders)
                .set({ tripId, status: 'assigned' as any, updatedAt: new Date() })
                .where(eq(orders.id, orderId));

            // Create loading point
            await tx.insert(routePoints).values({
                tripId,
                orderId,
                type: 'loading',
                status: 'pending',
                sequenceNumber: seq++,
                address: order.loadingAddress,
                lat: order.loadingLat,
                lon: order.loadingLon,
                windowStart: order.loadingWindowStart,
                windowEnd: order.loadingWindowEnd,
            });

            // Create unloading point
            await tx.insert(routePoints).values({
                tripId,
                orderId,
                type: 'unloading',
                status: 'pending',
                sequenceNumber: seq++,
                address: order.unloadingAddress,
                lat: order.unloadingLat,
                lon: order.unloadingLon,
                windowStart: order.unloadingWindowStart,
                windowEnd: order.unloadingWindowEnd,
            });
            // Record events inside transaction (N-2)
            for (const orderId of orderIds) {
                await recordEvent({
                    authorId: author.userId,
                    authorRole: author.role,
                    eventType: 'order.assigned',
                    entityType: 'order',
                    entityId: orderId,
                    data: { tripId },
                }, tx);
            }
        }
    });
}

// --- Route Points CRUD ---

export async function getRoutePoints(tripId: string) {
    return db
        .select()
        .from(routePoints)
        .where(eq(routePoints.tripId, tripId))
        .orderBy(routePoints.sequenceNumber);
}

export async function addRoutePoint(
    tripId: string,
    point: {
        orderId?: string;
        type: 'loading' | 'unloading';
        address: string;
        lat?: number;
        lon?: number;
        windowStart?: string;
        windowEnd?: string;
        notes?: string;
    },
) {
    return db.transaction(async (tx) => {
        // H-10 / S-5: Lock the parent trip row to prevent race conditions calculating maxSeq
        await tx.select({ id: trips.id })
            .from(trips)
            .where(eq(trips.id, tripId))
            .limit(1)
            .for('update');

        // Get max sequence for this trip within the transaction
        const existing = await tx.select({ sequenceNumber: routePoints.sequenceNumber })
            .from(routePoints)
            .where(eq(routePoints.tripId, tripId));

        const maxSeq = existing.length > 0
            ? Math.max(...existing.map(p => p.sequenceNumber))
            : 0;

        const [created] = await tx.insert(routePoints).values({
            tripId,
            orderId: point.orderId,
            type: point.type,
            status: 'pending',
            sequenceNumber: maxSeq + 1,
            address: point.address,
            lat: point.lat,
            lon: point.lon,
            windowStart: point.windowStart ? new Date(point.windowStart) : undefined,
            windowEnd: point.windowEnd ? new Date(point.windowEnd) : undefined,
            notes: point.notes,
        }).returning();

        return created;
    });
}

export async function updateRoutePoint(
    pointId: string,
    updates: Partial<{
        status: string;
        address: string;
        lat: number;
        lon: number;
        arrivedAt: string;
        completedAt: string;
        signatureUrl: string;
        photoUrls: string[];
        notes: string;
    }>,
) {
    const setFields: Record<string, any> = {};

    if (updates.status) setFields.status = updates.status;
    if (updates.address) setFields.address = updates.address;
    if (updates.lat !== undefined) setFields.lat = updates.lat;
    if (updates.lon !== undefined) setFields.lon = updates.lon;
    if (updates.arrivedAt) setFields.arrivedAt = new Date(updates.arrivedAt);
    if (updates.completedAt) setFields.completedAt = new Date(updates.completedAt);
    if (updates.signatureUrl) setFields.signatureUrl = updates.signatureUrl;
    if (updates.photoUrls) setFields.photoUrls = updates.photoUrls;
    if (updates.notes !== undefined) setFields.notes = updates.notes;

    const [updated] = await db
        .update(routePoints)
        .set(setFields)
        .where(eq(routePoints.id, pointId))
        .returning();

    return updated ?? null;
}

export async function deleteRoutePoint(pointId: string) {
    const [deleted] = await db
        .delete(routePoints)
        .where(eq(routePoints.id, pointId))
        .returning();

    return deleted ?? null;
}

// --- Get available vehicles for assignment ---

export async function getAvailableVehicles() {
    return db
        .select()
        .from(vehicles)
        .where(and(
            eq(vehicles.status, 'available'),
            eq(vehicles.isArchived, false),
        ))
        .orderBy(vehicles.plateNumber);
}

// --- Get available drivers ---

export async function getAvailableDrivers() {
    // H-NEW-4 FIX: Exclude drivers already on active trips
    const busyDriverIds = await db.select({ driverId: trips.driverId })
        .from(trips)
        .where(
            and(
                inArray(trips.status, ['assigned', 'in_transit']),
                sql`${trips.driverId} IS NOT NULL`
            )
        );
    const busyIds = busyDriverIds.map(r => r.driverId).filter(Boolean) as string[];

    const conditions = [eq(drivers.isActive, true)];
    if (busyIds.length > 0) {
        conditions.push(sql`${drivers.id} NOT IN (${sql.join(busyIds.map(id => sql`${id}`), sql`, `)})`);
    }

    return db
        .select()
        .from(drivers)
        .where(and(...conditions))
        .orderBy(drivers.fullName);
}
