// ============================================================
// TMS — Zod Schemas for all entities (§4.1 ТЗ)
// ============================================================
import { z } from 'zod';
import {
    UserRole, OrderStatus, TripStatus, VehicleStatus, RepairStatus,
    FineStatus, WaybillStatus, InspectionDecision, InspectionType, RoutePointType,
    RoutePointStatus, TariffType, EpdDocumentType, EventType,
    RestrictionZoneType, InvoicePaymentStatus,
} from './enums.js';

// --- Helpers ---
const uuid = z.string().uuid();
const dateStr = z.string().datetime();
const nullable = <T extends z.ZodTypeAny>(schema: T) => schema.nullable().optional();

// ================================================================
// Users & Auth
// ================================================================
export const UserSchema = z.object({
    id: uuid,
    email: z.string().email(),
    passwordHash: z.string(),
    fullName: z.string().min(1),
    phone: z.string().optional(),
    roles: z.array(z.nativeEnum(UserRole)),
    isActive: z.boolean().default(true),
    createdAt: dateStr,
    updatedAt: dateStr,
});
export type User = z.infer<typeof UserSchema>;

export const LoginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
});

export const TokenPayloadSchema = z.object({
    userId: uuid,
    roles: z.array(z.nativeEnum(UserRole)),
});

// ================================================================
// Контрагенты (§3.12)
// ================================================================
export const ContractorSchema = z.object({
    id: uuid,
    name: z.string().min(1),
    inn: z.string().regex(/^\d{10}(\d{2})?$/, 'ИНН: 10 или 12 цифр'),
    kpp: z.string().regex(/^\d{9}$/, 'КПП: 9 цифр').optional(),
    legalAddress: z.string(),
    phone: z.string().optional(),
    email: z.string().email().optional(),
    isArchived: z.boolean().default(false),
    createdAt: dateStr,
    updatedAt: dateStr,
});
export type Contractor = z.infer<typeof ContractorSchema>;

export const ContractorCreateSchema = ContractorSchema.omit({
    id: true, createdAt: true, updatedAt: true, isArchived: true,
});

// ================================================================
// Договоры / Тарифы (§3.9)
// ================================================================
export const ContractSchema = z.object({
    id: uuid,
    contractorId: uuid,
    number: z.string(),
    startDate: z.string(),
    endDate: z.string().optional(),
    isActive: z.boolean().default(true),
    createdAt: dateStr,
});
export type Contract = z.infer<typeof ContractSchema>;

export const TariffSchema = z.object({
    id: uuid,
    contractId: uuid,
    type: z.nativeEnum(TariffType),
    ratePerKm: z.number().optional(),
    ratePerTon: z.number().optional(),
    ratePerHour: z.number().optional(),
    fixedRate: z.number().optional(),
    // Комбинированный: фикс + за км сверх порога
    combinedFixedRate: z.number().optional(),
    combinedKmThreshold: z.number().optional(),
    combinedRatePerKm: z.number().optional(),
    // Модификаторы
    idleFreeLimitMinutes: z.number().default(120), // простой бесплатный (мин)
    idleRatePerHour: z.number().default(0),
    extraPointRate: z.number().default(0),
    nightCoefficient: z.number().default(1),
    urgentCoefficient: z.number().default(1),
    returnPercentage: z.number().default(100),
    cancellationFee: z.number().default(0),
    weekendCoefficient: z.number().default(1),
    // НДС
    vatIncluded: z.boolean().default(true),
    vatRate: z.number().default(20),
    minTripCost: z.number().default(0),
    createdAt: dateStr,
});
export type Tariff = z.infer<typeof TariffSchema>;

