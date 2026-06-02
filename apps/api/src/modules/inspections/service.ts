// ============================================================
// Inspections Service — Tech + Med (§3.3, §3.4, §А.2)
// ============================================================
import { db } from '../../db/connection.js';
import {
    techInspections, medInspections, vehicles, drivers, users,
    trips, checklistTemplates, repairRequests, medAccessLog, permits, waybills,
} from '../../db/schema.js';
import { recordEvent } from '../../events/journal.js';
import { getBusinessDayBounds } from '../../utils/timezone.js';
import { toFiniteNumber } from '../../utils/number.js';
import { syncWaybillStateForTrip } from '../waybills/service.js';
import { verifyPassword } from '../../auth/password.js';
import { eq, and, gte, lte, isNull, desc, sql, count, inArray } from 'drizzle-orm';
import { createHash } from 'node:crypto';

// ================================================================
// ПЭП (простая электронная подпись) — C1
// ================================================================
//
// Осмотр подписывается ПЭП: подписант повторно вводит пароль своей
// учётки. Раньше пароль писался в колонку `signature` ОТКРЫТЫМ ТЕКСТОМ
// без какой-либо проверки (P0: либо plaintext-пароль в БД, либо подпись
// не верифицировалась вовсе). Теперь:
//   1) пароль сверяется с хэшем учётки подписанта (verifyPassword);
//   2) в БД пишется НЕ пароль, а необратимый маркер `pep:v1:<fp>`,
//      привязанный к учётке (доказывает факт ПЭП без раскрытия секрета).

/** ПЭП-подпись недействительна (неверный пароль подписанта). → HTTP 403. */
export class InvalidPepError extends Error {
    statusCode = 403;
    constructor(message = 'ПЭП-подпись недействительна: неверный пароль') {
        super(message);
        this.name = 'InvalidPepError';
    }
}

/** Нарушение бизнес-правила осмотра (алкотест/immutability/note). → HTTP 422. */
export class InspectionRuleError extends Error {
    statusCode = 422;
    constructor(message: string) {
        super(message);
        this.name = 'InspectionRuleError';
    }
}

/**
 * Сверяет ПЭП (пароль подписанта) с хэшем его учётки и возвращает
 * необратимый маркер для хранения. НИКОГДА не возвращает/не хранит сам пароль.
 * @throws InvalidPepError при неверном пароле или отсутствии учётки.
 */
async function verifyPepSignature(signerUserId: string, signature: string): Promise<string> {
    if (!signature) throw new InvalidPepError('ПЭП-подпись обязательна');
    const [u] = await db
        .select({ passwordHash: users.passwordHash })
        .from(users)
        .where(eq(users.id, signerUserId))
        .limit(1);
    if (!u?.passwordHash || !(await verifyPassword(signature, u.passwordHash))) {
        throw new InvalidPepError();
    }
    const fp = createHash('sha256').update(`${signerUserId}:${u.passwordHash}`).digest('hex').slice(0, 16);
    return `pep:v1:${fp}`;
}

