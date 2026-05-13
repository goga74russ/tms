// ============================================================
// Trips Module — Business Logic (§3.2, §4.2, Приложение Б.3)
// ============================================================
import { db } from '../../db/connection.js';
import {
    trips, orders, routePoints, vehicles, drivers, permits, incidents, tripOrders, waybills, trailers, contractors,
    deliveryConfirmations, tachographRecords,
} from '../../db/schema.js';
import { eq, and, desc, sql, gte, lte, inArray } from 'drizzle-orm';
import { recordEvent } from '../../events/journal.js';
import { TripStatus, OrderStatus, VehicleStatus, WaybillStatus, TRIP_STATE_TRANSITIONS } from '@tms/shared';
import { getBlockingIncidents, getIncompleteRoutePoints, lockRowForUpdate } from '../../utils/db-helpers.js';
import { canTransitionTrip } from './state.js';

async function refreshTransportDocumentsForTrip(tripId: string, createdBy?: string | null) {
    try {
        const { syncTransportDocumentsForTrip } = await import('./transport-documents-store.js');
        return await syncTransportDocumentsForTrip(tripId, createdBy ?? null);
    } catch {
        return null;
    }
}

// --- State machine transitions (§4.2) ---
// Canonical map kept here for legacy references; the actual logic lives in
// ./state.ts so it can be unit-tested without booting the DB.
const TRIP_TRANSITIONS: Record<string, string[]> = TRIP_STATE_TRANSITIONS;
void TRIP_TRANSITIONS; // keep the symbol for parity with prior diagnostics output

export function canTransition(from: string, to: string): boolean {
    return canTransitionTrip(from, to);
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
    const rows = result as unknown as Array<{ number: string }>;
    if (rows.length > 0 && rows[0].number) {
        const parts = rows[0].number.split('-');
        seq = parseInt(parts[2], 10) + 1;
    }

    return `${prefix}${String(seq).padStart(5, '0')}`;
}

// --- Types ---
export interface CreateTripInput {
    vehicleId?: string;
    trailerId?: string;
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
    trailerId?: string;
    driverId?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
    tripIds?: string[]; // RLS: restrict to specific trip IDs (client filter)
    organizationId?: string | null; // Multitenancy: filter by vehicle's org
}

export interface AssignmentWarning {
    type: 'hard' | 'soft';
    code: string;
    message: string;
}

export interface ReadinessIssue {
    type: 'hard' | 'soft';
    code: string;
    message: string;
}

export interface ReadinessSnapshot {
    canDispatch: boolean;
    hardIssues: ReadinessIssue[];
    softIssues: ReadinessIssue[];
    operational: {
        vehicleStatus: string | null;
        driverActive: boolean | null;
        plannedDepartureAt: Date | null;
        departureOverdue: boolean;
        maintenanceNextKm: number | null;
        currentOdometerKm: number | null;
        maintenanceRemainingKm: number | null;
        maintenanceDueByKm: boolean;
        maintenanceDueSoonByKm: boolean;
    };
    vehicleDocuments: {
        techInspection: { status: 'green' | 'yellow' | 'red' | 'unknown'; expiry: Date | null };
        osago: { status: 'green' | 'yellow' | 'red' | 'unknown'; expiry: Date | null };
        maintenance: { status: 'green' | 'yellow' | 'red' | 'unknown'; expiry: Date | null };
        tachograph: { status: 'green' | 'yellow' | 'red' | 'unknown'; expiry: Date | null };
    };
    driverDocuments: {
        license: { status: 'green' | 'yellow' | 'red' | 'unknown'; expiry: Date | null };
        medCertificate: { status: 'green' | 'yellow' | 'red' | 'unknown'; expiry: Date | null };
    };
}

function getTrafficLight(expiryDate: Date | string | null | undefined) {
    const now = new Date();
    const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    if (!expiryDate) {
        return 'unknown' as const;
    }

    const expiry = expiryDate instanceof Date ? expiryDate : new Date(expiryDate);
    if (Number.isNaN(expiry.getTime())) {
        return 'unknown' as const;
    }

    if (expiry < now) return 'red' as const;
    if (expiry < thirtyDays) return 'yellow' as const;
    return 'green' as const;
}

