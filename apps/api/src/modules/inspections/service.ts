// ============================================================
// Inspections Service — Tech + Med (§3.3, §3.4, §А.2)
// ============================================================
import { db } from '../../db/connection.js';
import {
    techInspections, medInspections, vehicles, drivers,
    trips, checklistTemplates, repairRequests, medAccessLog, permits,
} from '../../db/schema.js';
import { recordEvent } from '../../events/journal.js';
import { eq, and, gte, lte, isNull, desc, sql, count, inArray } from 'drizzle-orm';

// ================================================================
// Types
// ================================================================
interface TechInspectionInput {
    vehicleId: string;
    tripId?: string;
    checklistVersion: string;
    items: Array<{
        name: string;
        result: 'ok' | 'fault';
        comment?: string;
        photoUrl?: string;
    }>;
    decision: 'approved' | 'rejected';
    comment?: string;
    signature: string; // PEP — password confirmation
}

interface MedInspectionInput {
    driverId: string;
    tripId?: string;
    checklistVersion: string;
    systolicBp: number;
    diastolicBp: number;
    heartRate: number;
    temperature: number;
    condition: string;
    alcoholTest: 'negative' | 'positive';
    complaints?: string;
    decision: 'approved' | 'rejected';
    comment?: string;
    signature: string;
}

// ================================================================
// TECH INSPECTIONS
// ================================================================

/**
 * Get queue of vehicles awaiting tech inspection today.
 * These are vehicles assigned to trips (status='assigned') 
 * that haven't been inspected today yet.
 */
export async function getTechInspectionQueue() {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // C-4 FIX: Single query with LEFT JOIN instead of N+1 loop
    // 1. Get assigned trips with vehicles in one query
    const assignedTrips = await db
        .select({
            tripId: trips.id,
            tripNumber: trips.number,
            vehicleId: trips.vehicleId,
            driverId: trips.driverId,
            plannedDepartureAt: trips.plannedDepartureAt,
        })
        .from(trips)
        .where(eq(trips.status, 'assigned'));

    const vehicleIds = assignedTrips
        .map((t: any) => t.vehicleId)
        .filter((id: any): id is string => !!id);

    if (vehicleIds.length === 0) return [];

    // 2. Batch: get all today's approved inspections for these vehicles
    const todayInspections = await db
        .select({ vehicleId: techInspections.vehicleId })
        .from(techInspections)
        .where(
            and(
                sql`${techInspections.vehicleId} IN ${vehicleIds}`,
                gte(techInspections.createdAt, todayStart),
                lte(techInspections.createdAt, todayEnd),
                eq(techInspections.decision, 'approved'),
            ),
        );
    const inspectedVehicleIds = new Set(todayInspections.map((i: any) => i.vehicleId));

    // 3. Filter out already-inspected vehicles
    const uninspectedTrips = assignedTrips.filter(
        (t: any) => t.vehicleId && !inspectedVehicleIds.has(t.vehicleId)
    );
    const uninspectedVehicleIds = uninspectedTrips
        .map((t: any) => t.vehicleId)
        .filter((id: any): id is string => !!id);

    if (uninspectedVehicleIds.length === 0) return [];

    // 4. Batch: get all vehicles + permits in 2 queries total
    const allVehicles = await db
        .select()
        .from(vehicles)
        .where(sql`${vehicles.id} IN ${uninspectedVehicleIds}`);
    const vehicleMap: Map<string, any> = new Map(allVehicles.map((v: any) => [v.id, v]));

    const allPermits = await db
        .select()
        .from(permits)
        .where(sql`${permits.vehicleId} IN ${uninspectedVehicleIds}`);
    const permitsMap = new Map<string, typeof allPermits>();
    for (const p of allPermits) {
        if (!permitsMap.has(p.vehicleId)) permitsMap.set(p.vehicleId, []);
        permitsMap.get(p.vehicleId)!.push(p);
    }

    // 5. Assemble result (0 additional queries)
    return uninspectedTrips
        .filter((t: any) => t.vehicleId && vehicleMap.has(t.vehicleId))
        .map((trip: any) => {
            const vehicle = vehicleMap.get(trip.vehicleId!)!;
            return {
                trip: {
                    id: trip.tripId,
                    number: trip.tripNumber,
                    plannedDepartureAt: trip.plannedDepartureAt,
                },
                vehicle: {
                    ...vehicle,
                    permits: permitsMap.get(vehicle.id) || [],
                },
                documentExpiry: getDocumentExpiryStatus(vehicle),
            };
        });
}

/**
 * Calculate document expiry traffic light status
 */
