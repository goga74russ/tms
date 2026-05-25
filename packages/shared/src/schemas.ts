// ============================================================
// TMS — Zod Schemas for all entities (§4.1 ТЗ)
// ============================================================
import { z } from 'zod';
import {
    UserRole, OrderStatus, TripStatus, VehicleStatus, RepairStatus,
    FineStatus, WaybillStatus, InspectionDecision, InspectionType, RoutePointType,
    RoutePointStatus, TariffType, EpdDocumentType, EventType,
    TransportDocumentType, TransportDocumentStatus,
    TransportDocumentExchangeStatus, TransportDocumentExchangeDirection, TransportDocumentReceiptType,
    EtrnTitleType, EtrnTitleStatus, EtrnWorkflowStatus,
    RestrictionZoneType, InvoicePaymentStatus,
    ConfirmationMode, CargoCondition, ForcedReason,
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
    plateNumber: z.string().regex(/^[A-ZА-Я]\\d{3}[A-ZА-Я]{2}\\d{2,3}$/i, 'Неверный формат госномера'),
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
    snils: z.string().optional(),
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

// Update DTO — явный список полей. Не .partial() от Create:
//   • userId — driver-transplant vector (пересадка driver-записи на чужого
//     user-а даёт ему cross-driver видимость рейсов через RLS-резолвер).
//   • personalDataConsent / personalDataConsentDate — write-once, фиксируются
//     при сборе согласия (152-ФЗ), переписывать через PUT нельзя.
// Всё остальное (ВУ, медсправка, доверенность, fuelCardNumber, isActive,
// контакты) — модифицируемо.
export const DriverUpdateSchema = z.object({
    fullName: z.string().optional(),
    birthDate: z.string().optional(),
    snils: z.string().optional(),
    licenseNumber: z.string().optional(),
    licenseCategories: z.array(z.string()).optional(),
    licenseExpiry: z.string().optional(),
    medCertificateExpiry: z.string().optional(),
    powerOfAttorneyNumber: z.string().optional(),
    powerOfAttorneyExpiry: z.string().optional(),
    fuelCardNumber: z.string().optional(),
    isActive: z.boolean().optional(),
}).strict();

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
    // Wave 2: Cold chain v0
    coldChainRequired: z.boolean().optional(),
    temperatureMinC: z.number().optional(),
    temperatureMaxC: z.number().optional(),
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
    // Sprint 13: Режим подтверждения доставки
    confirmationMode: z.nativeEnum(ConfirmationMode).default('none'),
    // K1 (Этап 2) — стоимость от заказчика. Видна manager+/accountant/admin.
    customerPrice: z.number().nonnegative().optional(),
    customerPriceCurrency: z.string().length(3).default('RUB'),
    customerPriceIncludesVat: z.boolean().default(false),
    createdBy: uuid,
    createdAt: dateStr,
    updatedAt: dateStr,
});
export type Order = z.infer<typeof OrderSchema>;

export const OrderCreateSchema = OrderSchema.omit({
    id: true, number: true, status: true, tripId: true,
    createdAt: true, updatedAt: true,
});

// Update DTO — explicit allowed-fields, не .partial() от Create.
// .partial() от Create включал contractorId/createdBy → mass-assignment vector:
// tenant-admin после IDOR-check мог через PUT /orders/:id переписать
// FK на чужого контрагента или подменить автора (audit forgery).
// Поэтому Update строится явно, БЕЗ contractorId/contractId/createdBy/
// confirmationMode/tripId/status. Эти поля меняются отдельными workflows
// (assignment, status-transition, confirmation-mode setter).
export const OrderUpdateSchema = z.object({
    // Груз
    cargoDescription: z.string().optional(),
    cargoWeightKg: z.number().positive().optional(),
    cargoVolumeM3: z.number().positive().optional(),
    cargoPlaces: z.number().int().positive().optional(),
    cargoType: z.string().optional(),
    multiTierAllowed: z.boolean().optional(),
    maxTiers: z.number().int().min(1).max(3).optional(),
    // Температурный режим
    temperatureMin: z.number().optional(),
    temperatureMax: z.number().optional(),
    coldChainRequired: z.boolean().optional(),
    temperatureMinC: z.number().optional(),
    temperatureMaxC: z.number().optional(),
    // Тип загрузки
    loadingType: z.enum(['rear', 'side', 'top']).optional(),
    hydraulicLiftRequired: z.boolean().optional(),
    // Адреса
    loadingAddress: z.string().optional(),
    loadingLat: z.number().optional(),
    loadingLon: z.number().optional(),
    loadingDate: dateStr.optional(),
    loadingWindowStart: dateStr.optional(),
    loadingWindowEnd: dateStr.optional(),
    unloadingAddress: z.string().optional(),
    unloadingLat: z.number().optional(),
    unloadingLon: z.number().optional(),
    unloadingDate: dateStr.optional(),
    unloadingWindowStart: dateStr.optional(),
    unloadingWindowEnd: dateStr.optional(),
    // Требования
    vehicleRequirements: z.string().optional(),
    notes: z.string().optional(),
    // K1 (Этап 2) — цена. Logist/admin может менять. Backend дополнительно
    // ограничит RBAC: logist не может выставить цену без явной роли.
    customerPrice: z.number().nonnegative().optional(),
    customerPriceCurrency: z.string().length(3).optional(),
    customerPriceIncludesVat: z.boolean().optional(),
}).strict();