export function buildReadinessSnapshot(params: {
    vehicle?: any;
    driver?: any;
    trip?: { plannedDepartureAt?: Date | string | null; status?: string | null };
    blockingIncidents?: Array<{ id: string; type: string; description: string; status: string }>;
}): ReadinessSnapshot {
    const vehicle = params.vehicle ?? {};
    const driver = params.driver ?? {};
    const trip = params.trip ?? {};
    const plannedDepartureAt = trip.plannedDepartureAt ? new Date(trip.plannedDepartureAt) : null;
    const departureOverdue = !!plannedDepartureAt && plannedDepartureAt < new Date();
    const vehicleStatus = typeof vehicle.status === 'string' ? vehicle.status : null;
    const driverActive = typeof driver.isActive === 'boolean' ? driver.isActive : null;
    const currentOdometerKm = typeof vehicle.currentOdometerKm === 'number' ? vehicle.currentOdometerKm : null;
    const maintenanceNextKm = typeof vehicle.maintenanceNextKm === 'number' ? vehicle.maintenanceNextKm : null;
    const maintenanceRemainingKm = currentOdometerKm !== null && maintenanceNextKm !== null
        ? maintenanceNextKm - currentOdometerKm
        : null;
    const maintenanceDueByKm = maintenanceRemainingKm !== null && maintenanceRemainingKm <= 0;
    const maintenanceDueSoonByKm = maintenanceRemainingKm !== null && maintenanceRemainingKm > 0 && maintenanceRemainingKm <= 500;
    const vehicleDocuments = {
        techInspection: {
            status: getTrafficLight(vehicle.techInspectionExpiry),
            expiry: vehicle.techInspectionExpiry ?? null,
        },
        osago: {
            status: getTrafficLight(vehicle.osagoExpiry),
            expiry: vehicle.osagoExpiry ?? null,
        },
        maintenance: {
            status: getTrafficLight(vehicle.maintenanceNextDate),
            expiry: vehicle.maintenanceNextDate ?? null,
        },
        tachograph: {
            status: getTrafficLight(vehicle.tachographCalibrationExpiry),
            expiry: vehicle.tachographCalibrationExpiry ?? null,
        },
    } as const;

    const driverDocuments = {
        license: {
            status: getTrafficLight(driver.licenseExpiry),
            expiry: driver.licenseExpiry ?? null,
        },
        medCertificate: {
            status: getTrafficLight(driver.medCertificateExpiry),
            expiry: driver.medCertificateExpiry ?? null,
        },
    } as const;

    const hardIssues: ReadinessIssue[] = [];
    const softIssues: ReadinessIssue[] = [];
    const blockingIncidents = Array.isArray(params.blockingIncidents) ? params.blockingIncidents : [];

    if (vehicleDocuments.techInspection.status === 'red') {
        hardIssues.push({
            type: 'hard',
            code: 'TECH_INSPECTION_EXPIRED',
            message: `Техосмотр ТС ${vehicle.plateNumber ?? 'unknown'} просрочен`,
        });
    }
    if (vehicleDocuments.osago.status === 'red') {
        hardIssues.push({
            type: 'hard',
            code: 'OSAGO_EXPIRED',
            message: `ОСАГО ТС ${vehicle.plateNumber ?? 'unknown'} просрочено`,
        });
    }
    if (driverDocuments.license.status === 'red') {
        hardIssues.push({
            type: 'hard',
            code: 'LICENSE_EXPIRED',
            message: `Водительское удостоверение ${driver.fullName ?? 'unknown'} просрочено`,
        });
    }
    if (driverDocuments.medCertificate.status === 'red') {
        hardIssues.push({
            type: 'hard',
            code: 'MED_CERTIFICATE_EXPIRED',
            message: `Медсправка водителя ${driver.fullName ?? 'unknown'} просрочена`,
        });
    }

    if (driverActive === false) {
        hardIssues.push({
            type: 'hard',
            code: 'DRIVER_INACTIVE',
            message: `Водитель ${driver.fullName ?? 'unknown'} недоступен для выпуска`,
        });
    }

    if (vehicleStatus && ['maintenance', 'broken', 'blocked', 'in_trip'].includes(vehicleStatus)) {
        hardIssues.push({
            type: 'hard',
            code: 'VEHICLE_NOT_READY',
            message: `ТС ${vehicle.plateNumber ?? 'unknown'} недоступно для выпуска (статус: ${vehicleStatus})`,
        });
    }

    if (vehicleDocuments.maintenance.status !== 'green' && vehicleDocuments.maintenance.status !== 'unknown') {
        softIssues.push({
            type: 'soft',
            code: 'MAINTENANCE_DUE',
            message: `Следующее ТО для ${vehicle.plateNumber ?? 'unknown'} скоро или уже просрочено`,
        });
    }
    if (vehicleDocuments.tachograph.status !== 'green' && vehicleDocuments.tachograph.status !== 'unknown') {
        softIssues.push({
            type: 'soft',
            code: 'TACHOGRAPH_EXPIRED',
            message: `Калибровка тахографа ТС ${vehicle.plateNumber ?? 'unknown'} просрочена`,
        });
    }

    if (maintenanceDueByKm) {
        hardIssues.push({
            type: 'hard',
            code: 'MAINTENANCE_DUE_KM',
            message: `ТО по пробегу для ${vehicle.plateNumber ?? 'unknown'} уже просрочено`,
        });
    } else if (maintenanceDueSoonByKm) {
        softIssues.push({
            type: 'soft',
            code: 'MAINTENANCE_DUE_SOON_KM',
            message: `ТО по пробегу для ${vehicle.plateNumber ?? 'unknown'} близко: осталось ${maintenanceRemainingKm} км`,
        });
    }

    if (departureOverdue) {
        softIssues.push({
            type: 'soft',
            code: 'DEPARTURE_OVERDUE',
            message: `Плановое время выезда рейса ${plannedDepartureAt?.toISOString() ?? ''} уже прошло`,
        });
    }

    for (const incident of blockingIncidents) {
        hardIssues.push({
            type: 'hard',
            code: 'BLOCKING_INCIDENT',
            message: `Blocking incident (${incident.type}, ${incident.status}): ${incident.description}`,
        });
    }

    return {
        canDispatch: hardIssues.length === 0,
        hardIssues,
        softIssues,
        operational: {
            vehicleStatus,
            driverActive,
            plannedDepartureAt,
            departureOverdue,
            maintenanceNextKm,
            currentOdometerKm,
            maintenanceRemainingKm,
            maintenanceDueByKm,
            maintenanceDueSoonByKm,
        },
        vehicleDocuments,
        driverDocuments,
    };
}

