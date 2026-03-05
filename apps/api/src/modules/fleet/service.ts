// ============================================================
// Fleet Service — Business logic for vehicles, drivers,
// contractors, permits, fines (§3.10–3.15 ТЗ)
// ============================================================
import { db } from '../../db/connection.js';
import {
    vehicles, drivers, contractors, permits, fines,
    addresses, restrictionZones, repairRequests,
} from '../../db/schema.js';
import { eq, and, ilike, desc, asc, sql, count, or } from 'drizzle-orm';
import { recordEvent } from '../../events/journal.js';
import {
    validateInn, validatePlateNumber, validateVin,
    getVehicleDeadlines, hasExpiredDocuments, lookupByInn,
    validateLicenseNumber, type DeadlineColor,
} from './validators.js';
import { getMockCoordinatesForVehicle } from './references/geocoding.js';

// ================================================================
// Helpers
// ================================================================
type Pagination = { page: number; limit: number; sort?: string; order?: 'asc' | 'desc' };

function paginationDefaults(p?: Partial<Pagination>): Pagination {
    return {
        page: Math.max(1, p?.page ?? 1),
        limit: Math.min(100, Math.max(1, p?.limit ?? 20)),
        sort: p?.sort || 'createdAt',
        order: p?.order || 'desc',
    };
}

function paginationMeta(total: number, p: Pagination) {
    return { total, page: p.page, limit: p.limit, totalPages: Math.ceil(total / p.limit) };
}

// ================================================================
// VEHICLES
// ================================================================

export async function listVehicles(
    filters: { status?: string; search?: string; isArchived?: boolean },
    pagination?: Partial<Pagination>,
) {
    const p = paginationDefaults(pagination);
    const conditions = [];

    if (filters.isArchived !== undefined) {
        conditions.push(eq(vehicles.isArchived, filters.isArchived));
    } else {
        conditions.push(eq(vehicles.isArchived, false));
    }

    if (filters.status) {
        conditions.push(eq(vehicles.status, filters.status as any));
    }

    if (filters.search) {
        conditions.push(
            or(
                ilike(vehicles.plateNumber, `%${filters.search}%`),
                ilike(vehicles.make, `%${filters.search}%`),
                ilike(vehicles.model, `%${filters.search}%`),
            ),
        );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalResult] = await db.select({ count: count() }).from(vehicles).where(where);
    const total = totalResult?.count ?? 0;

    const rows = await db.select()
        .from(vehicles)
        .where(where)
        .orderBy(p.order === 'asc' ? asc(vehicles.createdAt) : desc(vehicles.createdAt))
        .limit(p.limit)
        .offset((p.page - 1) * p.limit);

    // Enrich with deadline colors and mock coordinates
    const enriched = rows.map((v: any) => ({
        ...v,
        ...getMockCoordinatesForVehicle(v.plateNumber, v.status),
        deadlines: getVehicleDeadlines(v),
        isBlocked: hasExpiredDocuments(v),
    }));

    return { data: enriched, pagination: paginationMeta(total, p) };
}

export async function getVehicle(id: string) {
    const [vehicle] = await db.select().from(vehicles).where(eq(vehicles.id, id));
    if (!vehicle) return null;

    // Get repair history
    const repairs = await db.select()
        .from(repairRequests)
        .where(eq(repairRequests.vehicleId, id))
        .orderBy(desc(repairRequests.createdAt))
        .limit(50);

    // Get permits
    const vehiclePermits = await db.select()
        .from(permits)
        .where(eq(permits.vehicleId, id))
        .orderBy(desc(permits.createdAt));

    // Get fines
    const vehicleFines = await db.select()
        .from(fines)
        .where(eq(fines.vehicleId, id))
        .orderBy(desc(fines.createdAt));

    return {
        ...vehicle,
        ...getMockCoordinatesForVehicle(vehicle.plateNumber, vehicle.status),
        deadlines: getVehicleDeadlines(vehicle),
        isBlocked: hasExpiredDocuments(vehicle),
        repairs,
        permits: vehiclePermits,
        fines: vehicleFines,
    };
}