// ================================================================
// ТС — Транспортное средство (§3.11, §3.12)
// ================================================================
export const VehicleSchema = z.object({
    id: uuid,
    plateNumber: z.string().regex(/^[А-ЯA-Z]\d{3}[А-ЯA-Z]{2}\d{2,3}$/i, 'Формат госномера'),
    vin: z.string().length(17, 'VIN: 17 символов'),
    make: z.string(),
    model: z.string(),
    year: z.number().int().min(1990).max(2030),
    bodyType: z.string(),
    payloadCapacityKg: z.number().positive(),
    payloadVolumeM3: z.number().positive().optional(),
    status: z.nativeEnum(VehicleStatus).default('available'),
    currentOdometerKm: z.number().default(0),
    fuelTankLiters: z.number().optional(),
    fuelNormPer100Km: z.number().optional(), // ГСМ-норма
    // Сроки документов
    techInspectionExpiry: z.string().optional(),
    osagoExpiry: z.string().optional(),
    maintenanceNextDate: z.string().optional(),
    maintenanceNextKm: z.number().optional(),
    tachographCalibrationExpiry: z.string().optional(),
    // Sprint 9
    fuelCardNumber: z.string().optional(),
    transponderNumber: z.string().optional(),
    hasHydraulicLift: z.boolean().default(false),
    isArchived: z.boolean().default(false),
    createdAt: dateStr,
    updatedAt: dateStr,
});
export type Vehicle = z.infer<typeof VehicleSchema>;

export const VehicleCreateSchema = VehicleSchema.omit({
    id: true, createdAt: true, updatedAt: true, status: true, isArchived: true,
    currentOdometerKm: true,
});

// ================================================================
// Водитель (§3.11, §3.12)
// ================================================================
export const DriverSchema = z.object({
    id: uuid,
    userId: uuid, // связь с User
    fullName: z.string(),
    birthDate: z.string(),
    licenseNumber: z.string(),
    licenseCategories: z.array(z.string()),
    licenseExpiry: z.string(),
    medCertificateExpiry: z.string().optional(),
    personalDataConsent: z.boolean().default(false),
    personalDataConsentDate: z.string().optional(),
    // Sprint 9
    powerOfAttorneyNumber: z.string().optional(),
    powerOfAttorneyExpiry: z.string().optional(),
    fuelCardNumber: z.string().optional(),
    isActive: z.boolean().default(true),
    createdAt: dateStr,
    updatedAt: dateStr,
});
export type Driver = z.infer<typeof DriverSchema>;

export const DriverCreateSchema = DriverSchema.omit({
    id: true, createdAt: true, updatedAt: true,
});

// ================================================================
// Заявка (§3.1, §4.1)
// ================================================================
export const OrderSchema = z.object({
    id: uuid,
    number: z.string(),
    contractorId: uuid,
    contractId: uuid.optional(),
    status: z.nativeEnum(OrderStatus).default('draft'),
    // Груз
    cargoDescription: z.string(),
    cargoWeightKg: z.number().positive(),
    cargoVolumeM3: z.number().positive().optional(),
    cargoPlaces: z.number().int().positive().optional(),
    cargoType: z.string().optional(),
    // Sprint 9: Ярусность
    multiTierAllowed: z.boolean().default(false),
    maxTiers: z.number().int().min(1).max(3).default(1),
    // Sprint 9: Температурный режим
    temperatureMin: z.number().optional(),
    temperatureMax: z.number().optional(),
    // Sprint 9: Тип загрузки
    loadingType: z.enum(['rear', 'side', 'top']).optional(),
    hydraulicLiftRequired: z.boolean().default(false),
    // Адреса
    loadingAddress: z.string(),
    loadingLat: z.number().optional(),
    loadingLon: z.number().optional(),
    loadingDate: dateStr.optional(),
    loadingWindowStart: dateStr.optional(),
    loadingWindowEnd: dateStr.optional(),
    unloadingAddress: z.string(),
    unloadingLat: z.number().optional(),
    unloadingLon: z.number().optional(),
    unloadingDate: dateStr.optional(),
    unloadingWindowStart: dateStr.optional(),
    unloadingWindowEnd: dateStr.optional(),
    // Требования
    vehicleRequirements: z.string().optional(),
    notes: z.string().optional(),
    // Привязки
    tripId: uuid.optional(),
    createdBy: uuid,
    createdAt: dateStr,
    updatedAt: dateStr,
});
export type Order = z.infer<typeof OrderSchema>;