// ================================================================
// Рейс (§3.2, §4.1)
// ================================================================
export const TripSchema = z.object({
    id: uuid,
    number: z.string(),
    status: z.nativeEnum(TripStatus).default('planning'),
    vehicleId: uuid.optional(),
    trailerId: uuid.optional(),
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
    originalDocumentsReceived: z.boolean().optional(),
    // K1 (Этап 2) — себестоимость рейса. Видна manager+/accountant/admin.
    carrierCost: z.number().nonnegative().optional(),
    carrierCostCurrency: z.string().length(3).default('RUB'),
    carrierCostIncludesVat: z.boolean().default(false),
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
    windowFrom: dateStr.optional(),
    windowTo: dateStr.optional(),
    arrivedAt: dateStr.optional(),
    completedAt: dateStr.optional(),
    signatureUrl: z.string().optional(),
    photoUrls: z.array(z.string()).default([]),
    notes: z.string().optional(),
    sealNumbers: z.array(z.string()).optional(),
    packagingCondition: z.string().optional(),
    vehicleArrivedAt: dateStr.optional(),
    waitingStartedAt: dateStr.optional(),
    waitingEndedAt: dateStr.optional(),
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
    trailerId: uuid.optional(),
    driverId: uuid,
    status: z.nativeEnum(WaybillStatus).default('draft'),
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
    departureAt: dateStr.optional(),
    returnAt: dateStr.optional(),
    issuedAt: dateStr,
    closedAt: dateStr.optional(),
    issuedByName: z.string().optional(),
    issuedByPosition: z.string().optional(),
    validFrom: dateStr.optional(),
    validTo: dateStr.optional(),
    transportServiceType: z.string().optional(),
    transportMode: z.string().optional(),
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
// Transport document layer (persisted compliance foundation)
// ================================================================
export const TransportDocumentHistoryEventSchema = z.object({
    id: uuid,
    documentId: uuid,
    eventType: z.string(),
    title: z.string(),
    fromStatus: z.nativeEnum(TransportDocumentStatus).nullable().optional(),
    toStatus: z.nativeEnum(TransportDocumentStatus).nullable().optional(),
    severity: z.enum(['info', 'warning', 'critical']).default('info'),
    message: z.string().nullable().optional(),
    errorCode: z.string().nullable().optional(),
    payload: z.record(z.string(), z.unknown()).default({}),
    createdBy: uuid.nullable().optional(),
    at: dateStr,
});
export type TransportDocumentHistoryEvent = z.infer<typeof TransportDocumentHistoryEventSchema>;

export const TransportDocumentExchangeSchema = z.object({
    id: uuid,
    documentId: uuid,
    tripId: uuid,
    providerName: z.string(),
    direction: z.nativeEnum(TransportDocumentExchangeDirection),
    operation: z.string(),
    status: z.nativeEnum(TransportDocumentExchangeStatus),
    requestId: z.string().nullable().optional(),
    providerDocumentId: z.string().nullable().optional(),
    providerMessageId: z.string().nullable().optional(),
    providerEventId: z.string().nullable().optional(),
    providerStatus: z.string().nullable().optional(),
    attemptNumber: z.number().int().positive().default(1),
    errorCode: z.string().nullable().optional(),
    errorMessage: z.string().nullable().optional(),
    requestPayload: z.record(z.string(), z.unknown()).default({}),
    responsePayload: z.record(z.string(), z.unknown()).default({}),
    initiatedBy: uuid.nullable().optional(),
    initiatedAt: dateStr,
    completedAt: dateStr.nullable().optional(),
    nextRetryAt: dateStr.nullable().optional(),
});
export type TransportDocumentExchange = z.infer<typeof TransportDocumentExchangeSchema>;

export const TransportDocumentReceiptSchema = z.object({
    id: uuid,
    documentId: uuid,
    tripId: uuid,
    exchangeId: uuid.nullable().optional(),
    receiptType: z.nativeEnum(TransportDocumentReceiptType),
    providerReceiptId: z.string().nullable().optional(),
    providerEventId: z.string().nullable().optional(),
    providerStatus: z.string().nullable().optional(),
    title: z.string(),
    message: z.string().nullable().optional(),
    payload: z.record(z.string(), z.unknown()).default({}),
    receivedAt: dateStr,
    processedAt: dateStr.nullable().optional(),
    createdBy: uuid.nullable().optional(),
});
export type TransportDocumentReceipt = z.infer<typeof TransportDocumentReceiptSchema>;

export const TransportDocumentExchangeStateSchema = z.object({
    status: z.nativeEnum(TransportDocumentExchangeStatus),
    nextAction: z.string(),
    hasBlockingProblem: z.boolean().default(false),
    providerName: z.string().default('sandbox_edo'),
    providerStatus: z.string().nullable().optional(),
    providerDocumentId: z.string().nullable().optional(),
    providerMessageId: z.string().nullable().optional(),
    lastError: z.string().nullable().optional(),
    attemptCount: z.number().int().nonnegative().default(0),
    receiptCount: z.number().int().nonnegative().default(0),
    lastAttemptAt: dateStr.nullable().optional(),
    lastReceiptAt: dateStr.nullable().optional(),
    nextRetryAt: dateStr.nullable().optional(),
});
export type TransportDocumentExchangeState = z.infer<typeof TransportDocumentExchangeStateSchema>;

export const TransportDocumentSchema = z.object({
    id: uuid,
    sourceKey: z.string(),
    correlationId: z.string(),
    fingerprint: z.string(),
    version: z.number().int().positive().default(1),
    generatedAt: dateStr,
    type: z.nativeEnum(TransportDocumentType),
    titleType: z.string().nullable().optional(),
    titleNumber: z.string().nullable().optional(),
    sourceStatus: z.nativeEnum(TransportDocumentStatus).optional(),
    status: z.nativeEnum(TransportDocumentStatus),
    externalId: z.string(),
    providerName: z.string().default('internal'),
    providerDocumentId: z.string().nullable().optional(),
    providerMessageId: z.string().nullable().optional(),
    providerStatus: z.string().nullable().optional(),
    error: z.string().nullable().optional(),
    tripId: uuid,
    waybillId: uuid.nullable().optional(),
    orderIds: z.array(uuid).default([]),
    retryCount: z.number().int().nonnegative().default(0),
    lastRetryAt: dateStr.nullable().optional(),
    nextRetryAt: dateStr.nullable().optional(),
    lastSyncedAt: dateStr.nullable().optional(),
    createdAt: dateStr,
    updatedAt: dateStr,
    issuedAt: dateStr.nullable().optional(),
    sentAt: dateStr.nullable().optional(),
    acceptedAt: dateStr.nullable().optional(),
    rejectedAt: dateStr.nullable().optional(),
    completedAt: dateStr.nullable().optional(),
    payload: z.record(z.string(), z.unknown()).default({}),
    metadata: z.record(z.string(), z.unknown()).default({}),
    history: z.array(TransportDocumentHistoryEventSchema).default([]),
    exchanges: z.array(TransportDocumentExchangeSchema).default([]),
    receipts: z.array(TransportDocumentReceiptSchema).default([]),
    exchange: TransportDocumentExchangeStateSchema.optional(),
});
export type TransportDocument = z.infer<typeof TransportDocumentSchema>;

export const TransportDocumentTimelineEventSchema = z.object({
    id: z.string(),
    documentId: z.string(),
    documentType: z.nativeEnum(TransportDocumentType),
    status: z.nativeEnum(TransportDocumentStatus),
    title: z.string(),
    at: dateStr,
    severity: z.enum(['info', 'warning', 'critical']).default('info'),
    isProblem: z.boolean().default(false),
    message: z.string().optional(),
});
export type TransportDocumentTimelineEvent = z.infer<typeof TransportDocumentTimelineEventSchema>;

export const TransportDocumentProblemSchema = z.object({
    code: z.string(),
    severity: z.enum(['info', 'warning', 'critical']).default('warning'),
    message: z.string(),
    documentId: z.string().optional(),
    documentType: z.nativeEnum(TransportDocumentType).optional(),
    at: dateStr.optional(),
});
export type TransportDocumentProblem = z.infer<typeof TransportDocumentProblemSchema>;

export const TransportDocumentSummarySchema = z.object({
    tripId: uuid,
    totalDocuments: z.number().int().nonnegative(),
    completedDocuments: z.number().int().nonnegative(),
    activeDocuments: z.number().int().nonnegative(),
    problemCount: z.number().int().nonnegative(),
    criticalProblemCount: z.number().int().nonnegative(),
    warningProblemCount: z.number().int().nonnegative(),
    exchangeProblemCount: z.number().int().nonnegative().default(0),
    retryableDocumentCount: z.number().int().nonnegative().default(0),
    byType: z.record(z.number().int().nonnegative()).default({}),
    byStatus: z.record(z.number().int().nonnegative()).default({}),
    latestActivityAt: dateStr.nullable().optional(),
    nextAction: z.string().optional(),
});
export type TransportDocumentSummary = z.infer<typeof TransportDocumentSummarySchema>;

export const TransportDocumentLifecycleSchema = z.object({
    tripStatus: z.nativeEnum(TripStatus),
    waybillStatus: z.nativeEnum(WaybillStatus).nullable().optional(),
    documentPhase: z.enum(['planning', 'preparation', 'in_transit', 'closing', 'closed', 'blocked']),
    requiredDocumentTypes: z.array(z.nativeEnum(TransportDocumentType)).default([]),
    missingDocumentTypes: z.array(z.nativeEnum(TransportDocumentType)).default([]),
    hasBlockingProblems: z.boolean(),
    hasWarnings: z.boolean(),
    lastEventAt: dateStr.nullable().optional(),
    nextActionLabel: z.string().optional(),
});
export type TransportDocumentLifecycle = z.infer<typeof TransportDocumentLifecycleSchema>;

export const EtrnTimelineEventSchema = z.object({
    id: z.string(),
    titleType: z.nativeEnum(EtrnTitleType),
    status: z.nativeEnum(EtrnTitleStatus),
    title: z.string(),
    at: dateStr,
    severity: z.enum(['info', 'warning', 'critical']).default('info'),
    isProblem: z.boolean().default(false),
    message: z.string().optional(),
});
export type EtrnTimelineEvent = z.infer<typeof EtrnTimelineEventSchema>;

export const EtrnTitleSchema = z.object({
    id: z.string(),
    titleType: z.nativeEnum(EtrnTitleType),
    titleNumber: z.string(),
    titleLabel: z.string(),
    status: z.nativeEnum(EtrnTitleStatus),
    isRequired: z.boolean().default(false),
    isApplicable: z.boolean().default(true),
    tripId: uuid,
    waybillId: uuid.nullable().optional(),
    documentId: z.string().nullable().optional(),
    documentType: z.nativeEnum(TransportDocumentType).nullable().optional(),
    externalId: z.string(),
    error: z.string().nullable().optional(),
    createdAt: dateStr,
    updatedAt: dateStr,
    issuedAt: dateStr.nullable().optional(),
    sentAt: dateStr.nullable().optional(),
    acceptedAt: dateStr.nullable().optional(),
    rejectedAt: dateStr.nullable().optional(),
    completedAt: dateStr.nullable().optional(),
    history: z.array(EtrnTimelineEventSchema).default([]),
    metadata: z.record(z.string(), z.unknown()).default({}),
});
export type EtrnTitle = z.infer<typeof EtrnTitleSchema>;

export const EtrnWorkflowSummarySchema = z.object({
    totalTitles: z.number().int().nonnegative(),
    requiredTitles: z.number().int().nonnegative(),
    completedTitles: z.number().int().nonnegative(),
    activeTitles: z.number().int().nonnegative(),
    blockedTitles: z.number().int().nonnegative(),
    missingTitles: z.number().int().nonnegative(),
    problemCount: z.number().int().nonnegative(),
    criticalProblemCount: z.number().int().nonnegative(),
    warningProblemCount: z.number().int().nonnegative(),
    byStatus: z.record(z.number().int().nonnegative()).default({}),
    byType: z.record(z.number().int().nonnegative()).default({}),
    blockingTitleTypes: z.array(z.nativeEnum(EtrnTitleType)).default([]),
    incompleteTitleTypes: z.array(z.nativeEnum(EtrnTitleType)).default([]),
    latestActivityAt: dateStr.nullable().optional(),
    nextAction: z.string().optional(),
});
export type EtrnWorkflowSummary = z.infer<typeof EtrnWorkflowSummarySchema>;

export const EtrnWorkflowSchema = z.object({
    tripId: uuid,
    waybillId: uuid.nullable().optional(),
    snapshotId: z.string(),
    generatedAt: dateStr,
    status: z.nativeEnum(EtrnWorkflowStatus),
    titles: z.array(EtrnTitleSchema).default([]),
    timeline: z.array(EtrnTimelineEventSchema).default([]),
    history: z.array(EtrnTimelineEventSchema).default([]),
    problems: z.array(TransportDocumentProblemSchema).default([]),
    summary: EtrnWorkflowSummarySchema,
});
export type EtrnWorkflow = z.infer<typeof EtrnWorkflowSchema>;

export const TransportDocumentBundleSchema = z.object({
    tripId: uuid,
    waybillId: uuid.nullable().optional(),
    orderIds: z.array(uuid).default([]),
    snapshotId: z.string(),
    generatedAt: dateStr,
    documents: z.array(TransportDocumentSchema),
    timeline: z.array(TransportDocumentTimelineEventSchema).default([]),
    problems: z.array(TransportDocumentProblemSchema).default([]),
    summary: TransportDocumentSummarySchema,
    lifecycle: TransportDocumentLifecycleSchema,
    etrn: EtrnWorkflowSchema,
});
export type TransportDocumentBundle = z.infer<typeof TransportDocumentBundleSchema>;

export const TransportDocumentListResponseSchema = TransportDocumentBundleSchema;
export type TransportDocumentListResponse = z.infer<typeof TransportDocumentListResponseSchema>;

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
export const RepairPartSchema = z.object({
    name: z.string().optional(),
    quantity: z.number().min(0).optional(),
    cost: z.number().min(0).optional(),
    plannedQuantity: z.number().min(0).optional(),
    estimatedUnitCost: z.number().min(0).optional(),
    catalogId: z.string().optional(),
    catalogName: z.string().optional(),
    catalogCategory: z.string().optional(),
    unit: z.string().optional(),
    suggestedUnitCost: z.number().min(0).optional(),
    received: z.boolean().optional(),
    receivedQuantity: z.number().min(0).optional(),
    actualUnitCost: z.number().min(0).optional(),
    usedQuantity: z.number().min(0).optional(),
}).superRefine((part, ctx) => {
    const label = part.catalogName || part.name || 'Запчасть';

    if (!part.name?.trim() && !part.catalogName?.trim()) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['name'],
            message: `Укажите название для позиции "${label}"`,
        });
    }

    if (part.plannedQuantity !== undefined && part.plannedQuantity <= 0) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['plannedQuantity'],
            message: `Плановое количество для "${label}" должно быть больше 0`,
        });
    }

    if (part.received === true && Number(part.receivedQuantity ?? 0) <= 0) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['receivedQuantity'],
            message: `Если позиция отмечена как полученная, укажите количество для "${label}"`,
        });
    }

    if (part.usedQuantity !== undefined && part.receivedQuantity !== undefined && part.usedQuantity > part.receivedQuantity) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['usedQuantity'],
            message: `Использованное количество для "${label}" не может быть больше полученного`,
        });
    }
});

