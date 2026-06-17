// ============================================================
// Fleet Service — Business logic for vehicles, drivers,
// contractors, permits, fines (§3.10–3.15 ТЗ)
// ============================================================
import { db } from '../../db/connection.js';
import {
    vehicles, drivers, contractors, permits, fines, users,
    addresses, restrictionZones, repairRequests,
    fuelRecords, odometerReadings, downtimeRecords, maintenanceSchedule,
} from '../../db/schema.js';
import { eq, and, ilike, desc, asc, sql, count, or, isNull, gte, lte, inArray } from 'drizzle-orm';
import { recordEvent } from '../../events/journal.js';
import { isPlatformSuperAdmin } from '../../auth/guards.js';
import { containsLikePattern } from '../../utils/search.js';
import { toFiniteNumber, toOptionalFiniteNumber } from '../../utils/number.js';
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

function vehicleOrgScope(organizationId?: string | null) {
    return organizationId
        ? db.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.organizationId, organizationId))
        : undefined;
}

function scopedVehicleCondition(column: any, organizationId?: string | null) {
    const scopedVehicles = vehicleOrgScope(organizationId);
    return scopedVehicles ? inArray(column, scopedVehicles) : undefined;
}

// ================================================================
// VEHICLES
// ================================================================

export async function listVehicles(
    filters: { status?: string; search?: string; isArchived?: boolean; organizationId?: string | null; crossTenant?: boolean },
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
        const searchPattern = containsLikePattern(filters.search);
        conditions.push(
            or(
                ilike(vehicles.plateNumber, searchPattern),
                ilike(vehicles.make, searchPattern),
                ilike(vehicles.model, searchPattern),
            ),
        );
    }

    if (filters.organizationId) {
        conditions.push(eq(vehicles.organizationId, filters.organizationId));
    } else if (!filters.crossTenant) {
        // P1 (код-аудит 2026-06-14): org-less не-super-admin → DENY. Раньше список
        // ТС без org-фильтра отдавал парк всех тенантов.
        conditions.push(sql`false`);
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
        // P3 (код-аудит 2026-06-14): lat/lon берутся из симулятора, а отдавались как
        // реальные. Помечаем провенанс, чтобы фронт отличал mock-координаты от GPS.
        gpsSource: 'mock' as const,
        deadlines: getVehicleDeadlines(v),
        isBlocked: hasExpiredDocuments(v),
    }));

    return { data: enriched, pagination: paginationMeta(total, p) };
}