function getDocumentExpiryStatus(vehicle: typeof vehicles.$inferSelect) {
    const now = new Date();
    const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    function getStatus(expiryDate: Date | null): 'green' | 'yellow' | 'red' | 'unknown' {
        if (!expiryDate) return 'unknown';
        if (expiryDate < now) return 'red';
        if (expiryDate < thirtyDays) return 'yellow';
        return 'green';
    }

    return {
        techInspection: {
            status: getStatus(vehicle.techInspectionExpiry),
            expiry: vehicle.techInspectionExpiry,
        },
        osago: {
            status: getStatus(vehicle.osagoExpiry),
            expiry: vehicle.osagoExpiry,
        },
        maintenance: {
            status: getStatus(vehicle.maintenanceNextDate),
            expiry: vehicle.maintenanceNextDate,
        },
        tachograph: {
            status: getStatus(vehicle.tachographCalibrationExpiry),
            expiry: vehicle.tachographCalibrationExpiry,
        },
    };
}

/**
 * Get active checklist template for tech inspections
 */
export async function getTechChecklistTemplate() {
    const [template] = await db
        .select()
        .from(checklistTemplates)
        .where(
            and(
                eq(checklistTemplates.type, 'tech'),
                eq(checklistTemplates.isActive, true),
            ),
        )
        .orderBy(desc(checklistTemplates.createdAt))
        .limit(1);

    return template;
}

/**
 * Get active checklist template for med inspections
 */
export async function getMedChecklistTemplate() {
    const [template] = await db
        .select()
        .from(checklistTemplates)
        .where(
            and(
                eq(checklistTemplates.type, 'med'),
                eq(checklistTemplates.isActive, true),
            ),
        )
        .orderBy(desc(checklistTemplates.createdAt))
        .limit(1);

    return template;
}

/**
 * Create a tech inspection record.
 * On rejection: auto-creates repair request + notifies dispatcher.
 */
export async function createTechInspection(
    input: TechInspectionInput,
    mechanicId: string,
    mechanicRole: string,
) {
    // H-8 FIX: Wrap in transaction for atomicity
    return await db.transaction(async (tx: any) => {
        // Record start event
        await recordEvent({
            authorId: mechanicId,
            authorRole: mechanicRole,
            eventType: 'inspection.tech_started',
            entityType: 'vehicle',
            entityId: input.vehicleId,
            data: { checklistVersion: input.checklistVersion, tripId: input.tripId },
        }, tx);

        // Insert inspection (append-only — no updates allowed by trigger)
        const [inspection] = await tx.insert(techInspections).values({
            vehicleId: input.vehicleId,
            mechanicId,
            tripId: input.tripId,
            checklistVersion: input.checklistVersion,
            items: input.items,
            decision: input.decision,
            comment: input.comment,
            signature: input.signature,
        }).returning();

        // Record completion event
        await recordEvent({
            authorId: mechanicId,
            authorRole: mechanicRole,
            eventType: 'inspection.tech_completed',
            entityType: 'tech_inspection',
            entityId: inspection.id,
            data: {
                vehicleId: input.vehicleId,
                tripId: input.tripId,
                decision: input.decision,
                faultItems: input.items.filter(i => i.result === 'fault').map(i => i.name),
            },
        }, tx);

        // On rejection → auto-create repair request
        if (input.decision === 'rejected') {
            const faults = input.items
                .filter(i => i.result === 'fault')
                .map(i => `${i.name}: ${i.comment || 'Неисправность'}`)
                .join('; ');

            const [repairRequest] = await tx.insert(repairRequests).values({
                vehicleId: input.vehicleId,
                description: `Недопуск при техосмотре: ${faults}`,
                priority: 'high',
                source: 'auto_inspection',
                inspectionId: inspection.id,
            }).returning();

            // Record repair creation event
            await recordEvent({
                authorId: mechanicId,
                authorRole: mechanicRole,
                eventType: 'repair.created',
                entityType: 'repair_request',
                entityId: repairRequest.id,
                data: {
                    vehicleId: input.vehicleId,
                    source: 'auto_inspection',
                    inspectionId: inspection.id,
                },
            }, tx);

            // Update vehicle status to broken
            await tx.update(vehicles)
                .set({ status: 'broken', updatedAt: new Date() })
                .where(eq(vehicles.id, input.vehicleId));

            await recordEvent({
                authorId: mechanicId,
                authorRole: mechanicRole,
                eventType: 'vehicle.status_changed',
                entityType: 'vehicle',
                entityId: input.vehicleId,
                data: { newStatus: 'broken', reason: 'tech_inspection_rejected' },
            }, tx);
        }

        return inspection;
    });
}

