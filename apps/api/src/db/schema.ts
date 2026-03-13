// ============================================================
// TMS — PostgreSQL Schema (Drizzle ORM)
// Полная схема БД по §4.1 ТЗ + append-only event journal
// ============================================================
import {
    pgTable, uuid, text, varchar, integer, boolean,
    timestamp, jsonb, index, uniqueIndex, pgEnum, serial,
    numeric, doublePrecision,
} from 'drizzle-orm/pg-core';

// ================================================================
// Enums (PostgreSQL-native)
// ================================================================
export const userRoleEnum = pgEnum('user_role', [
    'logist', 'dispatcher', 'manager', 'mechanic', 'medic',
    'repair_service', 'driver', 'accountant', 'admin', 'client',
]);

export const orderStatusEnum = pgEnum('order_status', [
    'draft', 'confirmed', 'assigned', 'in_transit', 'delivered', 'returned', 'cancelled',
]);

export const tripStatusEnum = pgEnum('trip_status', [
    'planning', 'assigned', 'inspection', 'waybill_issued',
    'loading', 'in_transit', 'completed', 'billed', 'cancelled',
]);

export const vehicleStatusEnum = pgEnum('vehicle_status', [
    'available', 'assigned', 'in_trip', 'maintenance', 'broken', 'blocked',
]);

export const repairStatusEnum = pgEnum('repair_status', [
    'created', 'waiting_parts', 'in_progress', 'done',
]);

export const fineStatusEnum = pgEnum('fine_status', [
    'new', 'confirmed', 'paid', 'appealed',
]);

export const waybillStatusEnum = pgEnum('waybill_status', [
    'draft', 'medical_check', 'technical_check', 'issued', 'closed',
]);

export const inspectionDecisionEnum = pgEnum('inspection_decision', [
    'approved', 'rejected',
]);

export const inspectionTypeEnum = pgEnum('inspection_type', [
    'pre_trip', 'periodic',
]);

export const routePointTypeEnum = pgEnum('route_point_type', [
    'loading', 'unloading',
]);

export const routePointStatusEnum = pgEnum('route_point_status', [
    'pending', 'arrived', 'completed', 'skipped',
]);

// Sprint 9 — Incidents
export const incidentSeverityEnum = pgEnum('incident_severity', [
    'low', 'medium', 'critical',
]);

export const incidentStatusEnum = pgEnum('incident_status', [
    'open', 'investigating', 'resolved', 'dismissed',
]);

export const incidentTypeEnum = pgEnum('incident_type', [
    'med_inspection', 'tech_inspection', 'road', 'cargo', 'other',
]);

// Sprint 9 — Trailers
export const trailerTypeEnum = pgEnum('trailer_type', [
    'tent', 'board', 'refrigerator', 'cistern', 'flatbed', 'container', 'other',
]);

// Sprint 9 — Expense categories
export const expenseCategoryEnum = pgEnum('expense_category', [
    'fuel', 'platon', 'parking', 'fine', 'repair', 'toll', 'other',
]);

export const tariffTypeEnum = pgEnum('tariff_type', [
    'per_km', 'per_ton', 'per_hour', 'fixed_route', 'combined',
]);

export const invoiceStatusEnum = pgEnum('invoice_status', [
    'draft', 'sent', 'paid', 'overdue', 'cancelled',
]);

export const restrictionZoneTypeEnum = pgEnum('restriction_zone_type', [
    'mkad', 'ttk', 'city',
]);

export const repairPriorityEnum = pgEnum('repair_priority', [
    'low', 'medium', 'high', 'critical',
]);

export const repairSourceEnum = pgEnum('repair_source', [
    'auto_inspection', 'driver', 'mechanic', 'scheduled',
]);