export async function createVehicle(
    data: {
        plateNumber: string; vin: string; make: string; model: string;
        year: number; bodyType: string; payloadCapacityKg: number;
        payloadVolumeM3?: number; fuelTankLiters?: number; fuelNormPer100Km?: number;
        techInspectionExpiry?: string; osagoExpiry?: string;
        maintenanceNextDate?: string; maintenanceNextKm?: number;
        tachographCalibrationExpiry?: string;
    },
    user: { userId: string; roles: string[] },
) {
    // Validate plate
    const plateResult = validatePlateNumber(data.plateNumber);
    if (!plateResult.valid) throw new Error(plateResult.error);

    // Validate VIN
    const vinResult = validateVin(data.vin);
    if (!vinResult.valid) throw new Error(vinResult.error);

    // H-9 FIX: Wrap in transaction for atomicity (insert + event)
    return await db.transaction(async (tx: any) => {
        // Check duplicate plate
        const [existingPlate] = await tx.select({ id: vehicles.id })
            .from(vehicles)
            .where(eq(vehicles.plateNumber, data.plateNumber));
        if (existingPlate) throw new Error(`ТС с госномером ${data.plateNumber} уже существует`);

        // Check duplicate VIN
        const [existingVin] = await tx.select({ id: vehicles.id })
            .from(vehicles)
            .where(eq(vehicles.vin, data.vin));
        if (existingVin) throw new Error(`ТС с VIN ${data.vin} уже существует`);

        const [vehicle] = await tx.insert(vehicles).values({
            plateNumber: data.plateNumber,
            vin: data.vin,
            make: data.make,
            model: data.model,
            year: data.year,
            bodyType: data.bodyType,
            payloadCapacityKg: data.payloadCapacityKg,
            payloadVolumeM3: data.payloadVolumeM3,
            fuelTankLiters: data.fuelTankLiters,
            fuelNormPer100Km: data.fuelNormPer100Km,
            techInspectionExpiry: data.techInspectionExpiry ? new Date(data.techInspectionExpiry) : undefined,
            osagoExpiry: data.osagoExpiry ? new Date(data.osagoExpiry) : undefined,
            maintenanceNextDate: data.maintenanceNextDate ? new Date(data.maintenanceNextDate) : undefined,
            maintenanceNextKm: data.maintenanceNextKm,
            tachographCalibrationExpiry: data.tachographCalibrationExpiry ? new Date(data.tachographCalibrationExpiry) : undefined,
        }).returning();

        await recordEvent({
            authorId: user.userId,
            authorRole: user.roles[0],
            eventType: 'vehicle.created',
            entityType: 'vehicle',
            entityId: vehicle.id,
            data: { action: 'created', plateNumber: vehicle.plateNumber, status: vehicle.status },
        }, tx);

        return vehicle;
    });
}