/**
 * List tech inspections with pagination.
 */
export async function listTechInspections(page = 1, limit = 20) {
    const offset = (page - 1) * limit;

    const [totalResult] = await db
        .select({ count: count() })
        .from(techInspections);

    const items = await db
        .select()
        .from(techInspections)
        .orderBy(desc(techInspections.createdAt))
        .limit(limit)
        .offset(offset);

    // M-21 FIX: Batch load vehicle data for the list
    const vehicleIds = [...new Set(items.map((i: any) => i.vehicleId))].filter(Boolean);
    let vehicleMap = new Map();

    if (vehicleIds.length > 0) {
        const vehiclesData = await db
            .select({ id: vehicles.id, plateNumber: vehicles.plateNumber, make: vehicles.make, model: vehicles.model })
            .from(vehicles)
            .where(inArray(vehicles.id, vehicleIds));
        vehicleMap = new Map(vehiclesData.map((v: any) => [v.id, v]));
    }

    const enhancedItems = items.map((item: any) => ({
        ...item,
        vehicle: vehicleMap.get(item.vehicleId) || null,
    }));

    return {
        data: enhancedItems,
        total: totalResult.count,
        page,
        limit,
    };
}

/**
 * Get single tech inspection by ID.
 */
export async function getTechInspectionById(id: string) {
    const [inspection] = await db
        .select()
        .from(techInspections)
        .where(eq(techInspections.id, id))
        .limit(1);

    return inspection || null;
}

// ================================================================
// MED INSPECTIONS (152-ФЗ)
// ================================================================

/**
 * Get queue of drivers awaiting med inspection today.
 */
export async function getMedInspectionQueue() {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // 1. Get all assigned trips with drivers
    const assignedTrips = await db
        .select({
            tripId: trips.id,
            tripNumber: trips.number,
            driverId: trips.driverId,
            vehicleId: trips.vehicleId,
            plannedDepartureAt: trips.plannedDepartureAt,
        })
        .from(trips)
        .where(eq(trips.status, 'assigned'));

    const tripsWithDrivers = assignedTrips.filter((t: any) => t.driverId);
    if (tripsWithDrivers.length === 0) return [];

    const driverIds = [...new Set(tripsWithDrivers.map((t: any) => t.driverId!))];

    // 2. Batch: get all approved med inspections today for these drivers
    const approvedToday = await db
        .select({ driverId: medInspections.driverId })
        .from(medInspections)
        .where(
            and(
                inArray(medInspections.driverId, driverIds),
                gte(medInspections.createdAt, todayStart),
                lte(medInspections.createdAt, todayEnd),
                eq(medInspections.decision, 'approved'),
            ),
        );
    const approvedDriverIds = new Set(approvedToday.map((r: any) => r.driverId));

    // 3. Filter drivers who still need inspection
    const needInspection = tripsWithDrivers.filter((t: any) => !approvedDriverIds.has(t.driverId!));
    if (needInspection.length === 0) return [];

    // 4. Batch: load all driver details
    const needDriverIds = [...new Set(needInspection.map((t: any) => t.driverId!))];
    const allDrivers = await db
        .select()
        .from(drivers)
        .where(inArray(drivers.id, needDriverIds));
    const driverMap = new Map(allDrivers.map((d: any) => [d.id, d]));

    // 5. Build queue in memory
    const now = new Date();
    const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    return needInspection
        .map((trip: any) => {
            const driver = driverMap.get(trip.driverId!);
            if (!driver) return null;

            let medCertStatus: 'green' | 'yellow' | 'red' | 'unknown' = 'unknown';
            if ((driver as any).medCertificateExpiry) {
                if ((driver as any).medCertificateExpiry < now) medCertStatus = 'red';
                else if ((driver as any).medCertificateExpiry < thirtyDays) medCertStatus = 'yellow';
                else medCertStatus = 'green';
            }

            return {
                trip: {
                    id: trip.tripId,
                    number: trip.tripNumber,
                    plannedDepartureAt: trip.plannedDepartureAt,
                },
                driver: {
                    id: (driver as any).id,
                    fullName: (driver as any).fullName,
                    birthDate: (driver as any).birthDate,
                    licenseNumber: (driver as any).licenseNumber,
                    licenseCategories: (driver as any).licenseCategories,
                    personalDataConsent: (driver as any).personalDataConsent,
                    medCertificateExpiry: (driver as any).medCertificateExpiry,
                    medCertStatus,
                },
            };
        })
        .filter(Boolean);
}