// ================================================================
// Users
// ================================================================
export const users = pgTable('users', {
    id: uuid('id').primaryKey().defaultRandom(),
    email: varchar('email', { length: 255 }).notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    fullName: varchar('full_name', { length: 255 }).notNull(),
    phone: varchar('phone', { length: 20 }),
    roles: jsonb('roles').$type<string[]>().notNull().default([]),
    isActive: boolean('is_active').notNull().default(true),
    // Client RLS: link client users to their contractor
    contractorId: uuid('contractor_id').references(() => contractors.id),
    // Multitenancy (Sprint 6): isolate data by organization
    organizationId: uuid('organization_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    index('idx_users_email').on(table.email),
    index('idx_users_contractor').on(table.contractorId),
]);

// ================================================================
// Contractors (Контрагенты)
// ================================================================
export const contractors = pgTable('contractors', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 500 }).notNull(),
    inn: varchar('inn', { length: 12 }).notNull(),
    kpp: varchar('kpp', { length: 9 }),
    legalAddress: text('legal_address').notNull(),
    phone: varchar('phone', { length: 20 }),
    email: varchar('email', { length: 255 }),
    isArchived: boolean('is_archived').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    uniqueIndex('idx_contractors_inn').on(table.inn),
]);

// ================================================================
// Contracts & Tariffs (Договоры / Тарифы)
// ================================================================
export const contracts = pgTable('contracts', {
    id: uuid('id').primaryKey().defaultRandom(),
    contractorId: uuid('contractor_id').notNull().references(() => contractors.id),
    number: varchar('number', { length: 100 }).notNull(),
    startDate: timestamp('start_date', { withTimezone: true }).notNull(),
    endDate: timestamp('end_date', { withTimezone: true }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    index('idx_contracts_contractor').on(table.contractorId),
]);

export const tariffs = pgTable('tariffs', {
    id: uuid('id').primaryKey().defaultRandom(),
    contractId: uuid('contract_id').notNull().references(() => contracts.id),
    type: tariffTypeEnum('type').notNull(),
    ratePerKm: numeric('rate_per_km', { precision: 12, scale: 2 }).$type<number>(),
    ratePerTon: numeric('rate_per_ton', { precision: 12, scale: 2 }).$type<number>(),
    ratePerHour: numeric('rate_per_hour', { precision: 12, scale: 2 }).$type<number>(),
    fixedRate: numeric('fixed_rate', { precision: 12, scale: 2 }).$type<number>(),
    combinedFixedRate: numeric('combined_fixed_rate', { precision: 12, scale: 2 }).$type<number>(),
    combinedKmThreshold: doublePrecision('combined_km_threshold'),
    combinedRatePerKm: numeric('combined_rate_per_km', { precision: 12, scale: 2 }).$type<number>(),
    // Модификаторы
    idleFreeLimitMinutes: integer('idle_free_limit_minutes').notNull().default(120),
    idleRatePerHour: numeric('idle_rate_per_hour', { precision: 12, scale: 2 }).$type<number>().notNull().default(0),
    extraPointRate: numeric('extra_point_rate', { precision: 12, scale: 2 }).$type<number>().notNull().default(0),
    nightCoefficient: numeric('night_coefficient', { precision: 5, scale: 2 }).$type<number>().notNull().default(1),
    urgentCoefficient: numeric('urgent_coefficient', { precision: 5, scale: 2 }).$type<number>().notNull().default(1),
    returnPercentage: numeric('return_percentage', { precision: 5, scale: 2 }).$type<number>().notNull().default(100),
    cancellationFee: numeric('cancellation_fee', { precision: 12, scale: 2 }).$type<number>().notNull().default(0),
    weekendCoefficient: numeric('weekend_coefficient', { precision: 5, scale: 2 }).$type<number>().notNull().default(1),
    vatIncluded: boolean('vat_included').notNull().default(true),
    vatRate: numeric('vat_rate', { precision: 5, scale: 2 }).$type<number>().notNull().default(20),
    minTripCost: numeric('min_trip_cost', { precision: 12, scale: 2 }).$type<number>().notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    index('idx_tariffs_contract').on(table.contractId),
]);

// ================================================================
// Vehicles (ТС)
// ================================================================
export const vehicles = pgTable('vehicles', {
    id: uuid('id').primaryKey().defaultRandom(),
    plateNumber: varchar('plate_number', { length: 15 }).notNull().unique(),
    vin: varchar('vin', { length: 17 }).notNull().unique(),
    make: varchar('make', { length: 100 }).notNull(),
    model: varchar('model', { length: 100 }).notNull(),
    year: integer('year').notNull(),
    bodyType: varchar('body_type', { length: 100 }).notNull(),
    payloadCapacityKg: doublePrecision('payload_capacity_kg').notNull(),
    payloadVolumeM3: doublePrecision('payload_volume_m3'),
    status: vehicleStatusEnum('status').notNull().default('available'),
    currentOdometerKm: doublePrecision('current_odometer_km').notNull().default(0),
    fuelTankLiters: doublePrecision('fuel_tank_liters'),
    fuelNormPer100Km: doublePrecision('fuel_norm_per_100km'),
    // Сроки документов
    techInspectionExpiry: timestamp('tech_inspection_expiry', { withTimezone: true }),
    osagoExpiry: timestamp('osago_expiry', { withTimezone: true }),
    maintenanceNextDate: timestamp('maintenance_next_date', { withTimezone: true }),
    maintenanceNextKm: doublePrecision('maintenance_next_km'),
    tachographCalibrationExpiry: timestamp('tachograph_calibration_expiry', { withTimezone: true }),
    // Sprint 9: Топливная карта, транспондер, гидроборт
    fuelCardNumber: varchar('fuel_card_number', { length: 50 }),
    transponderNumber: varchar('transponder_number', { length: 50 }),
    hasHydraulicLift: boolean('has_hydraulic_lift').notNull().default(false),
    isArchived: boolean('is_archived').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    uniqueIndex('idx_vehicles_plate').on(table.plateNumber),
    uniqueIndex('idx_vehicles_vin').on(table.vin),
    index('idx_vehicles_status').on(table.status),
]);

// ================================================================
// Drivers (Водители)
// ================================================================
export const drivers = pgTable('drivers', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id),
    fullName: varchar('full_name', { length: 255 }).notNull(),
    birthDate: timestamp('birth_date', { withTimezone: true }).notNull(),
    licenseNumber: varchar('license_number', { length: 20 }).notNull(),
    licenseCategories: jsonb('license_categories').$type<string[]>().notNull().default([]),
    licenseExpiry: timestamp('license_expiry', { withTimezone: true }).notNull(),
    medCertificateExpiry: timestamp('med_certificate_expiry', { withTimezone: true }),
    personalDataConsent: boolean('personal_data_consent').notNull().default(false),
    personalDataConsentDate: timestamp('personal_data_consent_date', { withTimezone: true }),
    // Sprint 9: Доверенность, топливная карта
    powerOfAttorneyNumber: varchar('power_of_attorney_number', { length: 50 }),
    powerOfAttorneyExpiry: timestamp('power_of_attorney_expiry', { withTimezone: true }),
    fuelCardNumber: varchar('fuel_card_number', { length: 50 }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    index('idx_drivers_user').on(table.userId),
]);