// ================================================================
// Types
// ================================================================
interface TechInspectionInput {
    vehicleId: string;
    tripId?: string;
    inspectionType?: 'pre_trip' | 'periodic';
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

interface PostTripTechInspectionInput {
    vehicleId: string;
    tripId: string;
    checklistVersion: string;
    items: Array<{
        name: string;
        result: 'ok' | 'fault';
        comment?: string;
        photoUrl?: string;
    }>;
    decision: 'approved' | 'rejected';
    comment?: string;
    signature: string;
}

interface MedInspectionInput {
    driverId: string;
    tripId?: string;
    inspectionType?: 'pre_trip' | 'periodic';
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

interface PostTripMedInspectionInput {
    driverId: string;
    tripId: string;
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
export async function getTechInspectionQueue(organizationId?: string | null) {
    const { todayStart, todayEnd } = getBusinessDayBounds();

    // C-4 FIX: Single query with LEFT JOIN instead of N+1 loop
    // 1. Get assigned trips with vehicles in one query
    const assignedTrips = await db
        .select({
            tripId: trips.id,
            tripNumber: trips.number,
            waybillId: trips.waybillId,
            vehicleId: trips.vehicleId,
            driverId: trips.driverId,
            plannedDepartureAt: trips.plannedDepartureAt,
        })
        .from(trips)
        .where(
            organizationId
                ? and(inArray(trips.status, ['assigned', 'waybill_draft']), inArray(trips.driverId, db.select({ id: drivers.id }).from(drivers).where(eq(drivers.organizationId, organizationId))))
                : inArray(trips.status, ['assigned', 'waybill_draft'])
        );

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
                eq(techInspections.inspectionType, 'pre_trip'),
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
    const tripIds = uninspectedTrips.map((t: any) => t.tripId);

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

    const allWaybills = tripIds.length > 0
        ? await db
            .select({ id: waybills.id, tripId: waybills.tripId, number: waybills.number })
            .from(waybills)
            .where(inArray(waybills.tripId, tripIds))
        : [];
    const waybillMap = new Map(allWaybills.map((wb: any) => [wb.tripId, wb]));

    // 5. Assemble result (0 additional queries)
    return uninspectedTrips
        .filter((t: any) => t.vehicleId && vehicleMap.has(t.vehicleId))
        .map((trip: any) => {
            const vehicle = vehicleMap.get(trip.vehicleId!)!;
            const waybill = waybillMap.get(trip.tripId);
            return {
                trip: {
                    id: trip.tripId,
                    number: trip.tripNumber,
                    plannedDepartureAt: trip.plannedDepartureAt,
                    waybillId: trip.waybillId ?? waybill?.id ?? null,
                    waybillNumber: waybill?.number ?? null,
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
    if (input.inspectionType !== 'periodic' && !input.tripId) {
        throw new Error('Для предрейсового осмотра необходимо указать рейс (tripId)');
    }
    // ПЭП: сверяем пароль подписанта до любых записей (fail-fast → 403).
    const pepMarker = await verifyPepSignature(mechanicId, input.signature);
    const inspection = await db.transaction(async (tx: any) => {
        await recordEvent({
            authorId: mechanicId,
            authorRole: mechanicRole,
            eventType: 'inspection.tech_started',
            entityType: 'vehicle',
            entityId: input.vehicleId,
            data: { checklistVersion: input.checklistVersion, tripId: input.tripId },
        }, tx);
        const [createdInspection] = await tx.insert(techInspections).values({
            vehicleId: input.vehicleId,
            mechanicId,
            tripId: input.tripId,
            inspectionType: input.inspectionType ?? 'pre_trip',
            checklistVersion: input.checklistVersion,
            items: input.items,
            decision: input.decision,
            comment: input.comment,
            signature: pepMarker,
        }).returning();
        await recordEvent({
            authorId: mechanicId,
            authorRole: mechanicRole,
            eventType: 'inspection.tech_completed',
            entityType: 'tech_inspection',
            entityId: createdInspection.id,
            data: {
                vehicleId: input.vehicleId,
                tripId: input.tripId,
                decision: input.decision,
                faultItems: input.items.filter(i => i.result === 'fault').map(i => i.name),
            },
        }, tx);
        if (input.decision === 'rejected') {
            const faults = input.items
                .filter(i => i.result === 'fault')
                .map(i => `${i.name}: ${i.comment || 'Fault detected'}`)
                .join('; ');
            const [repairRequest] = await tx.insert(repairRequests).values({
                vehicleId: input.vehicleId,
                description: `Tech inspection failed: ${faults}`,
                priority: 'high',
                source: 'auto_inspection',
                inspectionId: createdInspection.id,
            }).returning();
            await recordEvent({
                authorId: mechanicId,
                authorRole: mechanicRole,
                eventType: 'repair.created',
                entityType: 'repair_request',
                entityId: repairRequest.id,
                data: {
                    vehicleId: input.vehicleId,
                    source: 'auto_inspection',
                    inspectionId: createdInspection.id,
                },
            }, tx);
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
        return createdInspection;
    });
    if (input.tripId && input.decision === 'approved') {
        await syncWaybillStateForTrip(input.tripId, mechanicId, mechanicRole);
    }
    return inspection;
}
/**
 * List tech inspections with pagination.
 */
export async function listTechInspections(page = 1, limit = 20, organizationId?: string | null) {
    const offset = (page - 1) * limit;

    const conditions = [];
    if (organizationId) {
        conditions.push(
            inArray(techInspections.vehicleId,
                db.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.organizationId, organizationId))
            )
        );
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalResult] = await db
        .select({ count: count() })
        .from(techInspections)
        .where(where);

    const items = await db
        .select()
        .from(techInspections)
        .where(where)
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
export async function getTechInspectionById(id: string, organizationId?: string | null) {
    const conditions = [eq(techInspections.id, id)];
    if (organizationId) {
        conditions.push(
            inArray(
                techInspections.vehicleId,
                db.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.organizationId, organizationId))
            )
        );
    }

    const [inspection] = await db
        .select()
        .from(techInspections)
        .where(and(...conditions))
        .limit(1);

    return inspection || null;
}

// ================================================================
// MED INSPECTIONS (152-ФЗ)
// ================================================================

/**
 * Get queue of drivers awaiting med inspection today.
 */
export async function getMedInspectionQueue(organizationId?: string | null) {
    const { todayStart, todayEnd } = getBusinessDayBounds();

    // 1. Get all assigned trips with drivers
    const assignedTrips = await db
        .select({
            tripId: trips.id,
            tripNumber: trips.number,
            waybillId: trips.waybillId,
            driverId: trips.driverId,
            vehicleId: trips.vehicleId,
            plannedDepartureAt: trips.plannedDepartureAt,
        })
        .from(trips)
        .where(
            organizationId
                ? and(inArray(trips.status, ['assigned', 'waybill_draft']), inArray(trips.driverId, db.select({ id: drivers.id }).from(drivers).where(eq(drivers.organizationId, organizationId))))
                : inArray(trips.status, ['assigned', 'waybill_draft'])
        );

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
                eq(medInspections.inspectionType, 'pre_trip'),
            ),
        );
    const approvedDriverIds = new Set(approvedToday.map((r: any) => r.driverId));

    // 3. Filter drivers who still need inspection
    const needInspection = tripsWithDrivers.filter((t: any) => !approvedDriverIds.has(t.driverId!));
    if (needInspection.length === 0) return [];
    const tripIds = needInspection.map((t: any) => t.tripId);

    // 4. Batch: load all driver details
    const needDriverIds = [...new Set(needInspection.map((t: any) => t.driverId!))];
    const allDrivers = await db
        .select()
        .from(drivers)
        .where(inArray(drivers.id, needDriverIds));
    type DriverRow = typeof drivers.$inferSelect;
    const driverMap = new Map<string, DriverRow>(allDrivers.map((d) => [d.id, d]));

    const allWaybills = tripIds.length > 0
        ? await db
            .select({ id: waybills.id, tripId: waybills.tripId, number: waybills.number })
            .from(waybills)
            .where(inArray(waybills.tripId, tripIds))
        : [];
    const waybillMap = new Map(allWaybills.map((wb: any) => [wb.tripId, wb]));

    // 5. Build queue in memory
    const now = new Date();
    const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    return needInspection
        .map((trip: any) => {
            const driver = driverMap.get(trip.driverId!);
            if (!driver) return null;
            const waybill = waybillMap.get(trip.tripId);

            let medCertStatus: 'green' | 'yellow' | 'red' | 'unknown' = 'unknown';
            if (driver.medCertificateExpiry) {
                if (driver.medCertificateExpiry < now) medCertStatus = 'red';
                else if (driver.medCertificateExpiry < thirtyDays) medCertStatus = 'yellow';
                else medCertStatus = 'green';
            }

            return {
                trip: {
                    id: trip.tripId,
                    number: trip.tripNumber,
                    plannedDepartureAt: trip.plannedDepartureAt,
                    waybillId: trip.waybillId ?? waybill?.id ?? null,
                    waybillNumber: waybill?.number ?? null,
                },
                driver: {
                    id: driver.id,
                    fullName: driver.fullName,
                    birthDate: driver.birthDate,
                    licenseNumber: driver.licenseNumber,
                    licenseCategories: driver.licenseCategories,
                    personalDataConsent: driver.personalDataConsent,
                    medCertificateExpiry: driver.medCertificateExpiry,
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
    if (input.inspectionType !== 'periodic' && !input.tripId) {
        throw new Error('Для предрейсового осмотра необходимо указать рейс (tripId)');
    }
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
        throw new Error('Водитель не подписал согласие на обработку персональных данных. Обратитесь к кадровой службе.');
    }
    // Серверный guard: положительный алкотест не может дать допуск.
    if (input.alcoholTest === 'positive' && input.decision === 'approved') {
        throw new InspectionRuleError('Положительный алкотест: допуск ("approved") невозможен');
    }
    // ПЭП: сверяем пароль подписанта до любых записей (fail-fast → 403).
    const pepMarker = await verifyPepSignature(medicId, input.signature);
    const inspection = await db.transaction(async (tx: any) => {
        await recordEvent({
            authorId: medicId,
            authorRole: medicRole,
            eventType: 'inspection.med_started',
            entityType: 'driver',
            entityId: input.driverId,
            data: { checklistVersion: input.checklistVersion, tripId: input.tripId },
        }, tx);
        const [createdInspection] = await tx.insert(medInspections).values({
            driverId: input.driverId,
            medicId,
            tripId: input.tripId,
            inspectionType: input.inspectionType ?? 'pre_trip',
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
            signature: pepMarker,
        }).returning();
        await tx.insert(medAccessLog).values({
            userId: medicId,
            targetDriverId: input.driverId,
            action: 'create_inspection',
        });
        await recordEvent({
            authorId: medicId,
            authorRole: medicRole,
            eventType: 'inspection.med_completed',
            entityType: 'med_inspection',
            entityId: createdInspection.id,
            data: {
                driverId: input.driverId,
                tripId: input.tripId,
                decision: input.decision,
            },
        }, tx);
        if (input.decision === 'rejected') {
            await recordEvent({
                authorId: medicId,
                authorRole: medicRole,
                eventType: 'trip.driver_cleared',
                entityType: 'trip',
                entityId: input.tripId || input.driverId,
                data: {
                    driverId: input.driverId,
                    decision: 'rejected',
                },
            }, tx);
        }
        return createdInspection;
    });
    if (input.tripId && input.decision === 'approved') {
        await syncWaybillStateForTrip(input.tripId, medicId, medicRole);
    }
    return inspection;
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
    organizationId?: string | null,
) {
    const offset = (page - 1) * limit;

    const conditions = [];
    if (organizationId) {
        conditions.push(
            inArray(medInspections.driverId,
                db.select({ id: drivers.id }).from(drivers)
                    .innerJoin(users, eq(drivers.userId, users.id))
                    .where(eq(users.organizationId, organizationId))
            )
        );
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalResult] = await db
        .select({ count: count() })
        .from(medInspections)
        .where(where);

    const items = await db
        .select()
        .from(medInspections)
        .where(where)
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
    organizationId?: string | null,
    ipAddress?: string,
) {
    const conditions = [eq(medInspections.id, id)];
    if (organizationId) {
        conditions.push(
            inArray(
                medInspections.driverId,
                db.select({ id: drivers.id }).from(drivers).where(eq(drivers.organizationId, organizationId))
            )
        );
    }

    const [inspection] = await db
        .select()
        .from(medInspections)
        .where(and(...conditions))
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
export async function getMedRejectionStats(daysBack = 30, organizationId?: string | null) {
    const since = new Date();
    since.setDate(since.getDate() - daysBack);

    // H-14 FIX: Use SQL COUNT instead of loading all records to RAM
    const [stats] = await db
        .select({
            total: count(),
            rejected: sql<number>`count(*) filter (where ${medInspections.decision} = 'rejected')`,
        })
        .from(medInspections)
        .innerJoin(drivers, eq(medInspections.driverId, drivers.id))
        .where(and(
            gte(medInspections.createdAt, since),
            organizationId ? eq(drivers.organizationId, organizationId) : undefined,
        ));

    const total = toFiniteNumber(stats?.total);
    const rejected = toFiniteNumber(stats?.rejected);
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
export async function getExpiringMedCertificates(daysAhead = 30, organizationId?: string | null) {
    const now = new Date();
    const deadline = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

    const conditions = [
        eq(drivers.isActive, true),
        lte(drivers.medCertificateExpiry!, deadline),
    ];
    if (organizationId) {
        conditions.push(eq(drivers.organizationId, organizationId));
    }

    return db
        .select({
            id: drivers.id,
            fullName: drivers.fullName,
            medCertificateExpiry: drivers.medCertificateExpiry,
        })
        .from(drivers)
        .where(and(...conditions))
        .orderBy(drivers.medCertificateExpiry);
}

/**
 * Check if vehicle has valid tech inspection today.
 */
export async function hasValidTechInspectionToday(vehicleId: string): Promise<boolean> {
    const { todayStart, todayEnd } = getBusinessDayBounds();

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
    const { todayStart, todayEnd } = getBusinessDayBounds();

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
    const { todayStart, todayEnd } = getBusinessDayBounds();

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
    const { todayStart, todayEnd } = getBusinessDayBounds();

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

// ================================================================
// LIGHTWEIGHT DECISION UPDATES (D5)
// ================================================================
//
// Decision-only mutators for the mechanic / medic queue UI. They
// flip the `decision` column on an existing inspection (or create
// a stub if the inspection row doesn't yet exist for the trip),
// journal a `inspection.decision_changed` event and re-run the
// waybill state sync hook.
// ================================================================

interface DecisionInput {
    decision: 'approved' | 'rejected';
    notes?: string;
}

interface DecisionResult {
    id: string;
    decision: 'approved' | 'rejected';
    tripId: string | null;
}

export async function updateTechInspectionDecision(
    inspectionId: string,
    input: DecisionInput,
    actor: { userId: string; role: string; organizationId?: string | null },
): Promise<DecisionResult | null> {
    // Verify access via org-scoped fetch.
    const existing = await getTechInspectionById(inspectionId, actor.organizationId);
    if (!existing) return null;

    const result = await db.transaction(async (tx: any) => {
        const previous = existing.decision;
        const merged = mergeDecisionComment(existing.comment, input.notes);
        const [updated] = await tx
            .update(techInspections)
            .set({ decision: input.decision, comment: merged })
            .where(eq(techInspections.id, inspectionId))
            .returning();

        await recordEvent({
            authorId: actor.userId,
            authorRole: actor.role,
            eventType: 'inspection.decision_changed',
            entityType: 'tech_inspection',
            entityId: inspectionId,
            data: {
                vehicleId: updated.vehicleId,
                tripId: updated.tripId,
                from: previous,
                to: input.decision,
                notes: input.notes ?? null,
            },
        }, tx);

        return updated;
    });

    if (result.tripId && input.decision === 'approved') {
        await syncWaybillStateForTrip(result.tripId, actor.userId, actor.role);
    }

    return {
        id: result.id,
        decision: result.decision as 'approved' | 'rejected',
        tripId: result.tripId ?? null,
    };
}

export async function updateMedInspectionDecision(
    inspectionId: string,
    input: DecisionInput,
    actor: { userId: string; role: string; organizationId?: string | null },
): Promise<DecisionResult | null> {
    const conditions = [eq(medInspections.id, inspectionId)];
    if (actor.organizationId) {
        conditions.push(
            inArray(
                medInspections.driverId,
                db.select({ id: drivers.id }).from(drivers).where(eq(drivers.organizationId, actor.organizationId))
            )
        );
    }
    const [existing] = await db
        .select()
        .from(medInspections)
        .where(and(...conditions))
        .limit(1);
    if (!existing) return null;

    const result = await db.transaction(async (tx: any) => {
        const previous = existing.decision;
        const merged = mergeDecisionComment(existing.comment, input.notes);
        const [updated] = await tx
            .update(medInspections)
            .set({ decision: input.decision, comment: merged })
            .where(eq(medInspections.id, inspectionId))
            .returning();

        await tx.insert(medAccessLog).values({
            userId: actor.userId,
            targetDriverId: updated.driverId,
            action: 'update_decision',
        });

        await recordEvent({
            authorId: actor.userId,
            authorRole: actor.role,
            eventType: 'inspection.decision_changed',
            entityType: 'med_inspection',
            entityId: inspectionId,
            data: {
                driverId: updated.driverId,
                tripId: updated.tripId,
                from: previous,
                to: input.decision,
                notes: input.notes ?? null,
            },
        }, tx);

        return updated;
    });

    if (result.tripId && input.decision === 'approved') {
        await syncWaybillStateForTrip(result.tripId, actor.userId, actor.role);
    }

    return {
        id: result.id,
        decision: result.decision as 'approved' | 'rejected',
        tripId: result.tripId ?? null,
    };
}

function mergeDecisionComment(existing: string | null | undefined, notes: string | undefined): string | null {
    if (!notes) return existing ?? null;
    if (!existing) return notes;
    return `${existing}\n${notes}`;
}

// ================================================================
// POST-TRIP INSPECTIONS
// ================================================================

/**
 * Create a post-trip tech inspection record.
 * On rejection: set vehicle status to 'maintenance' and auto-create repair request.
 */
export async function createPostTripTechInspection(
    input: PostTripTechInspectionInput,
    mechanicId: string,
    mechanicRole: string,
) {
    // ПЭП: сверяем пароль подписанта до любых записей (fail-fast → 403).
    const pepMarker = await verifyPepSignature(mechanicId, input.signature);
    return db.transaction(async (tx: any) => {
        await recordEvent({
            authorId: mechanicId,
            authorRole: mechanicRole,
            eventType: 'inspection.tech_started',
            entityType: 'vehicle',
            entityId: input.vehicleId,
            data: { checklistVersion: input.checklistVersion, tripId: input.tripId, inspectionType: 'post_trip' },
        }, tx);

        const [createdInspection] = await tx.insert(techInspections).values({
            vehicleId: input.vehicleId,
            mechanicId,
            tripId: input.tripId,
            inspectionType: 'post_trip',
            checklistVersion: input.checklistVersion,
            items: input.items,
            decision: input.decision,
            comment: input.comment,
            signature: pepMarker,
        }).returning();

        await recordEvent({
            authorId: mechanicId,
            authorRole: mechanicRole,
            eventType: 'inspection.tech_completed',
            entityType: 'tech_inspection',
            entityId: createdInspection.id,
            data: {
                vehicleId: input.vehicleId,
                tripId: input.tripId,
                inspectionType: 'post_trip',
                decision: input.decision,
                faultItems: input.items.filter(i => i.result === 'fault').map(i => i.name),
            },
        }, tx);

        if (input.decision === 'rejected') {
            const faults = input.items
                .filter(i => i.result === 'fault')
                .map(i => `${i.name}: ${i.comment || 'Fault detected'}`)
                .join('; ');

            const [repairRequest] = await tx.insert(repairRequests).values({
                vehicleId: input.vehicleId,
                description: `Post-trip tech inspection failed: ${faults}`,
                priority: 'high',
                source: 'auto_inspection',
                inspectionId: createdInspection.id,
            }).returning();

            await recordEvent({
                authorId: mechanicId,
                authorRole: mechanicRole,
                eventType: 'repair.created',
                entityType: 'repair_request',
                entityId: repairRequest.id,
                data: {
                    vehicleId: input.vehicleId,
                    source: 'auto_inspection',
                    inspectionId: createdInspection.id,
                },
            }, tx);

            await tx.update(vehicles)
                .set({ status: 'maintenance', updatedAt: new Date() })
                .where(eq(vehicles.id, input.vehicleId));

            await recordEvent({
                authorId: mechanicId,
                authorRole: mechanicRole,
                eventType: 'vehicle.status_changed',
                entityType: 'vehicle',
                entityId: input.vehicleId,
                data: { newStatus: 'maintenance', reason: 'post_trip_inspection_rejected' },
            }, tx);
        }

        return createdInspection;
    });
}

/**
 * Create a post-trip med inspection record.
 * CRITICAL 152-ФЗ: checks personal data consent.
 */
export async function createPostTripMedInspection(
    input: PostTripMedInspectionInput,
    medicId: string,
    medicRole: string,
) {
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
        throw new Error('Водитель не подписал согласие на обработку персональных данных. Обратитесь к кадровой службе.');
    }
    // Серверный guard: положительный алкотест не может дать допуск.
    if (input.alcoholTest === 'positive' && input.decision === 'approved') {
        throw new InspectionRuleError('Положительный алкотест: допуск ("approved") невозможен');
    }
    // ПЭП: сверяем пароль подписанта до любых записей (fail-fast → 403).
    const pepMarker = await verifyPepSignature(medicId, input.signature);

    return db.transaction(async (tx: any) => {
        await recordEvent({
            authorId: medicId,
            authorRole: medicRole,
            eventType: 'inspection.med_started',
            entityType: 'driver',
            entityId: input.driverId,
            data: { checklistVersion: input.checklistVersion, tripId: input.tripId, inspectionType: 'post_trip' },
        }, tx);

        const [createdInspection] = await tx.insert(medInspections).values({
            driverId: input.driverId,
            medicId,
            tripId: input.tripId,
            inspectionType: 'post_trip',
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
            signature: pepMarker,
        }).returning();

        await tx.insert(medAccessLog).values({
            userId: medicId,
            targetDriverId: input.driverId,
            action: 'create_inspection',
        });

        await recordEvent({
            authorId: medicId,
            authorRole: medicRole,
            eventType: 'inspection.med_completed',
            entityType: 'med_inspection',
            entityId: createdInspection.id,
            data: {
                driverId: input.driverId,
                tripId: input.tripId,
                inspectionType: 'post_trip',
                decision: input.decision,
            },
        }, tx);

        if (input.decision === 'rejected') {
            await recordEvent({
                authorId: medicId,
                authorRole: medicRole,
                eventType: 'trip.driver_cleared',
                entityType: 'trip',
                entityId: input.tripId,
                data: {
                    driverId: input.driverId,
                    inspectionType: 'post_trip',
                    decision: 'rejected',
                },
            }, tx);
        }

        return createdInspection;
    });
}