export async function updateVehicle(
    id: string,
    data: Partial<{
        plateNumber: string; make: string; model: string; year: number;
        bodyType: string; payloadCapacityKg: number; payloadVolumeM3: number;
        fuelTankLiters: number; fuelNormPer100Km: number;
        status: string; currentOdometerKm: number;
        techInspectionExpiry: string; osagoExpiry: string;
        maintenanceNextDate: string; maintenanceNextKm: number;
        tachographCalibrationExpiry: string; isArchived: boolean;
    }>,
    user: { userId: string; roles: string[] },
) {
    // Validate plate if changing
    if (data.plateNumber) {
        const plateResult = validatePlateNumber(data.plateNumber);
        if (!plateResult.valid) throw new Error(plateResult.error);

        const [existing] = await db.select({ id: vehicles.id })
            .from(vehicles)
            .where(and(eq(vehicles.plateNumber, data.plateNumber), sql`${vehicles.id} != ${id}`));
        if (existing) throw new Error(`ТС с госномером ${data.plateNumber} уже существует`);
    }

    const updateData: Record<string, any> = { updatedAt: new Date() };
    const directFields = [
        'plateNumber', 'make', 'model', 'year', 'bodyType',
        'payloadCapacityKg', 'payloadVolumeM3', 'fuelTankLiters',
        'fuelNormPer100Km', 'currentOdometerKm', 'isArchived',
    ] as const;
    for (const field of directFields) {
        if (data[field] !== undefined) updateData[field] = data[field];
    }
    if (data.status) updateData.status = data.status;

    // Date fields
    const dateFields = ['techInspectionExpiry', 'osagoExpiry', 'maintenanceNextDate', 'tachographCalibrationExpiry'] as const;
    for (const field of dateFields) {
        if (data[field] !== undefined) updateData[field] = new Date(data[field]!);
    }
    if (data.maintenanceNextKm !== undefined) updateData.maintenanceNextKm = data.maintenanceNextKm;

    const [updated] = await db.update(vehicles)
        .set(updateData)
        .where(eq(vehicles.id, id))
        .returning();

    if (!updated) throw new Error('ТС не найдено');

    if (data.status) {
        await recordEvent({
            authorId: user.userId,
            authorRole: user.roles[0],
            eventType: 'vehicle.status_changed',
            entityType: 'vehicle',
            entityId: id,
            data: { newStatus: data.status, reason: 'manual_update' },
        });
    }

    return updated;
}

// ================================================================
// DRIVERS
// ================================================================

export async function listDrivers(
    filters: { search?: string; isActive?: boolean },
    pagination?: Partial<Pagination>,
) {
    const p = paginationDefaults(pagination);
    const conditions = [];

    if (filters.isActive !== undefined) {
        conditions.push(eq(drivers.isActive, filters.isActive));
    } else {
        conditions.push(eq(drivers.isActive, true));
    }

    if (filters.search) {
        conditions.push(
            or(
                ilike(drivers.fullName, `%${filters.search}%`),
                ilike(drivers.licenseNumber, `%${filters.search}%`),
            ),
        );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalResult] = await db.select({ count: count() }).from(drivers).where(where);
    const total = totalResult?.count ?? 0;

    const rows = await db.select()
        .from(drivers)
        .where(where)
        .orderBy(p.order === 'asc' ? asc(drivers.createdAt) : desc(drivers.createdAt))
        .limit(p.limit)
        .offset((p.page - 1) * p.limit);

    return { data: rows, pagination: paginationMeta(total, p) };
}

export async function getDriver(id: string) {
    const [driver] = await db.select().from(drivers).where(eq(drivers.id, id));
    if (!driver) return null;

    // Get fines linked to this driver
    const driverFines = await db.select()
        .from(fines)
        .where(eq(fines.driverId, id))
        .orderBy(desc(fines.createdAt));

    return { ...driver, fines: driverFines };
}

export async function createDriver(
    data: {
        userId: string; fullName: string; birthDate: string;
        licenseNumber: string; licenseCategories: string[];
        licenseExpiry: string; medCertificateExpiry?: string;
        personalDataConsent: boolean; personalDataConsentDate?: string;
    },
    user: { userId: string; roles: string[] },
) {
    const licenseResult = validateLicenseNumber(data.licenseNumber);
    if (!licenseResult.valid) throw new Error(licenseResult.error);

    // Wrap in transaction for atomicity (N-2)
    return await db.transaction(async (tx: any) => {
        const [driver] = await tx.insert(drivers).values({
            userId: data.userId,
            fullName: data.fullName,
            birthDate: new Date(data.birthDate),
            licenseNumber: data.licenseNumber,
            licenseCategories: data.licenseCategories,
            licenseExpiry: new Date(data.licenseExpiry),
            medCertificateExpiry: data.medCertificateExpiry ? new Date(data.medCertificateExpiry) : undefined,
            personalDataConsent: data.personalDataConsent,
            personalDataConsentDate: data.personalDataConsentDate ? new Date(data.personalDataConsentDate) : undefined,
        }).returning();

        await recordEvent({
            authorId: user.userId,
            authorRole: user.roles[0],
            eventType: 'driver.created',
            entityType: 'driver',
            entityId: driver.id,
            data: { action: 'driver_created', fullName: driver.fullName },
        }, tx);

        return driver;
    });
}