// ================================================================
// Orders (Заявки)
// ================================================================
export const orders = pgTable('orders', {
    id: uuid('id').primaryKey().defaultRandom(),
    number: varchar('number', { length: 50 }).notNull().unique(),
    contractorId: uuid('contractor_id').notNull().references(() => contractors.id),
    contractId: uuid('contract_id').references(() => contracts.id),
    status: orderStatusEnum('status').notNull().default('draft'),
    // Груз
    cargoDescription: text('cargo_description').notNull(),
    cargoWeightKg: doublePrecision('cargo_weight_kg').notNull(),
    cargoVolumeM3: doublePrecision('cargo_volume_m3'),
    cargoPlaces: integer('cargo_places'),
    cargoType: varchar('cargo_type', { length: 100 }),
    // Sprint 9: Ярусность
    multiTierAllowed: boolean('multi_tier_allowed').notNull().default(false),
    maxTiers: integer('max_tiers').notNull().default(1),
    // Sprint 9: Температурный режим (рефрижераторы)
    temperatureMin: doublePrecision('temperature_min'),
    temperatureMax: doublePrecision('temperature_max'),
    // Sprint 9: Тип загрузки
    loadingType: varchar('loading_type', { length: 20 }),  // rear, side, top
    hydraulicLiftRequired: boolean('hydraulic_lift_required').notNull().default(false),
    // Адреса
    loadingAddress: text('loading_address').notNull(),
    loadingLat: doublePrecision('loading_lat'),
    loadingLon: doublePrecision('loading_lon'),
    loadingDate: timestamp('loading_date', { withTimezone: true }),
    loadingWindowStart: timestamp('loading_window_start', { withTimezone: true }),
    loadingWindowEnd: timestamp('loading_window_end', { withTimezone: true }),
    unloadingAddress: text('unloading_address').notNull(),
    unloadingLat: doublePrecision('unloading_lat'),
    unloadingLon: doublePrecision('unloading_lon'),
    unloadingDate: timestamp('unloading_date', { withTimezone: true }),
    unloadingWindowStart: timestamp('unloading_window_start', { withTimezone: true }),
    unloadingWindowEnd: timestamp('unloading_window_end', { withTimezone: true }),
    // Требования
    vehicleRequirements: text('vehicle_requirements'),
    notes: text('notes'),
    tripId: uuid('trip_id'),
    createdBy: uuid('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    uniqueIndex('idx_orders_number').on(table.number),
    index('idx_orders_status').on(table.status),
    index('idx_orders_contractor').on(table.contractorId),
    index('idx_orders_trip').on(table.tripId),
]);

// ================================================================
// Trips (Рейсы)
// ================================================================
export const trips = pgTable('trips', {
    id: uuid('id').primaryKey().defaultRandom(),
    number: varchar('number', { length: 50 }).notNull().unique(),
    status: tripStatusEnum('status').notNull().default('planning'),
    vehicleId: uuid('vehicle_id').references(() => vehicles.id),
    driverId: uuid('driver_id').references(() => drivers.id),
    waybillId: uuid('waybill_id'),
    plannedDistanceKm: doublePrecision('planned_distance_km'),
    actualDistanceKm: doublePrecision('actual_distance_km'),
    plannedDepartureAt: timestamp('planned_departure_at', { withTimezone: true }),
    actualDepartureAt: timestamp('actual_departure_at', { withTimezone: true }),
    actualCompletionAt: timestamp('actual_completion_at', { withTimezone: true }),
    odometerStart: doublePrecision('odometer_start'),
    odometerEnd: doublePrecision('odometer_end'),
    fuelStart: doublePrecision('fuel_start'),
    fuelEnd: doublePrecision('fuel_end'),
    notes: text('notes'),
    originalDocumentsReceived: boolean('original_documents_received').notNull().default(false),
    createdBy: uuid('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    uniqueIndex('idx_trips_number').on(table.number),
    index('idx_trips_status').on(table.status),
    index('idx_trips_vehicle').on(table.vehicleId),
    index('idx_trips_driver').on(table.driverId),
]);

// ================================================================
// Route Points (Точки маршрута)
// ================================================================
export const tripOrders = pgTable('trip_orders', {
    id: uuid('id').primaryKey().defaultRandom(),
    tripId: uuid('trip_id').notNull().references(() => trips.id),
    orderId: uuid('order_id').notNull().references(() => orders.id),
    linkedAt: timestamp('linked_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    uniqueIndex('idx_trip_orders_unique').on(table.tripId, table.orderId),
    index('idx_trip_orders_trip').on(table.tripId),
    index('idx_trip_orders_order').on(table.orderId),
]);

// ================================================================
// Route Points (?????????? ????????????????)
// ================================================================
export const routePoints = pgTable('route_points', {
    id: uuid('id').primaryKey().defaultRandom(),
    tripId: uuid('trip_id').notNull().references(() => trips.id),
    orderId: uuid('order_id').references(() => orders.id),
    type: routePointTypeEnum('type').notNull(),
    status: routePointStatusEnum('status').notNull().default('pending'),
    sequenceNumber: integer('sequence_number').notNull(),
    address: text('address').notNull(),
    lat: doublePrecision('lat'),
    lon: doublePrecision('lon'),
    windowStart: timestamp('window_start', { withTimezone: true }),
    windowEnd: timestamp('window_end', { withTimezone: true }),
    arrivedAt: timestamp('arrived_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    signatureUrl: text('signature_url'),
    photoUrls: jsonb('photo_urls').$type<string[]>().default([]),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    index('idx_route_points_trip').on(table.tripId),
]);

// ================================================================
// Tech Inspections (Акты техосмотра)
// ================================================================
export const techInspections = pgTable('tech_inspections', {
    id: uuid('id').primaryKey().defaultRandom(),
    vehicleId: uuid('vehicle_id').notNull().references(() => vehicles.id),
    mechanicId: uuid('mechanic_id').notNull().references(() => users.id),
    tripId: uuid('trip_id').references(() => trips.id),
    inspectionType: inspectionTypeEnum('inspection_type').notNull().default('pre_trip'),
    checklistVersion: varchar('checklist_version', { length: 20 }).notNull(),
    items: jsonb('items').$type<Array<{
        name: string;
        result: 'ok' | 'fault';
        comment?: string;
        photoUrl?: string;
    }>>().notNull(),
    decision: inspectionDecisionEnum('decision').notNull(),
    comment: text('comment'),
    signature: text('signature').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    index('idx_tech_inspections_vehicle').on(table.vehicleId),
    index('idx_tech_inspections_trip').on(table.tripId),
    index('idx_tech_inspections_type').on(table.inspectionType),
]);

// ================================================================
// Med Inspections (Акты медосмотра — 152-ФЗ)
// ================================================================
export const medInspections = pgTable('med_inspections', {
    id: uuid('id').primaryKey().defaultRandom(),
    driverId: uuid('driver_id').notNull().references(() => drivers.id),
    medicId: uuid('medic_id').notNull().references(() => users.id),
    tripId: uuid('trip_id').references(() => trips.id),
    inspectionType: inspectionTypeEnum('inspection_type').notNull().default('pre_trip'),
    checklistVersion: varchar('checklist_version', { length: 20 }).notNull(),
    // Медданные (в production шифровать pgcrypto)
    systolicBp: integer('systolic_bp').notNull(),
    diastolicBp: integer('diastolic_bp').notNull(),
    heartRate: integer('heart_rate').notNull(),
    temperature: doublePrecision('temperature').notNull(),
    condition: text('condition').notNull(),
    alcoholTest: varchar('alcohol_test', { length: 10 }).notNull(),
    complaints: text('complaints'),
    decision: inspectionDecisionEnum('decision').notNull(),
    comment: text('comment'),
    signature: text('signature').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    index('idx_med_inspections_driver').on(table.driverId),
    index('idx_med_inspections_trip').on(table.tripId),
    index('idx_med_inspections_type').on(table.inspectionType),
]);

// ================================================================
// Waybills (Путевые листы)
// ================================================================
export const waybills = pgTable('waybills', {
    id: uuid('id').primaryKey().defaultRandom(),
    number: varchar('number', { length: 50 }).notNull().unique(),
    tripId: uuid('trip_id').notNull().references(() => trips.id),
    vehicleId: uuid('vehicle_id').notNull().references(() => vehicles.id),
    driverId: uuid('driver_id').notNull().references(() => drivers.id),
    status: waybillStatusEnum('status').notNull().default('draft'),
    techInspectionId: uuid('tech_inspection_id').references(() => techInspections.id),
    medInspectionId: uuid('med_inspection_id').references(() => medInspections.id),
    mechanicSignature: text('mechanic_signature'),
    medicSignature: text('medic_signature'),
    odometerOut: doublePrecision('odometer_out').notNull(),
    odometerIn: doublePrecision('odometer_in'),
    fuelOut: doublePrecision('fuel_out'),
    fuelIn: doublePrecision('fuel_in'),
    departureAt: timestamp('departure_at', { withTimezone: true }),
    returnAt: timestamp('return_at', { withTimezone: true }),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
}, (table) => [
    uniqueIndex('idx_waybills_number').on(table.number),
    index('idx_waybills_trip').on(table.tripId),
]);

// ================================================================
// Repair Requests (Заявки на ремонт)
// ================================================================
export const waybillAttachments = pgTable('waybill_attachments', {
    id: uuid('id').primaryKey().defaultRandom(),
    waybillId: uuid('waybill_id').notNull().references(() => waybills.id),
    fileName: varchar('file_name', { length: 255 }).notNull(),
    originalName: varchar('original_name', { length: 255 }).notNull(),
    mimeType: varchar('mime_type', { length: 100 }).notNull(),
    fileSize: integer('file_size').notNull(),
    storagePath: text('storage_path').notNull(),
    uploadedBy: uuid('uploaded_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    index('idx_waybill_attachments_waybill').on(table.waybillId),
]);

// ================================================================
// Repair Requests (???????????? ???? ????????????)
// ================================================================
export const repairRequests = pgTable('repair_requests', {
    id: uuid('id').primaryKey().defaultRandom(),
    vehicleId: uuid('vehicle_id').notNull().references(() => vehicles.id),
    status: repairStatusEnum('status').notNull().default('created'),
    description: text('description').notNull(),
    priority: repairPriorityEnum('priority').notNull(),
    source: repairSourceEnum('source').notNull(),
    inspectionId: uuid('inspection_id'),
    assignedTo: varchar('assigned_to', { length: 255 }),
    workDescription: text('work_description'),
    partsUsed: jsonb('parts_used').$type<Array<{
        name: string;
        quantity: number;
        cost: number;
    }>>().default([]),
    totalCost: numeric('total_cost', { precision: 12, scale: 2 }).$type<number>().notNull().default(0),
    odometerAtRepair: doublePrecision('odometer_at_repair'),
    photoUrls: jsonb('photo_urls').$type<string[]>().default([]),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    index('idx_repairs_vehicle').on(table.vehicleId),
    index('idx_repairs_status').on(table.status),
]);

// ================================================================
// Permits (Пропуска)
// ================================================================
export const permits = pgTable('permits', {
    id: uuid('id').primaryKey().defaultRandom(),
    vehicleId: uuid('vehicle_id').notNull().references(() => vehicles.id),
    zoneType: restrictionZoneTypeEnum('zone_type').notNull(),
    zoneName: varchar('zone_name', { length: 255 }).notNull(),
    permitNumber: varchar('permit_number', { length: 100 }).notNull(),
    validFrom: timestamp('valid_from', { withTimezone: true }).notNull(),
    validUntil: timestamp('valid_until', { withTimezone: true }).notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    index('idx_permits_vehicle').on(table.vehicleId),
]);

// ================================================================
// Fines (Штрафы ГИБДД)
// ================================================================
export const fines = pgTable('fines', {
    id: uuid('id').primaryKey().defaultRandom(),
    vehicleId: uuid('vehicle_id').notNull().references(() => vehicles.id),
    driverId: uuid('driver_id').references(() => drivers.id),
    status: fineStatusEnum('status').notNull().default('new'),
    violationDate: timestamp('violation_date', { withTimezone: true }).notNull(),
    violationType: varchar('violation_type', { length: 255 }).notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).$type<number>().notNull(),
    resolutionNumber: varchar('resolution_number', { length: 100 }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    index('idx_fines_vehicle').on(table.vehicleId),
    index('idx_fines_driver').on(table.driverId),
]);

// ================================================================
// Invoices (Счета / Акты)
// ================================================================
export const invoices = pgTable('invoices', {
    id: uuid('id').primaryKey().defaultRandom(),
    number: varchar('number', { length: 50 }).notNull().unique(),
    contractorId: uuid('contractor_id').notNull().references(() => contractors.id),
    contractId: uuid('contract_id').references(() => contracts.id),
    type: varchar('type', { length: 20 }).notNull(), // invoice, act, upd
    status: invoiceStatusEnum('status').notNull().default('draft'),
    tripIds: jsonb('trip_ids').$type<string[]>().notNull().default([]),
    subtotal: numeric('subtotal', { precision: 12, scale: 2 }).$type<number>().notNull(),
    vatAmount: numeric('vat_amount', { precision: 12, scale: 2 }).$type<number>().notNull(),
    total: numeric('total', { precision: 12, scale: 2 }).$type<number>().notNull(),
    periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
    periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    uniqueIndex('idx_invoices_number').on(table.number),
    index('idx_invoices_contractor').on(table.contractorId),
]);

// ================================================================
// Tachograph Records (РТО)
// ================================================================
export const tachographRecords = pgTable('tachograph_records', {
    id: uuid('id').primaryKey().defaultRandom(),
    driverId: uuid('driver_id').notNull().references(() => drivers.id),
    date: timestamp('date', { withTimezone: true }).notNull(),
    drivingMinutes: integer('driving_minutes').notNull(),
    restMinutes: integer('rest_minutes').notNull(),
    continuousDrivingMinutes: integer('continuous_driving_minutes').notNull(),
    weeklyRestMinutes: integer('weekly_rest_minutes'),
    source: varchar('source', { length: 50 }).notNull().default('manual'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    index('idx_tachograph_driver').on(table.driverId),
    index('idx_tachograph_date').on(table.date),
]);

// ================================================================
// Restriction Zones (Зоны ограничений)
// ================================================================
export const restrictionZones = pgTable('restriction_zones', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }).notNull(),
    type: restrictionZoneTypeEnum('type').notNull(),
    geoJson: jsonb('geo_json').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ================================================================
// Checklist Templates (Шаблоны чек-листов)
// ================================================================
export const checklistTemplates = pgTable('checklist_templates', {
    id: uuid('id').primaryKey().defaultRandom(),
    type: varchar('type', { length: 10 }).notNull(), // tech, med
    version: varchar('version', { length: 20 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    items: jsonb('items').$type<Array<{
        name: string;
        responseType: 'ok_fault' | 'number' | 'text' | 'boolean';
        required: boolean;
    }>>().notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ================================================================
// Addresses (Адреса)
// ================================================================
export const addresses = pgTable('addresses', {
    id: uuid('id').primaryKey().defaultRandom(),
    addressString: text('address_string').notNull(),
    lat: doublePrecision('lat').notNull(),
    lon: doublePrecision('lon').notNull(),
    type: routePointTypeEnum('type').notNull(),
    contractorId: uuid('contractor_id').references(() => contractors.id),
    fiasId: varchar('fias_id', { length: 50 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    index('idx_addresses_contractor').on(table.contractorId),
]);

// ================================================================
// EVENT JOURNAL — Append-only (Приложение Б)
// Запрет UPDATE/DELETE будет через SQL-триггер в миграции
// ================================================================
export const events = pgTable('events', {
    id: uuid('id').primaryKey().defaultRandom(),
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
    authorId: uuid('author_id').notNull().references(() => users.id),
    authorRole: varchar('author_role', { length: 30 }).notNull(),
    eventType: varchar('event_type', { length: 100 }).notNull(),
    entityType: varchar('entity_type', { length: 50 }).notNull(),
    entityId: uuid('entity_id').notNull(),
    data: jsonb('data').notNull().default({}),
    version: integer('version').notNull().default(1),
    conflict: boolean('conflict').notNull().default(false),
    offlineCreatedAt: timestamp('offline_created_at', { withTimezone: true }),
    /** Idempotency key — prevents duplicate events on retries */
    externalId: varchar('external_id', { length: 255 }),
}, (table) => [
    index('idx_events_entity').on(table.entityType, table.entityId),
    index('idx_events_type').on(table.eventType),
    index('idx_events_timestamp').on(table.timestamp),
    index('idx_events_author').on(table.authorId),
    uniqueIndex('idx_events_external_id').on(table.externalId),
]);

// ================================================================
// Med Access Audit Log (§А.2 — 152-ФЗ)
// ================================================================
export const medAccessLog = pgTable('med_access_log', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id),
    targetDriverId: uuid('target_driver_id').notNull().references(() => drivers.id),
    action: varchar('action', { length: 50 }).notNull(),
    accessedAt: timestamp('accessed_at', { withTimezone: true }).notNull().defaultNow(),
    ipAddress: varchar('ip_address', { length: 45 }),
}, (table) => [
    // H-17 FIX: Indexes for 152-ФЗ audit queries
    index('idx_med_access_log_user').on(table.userId),
    index('idx_med_access_log_driver').on(table.targetDriverId),
    index('idx_med_access_log_accessed_at').on(table.accessedAt),
]);

// ================================================================
// Notification Subscriptions — Telegram Bot (Sprint 6)
// ================================================================
export const notificationSubscriptions = pgTable('notification_subscriptions', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id),
    telegramChatId: varchar('telegram_chat_id', { length: 50 }).notNull(),
    telegramUsername: varchar('telegram_username', { length: 100 }),
    eventTypes: jsonb('event_types').$type<string[]>().notNull().default(['*']),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    uniqueIndex('notification_subs_chat_id_idx').on(table.telegramChatId),
    index('notification_subs_user_id_idx').on(table.userId),
]);

// ================================================================
// Sprint 9 — Прицепы (Trailers)
// ================================================================
export const trailers = pgTable('trailers', {
    id: uuid('id').primaryKey().defaultRandom(),
    plateNumber: varchar('plate_number', { length: 20 }).notNull().unique(),
    vin: varchar('vin', { length: 17 }),
    type: trailerTypeEnum('type').notNull(),
    make: varchar('make', { length: 100 }),
    model: varchar('model', { length: 100 }),
    year: integer('year'),
    payloadCapacityKg: doublePrecision('payload_capacity_kg'),
    payloadVolumeM3: doublePrecision('payload_volume_m3'),
    // Документы
    techInspectionExpiry: timestamp('tech_inspection_expiry', { withTimezone: true }),
    osagoExpiry: timestamp('osago_expiry', { withTimezone: true }),
    tachographCalibrationExpiry: timestamp('tachograph_calibration_expiry', { withTimezone: true }),
    // Привязка к тягачу (может меняться)
    currentVehicleId: uuid('current_vehicle_id').references(() => vehicles.id),
    isArchived: boolean('is_archived').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    uniqueIndex('idx_trailers_plate').on(table.plateNumber),
    index('idx_trailers_vehicle').on(table.currentVehicleId),
]);

// ================================================================
// Sprint 9 — Инциденты (Incidents)
// ================================================================
export const incidents = pgTable('incidents', {
    id: uuid('id').primaryKey().defaultRandom(),
    type: incidentTypeEnum('type').notNull(),
    severity: incidentSeverityEnum('severity').notNull().default('low'),
    status: incidentStatusEnum('status').notNull().default('open'),
    description: text('description').notNull(),
    // Связи
    vehicleId: uuid('vehicle_id').references(() => vehicles.id),
    driverId: uuid('driver_id').references(() => drivers.id),
    tripId: uuid('trip_id').references(() => trips.id),
    techInspectionId: uuid('tech_inspection_id').references(() => techInspections.id),
    medInspectionId: uuid('med_inspection_id').references(() => medInspections.id),
    // Решение
    resolution: text('resolution'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolvedBy: uuid('resolved_by').references(() => users.id),
    // Блокировка
    blocksRelease: boolean('blocks_release').notNull().default(false),
    createdBy: uuid('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    index('idx_incidents_status').on(table.status),
    index('idx_incidents_vehicle').on(table.vehicleId),
    index('idx_incidents_driver').on(table.driverId),
    index('idx_incidents_trip').on(table.tripId),
]);

// ================================================================
// Sprint 9 — Несколько водителей на путевом (Waybill Drivers)
// ================================================================
export const waybillDrivers = pgTable('waybill_drivers', {
    id: uuid('id').primaryKey().defaultRandom(),
    waybillId: uuid('waybill_id').notNull().references(() => waybills.id),
    driverId: uuid('driver_id').notNull().references(() => drivers.id),
    shiftStart: timestamp('shift_start', { withTimezone: true }),
    shiftEnd: timestamp('shift_end', { withTimezone: true }),
    isPrimary: boolean('is_primary').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    index('idx_waybill_drivers_waybill').on(table.waybillId),
    index('idx_waybill_drivers_driver').on(table.driverId),
]);

// ================================================================
// Sprint 9 — Расходы путевого листа (Waybill Expenses)
// ================================================================
export const waybillExpenses = pgTable('waybill_expenses', {
    id: uuid('id').primaryKey().defaultRandom(),
    waybillId: uuid('waybill_id').notNull().references(() => waybills.id),
    category: expenseCategoryEnum('category').notNull(),
    description: varchar('description', { length: 255 }),
    plannedAmount: numeric('planned_amount', { precision: 12, scale: 2 }).$type<number>(),
    actualAmount: numeric('actual_amount', { precision: 12, scale: 2 }).$type<number>(),
    receiptUrl: text('receipt_url'),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    index('idx_waybill_expenses_waybill').on(table.waybillId),
    index('idx_waybill_expenses_category').on(table.category),
]);