export const OrderCreateSchema = OrderSchema.omit({
    id: true, number: true, status: true, tripId: true,
    createdAt: true, updatedAt: true,
});

export const OrderUpdateSchema = OrderCreateSchema.partial();

// ================================================================
// Рейс (§3.2, §4.1)
// ================================================================
export const TripSchema = z.object({
    id: uuid,
    number: z.string(),
    status: z.nativeEnum(TripStatus).default('planning'),
    vehicleId: uuid.optional(),
    driverId: uuid.optional(),
    waybillId: uuid.optional(),
    // Маршрут
    plannedDistanceKm: z.number().optional(),
    actualDistanceKm: z.number().optional(),
    plannedDepartureAt: dateStr.optional(),
    actualDepartureAt: dateStr.optional(),
    actualCompletionAt: dateStr.optional(),
    // Одометр
    odometerStart: z.number().optional(),
    odometerEnd: z.number().optional(),
    fuelStart: z.number().optional(),
    fuelEnd: z.number().optional(),
    notes: z.string().optional(),
    createdBy: uuid,
    createdAt: dateStr,
    updatedAt: dateStr,
});
export type Trip = z.infer<typeof TripSchema>;

export const TripCreateSchema = TripSchema.omit({
    id: true, number: true, status: true, waybillId: true,
    actualDepartureAt: true, actualCompletionAt: true,
    actualDistanceKm: true, odometerStart: true, odometerEnd: true,
    fuelStart: true, fuelEnd: true, createdAt: true, updatedAt: true,
});

export const TripUpdateSchema = TripCreateSchema.partial();

// ================================================================
// Точка маршрута (§4.1)
// ================================================================
export const RoutePointSchema = z.object({
    id: uuid,
    tripId: uuid,
    orderId: uuid.optional(),
    type: z.nativeEnum(RoutePointType),
    status: z.nativeEnum(RoutePointStatus).default('pending'),
    sequenceNumber: z.number().int(),
    address: z.string(),
    lat: z.number().optional(),
    lon: z.number().optional(),
    windowStart: dateStr.optional(),
    windowEnd: dateStr.optional(),
    arrivedAt: dateStr.optional(),
    completedAt: dateStr.optional(),
    signatureUrl: z.string().optional(),
    photoUrls: z.array(z.string()).default([]),
    notes: z.string().optional(),
    createdAt: dateStr,
});
export type RoutePoint = z.infer<typeof RoutePointSchema>;

// ================================================================
// Путевой лист (§3.5, §4.1)
// ================================================================
export const WaybillSchema = z.object({
    id: uuid,
    number: z.string(),
    tripId: uuid,
    vehicleId: uuid,
    driverId: uuid,
    status: z.nativeEnum(WaybillStatus).default('formed'),
    // Штампы
    techInspectionId: uuid,
    medInspectionId: uuid,
    mechanicSignature: z.string().optional(), // ПЭП
    medicSignature: z.string().optional(),    // ПЭП
    // Данные
    odometerOut: z.number(),
    odometerIn: z.number().optional(),
    fuelOut: z.number().optional(),
    fuelIn: z.number().optional(),
    departureAt: dateStr,
    returnAt: dateStr.optional(),
    issuedAt: dateStr,
    closedAt: dateStr.optional(),
});
export type Waybill = z.infer<typeof WaybillSchema>;

export const WaybillAttachmentSchema = z.object({
    id: uuid,
    waybillId: uuid,
    fileName: z.string(),
    originalName: z.string(),
    mimeType: z.string(),
    fileSize: z.number().int(),
    storagePath: z.string(),
    uploadedBy: uuid.optional(),
    createdAt: dateStr,
});
export type WaybillAttachment = z.infer<typeof WaybillAttachmentSchema>;