export const RepairPartsSummarySchema = z.object({
    partCount: z.number().min(0),
    plannedQuantity: z.number().min(0),
    receivedQuantity: z.number().min(0),
    usedQuantity: z.number().min(0),
    plannedCost: z.number().min(0),
    receivedCost: z.number().min(0),
    usedCost: z.number().min(0),
    factCost: z.number().min(0),
    variance: z.number(),
    variancePercent: z.number(),
    plannedRate: z.number().min(0),
    receivedRate: z.number().min(0),
    usedRate: z.number().min(0),
});
export type RepairPartsSummary = z.infer<typeof RepairPartsSummarySchema>;

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
    partsUsed: z.array(RepairPartSchema).default([]),
    partsSummary: nullable(RepairPartsSummarySchema),
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
// Sprint 13: Подтверждение доставки (ЭТрН Титул 3)
// ================================================================
export const DeliveryConfirmationCreateSchema = z.object({
    orderId: uuid.optional(),
    recipientName: z.string().min(1),
    recipientPosition: z.string().optional(),
    recipientDocument: z.string().optional(),
    recipientSignaturePath: z.string().optional(),
    photos: z.array(z.string()).default([]),
    cargoCondition: z.nativeEnum(CargoCondition).default('intact'),
    sealNumbers: z.array(z.string()).optional(),
    packagingCondition: z.string().optional(),
    notes: z.string().optional(),
    gpsLat: z.number().optional(),
    gpsLng: z.number().optional(),
    // Force-close (dispatcher only)
    forcedByDispatcher: z.boolean().default(false),
    forcedReason: z.nativeEnum(ForcedReason).optional(),
    forcedReasonNote: z.string().optional(),
}).superRefine((data, ctx) => {
    if (data.forcedByDispatcher && !data.forcedReason) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'forcedReason required when forcedByDispatcher=true', path: ['forcedReason'] });
    }
    if (data.forcedReason === 'other' && !data.forcedReasonNote) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'forcedReasonNote required when forcedReason=other', path: ['forcedReasonNote'] });
    }
});
export type DeliveryConfirmationCreate = z.infer<typeof DeliveryConfirmationCreateSchema>;

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