/**
 * Create a med inspection record.
 * CRITICAL 152-ФЗ: checks personal data consent.
 */
export async function createMedInspection(
    input: MedInspectionInput,
    medicId: string,
    medicRole: string,
) {
    // Check personal data consent (152-ФЗ)
    const [driver] = await db
        .select({
            personalDataConsent: drivers.personalDataConsent,
            fullName: drivers.fullName,
        })
        .from(drivers)
        .where(eq(drivers.id, input.driverId))
        .limit(1);

    if (!driver) {
        throw new Error('Водитель не найден');
    }

    if (!driver.personalDataConsent) {
        throw new Error('Согласие на обработку персональных данных не получено. Медосмотр в системе невозможен.');
    }

    // Wrap in transaction for atomicity (N-2)
    return await db.transaction(async (tx: any) => {
        // Record start event
        await recordEvent({
            authorId: medicId,
            authorRole: medicRole,
            eventType: 'inspection.med_started',
            entityType: 'driver',
            entityId: input.driverId,
            data: { checklistVersion: input.checklistVersion, tripId: input.tripId },
        }, tx);

        // Insert inspection (append-only)
        const [inspection] = await tx.insert(medInspections).values({
            driverId: input.driverId,
            medicId,
            tripId: input.tripId,
            checklistVersion: input.checklistVersion,
            systolicBp: input.systolicBp,
            diastolicBp: input.diastolicBp,
            heartRate: input.heartRate,
            temperature: input.temperature,
            condition: input.condition,
            alcoholTest: input.alcoholTest,
            complaints: input.complaints,
            decision: input.decision,
            comment: input.comment,
            signature: input.signature,
        }).returning();

        // Log med data access (152-ФЗ)
        await tx.insert(medAccessLog).values({
            userId: medicId,
            targetDriverId: input.driverId,
            action: 'create_inspection',
        });

        // Record completion event
        await recordEvent({
            authorId: medicId,
            authorRole: medicRole,
            eventType: 'inspection.med_completed',
            entityType: 'med_inspection',
            entityId: inspection.id,
            data: {
                driverId: input.driverId,
                tripId: input.tripId,
                decision: input.decision,
                // NOTE: no medical details in event (152-ФЗ)
            },
        }, tx);

        // On rejection → notify dispatcher via event
        if (input.decision === 'rejected') {
            // Event visible to dispatcher: only fact, no medical details
            await recordEvent({
                authorId: medicId,
                authorRole: medicRole,
                eventType: 'trip.driver_cleared',
                entityType: 'trip',
                entityId: input.tripId || input.driverId,
                data: {
                    driverId: input.driverId,
                    decision: 'rejected',
                    // No medical details here — 152-ФЗ
                },
            }, tx);
        }

        return inspection;
    });
}

/**
 * List med inspections.
 * For medics: full data.
 * For others: only public schema (decision + timestamp).
 */
export async function listMedInspections(
    page = 1,
    limit = 20,
    isMedic: boolean,
    userId: string,
) {
    const offset = (page - 1) * limit;

    const [totalResult] = await db
        .select({ count: count() })
        .from(medInspections);

    const items = await db
        .select()
        .from(medInspections)
        .orderBy(desc(medInspections.createdAt))
        .limit(limit)
        .offset(offset);

    // Log access (152-ФЗ)
    // M-22 FIX: Batch insert access log
    if (items.length > 0) {
        const logEntries = items.map((item: any) => ({
            userId,
            targetDriverId: item.driverId,
            action: isMedic ? 'list_full' as const : 'list_public' as const,
        }));
        await db.insert(medAccessLog).values(logEntries);
    }

    // M-21 FIX: Batch load driver data for the list
    const driverIds = [...new Set(items.map((i: any) => i.driverId))].filter(Boolean);
    let driverMap = new Map();

    if (driverIds.length > 0) {
        const driversData = await db
            .select({ id: drivers.id, fullName: drivers.fullName, licenseNumber: drivers.licenseNumber })
            .from(drivers)
            .where(inArray(drivers.id, driverIds));
        driverMap = new Map(driversData.map((d: any) => [d.id, d]));
    }

    if (!isMedic) {
        // Return only public data (152-ФЗ)
        return {
            data: items.map((i: any) => ({
                id: i.id,
                driverId: i.driverId,
                driver: driverMap.get(i.driverId) || null,
                decision: i.decision,
                createdAt: i.createdAt,
            })),
            total: totalResult.count,
            page,
            limit,
        };
    }

    const enhancedItems = items.map((item: any) => ({
        ...item,
        driver: driverMap.get(item.driverId) || null,
    }));

    return {
        data: enhancedItems,
        total: totalResult.count,
        page,
        limit,
    };
}