// ================================================================
// Акт техосмотра (§3.3)
// ================================================================
export const TechInspectionSchema = z.object({
    id: uuid,
    vehicleId: uuid,
    mechanicId: uuid,
    tripId: uuid.optional(),
    inspectionType: z.nativeEnum(InspectionType).default('pre_trip'),
    checklistVersion: z.string(),
    items: z.array(z.object({
        name: z.string(),
        result: z.enum(['ok', 'fault']),
        comment: z.string().optional(),
        photoUrl: z.string().optional(),
    })),
    decision: z.nativeEnum(InspectionDecision),
    comment: z.string().optional(),
    signature: z.string(), // ПЭП
    createdAt: dateStr,
});
export type TechInspection = z.infer<typeof TechInspectionSchema>;

// ================================================================
// Акт медосмотра (§3.4, §А.2 — 152-ФЗ)
// ================================================================
export const MedInspectionSchema = z.object({
    id: uuid,
    driverId: uuid,
    medicId: uuid,
    tripId: uuid.optional(),
    inspectionType: z.nativeEnum(InspectionType).default('pre_trip'),
    checklistVersion: z.string(),
    // Медданные — шифруются при хранении
    systolicBp: z.number().int(), // АД верхнее
    diastolicBp: z.number().int(), // АД нижнее
    heartRate: z.number().int(),
    temperature: z.number(),
    condition: z.string(), // состояние
    alcoholTest: z.enum(['negative', 'positive']),
    complaints: z.string().optional(),
    decision: z.nativeEnum(InspectionDecision),
    comment: z.string().optional(),
    signature: z.string(), // ПЭП
    createdAt: dateStr,
});
export type MedInspection = z.infer<typeof MedInspectionSchema>;

// Что видит диспетчер (только факт допуска)
export const MedInspectionPublicSchema = MedInspectionSchema.pick({
    id: true, driverId: true, decision: true, createdAt: true,
});

// ================================================================
// Заявка на ремонт (§3.10)
// ================================================================
export const RepairRequestSchema = z.object({
    id: uuid,
    vehicleId: uuid,
    status: z.nativeEnum(RepairStatus).default('created'),
    description: z.string(),
    priority: z.enum(['low', 'medium', 'high', 'critical']),
    source: z.enum(['auto_inspection', 'driver', 'mechanic', 'scheduled']),
    inspectionId: uuid.optional(),
    assignedTo: z.string().optional(),
    workDescription: z.string().optional(),
    partsUsed: z.array(z.object({
        name: z.string(),
        quantity: z.number(),
        cost: z.number(),
    })).default([]),
    totalCost: z.number().default(0),
    odometerAtRepair: z.number().optional(),
    photoUrls: z.array(z.string()).default([]),
    completedAt: dateStr.optional(),
    createdAt: dateStr,
    updatedAt: dateStr,
});
export type RepairRequest = z.infer<typeof RepairRequestSchema>;

export const RepairRequestCreateSchema = RepairRequestSchema.omit({
    id: true, status: true, completedAt: true, createdAt: true, updatedAt: true,
    totalCost: true,
});

// ================================================================
// Пропуск (§3.13)
// ================================================================
export const PermitSchema = z.object({
    id: uuid,
    vehicleId: uuid,
    zoneType: z.nativeEnum(RestrictionZoneType),
    zoneName: z.string(),
    permitNumber: z.string(),
    validFrom: z.string(),
    validUntil: z.string(),
    isActive: z.boolean().default(true),
    createdAt: dateStr,
});
export type Permit = z.infer<typeof PermitSchema>;

export const PermitCreateSchema = PermitSchema.omit({
    id: true, createdAt: true,
});

export const PermitUpdateSchema = PermitCreateSchema.partial();

// ================================================================
// Штраф ГИБДД (§3.15)
// ================================================================
export const FineSchema = z.object({
    id: uuid,
    vehicleId: uuid,
    driverId: uuid.optional(),
    status: z.nativeEnum(FineStatus).default('new'),
    violationDate: z.string(),
    violationType: z.string(),
    amount: z.number().positive(),
    resolutionNumber: z.string().optional(),
    paidAt: dateStr.optional(),
    createdAt: dateStr,
    updatedAt: dateStr,
});
export type Fine = z.infer<typeof FineSchema>;