async function getLinkedOrdersForTrip(tx: any, tripId: string) {
    return tx
        .select({ id: orders.id, status: orders.status })
        .from(orders)
        .where(eq(orders.tripId, tripId));
}

async function syncLinkedOrdersForTripStatus(
    tx: any,
    tripId: string,
    newStatus: string,
    author: { userId: string; role: string; organizationId?: string | null },
) {
    const linkedOrders = await getLinkedOrdersForTrip(tx, tripId);
    if (!linkedOrders.length) return;

    for (const order of linkedOrders) {
        if (newStatus === TripStatus.WAYBILL_ISSUED && order.status === OrderStatus.CONFIRMED) {
            await tx
                .update(orders)
                .set({ status: OrderStatus.ASSIGNED, updatedAt: new Date() })
                .where(eq(orders.id, order.id));

            await recordEvent({
                authorId: author.userId,
                authorRole: author.role,
                eventType: 'order.assigned',
                entityType: 'order',
                entityId: order.id,
                data: { tripId, previousStatus: order.status, newStatus: OrderStatus.ASSIGNED, source: 'waybill_issued' },
            }, tx);
        } else if (newStatus === TripStatus.IN_TRANSIT && ([OrderStatus.ASSIGNED, OrderStatus.CONFIRMED] as string[]).includes(order.status)) {
            await tx
                .update(orders)
                .set({ status: OrderStatus.IN_TRANSIT, updatedAt: new Date() })
                .where(eq(orders.id, order.id));

            await recordEvent({
                authorId: author.userId,
                authorRole: author.role,
                eventType: 'order.in_transit',
                entityType: 'order',
                entityId: order.id,
                data: { tripId, previousStatus: order.status, newStatus: OrderStatus.IN_TRANSIT },
            }, tx);
        } else if (newStatus === TripStatus.COMPLETED && ([OrderStatus.ASSIGNED, OrderStatus.CONFIRMED, OrderStatus.IN_TRANSIT] as string[]).includes(order.status)) {
            await tx
                .update(orders)
                .set({ status: OrderStatus.DELIVERED, updatedAt: new Date() })
                .where(eq(orders.id, order.id));

            await recordEvent({
                authorId: author.userId,
                authorRole: author.role,
                eventType: 'order.delivered',
                entityType: 'order',
                entityId: order.id,
                data: { tripId, previousStatus: order.status, newStatus: OrderStatus.DELIVERED },
            }, tx);
        } else if (newStatus === TripStatus.CANCELLED) {
            await tx
                .update(orders)
                .set({ status: OrderStatus.CONFIRMED, tripId: null, updatedAt: new Date() })
                .where(eq(orders.id, order.id));
        }
    }
}

// --- CRUD ---