/**
 * Get single med inspection.
 * 152-ФЗ: full data only for medics.
 */
export async function getMedInspectionById(
    id: string,
    isMedic: boolean,
    userId: string,
    ipAddress?: string,
) {
    const [inspection] = await db
        .select()
        .from(medInspections)
        .where(eq(medInspections.id, id))
        .limit(1);

    if (!inspection) return null;

    // Log access (152-ФЗ)
    await db.insert(medAccessLog).values({
        userId,
        targetDriverId: inspection.driverId,
        action: isMedic ? 'view_full' : 'view_public',
        ipAddress,
    });

    if (!isMedic) {
        return {
            id: inspection.id,
            driverId: inspection.driverId,
            decision: inspection.decision,
            createdAt: inspection.createdAt,
        };
    }

    return inspection;
}

/**
 * Get rejection statistics for a period.
 */
export async function getMedRejectionStats(daysBack = 30) {
    const since = new Date();
    since.setDate(since.getDate() - daysBack);

    // H-14 FIX: Use SQL COUNT instead of loading all records to RAM
    const [stats] = await db
        .select({
            total: count(),
            rejected: sql<number>`count(*) filter (where ${medInspections.decision} = 'rejected')`,
        })
        .from(medInspections)
        .where(gte(medInspections.createdAt, since));

    const total = stats?.total ?? 0;
    const rejected = stats?.rejected ?? 0;
    const approved = total - rejected;

    return {
        total,
        approved,
        rejected,
        rejectionRate: total > 0 ? Math.round((rejected / total) * 100) : 0,
        period: `${daysBack} days`,
    };
}

/**
 * Get drivers with med certificates expiring within N days.
 */
export async function getExpiringMedCertificates(daysAhead = 30) {
    const now = new Date();
    const deadline = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

    return db
        .select({
            id: drivers.id,
            fullName: drivers.fullName,
            medCertificateExpiry: drivers.medCertificateExpiry,
        })
        .from(drivers)
        .where(
            and(
                eq(drivers.isActive, true),
                lte(drivers.medCertificateExpiry!, deadline),
            ),
        )
        .orderBy(drivers.medCertificateExpiry);
}

/**
 * Check if vehicle has valid tech inspection today.
 */
export async function hasValidTechInspectionToday(vehicleId: string): Promise<boolean> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const [result] = await db
        .select({ id: techInspections.id })
        .from(techInspections)
        .where(
            and(
                eq(techInspections.vehicleId, vehicleId),
                eq(techInspections.decision, 'approved'),
                gte(techInspections.createdAt, todayStart),
                lte(techInspections.createdAt, todayEnd),
            ),
        )
        .limit(1);

    return !!result;
}

/**
 * Check if driver has valid med inspection today.
 */
export async function hasValidMedInspectionToday(driverId: string): Promise<boolean> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const [result] = await db
        .select({ id: medInspections.id })
        .from(medInspections)
        .where(
            and(
                eq(medInspections.driverId, driverId),
                eq(medInspections.decision, 'approved'),
                gte(medInspections.createdAt, todayStart),
                lte(medInspections.createdAt, todayEnd),
            ),
        )
        .limit(1);

    return !!result;
}

/**
 * Get today's approved tech inspection ID for a vehicle.
 */
export async function getTodayTechInspectionId(vehicleId: string): Promise<string | null> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const [result] = await db
        .select({ id: techInspections.id, signature: techInspections.signature })
        .from(techInspections)
        .where(
            and(
                eq(techInspections.vehicleId, vehicleId),
                eq(techInspections.decision, 'approved'),
                gte(techInspections.createdAt, todayStart),
                lte(techInspections.createdAt, todayEnd),
            ),
        )
        .orderBy(desc(techInspections.createdAt))
        .limit(1);

    return result ? result.id : null;
}

/**
 * Get today's approved med inspection ID for a driver.
 */
export async function getTodayMedInspectionId(driverId: string): Promise<string | null> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const [result] = await db
        .select({ id: medInspections.id, signature: medInspections.signature })
        .from(medInspections)
        .where(
            and(
                eq(medInspections.driverId, driverId),
                eq(medInspections.decision, 'approved'),
                gte(medInspections.createdAt, todayStart),
                lte(medInspections.createdAt, todayEnd),
            ),
        )
        .orderBy(desc(medInspections.createdAt))
        .limit(1);

    return result ? result.id : null;
}