export const FineCreateSchema = FineSchema.omit({
    id: true, createdAt: true, updatedAt: true, paidAt: true,
});

export const FineUpdateSchema = FineCreateSchema.partial();

// ================================================================
// Счёт / Акт (§3.9)
// ================================================================
export const InvoiceSchema = z.object({
    id: uuid,
    number: z.string(),
    contractorId: uuid,
    contractId: uuid.optional(),
    type: z.enum(['invoice', 'act', 'upd']),
    status: z.nativeEnum(InvoicePaymentStatus).default('draft'),
    tripIds: z.array(uuid),
    subtotal: z.number(),
    vatAmount: z.number(),
    total: z.number(),
    periodStart: z.string(),
    periodEnd: z.string(),
    paidAt: dateStr.optional(),
    createdAt: dateStr,
});
export type Invoice = z.infer<typeof InvoiceSchema>;

// ================================================================
// Запись тахографа / РТО (§3.14)
// ================================================================
export const TachographRecordSchema = z.object({
    id: uuid,
    driverId: uuid,
    date: z.string(),
    drivingMinutes: z.number().int(),
    restMinutes: z.number().int(),
    continuousDrivingMinutes: z.number().int(),
    weeklyRestMinutes: z.number().int().optional(),
    source: z.string().default('manual'),
    createdAt: dateStr,
});
export type TachographRecord = z.infer<typeof TachographRecordSchema>;

// ================================================================
// Событие (Приложение Б)
// ================================================================
export const EventSchema = z.object({
    id: uuid,
    timestamp: dateStr,
    authorId: uuid,
    authorRole: z.nativeEnum(UserRole),
    eventType: z.nativeEnum(EventType),
    entityType: z.string(),
    entityId: uuid,
    data: z.record(z.unknown()),
    version: z.number().int().default(1),
    conflict: z.boolean().default(false),
    offlineCreatedAt: dateStr.optional(),
});
export type Event = z.infer<typeof EventSchema>;

// ================================================================
// Зона ограничения (§3.13)
// ================================================================
export const RestrictionZoneSchema = z.object({
    id: uuid,
    name: z.string(),
    type: z.nativeEnum(RestrictionZoneType),
    geoJson: z.record(z.unknown()), // GeoJSON polygon
    isActive: z.boolean().default(true),
    createdAt: dateStr,
});
export type RestrictionZone = z.infer<typeof RestrictionZoneSchema>;

// ================================================================
// Шаблон чек-листа (§3.12)
// ================================================================
export const ChecklistTemplateSchema = z.object({
    id: uuid,
    type: z.enum(['tech', 'med']),
    version: z.string(),
    name: z.string(),
    items: z.array(z.object({
        name: z.string(),
        responseType: z.enum(['ok_fault', 'number', 'text', 'boolean']),
        required: z.boolean().default(true),
    })),
    isActive: z.boolean().default(true),
    createdAt: dateStr,
});
export type ChecklistTemplate = z.infer<typeof ChecklistTemplateSchema>;

// ================================================================
// Адрес (§3.12)
// ================================================================
export const AddressSchema = z.object({
    id: uuid,
    addressString: z.string(),
    lat: z.number(),
    lon: z.number(),
    type: z.nativeEnum(RoutePointType),
    contractorId: uuid.optional(),
    fiasId: z.string().optional(),
    createdAt: dateStr,
});
export type Address = z.infer<typeof AddressSchema>;

// ================================================================
// API Response wrappers
// ================================================================
export const PaginationSchema = z.object({
    page: z.number().int().min(1).default(1),
    limit: z.number().int().min(1).max(100).default(20),
    total: z.number().int(),
    totalPages: z.number().int(),
});
export type Pagination = z.infer<typeof PaginationSchema>;

export const ApiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
    z.object({
        success: z.boolean(),
        data: dataSchema.optional(),
        error: z.string().optional(),
        pagination: PaginationSchema.optional(),
    });
