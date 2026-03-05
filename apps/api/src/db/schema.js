"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.medAccessLog = exports.events = exports.addresses = exports.checklistTemplates = exports.restrictionZones = exports.tachographRecords = exports.invoices = exports.fines = exports.permits = exports.repairRequests = exports.waybills = exports.medInspections = exports.techInspections = exports.routePoints = exports.trips = exports.orders = exports.drivers = exports.vehicles = exports.tariffs = exports.contracts = exports.contractors = exports.users = exports.repairSourceEnum = exports.repairPriorityEnum = exports.restrictionZoneTypeEnum = exports.invoiceStatusEnum = exports.tariffTypeEnum = exports.routePointStatusEnum = exports.routePointTypeEnum = exports.inspectionDecisionEnum = exports.waybillStatusEnum = exports.fineStatusEnum = exports.repairStatusEnum = exports.vehicleStatusEnum = exports.tripStatusEnum = exports.orderStatusEnum = exports.userRoleEnum = void 0;
// ============================================================
// TMS — PostgreSQL Schema (Drizzle ORM)
// Полная схема БД по §4.1 ТЗ + append-only event journal
// ============================================================
var pg_core_1 = require("drizzle-orm/pg-core");
// ================================================================
// Enums (PostgreSQL-native)
// ================================================================
exports.userRoleEnum = (0, pg_core_1.pgEnum)('user_role', [
    'logist', 'dispatcher', 'manager', 'mechanic', 'medic',
    'repair_service', 'driver', 'accountant', 'admin', 'client',
]);
exports.orderStatusEnum = (0, pg_core_1.pgEnum)('order_status', [
    'draft', 'confirmed', 'assigned', 'in_transit', 'delivered', 'returned', 'cancelled',
]);
exports.tripStatusEnum = (0, pg_core_1.pgEnum)('trip_status', [
    'planning', 'assigned', 'inspection', 'waybill_issued',
    'loading', 'in_transit', 'completed', 'billed', 'cancelled',
]);
exports.vehicleStatusEnum = (0, pg_core_1.pgEnum)('vehicle_status', [
    'available', 'assigned', 'in_trip', 'maintenance', 'broken', 'blocked',
]);
exports.repairStatusEnum = (0, pg_core_1.pgEnum)('repair_status', [
    'created', 'waiting_parts', 'in_progress', 'done',
]);
exports.fineStatusEnum = (0, pg_core_1.pgEnum)('fine_status', [
    'new', 'confirmed', 'paid', 'appealed',
]);
exports.waybillStatusEnum = (0, pg_core_1.pgEnum)('waybill_status', [
    'formed', 'open', 'closed',
]);
exports.inspectionDecisionEnum = (0, pg_core_1.pgEnum)('inspection_decision', [
    'approved', 'rejected',
]);
exports.routePointTypeEnum = (0, pg_core_1.pgEnum)('route_point_type', [
    'loading', 'unloading',
]);
exports.routePointStatusEnum = (0, pg_core_1.pgEnum)('route_point_status', [
    'pending', 'arrived', 'completed', 'skipped',
]);
exports.tariffTypeEnum = (0, pg_core_1.pgEnum)('tariff_type', [
    'per_km', 'per_ton', 'per_hour', 'fixed_route', 'combined',
]);
exports.invoiceStatusEnum = (0, pg_core_1.pgEnum)('invoice_status', [
    'draft', 'sent', 'paid', 'overdue', 'cancelled',
]);
exports.restrictionZoneTypeEnum = (0, pg_core_1.pgEnum)('restriction_zone_type', [
    'mkad', 'ttk', 'city',
]);
exports.repairPriorityEnum = (0, pg_core_1.pgEnum)('repair_priority', [
    'low', 'medium', 'high', 'critical',
]);
exports.repairSourceEnum = (0, pg_core_1.pgEnum)('repair_source', [
    'auto_inspection', 'driver', 'mechanic', 'scheduled',
]);
// ================================================================
// Users
// ================================================================
exports.users = (0, pg_core_1.pgTable)('users', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    email: (0, pg_core_1.varchar)('email', { length: 255 }).notNull().unique(),
    passwordHash: (0, pg_core_1.text)('password_hash').notNull(),
    fullName: (0, pg_core_1.varchar)('full_name', { length: 255 }).notNull(),
    phone: (0, pg_core_1.varchar)('phone', { length: 20 }),
    roles: (0, pg_core_1.jsonb)('roles').$type().notNull().default([]),
    isActive: (0, pg_core_1.boolean)('is_active').notNull().default(true),
    // Client RLS: link client users to their contractor
    contractorId: (0, pg_core_1.uuid)('contractor_id').references(function () { return exports.contractors.id; }),
    // Multitenancy (Sprint 6): isolate data by organization
    organizationId: (0, pg_core_1.uuid)('organization_id'),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, function (table) { return [
    (0, pg_core_1.index)('idx_users_email').on(table.email),
    (0, pg_core_1.index)('idx_users_contractor').on(table.contractorId),
]; });
// ================================================================
// Contractors (Контрагенты)
// ================================================================
exports.contractors = (0, pg_core_1.pgTable)('contractors', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    name: (0, pg_core_1.varchar)('name', { length: 500 }).notNull(),
    inn: (0, pg_core_1.varchar)('inn', { length: 12 }).notNull(),
    kpp: (0, pg_core_1.varchar)('kpp', { length: 9 }),
    legalAddress: (0, pg_core_1.text)('legal_address').notNull(),
    phone: (0, pg_core_1.varchar)('phone', { length: 20 }),
    email: (0, pg_core_1.varchar)('email', { length: 255 }),
    isArchived: (0, pg_core_1.boolean)('is_archived').notNull().default(false),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, function (table) { return [
    (0, pg_core_1.uniqueIndex)('idx_contractors_inn').on(table.inn),
]; });
// ================================================================
// Contracts & Tariffs (Договоры / Тарифы)
// ================================================================
exports.contracts = (0, pg_core_1.pgTable)('contracts', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    contractorId: (0, pg_core_1.uuid)('contractor_id').notNull().references(function () { return exports.contractors.id; }),
    number: (0, pg_core_1.varchar)('number', { length: 100 }).notNull(),
    startDate: (0, pg_core_1.timestamp)('start_date', { withTimezone: true }).notNull(),
    endDate: (0, pg_core_1.timestamp)('end_date', { withTimezone: true }),
    isActive: (0, pg_core_1.boolean)('is_active').notNull().default(true),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
}, function (table) { return [
    (0, pg_core_1.index)('idx_contracts_contractor').on(table.contractorId),
]; });
exports.tariffs = (0, pg_core_1.pgTable)('tariffs', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    contractId: (0, pg_core_1.uuid)('contract_id').notNull().references(function () { return exports.contracts.id; }),
    type: (0, exports.tariffTypeEnum)('type').notNull(),
    ratePerKm: (0, pg_core_1.real)('rate_per_km'),
    ratePerTon: (0, pg_core_1.real)('rate_per_ton'),
    ratePerHour: (0, pg_core_1.real)('rate_per_hour'),
    fixedRate: (0, pg_core_1.real)('fixed_rate'),
    combinedFixedRate: (0, pg_core_1.real)('combined_fixed_rate'),
    combinedKmThreshold: (0, pg_core_1.real)('combined_km_threshold'),
    combinedRatePerKm: (0, pg_core_1.real)('combined_rate_per_km'),
    // Модификаторы
    idleFreeLimitMinutes: (0, pg_core_1.integer)('idle_free_limit_minutes').notNull().default(120),
    idleRatePerHour: (0, pg_core_1.real)('idle_rate_per_hour').notNull().default(0),
    extraPointRate: (0, pg_core_1.real)('extra_point_rate').notNull().default(0),
    nightCoefficient: (0, pg_core_1.real)('night_coefficient').notNull().default(1),
    urgentCoefficient: (0, pg_core_1.real)('urgent_coefficient').notNull().default(1),
    returnPercentage: (0, pg_core_1.real)('return_percentage').notNull().default(100),
    cancellationFee: (0, pg_core_1.real)('cancellation_fee').notNull().default(0),
    weekendCoefficient: (0, pg_core_1.real)('weekend_coefficient').notNull().default(1),
    vatIncluded: (0, pg_core_1.boolean)('vat_included').notNull().default(true),
    vatRate: (0, pg_core_1.real)('vat_rate').notNull().default(20),
    minTripCost: (0, pg_core_1.real)('min_trip_cost').notNull().default(0),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
}, function (table) { return [
    (0, pg_core_1.index)('idx_tariffs_contract').on(table.contractId),
]; });
// ================================================================
// Vehicles (ТС)
// ================================================================
exports.vehicles = (0, pg_core_1.pgTable)('vehicles', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    plateNumber: (0, pg_core_1.varchar)('plate_number', { length: 15 }).notNull().unique(),
    vin: (0, pg_core_1.varchar)('vin', { length: 17 }).notNull().unique(),
    make: (0, pg_core_1.varchar)('make', { length: 100 }).notNull(),
    model: (0, pg_core_1.varchar)('model', { length: 100 }).notNull(),
    year: (0, pg_core_1.integer)('year').notNull(),
    bodyType: (0, pg_core_1.varchar)('body_type', { length: 100 }).notNull(),
    payloadCapacityKg: (0, pg_core_1.real)('payload_capacity_kg').notNull(),
    payloadVolumeM3: (0, pg_core_1.real)('payload_volume_m3'),
    status: (0, exports.vehicleStatusEnum)('status').notNull().default('available'),
    currentOdometerKm: (0, pg_core_1.real)('current_odometer_km').notNull().default(0),
    fuelTankLiters: (0, pg_core_1.real)('fuel_tank_liters'),
    fuelNormPer100Km: (0, pg_core_1.real)('fuel_norm_per_100km'),
    // Сроки документов
    techInspectionExpiry: (0, pg_core_1.timestamp)('tech_inspection_expiry', { withTimezone: true }),
    osagoExpiry: (0, pg_core_1.timestamp)('osago_expiry', { withTimezone: true }),
    maintenanceNextDate: (0, pg_core_1.timestamp)('maintenance_next_date', { withTimezone: true }),
    maintenanceNextKm: (0, pg_core_1.real)('maintenance_next_km'),
    tachographCalibrationExpiry: (0, pg_core_1.timestamp)('tachograph_calibration_expiry', { withTimezone: true }),
    isArchived: (0, pg_core_1.boolean)('is_archived').notNull().default(false),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, function (table) { return [
    (0, pg_core_1.uniqueIndex)('idx_vehicles_plate').on(table.plateNumber),
    (0, pg_core_1.uniqueIndex)('idx_vehicles_vin').on(table.vin),
    (0, pg_core_1.index)('idx_vehicles_status').on(table.status),
]; });
// ================================================================
// Drivers (Водители)
// ================================================================
exports.drivers = (0, pg_core_1.pgTable)('drivers', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    userId: (0, pg_core_1.uuid)('user_id').notNull().references(function () { return exports.users.id; }),
    fullName: (0, pg_core_1.varchar)('full_name', { length: 255 }).notNull(),
    birthDate: (0, pg_core_1.timestamp)('birth_date', { withTimezone: true }).notNull(),
    licenseNumber: (0, pg_core_1.varchar)('license_number', { length: 20 }).notNull(),
    licenseCategories: (0, pg_core_1.jsonb)('license_categories').$type().notNull().default([]),
    licenseExpiry: (0, pg_core_1.timestamp)('license_expiry', { withTimezone: true }).notNull(),
    medCertificateExpiry: (0, pg_core_1.timestamp)('med_certificate_expiry', { withTimezone: true }),
    personalDataConsent: (0, pg_core_1.boolean)('personal_data_consent').notNull().default(false),
    personalDataConsentDate: (0, pg_core_1.timestamp)('personal_data_consent_date', { withTimezone: true }),
    isActive: (0, pg_core_1.boolean)('is_active').notNull().default(true),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, function (table) { return [
    (0, pg_core_1.index)('idx_drivers_user').on(table.userId),
]; });
// ================================================================
// Orders (Заявки)
// ================================================================
exports.orders = (0, pg_core_1.pgTable)('orders', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    number: (0, pg_core_1.varchar)('number', { length: 50 }).notNull().unique(),
    contractorId: (0, pg_core_1.uuid)('contractor_id').notNull().references(function () { return exports.contractors.id; }),
    contractId: (0, pg_core_1.uuid)('contract_id').references(function () { return exports.contracts.id; }),
    status: (0, exports.orderStatusEnum)('status').notNull().default('draft'),
    // Груз
    cargoDescription: (0, pg_core_1.text)('cargo_description').notNull(),
    cargoWeightKg: (0, pg_core_1.real)('cargo_weight_kg').notNull(),
    cargoVolumeM3: (0, pg_core_1.real)('cargo_volume_m3'),
    cargoPlaces: (0, pg_core_1.integer)('cargo_places'),
    cargoType: (0, pg_core_1.varchar)('cargo_type', { length: 100 }),
    // Адреса
    loadingAddress: (0, pg_core_1.text)('loading_address').notNull(),
    loadingLat: (0, pg_core_1.real)('loading_lat'),
    loadingLon: (0, pg_core_1.real)('loading_lon'),
    loadingWindowStart: (0, pg_core_1.timestamp)('loading_window_start', { withTimezone: true }),
    loadingWindowEnd: (0, pg_core_1.timestamp)('loading_window_end', { withTimezone: true }),
    unloadingAddress: (0, pg_core_1.text)('unloading_address').notNull(),
    unloadingLat: (0, pg_core_1.real)('unloading_lat'),
    unloadingLon: (0, pg_core_1.real)('unloading_lon'),
    unloadingWindowStart: (0, pg_core_1.timestamp)('unloading_window_start', { withTimezone: true }),
    unloadingWindowEnd: (0, pg_core_1.timestamp)('unloading_window_end', { withTimezone: true }),
    // Требования
    vehicleRequirements: (0, pg_core_1.text)('vehicle_requirements'),
    notes: (0, pg_core_1.text)('notes'),
    tripId: (0, pg_core_1.uuid)('trip_id'),
    createdBy: (0, pg_core_1.uuid)('created_by').notNull().references(function () { return exports.users.id; }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, function (table) { return [
    (0, pg_core_1.uniqueIndex)('idx_orders_number').on(table.number),
    (0, pg_core_1.index)('idx_orders_status').on(table.status),
    (0, pg_core_1.index)('idx_orders_contractor').on(table.contractorId),
    (0, pg_core_1.index)('idx_orders_trip').on(table.tripId),
]; });
// ================================================================
// Trips (Рейсы)
// ================================================================
exports.trips = (0, pg_core_1.pgTable)('trips', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    number: (0, pg_core_1.varchar)('number', { length: 50 }).notNull().unique(),
    status: (0, exports.tripStatusEnum)('status').notNull().default('planning'),
    vehicleId: (0, pg_core_1.uuid)('vehicle_id').references(function () { return exports.vehicles.id; }),
    driverId: (0, pg_core_1.uuid)('driver_id').references(function () { return exports.drivers.id; }),
    waybillId: (0, pg_core_1.uuid)('waybill_id'),
    plannedDistanceKm: (0, pg_core_1.real)('planned_distance_km'),
    actualDistanceKm: (0, pg_core_1.real)('actual_distance_km'),
    plannedDepartureAt: (0, pg_core_1.timestamp)('planned_departure_at', { withTimezone: true }),
    actualDepartureAt: (0, pg_core_1.timestamp)('actual_departure_at', { withTimezone: true }),
    actualCompletionAt: (0, pg_core_1.timestamp)('actual_completion_at', { withTimezone: true }),
    odometerStart: (0, pg_core_1.real)('odometer_start'),
    odometerEnd: (0, pg_core_1.real)('odometer_end'),
    fuelStart: (0, pg_core_1.real)('fuel_start'),
    fuelEnd: (0, pg_core_1.real)('fuel_end'),
    notes: (0, pg_core_1.text)('notes'),
    createdBy: (0, pg_core_1.uuid)('created_by').notNull().references(function () { return exports.users.id; }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, function (table) { return [
    (0, pg_core_1.uniqueIndex)('idx_trips_number').on(table.number),
    (0, pg_core_1.index)('idx_trips_status').on(table.status),
    (0, pg_core_1.index)('idx_trips_vehicle').on(table.vehicleId),
    (0, pg_core_1.index)('idx_trips_driver').on(table.driverId),
]; });
// ================================================================
// Route Points (Точки маршрута)
// ================================================================
exports.routePoints = (0, pg_core_1.pgTable)('route_points', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    tripId: (0, pg_core_1.uuid)('trip_id').notNull().references(function () { return exports.trips.id; }),
    orderId: (0, pg_core_1.uuid)('order_id').references(function () { return exports.orders.id; }),
    type: (0, exports.routePointTypeEnum)('type').notNull(),
    status: (0, exports.routePointStatusEnum)('status').notNull().default('pending'),
    sequenceNumber: (0, pg_core_1.integer)('sequence_number').notNull(),
    address: (0, pg_core_1.text)('address').notNull(),
    lat: (0, pg_core_1.real)('lat'),
    lon: (0, pg_core_1.real)('lon'),
    windowStart: (0, pg_core_1.timestamp)('window_start', { withTimezone: true }),
    windowEnd: (0, pg_core_1.timestamp)('window_end', { withTimezone: true }),
    arrivedAt: (0, pg_core_1.timestamp)('arrived_at', { withTimezone: true }),
    completedAt: (0, pg_core_1.timestamp)('completed_at', { withTimezone: true }),
    signatureUrl: (0, pg_core_1.text)('signature_url'),
    photoUrls: (0, pg_core_1.jsonb)('photo_urls').$type().default([]),
    notes: (0, pg_core_1.text)('notes'),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
}, function (table) { return [
    (0, pg_core_1.index)('idx_route_points_trip').on(table.tripId),
]; });
// ================================================================
// Tech Inspections (Акты техосмотра)
// ================================================================
exports.techInspections = (0, pg_core_1.pgTable)('tech_inspections', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    vehicleId: (0, pg_core_1.uuid)('vehicle_id').notNull().references(function () { return exports.vehicles.id; }),
    mechanicId: (0, pg_core_1.uuid)('mechanic_id').notNull().references(function () { return exports.users.id; }),
    tripId: (0, pg_core_1.uuid)('trip_id').references(function () { return exports.trips.id; }),
    checklistVersion: (0, pg_core_1.varchar)('checklist_version', { length: 20 }).notNull(),
    items: (0, pg_core_1.jsonb)('items').$type().notNull(),
    decision: (0, exports.inspectionDecisionEnum)('decision').notNull(),
    comment: (0, pg_core_1.text)('comment'),
    signature: (0, pg_core_1.text)('signature').notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
}, function (table) { return [
    (0, pg_core_1.index)('idx_tech_inspections_vehicle').on(table.vehicleId),
    (0, pg_core_1.index)('idx_tech_inspections_trip').on(table.tripId),
]; });
// ================================================================
// Med Inspections (Акты медосмотра — 152-ФЗ)
// ================================================================
exports.medInspections = (0, pg_core_1.pgTable)('med_inspections', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    driverId: (0, pg_core_1.uuid)('driver_id').notNull().references(function () { return exports.drivers.id; }),
    medicId: (0, pg_core_1.uuid)('medic_id').notNull().references(function () { return exports.users.id; }),
    tripId: (0, pg_core_1.uuid)('trip_id').references(function () { return exports.trips.id; }),
    checklistVersion: (0, pg_core_1.varchar)('checklist_version', { length: 20 }).notNull(),
    // Медданные (в production шифровать pgcrypto)
    systolicBp: (0, pg_core_1.integer)('systolic_bp').notNull(),
    diastolicBp: (0, pg_core_1.integer)('diastolic_bp').notNull(),
    heartRate: (0, pg_core_1.integer)('heart_rate').notNull(),
    temperature: (0, pg_core_1.real)('temperature').notNull(),
    condition: (0, pg_core_1.text)('condition').notNull(),
    alcoholTest: (0, pg_core_1.varchar)('alcohol_test', { length: 10 }).notNull(),
    complaints: (0, pg_core_1.text)('complaints'),
    decision: (0, exports.inspectionDecisionEnum)('decision').notNull(),
    comment: (0, pg_core_1.text)('comment'),
    signature: (0, pg_core_1.text)('signature').notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
}, function (table) { return [
    (0, pg_core_1.index)('idx_med_inspections_driver').on(table.driverId),
    (0, pg_core_1.index)('idx_med_inspections_trip').on(table.tripId),
]; });
// ================================================================
// Waybills (Путевые листы)
// ================================================================
exports.waybills = (0, pg_core_1.pgTable)('waybills', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    number: (0, pg_core_1.varchar)('number', { length: 50 }).notNull().unique(),
    tripId: (0, pg_core_1.uuid)('trip_id').notNull().references(function () { return exports.trips.id; }),
    vehicleId: (0, pg_core_1.uuid)('vehicle_id').notNull().references(function () { return exports.vehicles.id; }),
    driverId: (0, pg_core_1.uuid)('driver_id').notNull().references(function () { return exports.drivers.id; }),
    status: (0, exports.waybillStatusEnum)('status').notNull().default('formed'),
    techInspectionId: (0, pg_core_1.uuid)('tech_inspection_id').notNull().references(function () { return exports.techInspections.id; }),
    medInspectionId: (0, pg_core_1.uuid)('med_inspection_id').notNull().references(function () { return exports.medInspections.id; }),
    mechanicSignature: (0, pg_core_1.text)('mechanic_signature'),
    medicSignature: (0, pg_core_1.text)('medic_signature'),
    odometerOut: (0, pg_core_1.real)('odometer_out').notNull(),
    odometerIn: (0, pg_core_1.real)('odometer_in'),
    fuelOut: (0, pg_core_1.real)('fuel_out'),
    fuelIn: (0, pg_core_1.real)('fuel_in'),
    departureAt: (0, pg_core_1.timestamp)('departure_at', { withTimezone: true }).notNull(),
    returnAt: (0, pg_core_1.timestamp)('return_at', { withTimezone: true }),
    issuedAt: (0, pg_core_1.timestamp)('issued_at', { withTimezone: true }).notNull().defaultNow(),
    closedAt: (0, pg_core_1.timestamp)('closed_at', { withTimezone: true }),
}, function (table) { return [
    (0, pg_core_1.uniqueIndex)('idx_waybills_number').on(table.number),
    (0, pg_core_1.index)('idx_waybills_trip').on(table.tripId),
]; });
// ================================================================
// Repair Requests (Заявки на ремонт)
// ================================================================
exports.repairRequests = (0, pg_core_1.pgTable)('repair_requests', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    vehicleId: (0, pg_core_1.uuid)('vehicle_id').notNull().references(function () { return exports.vehicles.id; }),
    status: (0, exports.repairStatusEnum)('status').notNull().default('created'),
    description: (0, pg_core_1.text)('description').notNull(),
    priority: (0, exports.repairPriorityEnum)('priority').notNull(),
    source: (0, exports.repairSourceEnum)('source').notNull(),
    inspectionId: (0, pg_core_1.uuid)('inspection_id'),
    assignedTo: (0, pg_core_1.varchar)('assigned_to', { length: 255 }),
    workDescription: (0, pg_core_1.text)('work_description'),
    partsUsed: (0, pg_core_1.jsonb)('parts_used').$type().default([]),
    totalCost: (0, pg_core_1.real)('total_cost').notNull().default(0),
    odometerAtRepair: (0, pg_core_1.real)('odometer_at_repair'),
    photoUrls: (0, pg_core_1.jsonb)('photo_urls').$type().default([]),
    completedAt: (0, pg_core_1.timestamp)('completed_at', { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, function (table) { return [
    (0, pg_core_1.index)('idx_repairs_vehicle').on(table.vehicleId),
    (0, pg_core_1.index)('idx_repairs_status').on(table.status),
]; });
// ================================================================
// Permits (Пропуска)
// ================================================================
exports.permits = (0, pg_core_1.pgTable)('permits', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    vehicleId: (0, pg_core_1.uuid)('vehicle_id').notNull().references(function () { return exports.vehicles.id; }),
    zoneType: (0, exports.restrictionZoneTypeEnum)('zone_type').notNull(),
    zoneName: (0, pg_core_1.varchar)('zone_name', { length: 255 }).notNull(),
    permitNumber: (0, pg_core_1.varchar)('permit_number', { length: 100 }).notNull(),
    validFrom: (0, pg_core_1.timestamp)('valid_from', { withTimezone: true }).notNull(),
    validUntil: (0, pg_core_1.timestamp)('valid_until', { withTimezone: true }).notNull(),
    isActive: (0, pg_core_1.boolean)('is_active').notNull().default(true),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
}, function (table) { return [
    (0, pg_core_1.index)('idx_permits_vehicle').on(table.vehicleId),
]; });
// ================================================================
// Fines (Штрафы ГИБДД)
// ================================================================
exports.fines = (0, pg_core_1.pgTable)('fines', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    vehicleId: (0, pg_core_1.uuid)('vehicle_id').notNull().references(function () { return exports.vehicles.id; }),
    driverId: (0, pg_core_1.uuid)('driver_id').references(function () { return exports.drivers.id; }),
    status: (0, exports.fineStatusEnum)('status').notNull().default('new'),
    violationDate: (0, pg_core_1.timestamp)('violation_date', { withTimezone: true }).notNull(),
    violationType: (0, pg_core_1.varchar)('violation_type', { length: 255 }).notNull(),
    amount: (0, pg_core_1.real)('amount').notNull(),
    resolutionNumber: (0, pg_core_1.varchar)('resolution_number', { length: 100 }),
    paidAt: (0, pg_core_1.timestamp)('paid_at', { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, function (table) { return [
    (0, pg_core_1.index)('idx_fines_vehicle').on(table.vehicleId),
    (0, pg_core_1.index)('idx_fines_driver').on(table.driverId),
]; });
// ================================================================
// Invoices (Счета / Акты)
// ================================================================
exports.invoices = (0, pg_core_1.pgTable)('invoices', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    number: (0, pg_core_1.varchar)('number', { length: 50 }).notNull().unique(),
    contractorId: (0, pg_core_1.uuid)('contractor_id').notNull().references(function () { return exports.contractors.id; }),
    contractId: (0, pg_core_1.uuid)('contract_id').references(function () { return exports.contracts.id; }),
    type: (0, pg_core_1.varchar)('type', { length: 20 }).notNull(), // invoice, act, upd
    status: (0, exports.invoiceStatusEnum)('status').notNull().default('draft'),
    tripIds: (0, pg_core_1.jsonb)('trip_ids').$type().notNull().default([]),
    subtotal: (0, pg_core_1.real)('subtotal').notNull(),
    vatAmount: (0, pg_core_1.real)('vat_amount').notNull(),
    total: (0, pg_core_1.real)('total').notNull(),
    periodStart: (0, pg_core_1.timestamp)('period_start', { withTimezone: true }).notNull(),
    periodEnd: (0, pg_core_1.timestamp)('period_end', { withTimezone: true }).notNull(),
    paidAt: (0, pg_core_1.timestamp)('paid_at', { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
}, function (table) { return [
    (0, pg_core_1.uniqueIndex)('idx_invoices_number').on(table.number),
    (0, pg_core_1.index)('idx_invoices_contractor').on(table.contractorId),
]; });
// ================================================================
// Tachograph Records (РТО)
// ================================================================
exports.tachographRecords = (0, pg_core_1.pgTable)('tachograph_records', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    driverId: (0, pg_core_1.uuid)('driver_id').notNull().references(function () { return exports.drivers.id; }),
    date: (0, pg_core_1.timestamp)('date', { withTimezone: true }).notNull(),
    drivingMinutes: (0, pg_core_1.integer)('driving_minutes').notNull(),
    restMinutes: (0, pg_core_1.integer)('rest_minutes').notNull(),
    continuousDrivingMinutes: (0, pg_core_1.integer)('continuous_driving_minutes').notNull(),
    weeklyRestMinutes: (0, pg_core_1.integer)('weekly_rest_minutes'),
    source: (0, pg_core_1.varchar)('source', { length: 50 }).notNull().default('manual'),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
}, function (table) { return [
    (0, pg_core_1.index)('idx_tachograph_driver').on(table.driverId),
    (0, pg_core_1.index)('idx_tachograph_date').on(table.date),
]; });
// ================================================================
// Restriction Zones (Зоны ограничений)
// ================================================================
exports.restrictionZones = (0, pg_core_1.pgTable)('restriction_zones', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    name: (0, pg_core_1.varchar)('name', { length: 255 }).notNull(),
    type: (0, exports.restrictionZoneTypeEnum)('type').notNull(),
    geoJson: (0, pg_core_1.jsonb)('geo_json').notNull(),
    isActive: (0, pg_core_1.boolean)('is_active').notNull().default(true),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
});
// ================================================================
// Checklist Templates (Шаблоны чек-листов)
// ================================================================
exports.checklistTemplates = (0, pg_core_1.pgTable)('checklist_templates', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    type: (0, pg_core_1.varchar)('type', { length: 10 }).notNull(), // tech, med
    version: (0, pg_core_1.varchar)('version', { length: 20 }).notNull(),
    name: (0, pg_core_1.varchar)('name', { length: 255 }).notNull(),
    items: (0, pg_core_1.jsonb)('items').$type().notNull(),
    isActive: (0, pg_core_1.boolean)('is_active').notNull().default(true),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
});
// ================================================================
// Addresses (Адреса)
// ================================================================
exports.addresses = (0, pg_core_1.pgTable)('addresses', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    addressString: (0, pg_core_1.text)('address_string').notNull(),
    lat: (0, pg_core_1.real)('lat').notNull(),
    lon: (0, pg_core_1.real)('lon').notNull(),
    type: (0, exports.routePointTypeEnum)('type').notNull(),
    contractorId: (0, pg_core_1.uuid)('contractor_id').references(function () { return exports.contractors.id; }),
    fiasId: (0, pg_core_1.varchar)('fias_id', { length: 50 }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
}, function (table) { return [
    (0, pg_core_1.index)('idx_addresses_contractor').on(table.contractorId),
]; });
// ================================================================
// EVENT JOURNAL — Append-only (Приложение Б)
// Запрет UPDATE/DELETE будет через SQL-триггер в миграции
// ================================================================
exports.events = (0, pg_core_1.pgTable)('events', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    timestamp: (0, pg_core_1.timestamp)('timestamp', { withTimezone: true }).notNull().defaultNow(),
    authorId: (0, pg_core_1.uuid)('author_id').notNull().references(function () { return exports.users.id; }),
    authorRole: (0, pg_core_1.varchar)('author_role', { length: 30 }).notNull(),
    eventType: (0, pg_core_1.varchar)('event_type', { length: 100 }).notNull(),
    entityType: (0, pg_core_1.varchar)('entity_type', { length: 50 }).notNull(),
    entityId: (0, pg_core_1.uuid)('entity_id').notNull(),
    data: (0, pg_core_1.jsonb)('data').notNull().default({}),
    version: (0, pg_core_1.integer)('version').notNull().default(1),
    conflict: (0, pg_core_1.boolean)('conflict').notNull().default(false),
    offlineCreatedAt: (0, pg_core_1.timestamp)('offline_created_at', { withTimezone: true }),
}, function (table) { return [
    (0, pg_core_1.index)('idx_events_entity').on(table.entityType, table.entityId),
    (0, pg_core_1.index)('idx_events_type').on(table.eventType),
    (0, pg_core_1.index)('idx_events_timestamp').on(table.timestamp),
    (0, pg_core_1.index)('idx_events_author').on(table.authorId),
]; });
// ================================================================
// Med Access Audit Log (§А.2 — 152-ФЗ)
// ================================================================
exports.medAccessLog = (0, pg_core_1.pgTable)('med_access_log', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    userId: (0, pg_core_1.uuid)('user_id').notNull().references(function () { return exports.users.id; }),
    targetDriverId: (0, pg_core_1.uuid)('target_driver_id').notNull().references(function () { return exports.drivers.id; }),
    action: (0, pg_core_1.varchar)('action', { length: 50 }).notNull(),
    accessedAt: (0, pg_core_1.timestamp)('accessed_at', { withTimezone: true }).notNull().defaultNow(),
    ipAddress: (0, pg_core_1.varchar)('ip_address', { length: 45 }),
});