export async function getVehicle(id: string, organizationId?: string | null, crossTenant = false) {
    // org-less не-super-admin → DENY (sql`false`), а не безусловный eq(id).
    const vehicleWhere = organizationId
        ? and(eq(vehicles.id, id), eq(vehicles.organizationId, organizationId))
        : (crossTenant ? eq(vehicles.id, id) : sql`false`);
    const [vehicle] = await db.select().from(vehicles).where(vehicleWhere);
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

    const recentFuelRecords = await db.select()
        .from(fuelRecords)
        .where(eq(fuelRecords.vehicleId, id))
        .orderBy(desc(fuelRecords.recordedAt))
        .limit(10);

    const recentOdometerReadings = await db.select()
        .from(odometerReadings)
        .where(eq(odometerReadings.vehicleId, id))
        .orderBy(desc(odometerReadings.recordedAt))
        .limit(5);

    const [activeDowntime] = await db.select()
        .from(downtimeRecords)
        .where(and(eq(downtimeRecords.vehicleId, id), isNull(downtimeRecords.endAt)))
        .orderBy(desc(downtimeRecords.startAt))
        .limit(1);

    const upcomingMaintenance = await db.select()
        .from(maintenanceSchedule)
        .where(eq(maintenanceSchedule.vehicleId, id))
        .orderBy(asc(maintenanceSchedule.plannedDate), asc(maintenanceSchedule.createdAt))
        .limit(5);

    return {
        ...vehicle,
        ...getMockCoordinatesForVehicle(vehicle.plateNumber, vehicle.status),
        // P3 (код-аудит 2026-06-14): см. listVehicles — lat/lon симулированы,
        // помечаем провенанс, чтобы фронт не выдавал mock за реальный GPS.
        gpsSource: 'mock' as const,
        deadlines: getVehicleDeadlines(vehicle),
        isBlocked: hasExpiredDocuments(vehicle),
        repairs,
        permits: vehiclePermits,
        fines: vehicleFines,
        recentFuelRecords,
        recentOdometerReadings,
        activeDowntime: activeDowntime ?? null,
        upcomingMaintenance,
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
    user: { userId: string; roles: string[]; organizationId?: string | null },
) {
    // Validate plate
    const plateResult = validatePlateNumber(data.plateNumber);
    if (!plateResult.valid) throw new Error(plateResult.error);
    // C9: сохраняем КАНОНИЧЕСКИЙ (нормализованный кириллицей) номер — иначе
    // 'A000АА77' (лат) и 'А000АА77' (кир) попадут в БД как разные записи и
    // per-org дедуп не сработает.
    const normalizedPlate = plateResult.normalized ?? data.plateNumber;

    // Validate VIN
    const vinResult = validateVin(data.vin);
    if (!vinResult.valid) throw new Error(vinResult.error);

    // C4/C3: создание ТС требует орг; org-less разрешён только платформенному
    // super-admin (admin && !org, кросс-tenant по дизайну) — он чекает дубль глобально.
    const orgId = user.organizationId;
    if (!orgId && !isPlatformSuperAdmin(user)) throw new Error('Учётная запись не привязана к организации');

    // H-9 FIX: Wrap in transaction for atomicity (insert + event)
    return await db.transaction(async (tx: any) => {
        // C4: дубль plate/VIN — В ПРЕДЕЛАХ ОРГ (per-org unique, миг.0041); super-admin
        // без орг — глобально. Раньше глобально для всех → тенант B не мог завести ТС A.
        const plateCond = orgId ? and(eq(vehicles.plateNumber, normalizedPlate), eq(vehicles.organizationId, orgId)) : eq(vehicles.plateNumber, normalizedPlate);
        const [existingPlate] = await tx.select({ id: vehicles.id }).from(vehicles).where(plateCond);
        if (existingPlate) throw new Error(`ТС с госномером ${data.plateNumber} уже существует`);

        const vinCond = orgId ? and(eq(vehicles.vin, data.vin), eq(vehicles.organizationId, orgId)) : eq(vehicles.vin, data.vin);
        const [existingVin] = await tx.select({ id: vehicles.id }).from(vehicles).where(vinCond);
        if (existingVin) throw new Error(`ТС с VIN ${data.vin} уже существует`);

        const [vehicle] = await tx.insert(vehicles).values({
            plateNumber: normalizedPlate,
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
            organizationId: user.organizationId ?? null,
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
    user: { userId: string; roles: string[]; organizationId?: string | null },
) {
    // Validate plate if changing
    if (data.plateNumber) {
        const plateResult = validatePlateNumber(data.plateNumber);
        if (!plateResult.valid) throw new Error(plateResult.error);
        // C9: нормализуем на месте (латиница→кириллица) — и проверка уникальности,
        // и сохранение через directFields-цикл подхватят канонический номер.
        data.plateNumber = plateResult.normalized ?? data.plateNumber;

        const [existing] = await db.select({ id: vehicles.id })
            .from(vehicles)
            .where(and(
                eq(vehicles.plateNumber, data.plateNumber),
                sql`${vehicles.id} != ${id}`,
                ...(user.organizationId ? [eq(vehicles.organizationId, user.organizationId)] : []),
            ));
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
        .where(user.organizationId ? and(eq(vehicles.id, id), eq(vehicles.organizationId, user.organizationId)) : eq(vehicles.id, id))
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
    filters: { search?: string; isActive?: boolean; organizationId?: string | null },
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
        const searchPattern = containsLikePattern(filters.search);
        conditions.push(
            or(
                ilike(drivers.fullName, searchPattern),
                ilike(drivers.licenseNumber, searchPattern),
            ),
        );
    }

    if (filters.organizationId) {
        conditions.push(eq(drivers.organizationId, filters.organizationId));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalResult] = await db.select({ count: count() }).from(drivers).where(where);
    const total = totalResult?.count ?? 0;

    const rows = await db.select({
        id: drivers.id,
        userId: drivers.userId,
        fullName: drivers.fullName,
        licenseNumber: drivers.licenseNumber,
        licenseCategories: drivers.licenseCategories,
        licenseExpiry: drivers.licenseExpiry,
        medCertificateExpiry: drivers.medCertificateExpiry,
        isActive: drivers.isActive,
        organizationId: drivers.organizationId,
        createdAt: drivers.createdAt,
        updatedAt: drivers.updatedAt,
    })
        .from(drivers)
        .where(where)
        .orderBy(p.order === 'asc' ? asc(drivers.createdAt) : desc(drivers.createdAt))
        .limit(p.limit)
        .offset((p.page - 1) * p.limit);

    return { data: rows, pagination: paginationMeta(total, p) };
}

export async function getDriver(id: string, organizationId?: string | null) {
    const driverWhere = organizationId ? and(eq(drivers.id, id), eq(drivers.organizationId, organizationId)) : eq(drivers.id, id);
    const [driver] = await db.select({
        id: drivers.id,
        userId: drivers.userId,
        fullName: drivers.fullName,
        licenseNumber: drivers.licenseNumber,
        licenseCategories: drivers.licenseCategories,
        licenseExpiry: drivers.licenseExpiry,
        medCertificateExpiry: drivers.medCertificateExpiry,
        isActive: drivers.isActive,
        organizationId: drivers.organizationId,
        createdAt: drivers.createdAt,
        updatedAt: drivers.updatedAt,
    }).from(drivers).where(driverWhere);
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
        userId: string; fullName: string; birthDate: string; snils?: string;
        licenseNumber: string; licenseCategories: string[];
        licenseExpiry: string; medCertificateExpiry?: string;
        personalDataConsent: boolean; personalDataConsentDate?: string;
    },
    user: { userId: string; roles: string[]; organizationId?: string | null },
) {
    const licenseResult = validateLicenseNumber(data.licenseNumber);
    if (!licenseResult.valid) throw new Error(licenseResult.error);

    // Wrap in transaction for atomicity (N-2)
    return await db.transaction(async (tx: any) => {
        // Безопасность: карточку водителя можно привязать ТОЛЬКО к юзеру своей
        // организации (иначе driver-transplant — чужой юзер получает cross-driver
        // видимость рейсов через RLS-резолвер). Super-admin (org=null) — без ограничения.
        const [target] = await tx.select({ id: users.id, organizationId: users.organizationId })
            .from(users).where(eq(users.id, data.userId)).limit(1);
        if (!target) throw new Error('Учётная запись водителя не найдена');
        if (user.organizationId && target.organizationId !== user.organizationId) {
            throw new Error('Можно привязать только пользователя своей организации');
        }

        const [driver] = await tx.insert(drivers).values({
            userId: data.userId,
            fullName: data.fullName,
            birthDate: new Date(data.birthDate),
            snils: data.snils,
            licenseNumber: data.licenseNumber,
            licenseCategories: data.licenseCategories,
            licenseExpiry: new Date(data.licenseExpiry),
            medCertificateExpiry: data.medCertificateExpiry ? new Date(data.medCertificateExpiry) : undefined,
            personalDataConsent: data.personalDataConsent,
            personalDataConsentDate: data.personalDataConsentDate ? new Date(data.personalDataConsentDate) : undefined,
            organizationId: user.organizationId ?? null,
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
        fullName: string; snils: string; licenseNumber: string; licenseCategories: string[];
        licenseExpiry: string; medCertificateExpiry: string;
        personalDataConsent: boolean; personalDataConsentDate: string;
        isActive: boolean;
    }>,
    user: { userId: string; roles: string[]; organizationId?: string | null },
) {
    if (data.licenseNumber) {
        const licenseResult = validateLicenseNumber(data.licenseNumber);
        if (!licenseResult.valid) throw new Error(licenseResult.error);
    }

    const updateData: Record<string, any> = { updatedAt: new Date() };
    if (data.fullName !== undefined) updateData.fullName = data.fullName;
    if (data.snils !== undefined) updateData.snils = data.snils;
    if (data.licenseNumber !== undefined) updateData.licenseNumber = data.licenseNumber;
    if (data.licenseCategories !== undefined) updateData.licenseCategories = data.licenseCategories;
    if (data.licenseExpiry !== undefined) updateData.licenseExpiry = new Date(data.licenseExpiry);
    if (data.medCertificateExpiry !== undefined) updateData.medCertificateExpiry = new Date(data.medCertificateExpiry);
    if (data.personalDataConsent !== undefined) updateData.personalDataConsent = data.personalDataConsent;
    if (data.personalDataConsentDate !== undefined) updateData.personalDataConsentDate = new Date(data.personalDataConsentDate);
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    const [updated] = await db.update(drivers)
        .set(updateData)
        .where(user.organizationId ? and(eq(drivers.id, id), eq(drivers.organizationId, user.organizationId)) : eq(drivers.id, id))
        .returning();

    if (!updated) throw new Error('Водитель не найден');
    return updated;
}

// ================================================================
// CONTRACTORS
// ================================================================

export async function listContractors(
    filters: { search?: string; isArchived?: boolean; organizationId?: string | null },
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
        const searchPattern = containsLikePattern(filters.search);
        conditions.push(
            or(
                ilike(contractors.name, searchPattern),
                ilike(contractors.inn, searchPattern),
            ),
        );
    }

    if (filters.organizationId) {
        conditions.push(eq(contractors.organizationId, filters.organizationId));
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

export async function listContractorAddresses(
    contractorId: string,
    organizationId?: string | null,
) {
    const contractorWhere = organizationId
        ? and(eq(contractors.id, contractorId), eq(contractors.organizationId, organizationId))
        : eq(contractors.id, contractorId);

    const [contractor] = await db
        .select({ id: contractors.id })
        .from(contractors)
        .where(contractorWhere)
        .limit(1);

    if (!contractor) {
        return [];
    }

    return db
        .select({
            id: addresses.id,
            addressString: addresses.addressString,
            lat: addresses.lat,
            lon: addresses.lon,
            type: addresses.type,
            contractorId: addresses.contractorId,
            fiasId: addresses.fiasId,
            createdAt: addresses.createdAt,
        })
        .from(addresses)
        .where(eq(addresses.contractorId, contractorId))
        .orderBy(desc(addresses.createdAt));
}

async function resolveContractorForOrganization(contractorId: string, organizationId?: string | null) {
    const contractorWhere = organizationId
        ? and(eq(contractors.id, contractorId), eq(contractors.organizationId, organizationId))
        : eq(contractors.id, contractorId);

    const [contractor] = await db
        .select({ id: contractors.id })
        .from(contractors)
        .where(contractorWhere)
        .limit(1);

    return contractor ?? null;
}

export async function createContractorAddress(
    contractorId: string,
    data: {
        addressString: string;
        lat: number;
        lon: number;
        type: 'loading' | 'unloading';
        fiasId?: string | null;
    },
    organizationId?: string | null,
) {
    const contractor = await resolveContractorForOrganization(contractorId, organizationId);
    if (!contractor) {
        throw new Error('Контрагент не найден');
    }

    const [created] = await db.insert(addresses).values({
        contractorId,
        addressString: data.addressString.trim(),
        lat: data.lat,
        lon: data.lon,
        type: data.type,
        fiasId: data.fiasId ?? null,
    }).returning();

    return created;
}

export async function updateContractorAddress(
    contractorId: string,
    addressId: string,
    data: Partial<{
        addressString: string;
        lat: number;
        lon: number;
        type: 'loading' | 'unloading';
        fiasId?: string | null;
    }>,
    organizationId?: string | null,
) {
    const contractor = await resolveContractorForOrganization(contractorId, organizationId);
    if (!contractor) {
        throw new Error('Контрагент не найден');
    }

    const [updated] = await db
        .update(addresses)
        .set({
            ...(data.addressString !== undefined ? { addressString: data.addressString.trim() } : {}),
            ...(data.lat !== undefined ? { lat: data.lat } : {}),
            ...(data.lon !== undefined ? { lon: data.lon } : {}),
            ...(data.type !== undefined ? { type: data.type } : {}),
            ...(data.fiasId !== undefined ? { fiasId: data.fiasId } : {}),
        })
        .where(and(eq(addresses.id, addressId), eq(addresses.contractorId, contractorId)))
        .returning();

    if (!updated) {
        throw new Error('Адрес не найден');
    }

    return updated;
}

export async function deleteContractorAddress(
    contractorId: string,
    addressId: string,
    organizationId?: string | null,
) {
    const contractor = await resolveContractorForOrganization(contractorId, organizationId);
    if (!contractor) {
        throw new Error('Контрагент не найден');
    }

    const [deleted] = await db
        .delete(addresses)
        .where(and(eq(addresses.id, addressId), eq(addresses.contractorId, contractorId)))
        .returning({ id: addresses.id });

    if (!deleted) {
        throw new Error('Адрес не найден');
    }

    return deleted;
}

export async function createContractor(
    data: {
        name: string; inn: string; kpp?: string;
        legalAddress: string; phone?: string; email?: string;
    },
    user: { userId: string; roles: string[]; organizationId?: string | null },
) {
    // Validate INN
    const innResult = validateInn(data.inn);
    if (!innResult.valid) throw new Error(innResult.error);

    // C4/C3: создание контрагента требует орг; org-less — только super-admin.
    const orgId = user.organizationId;
    if (!orgId && !isPlatformSuperAdmin(user)) throw new Error('Учётная запись не привязана к организации');

    // C4: дубль ИНН — В ПРЕДЕЛАХ ОРГ (per-org unique, миг.0041); super-admin — глобально.
    // Раньше глобально для всех → блокировал того же контрагента у другого тенанта.
    const innCond = orgId ? and(eq(contractors.inn, data.inn), eq(contractors.organizationId, orgId)) : eq(contractors.inn, data.inn);
    const [existing] = await db.select({ id: contractors.id, name: contractors.name })
        .from(contractors)
        .where(innCond);
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
            organizationId: user.organizationId ?? null,
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
    user: { userId: string; roles: string[]; organizationId?: string | null },
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
        .where(user.organizationId ? and(eq(contractors.id, id), eq(contractors.organizationId, user.organizationId)) : eq(contractors.id, id))
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
    filters: { vehicleId?: string; isActive?: boolean; organizationId?: string | null },
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
    const vehicleScope = scopedVehicleCondition(permits.vehicleId, filters.organizationId);
    if (vehicleScope) conditions.push(vehicleScope);

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
    user: { userId: string; roles: string[]; organizationId?: string | null },
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
    user: { userId: string; roles: string[]; organizationId?: string | null },
) {
    const updateData: Record<string, any> = {};
    if (data.zoneName !== undefined) updateData.zoneName = data.zoneName;
    if (data.permitNumber !== undefined) updateData.permitNumber = data.permitNumber;
    if (data.validFrom !== undefined) updateData.validFrom = new Date(data.validFrom);
    if (data.validUntil !== undefined) updateData.validUntil = new Date(data.validUntil);
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    const [updated] = await db.update(permits)
        .set(updateData)
        .where(user.organizationId
            ? and(eq(permits.id, id), inArray(permits.vehicleId, db.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.organizationId, user.organizationId))))
            : eq(permits.id, id))
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
    filters: { vehicleId?: string; driverId?: string; status?: string; organizationId?: string | null },
    pagination?: Partial<Pagination>,
) {
    const p = paginationDefaults(pagination);
    const conditions = [];

    if (filters.vehicleId) conditions.push(eq(fines.vehicleId, filters.vehicleId));
    if (filters.driverId) conditions.push(eq(fines.driverId, filters.driverId));
    if (filters.status) conditions.push(eq(fines.status, filters.status as any));
    const vehicleScope = scopedVehicleCondition(fines.vehicleId, filters.organizationId);
    if (vehicleScope) conditions.push(vehicleScope);

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
    user: { userId: string; roles: string[]; organizationId?: string | null },
) {
    // Wrap in transaction (N-2)
    return await db.transaction(async (tx: any) => {
        const [fine] = await tx.insert(fines).values({
            vehicleId: data.vehicleId,
            driverId: data.driverId,
            organizationId: user.organizationId ?? null, // C3 «в» (миг.0042)
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
    user: { userId: string; roles: string[]; organizationId?: string | null },
) {
    // Wrap in transaction (N-2)
    return await db.transaction(async (tx: any) => {
        if (data.status) {
            // Validate state transition
            const fineScope = user.organizationId
                ? and(eq(fines.id, id), inArray(fines.vehicleId, db.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.organizationId, user.organizationId))))
                : eq(fines.id, id);
            const [current] = await tx.select({ status: fines.status }).from(fines).where(fineScope);
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
            .where(user.organizationId
                ? and(eq(fines.id, id), inArray(fines.vehicleId, db.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.organizationId, user.organizationId))))
                : eq(fines.id, id))
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
// FUEL RECORDS
// ================================================================

export async function listFuelRecords(filters: {
    vehicleId?: string;
    driverId?: string;
    tripId?: string;
    dateFrom?: string;
    dateTo?: string;
    organizationId?: string;
    page?: number;
    limit?: number;
}) {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 50, 200);
    const offset = (page - 1) * limit;
    const conditions = [];
    if (filters.vehicleId) conditions.push(eq(fuelRecords.vehicleId, filters.vehicleId));
    if (filters.driverId) conditions.push(eq(fuelRecords.driverId, filters.driverId));
    if (filters.tripId) conditions.push(eq(fuelRecords.tripId, filters.tripId));
    if (filters.organizationId) conditions.push(eq(fuelRecords.organizationId, filters.organizationId));
    if (filters.dateFrom) conditions.push(gte(fuelRecords.recordedAt, new Date(filters.dateFrom)));
    if (filters.dateTo) conditions.push(lte(fuelRecords.recordedAt, new Date(filters.dateTo)));
    const where = conditions.length ? and(...conditions) : undefined;
    const [rows, [{ count: total }]] = await Promise.all([
        db.select().from(fuelRecords)
            .leftJoin(vehicles, eq(fuelRecords.vehicleId, vehicles.id))
            .leftJoin(drivers, eq(fuelRecords.driverId, drivers.id))
            .where(where).orderBy(desc(fuelRecords.recordedAt)).limit(limit).offset(offset),
        db.select({ count: sql<number>`count(*)::int` }).from(fuelRecords).where(where),
    ]);
    return { data: rows, total, page, limit };
}

export async function createFuelRecord(data: {
    vehicleId: string; recordedAt: string; liters: number; costPerLiter: number;
    totalCost: number; fuelType: string; station?: string; odometerAtFill?: number;
    tripId?: string; driverId?: string; organizationId?: string; createdBy: string;
}) {
    return db.transaction(async (tx) => {
        const payload: typeof fuelRecords.$inferInsert = {
            vehicleId: data.vehicleId,
            recordedAt: new Date(data.recordedAt),
            liters: data.liters,
            costPerLiter: data.costPerLiter,
            totalCost: data.totalCost,
            fuelType: data.fuelType as any,
            station: data.station ?? null,
            odometerAtFill: data.odometerAtFill ?? null,
            tripId: data.tripId ?? null,
            driverId: data.driverId ?? null,
            organizationId: data.organizationId ?? null,
            createdBy: data.createdBy,
        };
        const [record] = await tx.insert(fuelRecords).values(payload).returning();
        // Accumulate total fuel consumed
        await tx.update(vehicles)
            .set({ totalFuelConsumedL: sql`total_fuel_consumed_l + ${data.liters}` })
            .where(eq(vehicles.id, data.vehicleId));
        // Auto-create odometer reading if odometerAtFill provided
        if (data.odometerAtFill) {
            await tx.insert(odometerReadings).values({
                vehicleId: data.vehicleId,
                recordedAt: new Date(data.recordedAt),
                valueKm: data.odometerAtFill,
                source: 'manual',
                tripId: data.tripId ?? null,
                driverId: data.driverId ?? null,
                organizationId: data.organizationId ?? null,
                createdBy: data.createdBy,
            });
            // Update lastOdometerKm if new value is greater
            await tx.update(vehicles)
                .set({ lastOdometerKm: data.odometerAtFill, lastOdometerUpdatedAt: new Date() })
                .where(and(
                    eq(vehicles.id, data.vehicleId),
                    sql`(last_odometer_km IS NULL OR last_odometer_km < ${data.odometerAtFill})`
                ));
        }
        return record;
    });
}

export async function updateFuelRecord(id: string, data: Partial<{
    liters: number; costPerLiter: number; totalCost: number;
    fuelType: string; station: string; odometerAtFill: number;
}>, organizationId?: string | null) {
    const updateData: Record<string, unknown> = {};
    if (data.liters !== undefined) updateData.liters = String(data.liters);
    if (data.costPerLiter !== undefined) updateData.costPerLiter = String(data.costPerLiter);
    if (data.totalCost !== undefined) updateData.totalCost = String(data.totalCost);
    if (data.fuelType !== undefined) updateData.fuelType = data.fuelType;
    if (data.station !== undefined) updateData.station = data.station;
    if (data.odometerAtFill !== undefined) updateData.odometerAtFill = data.odometerAtFill;
    const recordWhere = organizationId
        ? and(eq(fuelRecords.id, id), eq(fuelRecords.organizationId, organizationId))
        : eq(fuelRecords.id, id);
    // P3 (код-аудит 2026-06-14): редактирование liters не корректировало аккумулятор
    // vehicles.totalFuelConsumedL (createFuelRecord его наращивает) → постоянный дрейф.
    // Грузим старую запись, считаем delta = new - old и правим аккумулятор ТС в той же
    // транзакции. numeric().$type<number>() в рантайме строка → коэрцим через Number().
    return db.transaction(async (tx) => {
        const [old] = await tx.select({ vehicleId: fuelRecords.vehicleId, liters: fuelRecords.liters })
            .from(fuelRecords).where(recordWhere).limit(1);
        if (!old) return null;
        const [updated] = await tx.update(fuelRecords).set(updateData)
            .where(recordWhere)
            .returning();
        if (updated && data.liters !== undefined) {
            const delta = data.liters - Number(old.liters);
            if (delta !== 0) {
                await tx.update(vehicles)
                    .set({ totalFuelConsumedL: sql`total_fuel_consumed_l + ${delta}` })
                    .where(eq(vehicles.id, old.vehicleId));
            }
        }
        return updated ?? null;
    });
}

// ================================================================
// ODOMETER READINGS
// ================================================================

export async function listOdometerReadings(filters: {
    vehicleId?: string; source?: string; dateFrom?: string; dateTo?: string;
    organizationId?: string; page?: number; limit?: number;
}) {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 50, 200);
    const offset = (page - 1) * limit;
    const conditions = [];
    if (filters.vehicleId) conditions.push(eq(odometerReadings.vehicleId, filters.vehicleId));
    if (filters.source) conditions.push(eq(odometerReadings.source, filters.source as any));
    if (filters.organizationId) conditions.push(eq(odometerReadings.organizationId, filters.organizationId));
    if (filters.dateFrom) conditions.push(gte(odometerReadings.recordedAt, new Date(filters.dateFrom)));
    if (filters.dateTo) conditions.push(lte(odometerReadings.recordedAt, new Date(filters.dateTo)));
    const where = conditions.length ? and(...conditions) : undefined;
    const [rows, [{ count: total }]] = await Promise.all([
        db.select().from(odometerReadings).where(where)
            .orderBy(desc(odometerReadings.recordedAt)).limit(limit).offset(offset),
        db.select({ count: sql<number>`count(*)::int` }).from(odometerReadings).where(where),
    ]);
    return { data: rows, total, page, limit };
}

export async function createOdometerReading(data: {
    vehicleId: string; recordedAt: string; valueKm: number;
    source?: string; tripId?: string; driverId?: string;
    organizationId?: string; createdBy: string;
}) {
    return db.transaction(async (tx) => {
        const [reading] = await tx.insert(odometerReadings).values({
            ...data,
            recordedAt: new Date(data.recordedAt),
            source: (data.source ?? 'manual') as any,
        }).returning();
        // Update lastOdometerKm if new value is greater
        await tx.update(vehicles)
            .set({ lastOdometerKm: data.valueKm, lastOdometerUpdatedAt: new Date() })
            .where(and(
                eq(vehicles.id, data.vehicleId),
                sql`(last_odometer_km IS NULL OR last_odometer_km < ${data.valueKm})`
            ));
        return reading;
    });
}

// ================================================================
// DOWNTIME RECORDS
// ================================================================

export async function listDowntimeRecords(filters: {
    vehicleId?: string; reasonCode?: string; openOnly?: boolean;
    dateFrom?: string; dateTo?: string; organizationId?: string;
    page?: number; limit?: number;
}) {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 50, 200);
    const offset = (page - 1) * limit;
    const conditions = [];
    if (filters.vehicleId) conditions.push(eq(downtimeRecords.vehicleId, filters.vehicleId));
    if (filters.reasonCode) conditions.push(eq(downtimeRecords.reasonCode, filters.reasonCode as any));
    if (filters.openOnly) conditions.push(isNull(downtimeRecords.endAt));
    if (filters.organizationId) conditions.push(eq(downtimeRecords.organizationId, filters.organizationId));
    if (filters.dateFrom) conditions.push(gte(downtimeRecords.startAt, new Date(filters.dateFrom)));
    if (filters.dateTo) conditions.push(lte(downtimeRecords.startAt, new Date(filters.dateTo)));
    const where = conditions.length ? and(...conditions) : undefined;
    const [rows, [{ count: total }]] = await Promise.all([
        db.select().from(downtimeRecords)
            .leftJoin(vehicles, eq(downtimeRecords.vehicleId, vehicles.id))
            .where(where).orderBy(desc(downtimeRecords.startAt)).limit(limit).offset(offset),
        db.select({ count: sql<number>`count(*)::int` }).from(downtimeRecords).where(where),
    ]);
    return { data: rows, total, page, limit };
}

export async function createDowntimeRecord(data: {
    vehicleId: string; startAt: string; endAt?: string;
    reasonCode: string; description?: string; tripId?: string;
    organizationId?: string; createdBy: string;
}) {
    const [record] = await db.insert(downtimeRecords).values({
        ...data,
        startAt: new Date(data.startAt),
        endAt: data.endAt ? new Date(data.endAt) : null,
        reasonCode: data.reasonCode as any,
    }).returning();
    return record;
}

export async function updateDowntimeRecord(id: string, data: {
    endAt?: string; reasonCode?: string; description?: string;
}, organizationId?: string | null) {
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (data.endAt !== undefined) updateData.endAt = new Date(data.endAt);
    if (data.reasonCode !== undefined) updateData.reasonCode = data.reasonCode;
    if (data.description !== undefined) updateData.description = data.description;
    const [updated] = await db.update(downtimeRecords).set(updateData)
        .where(organizationId ? and(eq(downtimeRecords.id, id), eq(downtimeRecords.organizationId, organizationId)) : eq(downtimeRecords.id, id)).returning();
    return updated ?? null;
}

export async function getActiveDowntime(vehicleId: string, organizationId?: string | null) {
    const [record] = await db.select().from(downtimeRecords)
        .where(and(
            eq(downtimeRecords.vehicleId, vehicleId),
            isNull(downtimeRecords.endAt),
            ...(organizationId ? [eq(downtimeRecords.organizationId, organizationId)] : []),
        ))
        .orderBy(desc(downtimeRecords.startAt)).limit(1);
    return record ?? null;
}

// ================================================================
// MAINTENANCE SCHEDULE
// ================================================================

export async function listMaintenanceSchedule(filters: {
    vehicleId?: string; status?: string; maintenanceType?: string;
    dateFrom?: string; dateTo?: string; organizationId?: string;
    page?: number; limit?: number;
}) {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 50, 200);
    const offset = (page - 1) * limit;
    const conditions = [];
    if (filters.vehicleId) conditions.push(eq(maintenanceSchedule.vehicleId, filters.vehicleId));
    if (filters.status) conditions.push(eq(maintenanceSchedule.status, filters.status as any));
    if (filters.maintenanceType) conditions.push(eq(maintenanceSchedule.maintenanceType, filters.maintenanceType as any));
    if (filters.organizationId) conditions.push(eq(maintenanceSchedule.organizationId, filters.organizationId));
    if (filters.dateFrom) conditions.push(gte(maintenanceSchedule.plannedDate, new Date(filters.dateFrom)));
    if (filters.dateTo) conditions.push(lte(maintenanceSchedule.plannedDate, new Date(filters.dateTo)));
    const where = conditions.length ? and(...conditions) : undefined;
    const rows = await db.select().from(maintenanceSchedule)
        .leftJoin(vehicles, eq(maintenanceSchedule.vehicleId, vehicles.id))
        .where(where).orderBy(asc(maintenanceSchedule.plannedDate)).limit(limit).offset(offset);
    const [{ count: total }] = await db.select({ count: sql<number>`count(*)::int` })
        .from(maintenanceSchedule).where(where);
    // Mark overdue in-memory (status='planned' + past due)
    const now = new Date();
    const enriched = rows.map(r => {
        const item = r.maintenance_schedule;
        const vehicle = r.vehicles;
        let computedStatus = item.status;
        if (item.status === 'planned') {
            const datePast = item.plannedDate && item.plannedDate < now;
            const kmPast = item.plannedOdometerKm && vehicle?.lastOdometerKm
                && vehicle.lastOdometerKm >= item.plannedOdometerKm;
            if (datePast || kmPast) computedStatus = 'overdue';
        }
        return { ...item, computedStatus, vehicle };
    });
    return { data: enriched, total, page, limit };
}

export async function createMaintenancePlan(data: {
    vehicleId: string; maintenanceType: string; plannedDate?: string;
    plannedOdometerKm?: number; contractor?: string; notes?: string;
    repairRequestId?: string; organizationId?: string; createdBy: string;
}) {
    const [record] = await db.insert(maintenanceSchedule).values({
        ...data,
        maintenanceType: data.maintenanceType as any,
        plannedDate: data.plannedDate ? new Date(data.plannedDate) : null,
    }).returning();
    return record;
}

export async function updateMaintenancePlan(id: string, data: {
    status?: string; actualDate?: string; actualOdometerKm?: number;
    cost?: number; contractor?: string; notes?: string;
}, organizationId?: string | null) {
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (data.status !== undefined) updateData.status = data.status;
    if (data.actualDate !== undefined) updateData.actualDate = new Date(data.actualDate);
    if (data.actualOdometerKm !== undefined) updateData.actualOdometerKm = data.actualOdometerKm;
    if (data.cost !== undefined) updateData.cost = String(data.cost);
    if (data.contractor !== undefined) updateData.contractor = data.contractor;
    if (data.notes !== undefined) updateData.notes = data.notes;
    const [updated] = await db.update(maintenanceSchedule).set(updateData)
        .where(organizationId ? and(eq(maintenanceSchedule.id, id), eq(maintenanceSchedule.organizationId, organizationId)) : eq(maintenanceSchedule.id, id)).returning();
    return updated ?? null;
}

// ================================================================
// FLEET ANALYTICS — Fuel Consumption + КТГ
// ================================================================

export async function getFuelConsumptionAnalytics(filters: {
    vehicleId?: string; dateFrom: string; dateTo: string; organizationId?: string;
}) {
    const dateFromDt = new Date(filters.dateFrom);
    const dateToDt = new Date(filters.dateTo);
    const conditions = [
        gte(fuelRecords.recordedAt, dateFromDt),
        lte(fuelRecords.recordedAt, dateToDt),
    ];
    if (filters.vehicleId) conditions.push(eq(fuelRecords.vehicleId, filters.vehicleId));
    if (filters.organizationId) conditions.push(eq(fuelRecords.organizationId, filters.organizationId));
    // Aggregate fuel per vehicle
    const fuelAgg = await db.select({
        vehicleId: fuelRecords.vehicleId,
        totalLiters: sql<number>`SUM(liters::float)`,
        totalCost: sql<number>`SUM(total_cost::float)`,
        fillCount: sql<number>`COUNT(*)::int`,
        minOdometer: sql<number>`MIN(odometer_at_fill)`,
        maxOdometer: sql<number>`MAX(odometer_at_fill)`,
    }).from(fuelRecords).where(and(...conditions)).groupBy(fuelRecords.vehicleId);
    // Fetch vehicle norms
    const vehicleIds = fuelAgg.map(r => r.vehicleId);
    const vehicleData = vehicleIds.length > 0
        ? await db.select({ id: vehicles.id, plateNumber: vehicles.plateNumber, fuelNormPer100Km: vehicles.fuelNormPer100Km })
            .from(vehicles).where(sql`id = ANY(${vehicleIds})`)
        : [];
    const vehicleMap = Object.fromEntries(vehicleData.map(v => [v.id, v]));
    return fuelAgg.map(agg => {
        const vehicle = vehicleMap[agg.vehicleId];
        const totalLiters = toFiniteNumber(agg.totalLiters);
        const totalCost = toFiniteNumber(agg.totalCost);
        const fillCount = toFiniteNumber(agg.fillCount);
        const minOdometer = toOptionalFiniteNumber(agg.minOdometer);
        const maxOdometer = toOptionalFiniteNumber(agg.maxOdometer);
        const distanceKm = (maxOdometer !== null && minOdometer !== null)
            ? maxOdometer - minOdometer : null;
        const consumptionPer100km = distanceKm !== null && distanceKm > 0
            ? (totalLiters / distanceKm) * 100 : null;
        const norm = toOptionalFiniteNumber(vehicle?.fuelNormPer100Km ?? null);
        const expectedLiters = distanceKm !== null && norm !== null
            ? (distanceKm / 100) * norm
            : null;
        const deviation = (consumptionPer100km !== null && norm !== null)
            ? Math.round((consumptionPer100km - norm) * 10) / 10
            : null;
        const deviationPercent = expectedLiters !== null && expectedLiters > 0
            ? Math.round(((totalLiters - expectedLiters) / expectedLiters) * 1000) / 10
            : null;
        const status = deviationPercent === null
            ? 'unknown'
            : deviationPercent > 15
                ? 'high'
                : deviationPercent < -15
                    ? 'low'
                    : 'normal';
        return {
            vehicleId: agg.vehicleId,
            plateNumber: vehicle?.plateNumber ?? 'N/A',
            totalLiters,
            totalCost,
            fillCount,
            distanceKm,
            consumptionPer100km: consumptionPer100km !== null ? Math.round(consumptionPer100km * 10) / 10 : null,
            norm,
            expectedLiters: expectedLiters !== null ? Math.round(expectedLiters * 10) / 10 : null,
            deviation,
            deviationPercent,
            status,
            dataQuality: {
                hasOdometerRange: distanceKm !== null && distanceKm > 0,
                hasFuelNorm: norm !== null,
            },
        };
    });
}

export async function getFleetKtgAnalytics(filters: {
    vehicleId?: string; dateFrom: string; dateTo: string; organizationId?: string;
}) {
    const dateFromDt = new Date(filters.dateFrom);
    const dateToDt = new Date(filters.dateTo);
    const dateFromSql = dateFromDt.toISOString();
    const dateToSql = dateToDt.toISOString();
    const totalPeriodMs = dateToDt.getTime() - dateFromDt.getTime();
    // Downtime hours per vehicle
    const downtimeConditions: any[] = [
        sql`start_at < ${dateToSql}::timestamptz`,
        sql`(end_at IS NULL OR end_at > ${dateFromSql}::timestamptz)`,
    ];
    if (filters.vehicleId) downtimeConditions.push(eq(downtimeRecords.vehicleId, filters.vehicleId));
    if (filters.organizationId) downtimeConditions.push(eq(downtimeRecords.organizationId, filters.organizationId));
    const downtimeAgg = await db.select({
        vehicleId: downtimeRecords.vehicleId,
        totalDowntimeMs: sql<number>`
            SUM(EXTRACT(EPOCH FROM (LEAST(COALESCE(end_at, NOW()), ${dateToSql}::timestamptz) - GREATEST(start_at, ${dateFromSql}::timestamptz))) * 1000)
        `,
    }).from(downtimeRecords).where(and(...downtimeConditions)).groupBy(downtimeRecords.vehicleId);
    const downtimeReasonAgg = await db.select({
        vehicleId: downtimeRecords.vehicleId,
        reasonCode: downtimeRecords.reasonCode,
        totalDowntimeMs: sql<number>`
            SUM(EXTRACT(EPOCH FROM (LEAST(COALESCE(end_at, NOW()), ${dateToSql}::timestamptz) - GREATEST(start_at, ${dateFromSql}::timestamptz))) * 1000)
        `,
    }).from(downtimeRecords).where(and(...downtimeConditions)).groupBy(downtimeRecords.vehicleId, downtimeRecords.reasonCode);
    // All vehicles in scope
    const vehicleConditions: any[] = [eq(vehicles.isArchived, false)];
    if (filters.vehicleId) vehicleConditions.push(eq(vehicles.id, filters.vehicleId));
    if (filters.organizationId) vehicleConditions.push(eq(vehicles.organizationId, filters.organizationId));
    const vehicleList = await db.select({ id: vehicles.id, plateNumber: vehicles.plateNumber })
        .from(vehicles)
        .where(and(...vehicleConditions));
    const downtimeMap = Object.fromEntries(downtimeAgg.map(d => [d.vehicleId, toFiniteNumber(d.totalDowntimeMs)]));
    const reasonMap = new Map<string, Array<{ reasonCode: string; downtimeHours: number }>>();
    for (const row of downtimeReasonAgg) {
        const list = reasonMap.get(row.vehicleId) ?? [];
        list.push({
            reasonCode: row.reasonCode,
            downtimeHours: Math.round(toFiniteNumber(row.totalDowntimeMs) / 3600000 * 10) / 10,
        });
        reasonMap.set(row.vehicleId, list);
    }
    return vehicleList.map(v => {
        const downtimeMs = toFiniteNumber(downtimeMap[v.id]);
        const workingMs = Math.max(totalPeriodMs - downtimeMs, 0);
        const ktg = totalPeriodMs > 0 ? Math.round((workingMs / totalPeriodMs) * 1000) / 1000 : null;
        const downtimeByReason = (reasonMap.get(v.id) ?? [])
            .filter((item) => item.downtimeHours > 0)
            .sort((a, b) => b.downtimeHours - a.downtimeHours);
        return {
            vehicleId: v.id,
            plateNumber: v.plateNumber,
            totalPeriodHours: Math.round(totalPeriodMs / 3600000 * 10) / 10,
            downtimeHours: Math.round(downtimeMs / 3600000 * 10) / 10,
            workingHours: Math.round(workingMs / 3600000 * 10) / 10,
            ktg,
            ktgPercent: ktg !== null ? Math.round(ktg * 1000) / 10 : null,
            downtimeByReason,
        };
    });
}

// ================================================================
// ANALYTICS helpers
// ================================================================

export async function finesAnalytics(filters: { vehicleId?: string; driverId?: string; organizationId?: string | null }) {
    const conditions = [];
    if (filters.vehicleId) conditions.push(eq(fines.vehicleId, filters.vehicleId));
    if (filters.driverId) conditions.push(eq(fines.driverId, filters.driverId));
    const vehicleScope = scopedVehicleCondition(fines.vehicleId, filters.organizationId);
    if (vehicleScope) conditions.push(vehicleScope);

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db.select({
        status: fines.status,
        totalAmount: sql<number>`sum(${fines.amount})`,
        count: count(),
    })
        .from(fines)
        .where(where)
        .groupBy(fines.status);

    return rows.map((row) => ({
        ...row,
        totalAmount: toFiniteNumber(row.totalAmount),
        count: toFiniteNumber(row.count),
    }));
}