export async function updateDriver(
    id: string,
    data: Partial<{
        fullName: string; licenseNumber: string; licenseCategories: string[];
        licenseExpiry: string; medCertificateExpiry: string;
        personalDataConsent: boolean; personalDataConsentDate: string;
        isActive: boolean;
    }>,
    user: { userId: string; roles: string[] },
) {
    if (data.licenseNumber) {
        const licenseResult = validateLicenseNumber(data.licenseNumber);
        if (!licenseResult.valid) throw new Error(licenseResult.error);
    }

    const updateData: Record<string, any> = { updatedAt: new Date() };
    if (data.fullName !== undefined) updateData.fullName = data.fullName;
    if (data.licenseNumber !== undefined) updateData.licenseNumber = data.licenseNumber;
    if (data.licenseCategories !== undefined) updateData.licenseCategories = data.licenseCategories;
    if (data.licenseExpiry !== undefined) updateData.licenseExpiry = new Date(data.licenseExpiry);
    if (data.medCertificateExpiry !== undefined) updateData.medCertificateExpiry = new Date(data.medCertificateExpiry);
    if (data.personalDataConsent !== undefined) updateData.personalDataConsent = data.personalDataConsent;
    if (data.personalDataConsentDate !== undefined) updateData.personalDataConsentDate = new Date(data.personalDataConsentDate);
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    const [updated] = await db.update(drivers)
        .set(updateData)
        .where(eq(drivers.id, id))
        .returning();

    if (!updated) throw new Error('Водитель не найден');
    return updated;
}

// ================================================================
// CONTRACTORS
// ================================================================

export async function listContractors(
    filters: { search?: string; isArchived?: boolean },
    pagination?: Partial<Pagination>,
) {
    const p = paginationDefaults(pagination);
    const conditions = [];

    if (filters.isArchived !== undefined) {
        conditions.push(eq(contractors.isArchived, filters.isArchived));
    } else {
        conditions.push(eq(contractors.isArchived, false));
    }

    if (filters.search) {
        conditions.push(
            or(
                ilike(contractors.name, `%${filters.search}%`),
                ilike(contractors.inn, `%${filters.search}%`),
            ),
        );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalResult] = await db.select({ count: count() }).from(contractors).where(where);
    const total = totalResult?.count ?? 0;

    const rows = await db.select()
        .from(contractors)
        .where(where)
        .orderBy(p.order === 'asc' ? asc(contractors.createdAt) : desc(contractors.createdAt))
        .limit(p.limit)
        .offset((p.page - 1) * p.limit);

    return { data: rows, pagination: paginationMeta(total, p) };
}

export async function createContractor(
    data: {
        name: string; inn: string; kpp?: string;
        legalAddress: string; phone?: string; email?: string;
    },
    user: { userId: string; roles: string[] },
) {
    // Validate INN
    const innResult = validateInn(data.inn);
    if (!innResult.valid) throw new Error(innResult.error);

    // Check duplicate INN
    const [existing] = await db.select({ id: contractors.id, name: contractors.name })
        .from(contractors)
        .where(eq(contractors.inn, data.inn));
    if (existing) {
        throw new Error(`Контрагент с ИНН ${data.inn} уже существует: "${existing.name}". Проверьте, не дубликат ли это.`);
    }

    // §3.17 DaData integration: auto-fill name/address from INN
    let name = data.name;
    let kpp = data.kpp;
    let legalAddress = data.legalAddress;
    try {
        const dadataResult = await lookupByInn(data.inn);
        if (dadataResult) {
            // User-provided values take priority, DaData fills gaps
            if (!name || name.trim() === '') name = dadataResult.name || name;
            if (!kpp) kpp = dadataResult.kpp;
            if (!legalAddress || legalAddress.trim() === '') legalAddress = dadataResult.legalAddress || legalAddress;
        }
    } catch {
        // DaData lookup failure is non-critical, continue with provided data
    }

    // Wrap in transaction (N-2)
    return await db.transaction(async (tx: any) => {
        const [contractor] = await tx.insert(contractors).values({
            name,
            inn: data.inn,
            kpp,
            legalAddress,
            phone: data.phone,
            email: data.email,
        }).returning();

        await recordEvent({
            authorId: user.userId,
            authorRole: user.roles[0],
            eventType: 'contractor.created',
            entityType: 'contractor',
            entityId: contractor.id,
            data: { inn: data.inn, name: contractor.name, source: 'dadata_enriched' },
        }, tx);

        return contractor;
    });
}