export async function createTrip(
    input: CreateTripInput,
    author: { userId: string; role: string; organizationId?: string | null },
) {
    const uniqueOrderIds = Array.from(new Set(
        (input.orderIds ?? []).filter((orderId): orderId is string => typeof orderId === 'string' && orderId.trim().length > 0),
    ));

    // Keep trip creation, order links, route points and journal writes atomic.
    const trip = await db.transaction(async (tx) => {
        const number = await generateTripNumber(tx);

        const [created] = await tx.insert(trips).values({
            number,
            status: 'planning',
            vehicleId: input.vehicleId,
            trailerId: input.trailerId,
            driverId: input.driverId,
            plannedDistanceKm: input.plannedDistanceKm,
            plannedDepartureAt: input.plannedDepartureAt
                ? new Date(input.plannedDepartureAt) : undefined,
            notes: input.notes,
            organizationId: author.organizationId ?? undefined,
            createdBy: input.createdBy,
        }).returning();

        if (uniqueOrderIds.length > 0) {
            await linkOrdersToTripTx(tx, created.id, uniqueOrderIds, author);
        }

        await recordEvent({
            authorId: author.userId,
            authorRole: author.role,
            eventType: 'trip.created',
            entityType: 'trip',
            entityId: created.id,
            data: { number: created.number, orderIds: uniqueOrderIds },
        }, tx);

        return created;
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
    if (filters.trailerId) {
        conditions.push(eq(trips.trailerId, filters.trailerId));
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
    if (filters.tripIds && filters.tripIds.length > 0) {
        conditions.push(inArray(trips.id, filters.tripIds));
    }
    if (filters.organizationId) {
        conditions.push(eq(trips.organizationId, filters.organizationId));
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
    // Fetch linked orders via normalized trip_orders relation
    const linkedOrders = await db
        .select({ order: orders })
        .from(tripOrders)
        .innerJoin(orders, eq(tripOrders.orderId, orders.id))
        .where(eq(tripOrders.tripId, id));

    return {
        ...trip,
        routePoints: points,
        orders: linkedOrders.map((row: any) => row.order),
    };
}

export async function getTransportDossier(id: string) {
    const trip = await getTripById(id);
    if (!trip) return null;

    const [waybill] = await db
        .select()
        .from(waybills)
        .where(eq(waybills.tripId, id))
        .limit(1);

    const [vehicle] = trip.vehicleId
        ? await db.select().from(vehicles).where(eq(vehicles.id, trip.vehicleId)).limit(1)
        : [];

    const [trailer] = trip.trailerId
        ? await db.select().from(trailers).where(eq(trailers.id, trip.trailerId)).limit(1)
        : [];

    const [driver] = trip.driverId
        ? await db
            .select({
                id: drivers.id,
                fullName: drivers.fullName,
                isActive: drivers.isActive,
                licenseExpiry: drivers.licenseExpiry,
                medCertificateExpiry: drivers.medCertificateExpiry,
            })
            .from(drivers)
            .where(eq(drivers.id, trip.driverId))
            .limit(1)
        : [];

    const contractorIds = Array.from(new Set(
        (trip.orders ?? [])
            .map((order: any) => order.contractorId)
            .filter((contractorId: string | null | undefined): contractorId is string => Boolean(contractorId)),
    ));

    const relatedContractors = contractorIds.length > 0
        ? await db.select().from(contractors).where(inArray(contractors.id, contractorIds))
        : [];

    const contractorMap = new Map(relatedContractors.map((contractor) => [contractor.id, contractor]));
    const readiness = buildReadinessSnapshot({ vehicle, driver, trip });

    const ordersWithParties = (trip.orders ?? []).map((order: any) => ({
        ...order,
        contractor: order.contractorId ? contractorMap.get(order.contractorId) ?? null : null,
    }));

    return {
        trip,
        waybill: waybill ?? null,
        vehicle: vehicle ?? null,
        trailer: trailer ?? null,
        orders: ordersWithParties,
        parties: relatedContractors,
        readiness,
        summary: {
            orderCount: ordersWithParties.length,
            hasWaybill: Boolean(waybill),
            hasVehicle: Boolean(vehicle),
            hasTrailer: Boolean(trailer),
        },
    };
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

    await refreshTransportDocumentsForTrip(id);
    return trip ?? null;
}

// --- Assignment with Validation Checks (§3.2) ---

export async function assignTrip(
    tripId: string,
    vehicleId: string,
    driverId: string,
    author: { userId: string; role: string; organizationId?: string | null },
    trailerId?: string,
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
        .where(author.organizationId
            ? and(eq(vehicles.id, vehicleId), eq(vehicles.organizationId, author.organizationId))
            : eq(vehicles.id, vehicleId))
        .limit(1);
    if (!vehicle) throw new Error('ТС не найдено');

    let trailer: any = null;
    if (trailerId) {
        [trailer] = await db
            .select()
            .from(trailers)
            .where(author.organizationId
                ? and(eq(trailers.id, trailerId), eq(trailers.organizationId, author.organizationId))
                : eq(trailers.id, trailerId))
            .limit(1);
        if (!trailer) throw new Error('Прицеп не найден');
    }

    // 2. Load driver
    const [driver] = await db
        .select()
        .from(drivers)
        .where(author.organizationId
            ? and(eq(drivers.id, driverId), eq(drivers.organizationId, author.organizationId))
            : eq(drivers.id, driverId))
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

    if (trailer && trailer.currentVehicleId && trailer.currentVehicleId !== vehicleId) {
        warnings.push({
            type: 'hard',
            code: 'TRAILER_ALREADY_COUPLED',
            message: `Trailer ${trailer.plateNumber} is already coupled to another vehicle`,
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

    if (driver.medCertificateExpiry && new Date(driver.medCertificateExpiry) < now) {
        warnings.push({
            type: 'hard',
            code: 'MED_CERTIFICATE_EXPIRED',
            message: `Медсправка водителя ${driver.fullName} просрочена`,
        });
    }

    if (typeof vehicle.maintenanceNextKm === 'number' && typeof vehicle.currentOdometerKm === 'number') {
        const remainingKm = vehicle.maintenanceNextKm - vehicle.currentOdometerKm;
        if (remainingKm <= 0) {
            warnings.push({
                type: 'hard',
                code: 'MAINTENANCE_DUE_KM',
                message: `ТО по пробегу для ${vehicle.plateNumber} уже просрочено`,
            });
        } else if (remainingKm <= 500) {
            warnings.push({
                type: 'soft',
                code: 'MAINTENANCE_DUE_SOON_KM',
                message: `ТО по пробегу для ${vehicle.plateNumber} близко: осталось ${remainingKm} км`,
            });
        }
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

    // Check 6b: RTO / проверка режима труда и отдыха (soft, данные берутся из тахографа DDD)
    // Правила: ПП РФ Приказ №440 (разд: ст.6-9)
    {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const [todayRecord] = await db.select({
            drivingMinutes: tachographRecords.drivingMinutes,
            continuousDrivingMinutes: tachographRecords.continuousDrivingMinutes,
            weeklyRestMinutes: tachographRecords.weeklyRestMinutes,
        })
            .from(tachographRecords)
            .where(and(eq(tachographRecords.driverId, driverId), gte(tachographRecords.date, today)))
            .orderBy(desc(tachographRecords.date))
            .limit(1);

        if (todayRecord) {
            // 1. Непрерывное вождение > 4.5 ч (270 мин)
            if ((todayRecord.continuousDrivingMinutes ?? 0) > 270) {
                warnings.push({
                    type: 'soft',
                    code: 'RTO_CONTINUOUS_DRIVING_EXCEEDED',
                    message: `Водитель ${driver.fullName}: непрерывное вождение ${todayRecord.continuousDrivingMinutes} мин (лимит 270 мин). Требуется перерыв 45 мин.`,
                });
            }
            // 2. Суточное вождение > 10 ч (600 мин)
            if ((todayRecord.drivingMinutes ?? 0) > 600) {
                warnings.push({
                    type: 'soft',
                    code: 'RTO_DAILY_DRIVING_EXCEEDED',
                    message: `Водитель ${driver.fullName}: суточное вождение ${todayRecord.drivingMinutes} мин (лимит 600 мин).`,
                });
            }
            // 3. Еженедельный отдых < 44 ч (2640 мин)
            if (todayRecord.weeklyRestMinutes !== null && (todayRecord.weeklyRestMinutes ?? 2640) < 2640) {
                warnings.push({
                    type: 'soft',
                    code: 'RTO_WEEKLY_REST_INSUFFICIENT',
                    message: `Водитель ${driver.fullName}: еженедельный отдых ${todayRecord.weeklyRestMinutes} мин (минимум 2640 мин / 44 ч).`,
                });
            }
        }
    }

    // Check 7: Med certificate expiry (hard — expired cert blocks assignment)
    if (driver.medCertificateExpiry
        && new Date(driver.medCertificateExpiry) < now) {
        warnings.push({
            type: 'hard',
            code: 'MED_CERTIFICATE_EXPIRED',
            message: `Медсправка водителя ${driver.fullName} просрочена`,
        });
    }

    if (trip.plannedDepartureAt && new Date(trip.plannedDepartureAt) < now) {
        warnings.push({
            type: 'soft',
            code: 'DEPARTURE_OVERDUE',
            message: `Плановое время выезда рейса ${new Date(trip.plannedDepartureAt).toISOString()} уже прошло`,
        });
    }

    // Wave 5: ADR / hazmat. Default: warn-only.
    // D19: when org.adr_strict_mode = true, ADR errors escalate from soft
    // warnings to a 'hard' block so the assignment cannot proceed.
    {
        const hazmatOrders = (trip.orders ?? []).filter((o: any) => o.adrClass);
        if (hazmatOrders.length > 0) {
            const { validateAdrCompatibility } = await import('../adr/service.js');
            const { getAdrStrictMode } = await import('../compliance/adr/service.js');
            const strictMode = author.organizationId
                ? await getAdrStrictMode(author.organizationId)
                : false;
            for (const hazmatOrder of hazmatOrders) {
                const adrResult = await validateAdrCompatibility(
                    hazmatOrder.id,
                    vehicleId,
                    driverId,
                    now,
                );
                if (!adrResult.ok) {
                    for (const message of adrResult.errors) {
                        warnings.push({
                            type: strictMode ? 'hard' : 'soft',
                            code: strictMode ? 'ADR_BLOCKED' : 'ADR_INCOMPATIBLE',
                            message: strictMode
                                ? `Назначение заблокировано: транспорт не соответствует требованиям ADR (${hazmatOrder.adrClass}${
                                    hazmatOrder.adrUnNumber ? ` ${hazmatOrder.adrUnNumber}` : ''
                                }): ${message}`
                                : `ADR (${hazmatOrder.adrClass}${
                                    hazmatOrder.adrUnNumber ? ` ${hazmatOrder.adrUnNumber}` : ''
                                }): ${message}`,
                        });
                    }
                }
            }
        }
    }

    const blockingIncidents = await getBlockingIncidents({
        tripId,
        vehicleId,
        driverId,
    });
    for (const incident of blockingIncidents) {
        warnings.push({
            type: 'hard',
            code: 'BLOCKING_INCIDENT',
            message: `Blocking incident (${incident.type}, ${incident.status}): ${incident.description}`,
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
                trailerId: trailerId ?? null,
                driverId,
                status: TripStatus.ASSIGNED,
                updatedAt: new Date(),
            })
            .where(eq(trips.id, tripId))
            .returning();

        // Update vehicle status
        await tx
            .update(vehicles)
            .set({ status: VehicleStatus.ASSIGNED, updatedAt: new Date() })
            .where(eq(vehicles.id, vehicleId));

        if (trailerId) {
            await tx
                .update(trailers)
                .set({ currentVehicleId: vehicleId, updatedAt: new Date() })
                .where(author.organizationId
                    ? and(eq(trailers.id, trailerId), eq(trailers.organizationId, author.organizationId))
                    : eq(trailers.id, trailerId));
        }

        await recordEvent({
            authorId: author.userId,
            authorRole: author.role,
            eventType: 'trip.assigned',
            entityType: 'trip',
            entityId: tripId,
            data: {
                vehicleId,
                trailerId: trailerId ?? null,
                driverId,
                vehiclePlate: vehicle.plateNumber,
                driverName: driver.fullName,
                warnings: warnings.filter(w => w.type === 'soft'),
            },
        }, tx);

        // Wave 5: отдельно журналируем ADR-предупреждения (WARN-ONLY).
        const adrWarnings = warnings.filter(w => w.code === 'ADR_INCOMPATIBLE');
        if (adrWarnings.length > 0) {
            await recordEvent({
                authorId: author.userId,
                authorRole: author.role,
                eventType: 'trip.adr_warning',
                entityType: 'trip',
                entityId: tripId,
                data: {
                    vehicleId,
                    driverId,
                    warnings: adrWarnings,
                },
            }, tx);
        }

        return result;
    });

    await refreshTransportDocumentsForTrip(tripId, author.userId);
    return { trip: updated, warnings };
}

// --- Status transitions ---

export async function changeTripStatus(
    id: string,
    newStatus: string,
    author: { userId: string; role: string; organizationId?: string | null },
    data?: Record<string, unknown>,
) {
    const tripData = await getTripById(id);
    if (!tripData) throw new Error('Рейс не найден');

    if (!canTransition(tripData.status, newStatus)) {
        throw new Error(`Невозможен переход: ${tripData.status} → ${newStatus}`);
    }

    if (newStatus === TripStatus.WAYBILL_ISSUED) {
        const [waybill] = await db.select().from(waybills).where(eq(waybills.tripId, id)).limit(1);
        if (!waybill || (waybill.status !== 'issued' && waybill.status !== 'closed')) {
            throw new Error('Оформленный путевой лист не найден');
        }
    }
    if (newStatus === TripStatus.IN_TRANSIT) {
        const [waybill] = await db.select().from(waybills).where(eq(waybills.tripId, id)).limit(1);
        if (!waybill || (waybill.status !== 'issued' && waybill.status !== 'closed')) {
            throw new Error('Нельзя перевести рейс в путь без оформленного путевого листа');
        }
    }
    if (newStatus === TripStatus.COMPLETED) {
        const incompleteRoutePoints = await getIncompleteRoutePoints(id);
        if (incompleteRoutePoints.length > 0) {
            throw new Error('Не все точки маршрута пройдены');
        }

        // Sprint 13: confirmationMode guard
        const isForced = data?.forcedByDispatcher === true;
        if (!isForced) {
            const linkedOrderModes = await db
                .select({ confirmationMode: orders.confirmationMode })
                .from(tripOrders)
                .innerJoin(orders, eq(tripOrders.orderId, orders.id))
                .where(eq(tripOrders.tripId, id));
            const requiresConfirmation = linkedOrderModes.some((o) => o.confirmationMode === 'required');
            if (requiresConfirmation) {
                const [existing] = await db
                    .select({ id: deliveryConfirmations.id })
                    .from(deliveryConfirmations)
                    .where(eq(deliveryConfirmations.tripId, id))
                    .limit(1);
                if (!existing) {
                    throw new Error('Требуется подтверждение доставки от получателя (confirmationMode=required)');
                }
            }
        }
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
        if (data?.actualDistanceKm !== undefined) updateFields.actualDistanceKm = data.actualDistanceKm;
        if (data?.originalDocumentsReceived !== undefined) updateFields.originalDocumentsReceived = data.originalDocumentsReceived;
    }

    // Wrap all mutations in transaction
    const updated = await db.transaction(async (tx) => {
        const [tripLocked] = await lockRowForUpdate(
            tx
                .select()
                .from(trips)
                .where(eq(trips.id, id))
                .limit(1)
        );

        if (!tripLocked) {
            throw new Error('Trip not found');
        }

        if (!canTransition(tripLocked.status, newStatus)) {
            throw new Error(`Запрещённый переход: ${tripLocked.status} -> ${newStatus}`);
        }

        if (newStatus === TripStatus.WAYBILL_ISSUED) {
            const [lockedWaybill] = await tx
                .select()
                .from(waybills)
                .where(eq(waybills.tripId, id))
                .limit(1);

            if (!lockedWaybill || (lockedWaybill.status !== 'issued' && lockedWaybill.status !== 'closed')) {
                throw new Error('Нельзя перевести рейс в status=waybill_issued без путевого листа');
            }
        }
        const [result] = await tx
            .update(trips)
            .set(updateFields)
            .where(eq(trips.id, id))
            .returning();

        // Keep trip completion idempotent with waybill closing flow.
        if (newStatus === TripStatus.COMPLETED) {
            const [wb] = await tx.select().from(waybills).where(eq(waybills.tripId, id)).limit(1);
            if (wb?.status === 'issued') {
                await tx.update(waybills)
                    .set({
                        status: WaybillStatus.CLOSED,
                        closedAt: wb.closedAt ?? new Date(),
                        odometerIn: wb.odometerIn ?? Number(updateFields.odometerEnd ?? data?.odometerEnd),
                        fuelIn: wb.fuelIn ?? (data?.fuelEnd != null ? Number(data.fuelEnd) : null),
                        returnAt: wb.returnAt ?? updateFields.actualCompletionAt ?? new Date(),
                    })
                    .where(eq(waybills.id, wb.id));
            }

            const odomEnd = wb?.odometerIn ?? updateFields.odometerEnd ?? data?.odometerEnd;
            if (odomEnd && tripData.vehicleId) {
                await tx.update(vehicles)
                    .set({ currentOdometerKm: odomEnd as number, updatedAt: new Date() })
                    .where(eq(vehicles.id, tripData.vehicleId));
            }
        }

        // Update vehicle status on completion or cancellation
        if ((newStatus === TripStatus.COMPLETED || newStatus === TripStatus.CANCELLED) && tripData.vehicleId) {
            await tx
                .update(vehicles)
                .set({ status: VehicleStatus.AVAILABLE, updatedAt: new Date() })
                .where(eq(vehicles.id, tripData.vehicleId));
        }

        if ((newStatus === TripStatus.COMPLETED || newStatus === TripStatus.CANCELLED) && tripData.trailerId) {
            await tx
                .update(trailers)
                .set({ currentVehicleId: null, updatedAt: new Date() })
                .where(author.organizationId
                    ? and(eq(trailers.id, tripData.trailerId), eq(trailers.organizationId, author.organizationId))
                    : eq(trailers.id, tripData.trailerId));
        }

        // Update linked orders on certain transitions
        await syncLinkedOrdersForTripStatus(tx, id, newStatus, author);

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

    await refreshTransportDocumentsForTrip(id, author.userId);

    // Wave 4: автогенерация черновика счёта при завершении рейса.
    // Вынесено за транзакцию, ошибки логируются — не блокируют переход статуса.
    if (newStatus === TripStatus.COMPLETED) {
        try {
            const { financeService } = await import('../finance/finance.service.js');
            await financeService.tryAutoCreateInvoice(id, {
                authorId: author.userId,
                authorRole: author.role,
            });
        } catch (err) {
            // Best-effort: не падаем при сбое автотарификации.
            console.warn('[trips] tryAutoCreateInvoice failed for', id, (err as Error).message);
        }
    }

    return updated;
}

// --- Link orders to trip ---

async function linkOrdersToTrip(
    tripId: string,
    orderIds: string[],
    author: { userId: string; role: string; organizationId?: string | null },
) {
    // C-5: Wrap entire loop in single transaction
    await db.transaction(async (tx) => {
        await linkOrdersToTripTx(tx, tripId, orderIds, author);
    });
}

async function linkOrdersToTripTx(
    tx: any,
    tripId: string,
    orderIds: string[],
    author: { userId: string; role: string; organizationId?: string | null },
) {
    let seq = 1;

    for (const orderId of orderIds) {
        const [order] = await tx
            .select()
            .from(orders)
            .where(eq(orders.id, orderId))
            .limit(1);

        if (!order) continue;
        if (author.organizationId && order.organizationId !== author.organizationId) {
            throw new Error(`Order ${order.number ?? order.id} is outside current organization`);
        }
        if (order.tripId && order.tripId !== tripId) {
            throw new Error(`Order ${order.number ?? order.id} is already linked to another trip`);
        }
        if (order.tripId === tripId) {
            continue;
        }

        await tx
            .update(orders)
            .set({ tripId, status: OrderStatus.ASSIGNED, updatedAt: new Date() })
            .where(eq(orders.id, orderId));

        await tx.insert(tripOrders).values({ tripId, orderId }).onConflictDoNothing();

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
        windowFrom?: string;
        windowTo?: string;
        notes?: string;
        sealNumbers?: string[];
        packagingCondition?: string;
        vehicleArrivedAt?: string;
        waitingStartedAt?: string;
        waitingEndedAt?: string;
    },
) {
    return db.transaction(async (tx) => {
        // H-10 / S-5: Lock the parent trip row to prevent race conditions calculating maxSeq
        await lockRowForUpdate(
            tx.select({ id: trips.id })
                .from(trips)
                .where(eq(trips.id, tripId))
                .limit(1)
        );

        const existing = await tx.select({ sequenceNumber: routePoints.sequenceNumber })
            .from(routePoints)
            .where(eq(routePoints.tripId, tripId));

        const maxSeq = existing.length > 0
            ? Math.max(...existing.map((p: any) => p.sequenceNumber))
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
            windowFrom: point.windowFrom ? new Date(point.windowFrom) : undefined,
            windowTo: point.windowTo ? new Date(point.windowTo) : undefined,
            notes: point.notes,
            sealNumbers: point.sealNumbers,
            packagingCondition: point.packagingCondition,
            vehicleArrivedAt: point.vehicleArrivedAt ? new Date(point.vehicleArrivedAt) : undefined,
            waitingStartedAt: point.waitingStartedAt ? new Date(point.waitingStartedAt) : undefined,
            waitingEndedAt: point.waitingEndedAt ? new Date(point.waitingEndedAt) : undefined,
        }).returning();

        return created;
    });
}

export async function updateRoutePoint(
    tripId: string,
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
        sealNumbers: string[];
        packagingCondition: string;
        vehicleArrivedAt: string;
        waitingStartedAt: string;
        waitingEndedAt: string;
        windowStart: string | null;
        windowEnd: string | null;
        windowFrom: string | null;
        windowTo: string | null;
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
    if (updates.sealNumbers !== undefined) setFields.sealNumbers = updates.sealNumbers;
    if (updates.packagingCondition !== undefined) setFields.packagingCondition = updates.packagingCondition;
    if (updates.vehicleArrivedAt !== undefined) setFields.vehicleArrivedAt = updates.vehicleArrivedAt ? new Date(updates.vehicleArrivedAt) : null;
    if (updates.waitingStartedAt !== undefined) setFields.waitingStartedAt = updates.waitingStartedAt ? new Date(updates.waitingStartedAt) : null;
    if (updates.waitingEndedAt !== undefined) setFields.waitingEndedAt = updates.waitingEndedAt ? new Date(updates.waitingEndedAt) : null;
    if (updates.windowStart !== undefined) setFields.windowStart = updates.windowStart ? new Date(updates.windowStart) : null;
    if (updates.windowEnd !== undefined) setFields.windowEnd = updates.windowEnd ? new Date(updates.windowEnd) : null;
    if (updates.windowFrom !== undefined) setFields.windowFrom = updates.windowFrom ? new Date(updates.windowFrom) : null;
    if (updates.windowTo !== undefined) setFields.windowTo = updates.windowTo ? new Date(updates.windowTo) : null;

    const [updated] = await db
        .update(routePoints)
        .set(setFields)
        .where(and(eq(routePoints.id, pointId), eq(routePoints.tripId, tripId)))
        .returning();

    return updated ?? null;
}

export async function deleteRoutePoint(tripId: string, pointId: string) {
    const [deleted] = await db
        .delete(routePoints)
        .where(and(eq(routePoints.id, pointId), eq(routePoints.tripId, tripId)))
        .returning();

    return deleted ?? null;
}

// --- Get available vehicles for assignment ---

export async function getAvailableVehicles(organizationId?: string | null) {
    const conditions = [
        eq(vehicles.status, 'available'),
        eq(vehicles.isArchived, false),
    ];
    if (organizationId) conditions.push(eq(vehicles.organizationId, organizationId));

    return db
        .select()
        .from(vehicles)
        .where(and(...conditions))
        .orderBy(vehicles.plateNumber);
}

// ================================================================
// Sprint 13: Delivery Confirmation
// ================================================================

export interface DeliveryConfirmationInput {
    orderId?: string;
    recipientName: string;
    recipientPosition?: string;
    recipientDocument?: string;
    recipientSignaturePath?: string;
    photos?: string[];
    cargoCondition?: 'intact' | 'damaged' | 'partial';
    sealNumbers?: string[];
    packagingCondition?: string;
    notes?: string;
    gpsLat?: number;
    gpsLng?: number;
    forcedByDispatcher?: boolean;
    forcedReason?: 'no_mobile' | 'recipient_refused' | 'no_internet' | 'other';
    forcedReasonNote?: string;
}

export async function createDeliveryConfirmation(
    tripId: string,
    input: DeliveryConfirmationInput,
    author: { userId: string; role: string },
) {
    const [trip] = await db.select().from(trips).where(eq(trips.id, tripId)).limit(1);
    if (!trip) throw new Error('Рейс не найден');
    if (trip.status !== 'in_transit') throw new Error('Подтверждение доставки возможно только для рейсов в статусе in_transit');

    const [confirmation] = await db.insert(deliveryConfirmations).values({
        tripId,
        orderId: input.orderId ?? null,
        recipientName: input.recipientName,
        recipientPosition: input.recipientPosition ?? null,
        recipientDocument: input.recipientDocument ?? null,
        recipientSignaturePath: input.recipientSignaturePath ?? null,
        photos: input.photos ?? [],
        cargoCondition: (input.cargoCondition ?? 'intact') as any,
        sealNumbers: input.sealNumbers ?? null,
        packagingCondition: input.packagingCondition ?? null,
        notes: input.notes ?? null,
        gpsLat: input.gpsLat ?? null,
        gpsLng: input.gpsLng ?? null,
        createdBy: author.userId,
        forcedByDispatcher: input.forcedByDispatcher ?? false,
        forcedReason: (input.forcedReason ?? null) as any,
        forcedReasonNote: input.forcedReasonNote ?? null,
    }).returning();

    await recordEvent({
        authorId: author.userId,
        authorRole: author.role,
        eventType: input.forcedByDispatcher ? 'trip.completed' : 'trip.completed',
        entityType: 'trip',
        entityId: tripId,
        data: {
            action: 'delivery_confirmed',
            recipientName: input.recipientName,
            cargoCondition: input.cargoCondition,
            forcedByDispatcher: input.forcedByDispatcher ?? false,
            forcedReason: input.forcedReason,
        },
    });

    // Auto-transition trip to completed
    await changeTripStatus(tripId, 'completed', author, {
        forcedByDispatcher: input.forcedByDispatcher ?? false,
    });

    await refreshTransportDocumentsForTrip(tripId, author.userId);

    return confirmation;
}

export async function getDeliveryConfirmation(tripId: string) {
    const [confirmation] = await db
        .select()
        .from(deliveryConfirmations)
        .where(eq(deliveryConfirmations.tripId, tripId))
        .limit(1);
    return confirmation ?? null;
}

// --- Get available drivers ---

export async function getAvailableDrivers(organizationId?: string | null) {
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
    if (organizationId) conditions.push(eq(drivers.organizationId, organizationId));
    if (busyIds.length > 0) {
        conditions.push(sql`${drivers.id} NOT IN (${sql.join(busyIds.map(id => sql`${id}`), sql`, `)})`);
    }

    return db
        .select()
        .from(drivers)
        .where(and(...conditions))
        .orderBy(drivers.fullName);
}