// ================================================================
// Deep Fleet Operations Schemas
// ================================================================

export const FuelRecordCreateSchema = z.object({
    vehicleId: z.string().uuid(),
    recordedAt: z.string().datetime(),
    liters: z.number().positive(),
    costPerLiter: z.number().positive(),
    totalCost: z.number().positive(),
    fuelType: z.enum(['diesel', 'petrol', 'gas', 'adblue']),
    station: z.string().max(255).optional(),
    odometerAtFill: z.number().positive().optional(),
    tripId: z.string().uuid().optional(),
    driverId: z.string().uuid().optional(),
});

export const OdometerReadingCreateSchema = z.object({
    vehicleId: z.string().uuid(),
    recordedAt: z.string().datetime(),
    valueKm: z.number().positive(),
    source: z.enum(['manual', 'gps', 'waybill', 'inspection']).default('manual'),
    tripId: z.string().uuid().optional(),
    driverId: z.string().uuid().optional(),
});

export const DowntimeRecordCreateSchema = z.object({
    vehicleId: z.string().uuid(),
    startAt: z.string().datetime(),
    endAt: z.string().datetime().optional(),
    reasonCode: z.enum(['repair', 'waiting_load', 'waiting_docs', 'driver_absence', 'weather', 'other']),
    description: z.string().optional(),
    tripId: z.string().uuid().optional(),
});

export const DowntimeRecordUpdateSchema = z.object({
    endAt: z.string().datetime().optional(),
    reasonCode: z.enum(['repair', 'waiting_load', 'waiting_docs', 'driver_absence', 'weather', 'other']).optional(),
    description: z.string().optional(),
});

export const MaintenancePlanCreateSchema = z.object({
    vehicleId: z.string().uuid(),
    maintenanceType: z.enum(['to1', 'to2', 'to3', 'seasonal', 'other']),
    plannedDate: z.string().datetime().optional(),
    plannedOdometerKm: z.number().positive().optional(),
    contractor: z.string().max(255).optional(),
    notes: z.string().optional(),
    repairRequestId: z.string().uuid().optional(),
});

export const MaintenancePlanUpdateSchema = z.object({
    status: z.enum(['planned', 'overdue', 'done', 'cancelled']).optional(),
    actualDate: z.string().datetime().optional(),
    actualOdometerKm: z.number().positive().optional(),
    cost: z.number().positive().optional(),
    contractor: z.string().max(255).optional(),
    notes: z.string().optional(),
});