export async function updateContractor(
    id: string,
    data: Partial<{
        name: string; kpp: string; legalAddress: string;
        phone: string; email: string; isArchived: boolean;
    }>,
    _user: { userId: string; roles: string[] },
) {
    const updateData: Record<string, any> = { updatedAt: new Date() };
    if (data.name !== undefined) updateData.name = data.name;
    if (data.kpp !== undefined) updateData.kpp = data.kpp;
    if (data.legalAddress !== undefined) updateData.legalAddress = data.legalAddress;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.isArchived !== undefined) updateData.isArchived = data.isArchived;

    const [updated] = await db.update(contractors)
        .set(updateData)
        .where(eq(contractors.id, id))
        .returning();

    if (!updated) throw new Error('Контрагент не найден');
    return updated;
}

/**
 * DaData integration placeholder
 */
export async function lookupContractorByInn(inn: string) {
    return lookupByInn(inn);
}

// ================================================================
// PERMITS
// ================================================================

export async function listPermits(
    filters: { vehicleId?: string; isActive?: boolean },
    pagination?: Partial<Pagination>,
) {
    const p = paginationDefaults(pagination);
    const conditions = [];

    if (filters.vehicleId) {
        conditions.push(eq(permits.vehicleId, filters.vehicleId));
    }
    if (filters.isActive !== undefined) {
        conditions.push(eq(permits.isActive, filters.isActive));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalResult] = await db.select({ count: count() }).from(permits).where(where);
    const total = totalResult?.count ?? 0;

    const rows = await db.select()
        .from(permits)
        .where(where)
        .orderBy(desc(permits.createdAt))
        .limit(p.limit)
        .offset((p.page - 1) * p.limit);

    return { data: rows, pagination: paginationMeta(total, p) };
}

export async function createPermit(
    data: {
        vehicleId: string; zoneType: 'mkad' | 'ttk' | 'city';
        zoneName: string; permitNumber: string;
        validFrom: string; validUntil: string;
    },
    user: { userId: string; roles: string[] },
) {
    const [permit] = await db.insert(permits).values({
        vehicleId: data.vehicleId,
        zoneType: data.zoneType,
        zoneName: data.zoneName,
        permitNumber: data.permitNumber,
        validFrom: new Date(data.validFrom),
        validUntil: new Date(data.validUntil),
    }).returning();

    return permit;
}

export async function updatePermit(
    id: string,
    data: Partial<{
        zoneName: string; permitNumber: string;
        validFrom: string; validUntil: string; isActive: boolean;
    }>,
    _user: { userId: string; roles: string[] },
) {
    const updateData: Record<string, any> = {};
    if (data.zoneName !== undefined) updateData.zoneName = data.zoneName;
    if (data.permitNumber !== undefined) updateData.permitNumber = data.permitNumber;
    if (data.validFrom !== undefined) updateData.validFrom = new Date(data.validFrom);
    if (data.validUntil !== undefined) updateData.validUntil = new Date(data.validUntil);
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    const [updated] = await db.update(permits)
        .set(updateData)
        .where(eq(permits.id, id))
        .returning();

    if (!updated) throw new Error('Пропуск не найден');
    return updated;
}

// ================================================================
// FINES
// ================================================================

const FINE_STATUS_TRANSITIONS: Record<string, string[]> = {
    new: ['confirmed'],
    confirmed: ['paid', 'appealed'],
    paid: [],
    appealed: ['confirmed', 'paid'],
};

export async function listFines(
    filters: { vehicleId?: string; driverId?: string; status?: string },
    pagination?: Partial<Pagination>,
) {
    const p = paginationDefaults(pagination);
    const conditions = [];

    if (filters.vehicleId) conditions.push(eq(fines.vehicleId, filters.vehicleId));
    if (filters.driverId) conditions.push(eq(fines.driverId, filters.driverId));
    if (filters.status) conditions.push(eq(fines.status, filters.status as any));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalResult] = await db.select({ count: count() }).from(fines).where(where);
    const total = totalResult?.count ?? 0;

    const rows = await db.select()
        .from(fines)
        .where(where)
        .orderBy(desc(fines.createdAt))
        .limit(p.limit)
        .offset((p.page - 1) * p.limit);

    return { data: rows, pagination: paginationMeta(total, p) };
}

export async function createFine(
    data: {
        vehicleId: string; driverId?: string;
        violationDate: string; violationType: string;
        amount: number; resolutionNumber?: string;
    },
    user: { userId: string; roles: string[] },
) {
    // Wrap in transaction (N-2)
    return await db.transaction(async (tx: any) => {
        const [fine] = await tx.insert(fines).values({
            vehicleId: data.vehicleId,
            driverId: data.driverId,
            violationDate: new Date(data.violationDate),
            violationType: data.violationType,
            amount: data.amount,
            resolutionNumber: data.resolutionNumber,
        }).returning();

        await recordEvent({
            authorId: user.userId,
            authorRole: user.roles[0],
            eventType: 'fine.registered',
            entityType: 'fine',
            entityId: fine.id,
            data: { vehicleId: data.vehicleId, driverId: data.driverId, amount: data.amount, violationType: data.violationType },
        }, tx);

        return fine;
    });
}

export async function updateFine(
    id: string,
    data: Partial<{
        status: string; driverId: string;
        resolutionNumber: string; paidAt: string;
    }>,
    user: { userId: string; roles: string[] },
) {
    // Wrap in transaction (N-2)
    return await db.transaction(async (tx: any) => {
        if (data.status) {
            // Validate state transition
            const [current] = await tx.select({ status: fines.status }).from(fines).where(eq(fines.id, id));
            if (!current) throw new Error('Штраф не найден');

            const allowed = FINE_STATUS_TRANSITIONS[current.status] || [];
            if (!allowed.includes(data.status)) {
                throw new Error(`Недопустимый переход статуса: ${current.status} → ${data.status}`);
            }
        }

        const updateData: Record<string, any> = { updatedAt: new Date() };
        if (data.status) updateData.status = data.status;
        if (data.driverId !== undefined) updateData.driverId = data.driverId;
        if (data.resolutionNumber !== undefined) updateData.resolutionNumber = data.resolutionNumber;
        if (data.paidAt !== undefined) updateData.paidAt = new Date(data.paidAt);

        // Auto-set paidAt on status=paid
        if (data.status === 'paid' && !data.paidAt) {
            updateData.paidAt = new Date();
        }

        const [updated] = await tx.update(fines)
            .set(updateData)
            .where(eq(fines.id, id))
            .returning();

        if (!updated) throw new Error('Штраф не найден');

        if (data.status) {
            const eventType = data.status === 'paid' ? 'fine.paid' : 'fine.registered';
            await recordEvent({
                authorId: user.userId,
                authorRole: user.roles[0],
                eventType,
                entityType: 'fine',
                entityId: id,
                data: { newStatus: data.status },
            }, tx);
        }

        return updated;
    });
}

// ================================================================
// ANALYTICS helpers
// ================================================================

export async function finesAnalytics(filters: { vehicleId?: string; driverId?: string }) {
    const conditions = [];
    if (filters.vehicleId) conditions.push(eq(fines.vehicleId, filters.vehicleId));
    if (filters.driverId) conditions.push(eq(fines.driverId, filters.driverId));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db.select({
        status: fines.status,
        totalAmount: sql<number>`sum(${fines.amount})`,
        count: count(),
    })
        .from(fines)
        .where(where)
        .groupBy(fines.status);

    return rows;
}
