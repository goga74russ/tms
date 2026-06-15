// ============================================================
// TMS — PostgreSQL Schema (Drizzle ORM)
// Полная схема БД по §4.1 ТЗ + append-only event journal
// ============================================================
import {
    pgTable, uuid, text, varchar, integer, boolean,
    timestamp, jsonb, index, uniqueIndex, pgEnum, serial,
    numeric, doublePrecision,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

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
    'planning', 'assigned', 'waybill_draft', 'inspection', 'waybill_issued',
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
    'pre_trip', 'periodic', 'post_trip',
]);

export const routePointTypeEnum = pgEnum('route_point_type', [
    'loading', 'unloading',
]);

export const routePointStatusEnum = pgEnum('route_point_status', [
    'pending', 'arrived', 'completed', 'skipped',
]);

export const shipmentLotStatusEnum = pgEnum('shipment_lot_status', [
    'planned', 'assigned', 'loading', 'in_transit', 'delivered', 'partially_delivered', 'returned', 'cancelled',
]);

export const tripLotAssignmentStatusEnum = pgEnum('trip_lot_assignment_status', [
    'planned', 'loaded', 'in_transit', 'delivered', 'short', 'damaged', 'returned', 'cancelled',
]);

// L1 (Этап 1.1 + Carriers-0, миграция 0035) — режим выполнения рейса.
// 'own' = свой парк (учёт через own_cost_estimate), 'subcontract' = наёмный
// (учёт через subcontractor_cost). Поля cost взаимоисключающие (XOR-CHECK).
export const tripExecutionModeEnum = pgEnum('trip_execution_mode', ['own', 'subcontract']);

export const shipmentFactTypeEnum = pgEnum('shipment_fact_type', [
    'loading', 'unloading', 'return', 'correction', 'discrepancy',
]);

export const shipmentDiscrepancyCodeEnum = pgEnum('shipment_discrepancy_code', [
    'shortage', 'overage', 'damage', 'refusal', 'wrong_docs', 'other',
]);

export const documentDossierScopeEnum = pgEnum('document_dossier_scope', [
    'order', 'trip', 'shipment_lot', 'trip_lot_assignment',
]);

export const documentDossierStatusEnum = pgEnum('document_dossier_status', [
    'missing', 'draft', 'sent', 'signed', 'received', 'accepted', 'rejected', 'exceptioned',
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

// Sprint 13 — Delivery Confirmation
export const confirmationModeEnum = pgEnum('confirmation_mode', [
    'none', 'optional', 'required',
]);

export const cargoConditionEnum = pgEnum('cargo_condition', [
    'intact', 'damaged', 'partial',
]);

export const forcedReasonEnum = pgEnum('forced_reason', [
    'no_mobile', 'recipient_refused', 'no_internet', 'other',
]);

export const tariffTypeEnum = pgEnum('tariff_type', [
    'per_km', 'per_ton', 'per_hour', 'fixed_route', 'combined',
]);

// M (Этап 3, миграция 0036) — обновлённый FSM per invoice-spec.md §2.
// Старый enum ('draft','sent','paid','overdue','cancelled') заменён через
// ALTER TABLE USING с маппингом: sent→issued, paid→paid_full, overdue→issued.
export const invoiceStatusEnum = pgEnum('invoice_status', [
    'draft',
    'issued',
    'paid_partial',
    'paid_full',
    'cancelled',
    'corrected',
]);

// M — invoice_type enum (spec §1).
export const invoiceTypeEnum = pgEnum('invoice_type', [
    'payment',
    'advance',
    'sf',
    'upd',
    'corrective_sf',
    'corrective_upd',
    'act',
]);

// M — correction_kind enum (spec §5): adjustment = КСФ, replacement = ИСФ.
export const invoiceCorrectionKindEnum = pgEnum('invoice_correction_kind', [
    'adjustment',
    'replacement',
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

// Deep Fleet Operations enums
export const fuelTypeEnum = pgEnum('fuel_type', ['diesel', 'petrol', 'gas', 'adblue']);
export const odometerSourceEnum = pgEnum('odometer_source', ['manual', 'gps', 'waybill', 'inspection']);
export const downtimeReasonEnum = pgEnum('downtime_reason', ['repair', 'waiting_load', 'waiting_docs', 'driver_absence', 'weather', 'other']);
export const maintenanceTypeEnum = pgEnum('maintenance_type', ['to1', 'to2', 'to3', 'seasonal', 'other']);
export const maintenanceStatusEnum = pgEnum('maintenance_status', ['planned', 'overdue', 'done', 'cancelled']);

// ================================================================
// Organizations (Multitenancy — Sprint 14)
// ================================================================
// J1 — налоговый режим (Jurist Этап 1, миграция 0033).
// 'unspecified' — обязательный default до явного выбора режима. Любая
// бизнес-логика выпуска счетов проверяет tax_regime !== 'unspecified'.
// 'usn_with_vat' — новая категория с 244-ФЗ от 12.07.2024 (УСН >60M ₽ с НДС).
export const taxRegimeEnum = pgEnum('tax_regime', [
    'osno',
    'usn_income',
    'usn_income_expense',
    'usn_with_vat',
    'ausn',
    'patent',
    'npd',
    'unspecified',
]);

export const organizations = pgTable('organizations', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 500 }).notNull(),
    inn: varchar('inn', { length: 12 }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // Round 1B — onboarding wizard state. See `// === ONBOARDING (Round 1B) ===`.
    onboardingStep: integer('onboarding_step').notNull().default(0),
    onboardingCompletedAt: timestamp('onboarding_completed_at', { withTimezone: true }),
    onboardingScenario: text('onboarding_scenario'),
    kpp: text('kpp'),
    ogrn: text('ogrn'),
    legalAddress: text('legal_address'),
    bankBik: text('bank_bik'),
    bankAccount: text('bank_account'),
    // ③ (legal-register §2.F1, миграция 0048) — наименование банка и корр.счёт
    // для банковского блока счёта на оплату. Без них server invoice-PDF брал
    // реквизиты из хардкода ИП Бардина (денежная мина). Теперь — из профиля орг.
    bankName: text('bank_name'),
    corrAccount: text('corr_account'),
    // Round 2A: when true, ADR validation failures block trip assignment.
    adrStrictMode: boolean('adr_strict_mode').notNull().default(false),
    // J1 (Jurist Этап 1, миграция 0033) — налоговый режим. От него зависит логика
    // НДС и выпуска СФ. 'unspecified' блокирует выпуск счетов до явного выбора.
    taxRegime: taxRegimeEnum('tax_regime').notNull().default('unspecified'),
    // L1 (Этап 1.1, миграция 0035) — ставка НДС для usn_with_vat (244-ФЗ 2024).
    // Допустимые значения 5/7/20 (CHECK на уровне БД). NULL для прочих режимов.
    usnVatRate: numeric('usn_vat_rate', { precision: 4, scale: 2 }).$type<number>(),
});

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
    // E6 (JWT revocation): монотонный счётчик версии токенов. Кладётся в JWT при
    // логине; authenticate сверяет с БД и отвергает токены со старой версией.
    // Бампится при деактивации/смене пароля/ролей → старые токены мгновенно мертвы.
    tokenVersion: integer('token_version').notNull().default(0),
    // Client RLS: link client users to their contractor
    contractorId: uuid('contractor_id').references(() => contractors.id),
    // Multitenancy (Sprint 14): isolate data by organization
    organizationId: uuid('organization_id').references(() => organizations.id),
    // Round 1B — set when the user verifies their email via 6-digit code.
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
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
    // Wave 4: контрагент может выступать как перевозчик-субподрядчик.
    isCarrier: boolean('is_carrier').notNull().default(false),
    // Multitenancy (Sprint 14)
    organizationId: uuid('organization_id').references(() => organizations.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    // C4 (миг.0041): per-org уникальность ИНН (был глобальный idx_contractors_inn).
    uniqueIndex('idx_contractors_org_inn').on(table.organizationId, table.inn),
    index('idx_contractors_is_carrier').on(table.isCarrier),
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
    // C4 (миг.0041): уникальность plate/vin теперь per-org (composite index ниже),
    // не глобальная — убран inline .unique() (был vehicles_plate_number_unique/_vin_unique).
    plateNumber: varchar('plate_number', { length: 15 }).notNull(),
    vin: varchar('vin', { length: 17 }).notNull(),
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
    // ⑥ (Приказ Минтранса №390, миграция 0049) — обязательные реквизиты ОСАГО и
    // диагностической карты для путевого листа (серия/номер + срок).
    osagoNumber: varchar('osago_number', { length: 50 }),
    diagnosticCardNumber: varchar('diagnostic_card_number', { length: 50 }),
    diagnosticCardExpiry: timestamp('diagnostic_card_expiry', { withTimezone: true }),
    maintenanceNextDate: timestamp('maintenance_next_date', { withTimezone: true }),
    maintenanceNextKm: doublePrecision('maintenance_next_km'),
    tachographCalibrationExpiry: timestamp('tachograph_calibration_expiry', { withTimezone: true }),
    // Sprint 9: Топливная карта, транспондер, гидроборт
    fuelCardNumber: varchar('fuel_card_number', { length: 50 }),
    transponderNumber: varchar('transponder_number', { length: 50 }),
    hasHydraulicLift: boolean('has_hydraulic_lift').notNull().default(false),
    // Wave 5: ADR (опасные грузы) — оборудование ADR на ТС
    adrEquipped: boolean('adr_equipped').notNull().default(false),
    isArchived: boolean('is_archived').notNull().default(false),
    // Multitenancy (Sprint 14)
    organizationId: uuid('organization_id').references(() => organizations.id),
    // Deep Fleet Operations
    totalFuelConsumedL: doublePrecision('total_fuel_consumed_l').notNull().default(0),
    lastOdometerKm: doublePrecision('last_odometer_km'),
    lastOdometerUpdatedAt: timestamp('last_odometer_updated_at', { withTimezone: true }),
    // L1 (Carriers-0, миграция 0035) — если ТС принадлежит подрядчику.
    // NULL = свой парк. NOT NULL = наёмное ТС.
    ownerContractorId: uuid('owner_contractor_id').references(() => contractors.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    // C4 (миг.0041): per-org уникальность (были глобальные idx_vehicles_plate/_vin).
    uniqueIndex('idx_vehicles_org_plate').on(table.organizationId, table.plateNumber),
    uniqueIndex('idx_vehicles_org_vin').on(table.organizationId, table.vin),
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
    // Sprint 19: Приказ Минтранса 390 — СНИЛС обязателен для путевого листа
    snils: varchar('snils', { length: 14 }),
    // Wave 5: ADR-свидетельство (опасные грузы) — срок окончания
    adrCertificateExpiry: timestamp('adr_certificate_expiry', { withTimezone: true }),
    // Round 2A: тахограф — номер карты водителя (СКЗИ). Используется для
    // привязки записей при загрузке .DDD.
    tachographCardNumber: varchar('tachograph_card_number', { length: 32 }),
    isActive: boolean('is_active').notNull().default(true),
    // Multitenancy (Sprint 14)
    organizationId: uuid('organization_id').references(() => organizations.id),
    // L1 (Carriers-0, миграция 0035) — если водитель работает на стороннюю
    // организацию (подрядчик). NULL = наш сотрудник.
    employerContractorId: uuid('employer_contractor_id').references(() => contractors.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    // 0054 (P2): один driver на user (недетерминированный driver-RLS при дублях).
    uniqueIndex('idx_drivers_user_unique').on(table.userId),
]);

// ================================================================
// Orders (Заявки)
// ================================================================
export const orders = pgTable('orders', {
    id: uuid('id').primaryKey().defaultRandom(),
    // 0051 (P1): уникальность номера — per-org (idx_orders_org_number ниже), не
    // глобальная. Inline .unique() снят, чтобы не плодить orders_number_unique.
    number: varchar('number', { length: 50 }).notNull(),
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
    // Wave 2: Cold chain v0 — SLA bounds for refrigerated cargo
    coldChainRequired: boolean('cold_chain_required').notNull().default(false),
    temperatureMinC: numeric('temperature_min_c', { precision: 5, scale: 2 }).$type<number>(),
    temperatureMaxC: numeric('temperature_max_c', { precision: 5, scale: 2 }).$type<number>(),
    // Sprint 9: Тип загрузки
    loadingType: varchar('loading_type', { length: 20 }),  // rear, side, top
    hydraulicLiftRequired: boolean('hydraulic_lift_required').notNull().default(false),
    // Wave 5: ADR (опасные грузы) — UN ADR классы 1, 2, 3, 4.1, 4.2, 4.3,
    // 5.1, 5.2, 6.1, 6.2, 7, 8, 9. NULL означает не-опасный груз.
    adrClass: text('adr_class'),
    adrUnNumber: text('adr_un_number'),
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
    tripId: uuid('trip_id').references(() => trips.id, { onDelete: 'set null' }),
    // Sprint 13: Режим подтверждения доставки
    confirmationMode: confirmationModeEnum('confirmation_mode').notNull().default('none'),
    // Sprint 14: Грузополучатель (если отличается от contractorId/грузоотправителя)
    consigneeContractorId: uuid('consignee_contractor_id').references(() => contractors.id),
    // Multitenancy (Sprint 14)
    organizationId: uuid('organization_id').references(() => organizations.id),
    // K1 (Этап 2, миграция 0034) — стоимость от заказчика.
    // Видна manager+/accountant/admin. Logist может вводить через UI.
    // includes_vat default UI зависит от org.tax_regime.
    customerPrice: numeric('customer_price', { precision: 12, scale: 2 }).$type<number>(),
    customerPriceCurrency: varchar('customer_price_currency', { length: 3 }).notNull().default('RUB'),
    customerPriceIncludesVat: boolean('customer_price_includes_vat').notNull().default(false),
    createdBy: uuid('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    // 0051 (P1): per-org уникальность номера заявки (+ частичный idx_orders_nullorg_number
    // для org-less строк создаётся в миграции).
    uniqueIndex('idx_orders_org_number').on(table.organizationId, table.number),
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
    trailerId: uuid('trailer_id').references(() => trailers.id),
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
    organizationId: uuid('organization_id').references(() => organizations.id),
    // Wave 4: рейс выполняется субподрядчиком-перевозчиком.
    carrierContractorId: uuid('carrier_contractor_id').references(() => contractors.id, { onDelete: 'set null' }),
    // K1 (Этап 2, миграция 0034) — себестоимость рейса (LEGACY).
    // DEPRECATED: с L1 (миграция 0035) используются own_cost_estimate / subcontractor_cost
    // в зависимости от execution_mode. Это поле остаётся для backward compat
    // до полной миграции UI/API, удаление запланировано в 004x.
    carrierCost: numeric('carrier_cost', { precision: 12, scale: 2 }).$type<number>(),
    carrierCostCurrency: varchar('carrier_cost_currency', { length: 3 }).notNull().default('RUB'),
    carrierCostIncludesVat: boolean('carrier_cost_includes_vat').notNull().default(false),
    // L1 (миграция 0035) — режим выполнения рейса + раздельный учёт стоимости.
    executionMode: tripExecutionModeEnum('execution_mode').notNull().default('own'),
    ownCostEstimate: numeric('own_cost_estimate', { precision: 12, scale: 2 }).$type<number>(),
    subcontractorCost: numeric('subcontractor_cost', { precision: 12, scale: 2 }).$type<number>(),
    createdBy: uuid('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    uniqueIndex('idx_trips_number').on(table.number),
    index('idx_trips_status').on(table.status),
    index('idx_trips_vehicle').on(table.vehicleId),
    index('idx_trips_trailer').on(table.trailerId),
    index('idx_trips_driver').on(table.driverId),
    index('idx_trips_org').on(table.organizationId),
    index('idx_trips_carrier_contractor').on(table.carrierContractorId),
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

export const shipmentLots = pgTable('shipment_lots', {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').references(() => organizations.id),
    orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
    sequence: integer('sequence').notNull().default(1),
    status: shipmentLotStatusEnum('status').notNull().default('planned'),
    plannedWeightKg: doublePrecision('planned_weight_kg'),
    plannedVolumeM3: doublePrecision('planned_volume_m3'),
    plannedPlaces: integer('planned_places'),
    loadedWeightKg: doublePrecision('loaded_weight_kg'),
    loadedVolumeM3: doublePrecision('loaded_volume_m3'),
    loadedPlaces: integer('loaded_places'),
    deliveredWeightKg: doublePrecision('delivered_weight_kg'),
    deliveredVolumeM3: doublePrecision('delivered_volume_m3'),
    deliveredPlaces: integer('delivered_places'),
    remainingWeightKg: doublePrecision('remaining_weight_kg'),
    remainingVolumeM3: doublePrecision('remaining_volume_m3'),
    remainingPlaces: integer('remaining_places'),
    cargoDescription: text('cargo_description'),
    cargoType: varchar('cargo_type', { length: 100 }),
    loadingAddress: text('loading_address'),
    loadingDate: timestamp('loading_date', { withTimezone: true }),
    loadingWindowStart: timestamp('loading_window_start', { withTimezone: true }),
    loadingWindowEnd: timestamp('loading_window_end', { withTimezone: true }),
    unloadingAddress: text('unloading_address'),
    unloadingDate: timestamp('unloading_date', { withTimezone: true }),
    unloadingWindowStart: timestamp('unloading_window_start', { withTimezone: true }),
    unloadingWindowEnd: timestamp('unloading_window_end', { withTimezone: true }),
    requirementsSnapshot: jsonb('requirements_snapshot').$type<Record<string, unknown>>().notNull().default({}),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    index('idx_shipment_lots_order').on(table.orderId),
    index('idx_shipment_lots_org').on(table.organizationId),
    index('idx_shipment_lots_status').on(table.status),
]);

// ================================================================
// Route Points (Точки маршрута)
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
    // Wave 3: Дополнительные окна доставки (РТО)
    windowFrom: timestamp('window_from', { withTimezone: true }),
    windowTo: timestamp('window_to', { withTimezone: true }),
    arrivedAt: timestamp('arrived_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    signatureUrl: text('signature_url'),
    photoUrls: jsonb('photo_urls').$type<string[]>().default([]),
    notes: text('notes'),
    // Sprint 19: Пломбы и маркировка
    sealNumbers: jsonb('seal_numbers').$type<string[]>(),
    packagingCondition: text('packaging_condition'),
    // Sprint 19: Простой и время прибытия ТС
    vehicleArrivedAt: timestamp('vehicle_arrived_at', { withTimezone: true }),
    waitingStartedAt: timestamp('waiting_started_at', { withTimezone: true }),
    waitingEndedAt: timestamp('waiting_ended_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // 0055 (P2): updated_at + триггер автообновления (для дельта-sync route_points).
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    index('idx_route_points_trip').on(table.tripId),
]);

export const tripLotAssignments = pgTable('trip_lot_assignments', {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').references(() => organizations.id),
    tripId: uuid('trip_id').notNull().references(() => trips.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
    shipmentLotId: uuid('shipment_lot_id').notNull().references(() => shipmentLots.id, { onDelete: 'cascade' }),
    assignedWeightKg: doublePrecision('assigned_weight_kg'),
    assignedVolumeM3: doublePrecision('assigned_volume_m3'),
    assignedPlaces: integer('assigned_places'),
    status: tripLotAssignmentStatusEnum('status').notNull().default('planned'),
    loadingRoutePointId: uuid('loading_route_point_id').references(() => routePoints.id, { onDelete: 'set null' }),
    unloadingRoutePointId: uuid('unloading_route_point_id').references(() => routePoints.id, { onDelete: 'set null' }),
    documentGroupId: uuid('document_group_id'),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    uniqueIndex('idx_trip_lot_assignments_unique').on(table.tripId, table.shipmentLotId),
    index('idx_trip_lot_assignments_trip').on(table.tripId),
    index('idx_trip_lot_assignments_lot').on(table.shipmentLotId),
    index('idx_trip_lot_assignments_order').on(table.orderId),
    index('idx_trip_lot_assignments_org').on(table.organizationId),
    index('idx_trip_lot_assignments_status').on(table.status),
]);

// ================================================================
// Delivery Confirmations (Sprint 13 — Подтверждение доставки)
// Данные для ЭТрН Титул 3 (Информация грузополучателя)
// ================================================================
export const shipmentFacts = pgTable('shipment_facts', {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').references(() => organizations.id),
    tripId: uuid('trip_id').notNull().references(() => trips.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
    shipmentLotId: uuid('shipment_lot_id').notNull().references(() => shipmentLots.id, { onDelete: 'cascade' }),
    tripLotAssignmentId: uuid('trip_lot_assignment_id').references(() => tripLotAssignments.id, { onDelete: 'set null' }),
    routePointId: uuid('route_point_id').references(() => routePoints.id, { onDelete: 'set null' }),
    factType: shipmentFactTypeEnum('fact_type').notNull(),
    weightKg: doublePrecision('weight_kg'),
    volumeM3: doublePrecision('volume_m3'),
    places: integer('places'),
    cargoCondition: cargoConditionEnum('cargo_condition'),
    discrepancyCode: shipmentDiscrepancyCodeEnum('discrepancy_code'),
    notes: text('notes'),
    attachments: jsonb('attachments').$type<string[]>().notNull().default([]),
    gpsLat: doublePrecision('gps_lat'),
    gpsLon: doublePrecision('gps_lon'),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
    capturedBy: uuid('captured_by').references(() => users.id),
    source: varchar('source', { length: 50 }).notNull().default('web'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    index('idx_shipment_facts_trip').on(table.tripId),
    index('idx_shipment_facts_order').on(table.orderId),
    index('idx_shipment_facts_lot').on(table.shipmentLotId),
    index('idx_shipment_facts_assignment').on(table.tripLotAssignmentId),
    index('idx_shipment_facts_route_point').on(table.routePointId),
    index('idx_shipment_facts_org').on(table.organizationId),
]);

export const deliveryConfirmations = pgTable('delivery_confirmations', {
    id: uuid('id').primaryKey().defaultRandom(),
    tripId: uuid('trip_id').notNull().references(() => trips.id),
    orderId: uuid('order_id').references(() => orders.id),
    recipientName: varchar('recipient_name', { length: 255 }).notNull(),
    recipientPosition: varchar('recipient_position', { length: 255 }),
    recipientDocument: varchar('recipient_document', { length: 255 }),
    recipientSignaturePath: text('recipient_signature_path'),
    photos: jsonb('photos').$type<string[]>().notNull().default([]),
    cargoCondition: cargoConditionEnum('cargo_condition').notNull().default('intact'),
    // Sprint 19: Пломбы при доставке
    sealNumbers: jsonb('seal_numbers').$type<string[]>(),
    packagingCondition: text('packaging_condition'),
    notes: text('notes'),
    gpsLat: doublePrecision('gps_lat'),
    gpsLng: doublePrecision('gps_lng'),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').notNull().references(() => users.id),
    forcedByDispatcher: boolean('forced_by_dispatcher').notNull().default(false),
    forcedReason: forcedReasonEnum('forced_reason'),
    forcedReasonNote: text('forced_reason_note'),
}, (table) => [
    index('idx_delivery_confirmations_trip').on(table.tripId),
    index('idx_delivery_confirmations_order').on(table.orderId),
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
    trailerId: uuid('trailer_id').references(() => trailers.id),
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
    // Sprint 19: Приказ Минтранса 390 — обязательные реквизиты
    issuedByName: varchar('issued_by_name', { length: 255 }),
    issuedByPosition: varchar('issued_by_position', { length: 255 }),
    validFrom: timestamp('valid_from', { withTimezone: true }),
    validTo: timestamp('valid_to', { withTimezone: true }),
    transportServiceType: varchar('transport_service_type', { length: 100 }),
    transportMode: varchar('transport_mode', { length: 100 }),
}, (table) => [
    uniqueIndex('idx_waybills_number').on(table.number),
        uniqueIndex('idx_waybills_trip_unique').on(table.tripId),
    index('idx_waybills_trailer').on(table.trailerId),
]);

// ================================================================
// Waybill Attachments (Вложения путевых листов)
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
// Repair Requests (Заявки на ремонт)
// ================================================================
export const repairRequests = pgTable('repair_requests', {
    id: uuid('id').primaryKey().defaultRandom(),
    vehicleId: uuid('vehicle_id').notNull().references(() => vehicles.id),
    status: repairStatusEnum('status').notNull().default('created'),
    description: text('description').notNull(),
    priority: repairPriorityEnum('priority').notNull(),
    source: repairSourceEnum('source').notNull(),
    inspectionId: uuid('inspection_id').references(() => techInspections.id, { onDelete: 'set null' }),
    assignedTo: varchar('assigned_to', { length: 255 }),
    workDescription: text('work_description'),
    partsUsed: jsonb('parts_used').$type<Array<{
        name: string;
        quantity?: number;
        cost?: number;
        plannedQuantity?: number;
        estimatedUnitCost?: number;
        received?: boolean;
        receivedQuantity?: number;
        actualUnitCost?: number;
        usedQuantity?: number;
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
    index('idx_repairs_created_at').on(table.createdAt),
]);

export const repairPartCatalog = pgTable('repair_part_catalog', {
    id: uuid('id').primaryKey().defaultRandom(),
    code: varchar('code', { length: 100 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    category: varchar('category', { length: 120 }).notNull(),
    unit: varchar('unit', { length: 30 }).notNull(),
    suggestedUnitCost: numeric('suggested_unit_cost', { precision: 12, scale: 2 }).$type<number>().notNull().default(0),
    aliases: jsonb('aliases').$type<string[]>().notNull().default([]),
    isArchived: boolean('is_archived').notNull().default(false),
    organizationId: uuid('organization_id').references(() => organizations.id),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    // 0052 (P1): per-org уникальность кода (+ частичный global-индекс для
    // organization_id IS NULL создаётся в миграции). Раньше глобальный unique(code)
    // → cross-tenant коллизия и silent data loss при sync/гидрации.
    uniqueIndex('idx_repair_part_catalog_org_code').on(table.organizationId, table.code),
    index('idx_repair_part_catalog_category').on(table.category),
    index('idx_repair_part_catalog_archived').on(table.isArchived),
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
    // C3 «в» (миг.0042): прямой org-скоуп (раньше только через join fines→vehicles).
    organizationId: uuid('organization_id').references(() => organizations.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    index('idx_fines_vehicle').on(table.vehicleId),
    index('idx_fines_driver').on(table.driverId),
    index('idx_fines_created_at').on(table.createdAt),
    index('idx_fines_violation_date').on(table.violationDate),
    index('idx_fines_org').on(table.organizationId),
]);

// ================================================================
// Invoices (Счета / Акты)
// ================================================================
export const invoices = pgTable('invoices', {
    id: uuid('id').primaryKey().defaultRandom(),
    // 0039: number уникален per-org (composite index ниже), не глобально.
    number: varchar('number', { length: 50 }).notNull(),
    // contractor_id остался для backward compat (legacy). Новая модель
    // использует payer_id / payee_id (spec §3) — направление документа
    // определяется через них, не через тип.
    contractorId: uuid('contractor_id').notNull().references(() => contractors.id),
    contractId: uuid('contract_id').references(() => contracts.id),
    // M — invoice_type теперь ENUM (spec §1).
    type: invoiceTypeEnum('type').notNull(),
    status: invoiceStatusEnum('status').notNull().default('draft'),
    // tripIds оставлен для backward compat. Новые связки через invoice_orders.
    tripIds: jsonb('trip_ids').$type<string[]>().notNull().default([]),
    subtotal: numeric('subtotal', { precision: 12, scale: 2 }).$type<number>().notNull(),
    vatAmount: numeric('vat_amount', { precision: 12, scale: 2 }).$type<number>().notNull(),
    total: numeric('total', { precision: 12, scale: 2 }).$type<number>().notNull(),
    periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
    periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // M (Этап 3, миграция 0036) — новые поля per invoice-spec.md §3.
    payerId: uuid('payer_id').references(() => contractors.id),
    payeeId: uuid('payee_id').references(() => contractors.id),
    payeeOrganizationId: uuid('payee_organization_id').references(() => organizations.id),
    basisText: text('basis_text'),
    vatRate: numeric('vat_rate', { precision: 4, scale: 2 }).$type<number>(),
    includesVat: boolean('includes_vat').notNull().default(false),
    currency: varchar('currency', { length: 3 }).notNull().default('RUB'),
    issuedAt: timestamp('issued_at', { withTimezone: true }),
    paidAmount: numeric('paid_amount', { precision: 12, scale: 2 }).$type<number>().notNull().default(0),
    correctionKind: invoiceCorrectionKindEnum('correction_kind'),
    relatedInvoiceId: uuid('related_invoice_id'),
    correctionReason: text('correction_reason'),
    correctionBasisArtifactId: uuid('correction_basis_artifact_id'),
    hasCorrections: boolean('has_corrections').notNull().default(false),
    cancellationReason: text('cancellation_reason'),
}, (table) => [
    // 0039: per-org серия номеров (п.5.1 ст.169 НК) + неуникальный индекс на number.
    uniqueIndex('idx_invoices_org_number').on(table.payeeOrganizationId, table.number),
    index('idx_invoices_number').on(table.number),
    index('idx_invoices_contractor').on(table.contractorId),
    index('idx_invoices_status').on(table.status),
    index('idx_invoices_created_at').on(table.createdAt),
    index('idx_invoices_status_created').on(table.status, table.createdAt),
    index('idx_invoices_contractor_period').on(table.contractorId, table.periodStart, table.periodEnd),
]);

// M (Этап 3) — junction для связки счёт ↔ заявка с allocated_amount.
// CHECK Σ allocated_amount = invoice.total — DEFERRED trigger в БД.
export const invoiceOrders = pgTable('invoice_orders', {
    id: uuid('id').primaryKey().defaultRandom(),
    invoiceId: uuid('invoice_id').notNull().references(() => invoices.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id').notNull().references(() => orders.id),
    allocatedAmount: numeric('allocated_amount', { precision: 12, scale: 2 }).$type<number>().notNull(),
    allocatedVat: numeric('allocated_vat', { precision: 12, scale: 2 }).$type<number>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    uniqueIndex('idx_invoice_orders_unique').on(table.invoiceId, table.orderId),
    index('idx_invoice_orders_invoice').on(table.invoiceId),
    index('idx_invoice_orders_order').on(table.orderId),
]);

// M (Этап 3) — audit-trail per spec §8. Auto-fill через DB-trigger.
export const invoiceHistory = pgTable('invoice_history', {
    id: uuid('id').primaryKey().defaultRandom(),
    invoiceId: uuid('invoice_id').notNull().references(() => invoices.id),
    operation: varchar('operation', { length: 20 }).notNull(),
    fieldName: varchar('field_name', { length: 64 }),
    previousValue: jsonb('previous_value'),
    newValue: jsonb('new_value'),
    changedByUserId: uuid('changed_by_user_id').references(() => users.id),
    changeReason: text('change_reason'),
    changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    index('idx_invoice_history_invoice').on(table.invoiceId, table.changedAt),
    index('idx_invoice_history_operation').on(table.operation),
]);

// ================================================================
// App Settings (Системные настройки)
// ================================================================
export const appSettings = pgTable('app_settings', {
    id: uuid('id').primaryKey().defaultRandom(),
    key: varchar('key', { length: 100 }).notNull().unique(),
    value: text('value').notNull(),
    description: text('description'),
    updatedBy: uuid('updated_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    index('idx_app_settings_key').on(table.key),
]);

// ================================================================
// Invoice Adjustments (Sprint 19 — Корректировочные счета)
// ================================================================
export const adjustmentReasonEnum = pgEnum('adjustment_reason', [
    'rate_change', 'volume_change', 'penalty', 'discount', 'error_correction', 'other',
]);

export const invoiceAdjustments = pgTable('invoice_adjustments', {
    id: uuid('id').primaryKey().defaultRandom(),
    invoiceId: uuid('invoice_id').notNull().references(() => invoices.id),
    reason: adjustmentReasonEnum('reason').notNull(),
    description: text('description').notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).$type<number>().notNull(),
    createdBy: uuid('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    index('idx_invoice_adjustments_invoice').on(table.invoiceId),
]);

// ================================================================
// Tachograph Records (РТО)
// ================================================================
export const tachographRecords = pgTable('tachograph_records', {
    id: uuid('id').primaryKey().defaultRandom(),
    driverId: uuid('driver_id').notNull().references(() => drivers.id),
    // A-P2 verified 2026-05-13: `date` is `timestamptz` (NOT `date`), so
    // the JS Date round-trip preserves timezone info. Consumers should
    // continue to use the timestamp directly (no implicit date-only
    // conversions). Reviewed in audit-2026-05-12-deep.md.
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
    // C9 (миг.0044): идемпотентность .DDD-загрузок на уровне БД.
    uniqueIndex('uq_tachograph_driver_date_source').on(table.driverId, table.date, table.source),
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
    // A-P0-12: tenant scoping. Pre-multitenancy templates have null
    // organization_id and act as system defaults (read-only, visible to all
    // tenants). New templates created via /admin/checklists belong to the
    // creator's org and are tenant-scoped.
    organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }),
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
}, (table) => [
    index('idx_checklist_templates_organization').on(table.organizationId),
]);

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
    // A-P0-12: tenant scoping. Backfilled from author's org in migration 0027.
    // Nullable for now — old rows where the author was deleted may have no
    // org. App-side queries filter `IS NOT NULL` + match request.orgId.
    // B7.1 (migration 0030): RESTRICT — audit trail (152-ФЗ) не стирается с org.
    organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'restrict' }),
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
    index('idx_events_organization').on(table.organizationId, sql`${table.timestamp} DESC`),
    // C9: синхрон с миграцией 0039 — composite per-org (был single-col global).
    uniqueIndex('idx_events_org_external_id').on(table.organizationId, table.externalId),
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
    // P0-S2: tenant-scope. Воркер рассылает событие только подписчикам той же орг.
    organizationId: uuid('organization_id').references(() => organizations.id),
    telegramChatId: varchar('telegram_chat_id', { length: 50 }).notNull(),
    telegramUsername: varchar('telegram_username', { length: 100 }),
    eventTypes: jsonb('event_types').$type<string[]>().notNull().default(['*']),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    uniqueIndex('notification_subs_chat_id_idx').on(table.telegramChatId),
    index('notification_subs_user_id_idx').on(table.userId),
    index('notification_subs_org_idx').on(table.organizationId, table.isActive),
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
    organizationId: uuid('organization_id').references(() => organizations.id),
    isArchived: boolean('is_archived').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    uniqueIndex('idx_trailers_plate').on(table.plateNumber),
    index('idx_trailers_vehicle').on(table.currentVehicleId),
    index('idx_trailers_org').on(table.organizationId),
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
    trailerId: uuid('trailer_id').references(() => trailers.id),
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
    // C3 «в» (миг.0042): прямой org-скоуп — раньше incidents скоупились через
    // vehicleId-subquery, и строки с vehicleId=null утекали всем тенантам.
    organizationId: uuid('organization_id').references(() => organizations.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    index('idx_incidents_status').on(table.status),
    index('idx_incidents_vehicle').on(table.vehicleId),
    index('idx_incidents_driver').on(table.driverId),
    index('idx_incidents_trip').on(table.tripId),
    index('idx_incidents_org').on(table.organizationId),
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

// ================================================================
// Sprint 11 — Invoice Trips junction table (нормализация tripIds)
// ================================================================
export const invoiceTrips = pgTable('invoice_trips', {
    id: uuid('id').primaryKey().defaultRandom(),
    invoiceId: uuid('invoice_id').notNull().references(() => invoices.id, { onDelete: 'cascade' }),
    tripId: uuid('trip_id').notNull().references(() => trips.id),
}, (table) => [
    uniqueIndex('idx_invoice_trips_unique').on(table.invoiceId, table.tripId),
    index('idx_invoice_trips_invoice').on(table.invoiceId),
    index('idx_invoice_trips_trip').on(table.tripId),
]);

// ================================================================
// Sprint 11 — Document Returns (Реестр возврата первичных документов)
// ================================================================
// 0050 (P1 код-аудит 2026-06-14): waybill/cmr — отдельные значения, чтобы не
// схлопывались в 'other' и unique(tripId, docType) их различал.
export const documentReturnTypeEnum = pgEnum('document_return_type', ['ttn', 'upd', 'act', 'other', 'waybill', 'cmr']);
export const documentReturnStatusEnum = pgEnum('document_return_status', ['pending', 'received', 'overdue']);

export const documentReturns = pgTable('document_returns', {
    id: uuid('id').primaryKey().defaultRandom(),
    tripId: uuid('trip_id').notNull().references(() => trips.id),
    docType: documentReturnTypeEnum('doc_type').notNull(),
    status: documentReturnStatusEnum('status').notNull().default('pending'),
    receivedAt: timestamp('received_at', { withTimezone: true }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    uniqueIndex('idx_doc_returns_trip_type').on(table.tripId, table.docType),
    index('idx_doc_returns_trip').on(table.tripId),
]);

export const documentDossierItems = pgTable('document_dossier_items', {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').references(() => organizations.id),
    scopeType: documentDossierScopeEnum('scope_type').notNull(),
    scopeId: uuid('scope_id').notNull(),
    documentType: varchar('document_type', { length: 50 }).notNull(),
    required: boolean('required').notNull().default(true),
    status: documentDossierStatusEnum('status').notNull().default('missing'),
    sourceDocumentId: uuid('source_document_id'),
    sourceDocumentKind: varchar('source_document_kind', { length: 50 }),
    dueAt: timestamp('due_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    blockedReason: text('blocked_reason'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    index('idx_document_dossier_scope').on(table.scopeType, table.scopeId),
    index('idx_document_dossier_org').on(table.organizationId),
    index('idx_document_dossier_status').on(table.status),
]);

// ================================================================
// Sprint 12.5 — Claims (Претензии к контрагентам)
// ================================================================
// ================================================================
// Transport Documents (persisted compliance artifacts)
// ================================================================
export const transportDocumentSeverityEnum = pgEnum('transport_document_severity', [
    'info', 'warning', 'critical',
]);

export const transportDocumentExchangeDirectionEnum = pgEnum('transport_document_exchange_direction', [
    'outbound', 'inbound',
]);

export const transportDocumentExchangeStatusEnum = pgEnum('transport_document_exchange_status', [
    'queued', 'sent', 'acknowledged', 'delivered', 'accepted', 'rejected', 'failed',
]);

export const transportDocumentReceiptTypeEnum = pgEnum('transport_document_receipt_type', [
    'ack', 'acceptance', 'rejection', 'correction_required', 'registration', 'delivery',
]);

export const transportDocuments = pgTable('transport_documents', {
    id: uuid('id').primaryKey().defaultRandom(),
    artifactId: varchar('artifact_id', { length: 255 }).notNull(),
    artifactKind: varchar('artifact_kind', { length: 50 }).notNull(),
    tripId: uuid('trip_id').notNull().references(() => trips.id, { onDelete: 'cascade' }),
    waybillId: uuid('waybill_id').references(() => waybills.id, { onDelete: 'set null' }),
    documentType: varchar('document_type', { length: 50 }),
    titleType: varchar('title_type', { length: 50 }),
    titleNumber: varchar('title_number', { length: 8 }),
    sourceKey: text('source_key').notNull(),
    correlationId: text('correlation_id').notNull(),
    snapshotId: varchar('snapshot_id', { length: 64 }).notNull(),
    externalId: varchar('external_id', { length: 255 }).notNull(),
    status: varchar('status', { length: 50 }).notNull(),
    sourceStatus: varchar('source_status', { length: 50 }),
    providerName: varchar('provider_name', { length: 100 }).notNull().default('internal'),
    providerDocumentId: varchar('provider_document_id', { length: 255 }),
    providerMessageId: varchar('provider_message_id', { length: 255 }),
    providerStatus: varchar('provider_status', { length: 100 }),
    error: text('error'),
    version: integer('version').notNull().default(1),
    orderIds: jsonb('order_ids').$type<string[]>().notNull().default([]),
    retryCount: integer('retry_count').notNull().default(0),
    lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
    lastRetryAt: timestamp('last_retry_at', { withTimezone: true }),
    lastErrorAt: timestamp('last_error_at', { withTimezone: true }),
    nextRetryAt: timestamp('next_retry_at', { withTimezone: true }),
    issuedAt: timestamp('issued_at', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    rejectedAt: timestamp('rejected_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }).notNull().defaultNow(),
    payload: jsonb('payload').notNull().default({}),
    history: jsonb('history').$type<Array<Record<string, unknown>>>().notNull().default([]),
    timeline: jsonb('timeline').$type<Array<Record<string, unknown>>>().notNull().default([]),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    // Wave 5: EDI / Diadoc / SBIS / Kontur (mock).
    // ediStatus ∈ 'not_sent' | 'sent' | 'signed_by_carrier' | 'signed_by_client' | 'rejected'
    // ediProvider ∈ 'diadoc' | 'sbis' | 'kontur'
    ediStatus: text('edi_status'),
    ediProvider: text('edi_provider'),
    ediExternalId: text('edi_external_id'),
    ediSentAt: timestamp('edi_sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    uniqueIndex('idx_transport_documents_artifact').on(table.artifactId),
    uniqueIndex('idx_transport_documents_source_key').on(table.sourceKey),
    index('idx_transport_documents_trip').on(table.tripId),
    index('idx_transport_documents_waybill').on(table.waybillId),
    index('idx_transport_documents_kind').on(table.artifactKind),
    index('idx_transport_documents_status').on(table.status),
]);

// ================================================================
// Wave 5: EDI events log (Diadoc/SBIS/Kontur mock)
// ================================================================
export const ediEvents = pgTable('edi_events', {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id').notNull().references(() => transportDocuments.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    eventType: text('event_type').notNull(), // 'sent' | 'signed' | 'rejected'
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    index('idx_edi_events_document').on(table.documentId),
    index('idx_edi_events_created').on(sql`${table.createdAt} DESC`),
]);

export const transportDocumentEvents = pgTable('transport_document_events', {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id').notNull().references(() => transportDocuments.id, { onDelete: 'cascade' }),
    eventType: varchar('event_type', { length: 50 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    fromStatus: varchar('from_status', { length: 50 }),
    toStatus: varchar('to_status', { length: 50 }),
    severity: transportDocumentSeverityEnum('severity').notNull().default('info'),
    message: text('message'),
    errorCode: varchar('error_code', { length: 100 }),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    index('idx_transport_document_events_document').on(table.documentId),
    index('idx_transport_document_events_created').on(table.createdAt),
]);

export const transportDocumentExchanges = pgTable('transport_document_exchanges', {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id').notNull().references(() => transportDocuments.id, { onDelete: 'cascade' }),
    tripId: uuid('trip_id').notNull().references(() => trips.id, { onDelete: 'cascade' }),
    providerName: varchar('provider_name', { length: 100 }).notNull().default('sandbox_edo'),
    direction: transportDocumentExchangeDirectionEnum('direction').notNull().default('outbound'),
    operation: varchar('operation', { length: 50 }).notNull(),
    status: transportDocumentExchangeStatusEnum('status').notNull().default('queued'),
    requestId: varchar('request_id', { length: 255 }),
    providerDocumentId: varchar('provider_document_id', { length: 255 }),
    providerMessageId: varchar('provider_message_id', { length: 255 }),
    providerEventId: varchar('provider_event_id', { length: 255 }),
    providerStatus: varchar('provider_status', { length: 100 }),
    attemptNumber: integer('attempt_number').notNull().default(1),
    errorCode: varchar('error_code', { length: 100 }),
    errorMessage: text('error_message'),
    requestPayload: jsonb('request_payload').$type<Record<string, unknown>>().notNull().default({}),
    responsePayload: jsonb('response_payload').$type<Record<string, unknown>>().notNull().default({}),
    initiatedBy: uuid('initiated_by').references(() => users.id),
    initiatedAt: timestamp('initiated_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    nextRetryAt: timestamp('next_retry_at', { withTimezone: true }),
}, (table) => [
    index('idx_transport_document_exchanges_document').on(table.documentId),
    index('idx_transport_document_exchanges_trip').on(table.tripId),
    index('idx_transport_document_exchanges_status').on(table.status),
    index('idx_transport_document_exchanges_initiated').on(table.initiatedAt),
]);

export const transportDocumentReceipts = pgTable('transport_document_receipts', {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id').notNull().references(() => transportDocuments.id, { onDelete: 'cascade' }),
    tripId: uuid('trip_id').notNull().references(() => trips.id, { onDelete: 'cascade' }),
    exchangeId: uuid('exchange_id').references(() => transportDocumentExchanges.id, { onDelete: 'set null' }),
    receiptType: transportDocumentReceiptTypeEnum('receipt_type').notNull(),
    providerReceiptId: varchar('provider_receipt_id', { length: 255 }),
    providerEventId: varchar('provider_event_id', { length: 255 }),
    providerStatus: varchar('provider_status', { length: 100 }),
    title: varchar('title', { length: 255 }).notNull(),
    message: text('message'),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id),
}, (table) => [
    index('idx_transport_document_receipts_document').on(table.documentId),
    index('idx_transport_document_receipts_trip').on(table.tripId),
    index('idx_transport_document_receipts_received').on(table.receivedAt),
]);

export const claimTypeEnum = pgEnum('claim_type', ['damage', 'delay', 'loss', 'other']);
export const claimStatusEnum = pgEnum('claim_status', ['open', 'investigating', 'resolved', 'rejected']);

export const claims = pgTable('claims', {
    id: uuid('id').primaryKey().defaultRandom(),
    // Прямой org-скоуп (миг.0047) — раньше claims скоупились только через
    // contractor-FK (claims с null-contractor / cross-org FK мис-скоупились,
    // как был NULL-FK баг incidents до 0042). Заполняется при создании из
    // contractor.organizationId.
    organizationId: uuid('organization_id').references(() => organizations.id),
    tripId: uuid('trip_id').references(() => trips.id, { onDelete: 'set null' }),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'set null' }),
    contractorId: uuid('contractor_id').references(() => contractors.id, { onDelete: 'set null' }),
    type: claimTypeEnum('type').notNull(),
    status: claimStatusEnum('status').notNull().default('open'),
    amount: numeric('amount', { precision: 12, scale: 2 }),
    resolvedAmount: numeric('resolved_amount', { precision: 12, scale: 2 }),
    description: text('description').notNull(),
    resolution: text('resolution'),
    attachments: jsonb('attachments').default([]),
    createdBy: uuid('created_by').references(() => users.id),
    resolvedBy: uuid('resolved_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    index('idx_claims_trip').on(table.tripId),
    index('idx_claims_contractor').on(table.contractorId),
    index('idx_claims_status').on(table.status),
    index('idx_claims_org').on(table.organizationId),
]);

// ================================================================
// Deep Fleet Operations
// ================================================================

export const fuelRecords = pgTable('fuel_records', {
    id: uuid('id').primaryKey().defaultRandom(),
    vehicleId: uuid('vehicle_id').notNull().references(() => vehicles.id),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
    liters: numeric('liters', { precision: 10, scale: 2 }).$type<number>().notNull(),
    costPerLiter: numeric('cost_per_liter', { precision: 10, scale: 2 }).$type<number>().notNull(),
    totalCost: numeric('total_cost', { precision: 12, scale: 2 }).$type<number>().notNull(),
    fuelType: fuelTypeEnum('fuel_type').notNull(),
    station: varchar('station', { length: 255 }),
    odometerAtFill: doublePrecision('odometer_at_fill'),
    tripId: uuid('trip_id').references(() => trips.id, { onDelete: 'set null' }),
    driverId: uuid('driver_id').references(() => drivers.id),
    organizationId: uuid('organization_id').references(() => organizations.id),
    // Wave 6: provenance — 'manual' (default), 'fuel_card_mock', or future real-provider tags.
    source: varchar('source', { length: 50 }).notNull().default('manual'),
    createdBy: uuid('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    index('idx_fuel_records_vehicle').on(table.vehicleId),
    index('idx_fuel_records_driver').on(table.driverId),
    index('idx_fuel_records_recorded_at').on(table.recordedAt),
    index('idx_fuel_records_trip').on(table.tripId),
    index('idx_fuel_records_org').on(table.organizationId),
]);

export const odometerReadings = pgTable('odometer_readings', {
    id: uuid('id').primaryKey().defaultRandom(),
    vehicleId: uuid('vehicle_id').notNull().references(() => vehicles.id),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
    valueKm: doublePrecision('value_km').notNull(),
    source: odometerSourceEnum('source').notNull().default('manual'),
    tripId: uuid('trip_id').references(() => trips.id, { onDelete: 'set null' }),
    driverId: uuid('driver_id').references(() => drivers.id),
    organizationId: uuid('organization_id').references(() => organizations.id),
    createdBy: uuid('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    index('idx_odometer_vehicle').on(table.vehicleId),
    index('idx_odometer_recorded_at').on(table.recordedAt),
    index('idx_odometer_vehicle_recorded').on(table.vehicleId, table.recordedAt),
]);

export const downtimeRecords = pgTable('downtime_records', {
    id: uuid('id').primaryKey().defaultRandom(),
    vehicleId: uuid('vehicle_id').notNull().references(() => vehicles.id),
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    endAt: timestamp('end_at', { withTimezone: true }),
    reasonCode: downtimeReasonEnum('reason_code').notNull(),
    description: text('description'),
    tripId: uuid('trip_id').references(() => trips.id, { onDelete: 'set null' }),
    organizationId: uuid('organization_id').references(() => organizations.id),
    createdBy: uuid('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    index('idx_downtime_vehicle').on(table.vehicleId),
    index('idx_downtime_start_at').on(table.startAt),
    index('idx_downtime_vehicle_period').on(table.vehicleId, table.startAt, table.endAt),
]);

export const maintenanceSchedule = pgTable('maintenance_schedule', {
    id: uuid('id').primaryKey().defaultRandom(),
    vehicleId: uuid('vehicle_id').notNull().references(() => vehicles.id),
    maintenanceType: maintenanceTypeEnum('maintenance_type').notNull(),
    plannedDate: timestamp('planned_date', { withTimezone: true }),
    plannedOdometerKm: doublePrecision('planned_odometer_km'),
    actualDate: timestamp('actual_date', { withTimezone: true }),
    actualOdometerKm: doublePrecision('actual_odometer_km'),
    status: maintenanceStatusEnum('status').notNull().default('planned'),
    cost: numeric('cost', { precision: 12, scale: 2 }).$type<number>(),
    contractor: varchar('contractor', { length: 255 }),
    notes: text('notes'),
    repairRequestId: uuid('repair_request_id').references(() => repairRequests.id, { onDelete: 'set null' }),
    organizationId: uuid('organization_id').references(() => organizations.id),
    createdBy: uuid('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    index('idx_maintenance_vehicle').on(table.vehicleId),
    index('idx_maintenance_status').on(table.status),
    index('idx_maintenance_planned_date').on(table.plannedDate),
    index('idx_maintenance_vehicle_status').on(table.vehicleId, table.status),
]);

// ================================================================
// Wave 2 — Cold chain v0 (Temperature Readings)
// ================================================================
export const temperatureReadingSourceEnum = pgEnum('temperature_reading_source', [
    'sensor', 'manual', 'mock',
]);

export const temperatureReadings = pgTable('temperature_readings', {
    id: uuid('id').primaryKey().defaultRandom(),
    tripId: uuid('trip_id').notNull().references(() => trips.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'set null' }),
    // A-P2: explicit per-row tenancy. Backfilled in migration 0028 from
    // the trip's organization_id. Stays nullable until a follow-up
    // verifies no orphan rows; service-layer inserts always set it.
    // B7.1 (migration 0030): RESTRICT — cold-chain compliance retention.
    organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'restrict' }),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
    tempC: numeric('temp_c', { precision: 5, scale: 2 }).$type<number>().notNull(),
    sensorId: text('sensor_id'),
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
    source: temperatureReadingSourceEnum('source').notNull().default('mock'),
    breach: boolean('breach').notNull().default(false),
    breachMinC: numeric('breach_min_c', { precision: 5, scale: 2 }).$type<number>(),
    breachMaxC: numeric('breach_max_c', { precision: 5, scale: 2 }).$type<number>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    index('idx_temp_readings_trip_recorded').on(table.tripId, sql`${table.recordedAt} DESC`),
    index('idx_temp_readings_order_recorded')
        .on(table.orderId, sql`${table.recordedAt} DESC`)
        .where(sql`${table.orderId} IS NOT NULL`),
    index('idx_temperature_readings_org').on(table.organizationId),
]);

// ================================================================
// Wave 4: Carrier subcontracting v0
// Договоры с перевозчиками-субподрядчиками. status управляет
// жизненным циклом (draft → active → terminated), договор вступает
// в силу только в статусе 'active'.
// ================================================================
export const carrierContracts = pgTable('carrier_contracts', {
    id: uuid('id').primaryKey().defaultRandom(),
    contractorId: uuid('contractor_id').notNull().references(() => contractors.id, { onDelete: 'cascade' }),
    number: varchar('number', { length: 100 }).notNull(),
    startDate: timestamp('start_date', { withTimezone: true }).notNull(),
    endDate: timestamp('end_date', { withTimezone: true }),
    defaultRatePerKm: numeric('default_rate_per_km', { precision: 12, scale: 2 }).$type<number>(),
    defaultRatePerTon: numeric('default_rate_per_ton', { precision: 12, scale: 2 }).$type<number>(),
    status: varchar('status', { length: 20 }).notNull().default('draft'),
    organizationId: uuid('organization_id').references(() => organizations.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    index('idx_carrier_contracts_contractor').on(table.contractorId),
    index('idx_carrier_contracts_status').on(table.status),
    index('idx_carrier_contracts_org').on(table.organizationId),
    // 0053 (P2): per-org уникальность номера договора (+ частичный nullorg в миграции).
    uniqueIndex('idx_carrier_contracts_org_number').on(table.organizationId, table.number),
]);

// ================================================================
// Wave 3: Vehicle Positions (история GPS)
// Хранит исторические позиции ТС для ETA/треков. WS broadcast
// читает эту таблицу или fallback на mock-телеметрию.
// ================================================================
export const vehiclePositions = pgTable('vehicle_positions', {
    id: uuid('id').primaryKey().defaultRandom(),
    vehicleId: uuid('vehicle_id').notNull().references(() => vehicles.id, { onDelete: 'cascade' }),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
    latitude: doublePrecision('latitude').notNull(),
    longitude: doublePrecision('longitude').notNull(),
    speedKmh: doublePrecision('speed_kmh'),
    headingDeg: doublePrecision('heading_deg'),
    source: text('source').notNull().default('mock'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    index('idx_vehicle_positions_vehicle_recorded').on(table.vehicleId, sql`${table.recordedAt} DESC`),
]);

// === PROVIDER FRAMEWORK (Round 1C) ===
// Pluggable adapters for signature/EDI/telematics/fuel-card/fines/marking/payment/email
// providers. Real credentials live encrypted in `encrypted_credentials` (AES-256-GCM,
// key from CREDENTIALS_KEY env). The framework lets us swap a mock for a real provider
// per organization within hours when API keys arrive.
export const providerCredentials = pgTable('provider_credentials', {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    // 'signature' | 'edi' | 'telematics' | 'fuel_card' | 'fines' | 'marking' | 'payment' | 'email'
    providerType: text('provider_type').notNull(),
    // 'gosklyuch' | 'kontur_sign' | 'sbis_sign' | 'cadesplugin' | 'diadoc' | 'sbis' |
    // 'kontur' | 'wialon' | 'omnicomm' | 'glonasssoft' | 'lukoil' | 'rosneft' |
    // 'gazpromneft' | 'autocode' | 'fssp' | 'gibdd' | 'crpt' | 'yookassa' | 'tinkoff' |
    // 'cloudpayments' | 'mailru_smtp' | 'unisender' | 'mock'
    providerName: text('provider_name').notNull(),
    // 'mock' | 'sandbox' | 'active' | 'disabled' | 'error'
    status: text('status').notNull().default('mock'),
    encryptedCredentials: text('encrypted_credentials'),
    lastHealthCheckAt: timestamp('last_health_check_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    uniqueIndex('uniq_provider_credentials_org_type_name')
        .on(table.organizationId, table.providerType, table.providerName),
    index('idx_provider_credentials_org_type').on(table.organizationId, table.providerType),
]);

// === COPILOT (Round 1A) ===
export const copilotMessageRoleEnum = pgEnum('copilot_message_role', [
    'user', 'assistant', 'tool', 'system',
]);

export const copilotConversations = pgTable('copilot_conversations', {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').references(() => organizations.id),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    messageCount: integer('message_count').notNull().default(0),
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    index('idx_copilot_conversations_user').on(table.userId, sql`${table.lastActivityAt} DESC`),
    index('idx_copilot_conversations_org').on(table.organizationId, sql`${table.lastActivityAt} DESC`),
]);

export const copilotMessages = pgTable('copilot_messages', {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id').notNull().references(() => copilotConversations.id, { onDelete: 'cascade' }),
    role: copilotMessageRoleEnum('role').notNull(),
    content: text('content').notNull().default(''),
    toolName: text('tool_name'),
    toolInput: jsonb('tool_input').$type<Record<string, unknown>>(),
    toolOutput: jsonb('tool_output').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    index('idx_copilot_messages_conv_created').on(table.conversationId, table.createdAt),
]);

// === ONBOARDING (Round 1B) ===
// Self-serve signup + 6-step onboarding wizard. The signup flow
// creates an inactive `users` row (isActive=false, emailVerifiedAt=null)
// plus an organization, and sends a 6-digit code stored here. The
// onboarding wizard then walks the new admin through ИНН lookup,
// company profile, scenario pick, EDI/signature provider hookup, and
// teammate invites. `organizations.onboarding_step` is the resumable
// pointer; `onboarding_completed_at` flips when step 6 finishes.
export const emailVerifications = pgTable('email_verifications', {
    id: uuid('id').primaryKey().defaultRandom(),
    email: varchar('email', { length: 255 }).notNull(),
    code: varchar('code', { length: 6 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    index('idx_email_verifications_email').on(table.email),
    index('idx_email_verifications_created').on(sql`${table.createdAt} DESC`),
]);

// === COMPLIANCE (Round 2A) ===
// РФ-специфичные интеграции: РСА-ОСАГО, ЦРПТ (Честный знак), тахограф.
// Все таблицы scope-аются по organization_id, чтобы один тенант не видел
// чужие данные. Реальные провайдеры в `apps/api/src/providers/{osago,marking}`,
// при отсутствии креденшелов используется mock-адаптер.
export const osagoChecks = pgTable('osago_checks', {
    id: uuid('id').primaryKey().defaultRandom(),
    // B7.1 (migration 0030): RESTRICT — страховая история.
    organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'restrict' }),
    vehicleId: uuid('vehicle_id').notNull().references(() => vehicles.id, { onDelete: 'cascade' }),
    checkedAt: timestamp('checked_at', { withTimezone: true }).notNull().defaultNow(),
    valid: boolean('valid').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    insurer: text('insurer'),
    policyNumber: text('policy_number'),
    rawResponse: jsonb('raw_response').$type<Record<string, unknown>>(),
    providerName: text('provider_name').notNull().default('mock'),
}, (table) => [
    index('idx_osago_checks_vehicle').on(table.vehicleId, sql`${table.checkedAt} DESC`),
    index('idx_osago_checks_org').on(table.organizationId, sql`${table.checkedAt} DESC`),
]);

export const markingVerifications = pgTable('marking_verifications', {
    id: uuid('id').primaryKey().defaultRandom(),
    // B7.1 (migration 0030): RESTRICT.
    organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'restrict' }),
    lotId: uuid('lot_id').references(() => shipmentLots.id, { onDelete: 'set null' }),
    code: text('code').notNull(),
    verifiedAt: timestamp('verified_at', { withTimezone: true }).notNull().defaultNow(),
    valid: boolean('valid').notNull(),
    category: text('category'),
    productName: text('product_name'),
    gtin: text('gtin'),
    serial: text('serial'),
    rawResponse: jsonb('raw_response').$type<Record<string, unknown>>(),
    providerName: text('provider_name').notNull().default('mock'),
}, (table) => [
    index('idx_marking_verifications_org_code').on(table.organizationId, table.code),
    index('idx_marking_verifications_lot').on(table.lotId),
]);

export const tachographUploads = pgTable('tachograph_uploads', {
    id: uuid('id').primaryKey().defaultRandom(),
    // B7.1 (migration 0030): RESTRICT — Минтранс хранение.
    organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'restrict' }),
    driverId: uuid('driver_id').references(() => drivers.id, { onDelete: 'set null' }),
    driverCardNumber: varchar('driver_card_number', { length: 32 }),
    vehicleVin: varchar('vehicle_vin', { length: 17 }),
    periodFrom: timestamp('period_from', { withTimezone: true }),
    periodTo: timestamp('period_to', { withTimezone: true }),
    fileName: text('file_name'),
    fileSizeBytes: integer('file_size_bytes'),
    recordsInserted: integer('records_inserted').notNull().default(0),
    totalDrivingMinutes: integer('total_driving_minutes').notNull().default(0),
    uploadedBy: uuid('uploaded_by').references(() => users.id),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
    parseWarnings: jsonb('parse_warnings').$type<string[]>(),
}, (table) => [
    index('idx_tachograph_uploads_org').on(table.organizationId, sql`${table.uploadedAt} DESC`),
    index('idx_tachograph_uploads_driver').on(table.driverId, sql`${table.uploadedAt} DESC`),
]);

// === MONETIZATION (Round 2B) ===
// Plan catalogue + per-organization subscriptions, payment history, monthly
// usage counters. Plans seeded by 0023_monetization.sql migration; new orgs
// default to 'free' (no subscription row required).
export const plans = pgTable('plans', {
    id: text('id').primaryKey(), // 'free' | 'pro' | 'business' | 'enterprise'
    nameRu: text('name_ru').notNull(),
    priceMonthlyKopecks: integer('price_monthly_kopecks').notNull().default(0),
    vehicleLimit: integer('vehicle_limit'),
    monthlyOrdersLimit: integer('monthly_orders_limit'),
    copilotMessagesDaily: integer('copilot_messages_daily'),
    features: jsonb('features').$type<Record<string, boolean>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const subscriptions = pgTable('subscriptions', {
    id: uuid('id').primaryKey().defaultRandom(),
    // B7.1 (migration 0030): RESTRICT — биллинг history.
    organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'restrict' }),
    planId: text('plan_id').notNull().references(() => plans.id),
    // 'trial' | 'active' | 'past_due' | 'suspended' | 'cancelled'
    status: text('status').notNull().default('trial'),
    trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
    currentPeriodStart: timestamp('current_period_start', { withTimezone: true }).notNull().defaultNow(),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }).notNull(),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
    paymentProvider: text('payment_provider'),
    paymentExternalId: text('payment_external_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    uniqueIndex('uniq_subscriptions_org').on(table.organizationId),
    index('idx_subscriptions_status').on(table.status),
    index('idx_subscriptions_period_end').on(table.currentPeriodEnd),
]);

export const payments = pgTable('payments', {
    id: uuid('id').primaryKey().defaultRandom(),
    subscriptionId: uuid('subscription_id').notNull().references(() => subscriptions.id, { onDelete: 'cascade' }),
    amountKopecks: integer('amount_kopecks').notNull(),
    // 'pending' | 'succeeded' | 'failed' | 'refunded'
    status: text('status').notNull().default('pending'),
    providerPaymentId: text('provider_payment_id'),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    receiptUrl: text('receipt_url'),
    failureReason: text('failure_reason'),
    // A-P0-1: stores `lastWebhookEventId` for replay dedupe + provider-side
    // correlation ids. JSONB so future providers (Tinkoff, CloudPayments) can
    // add fields without further migrations. See migration 0026.
    providerMetadata: jsonb('provider_metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    index('idx_payments_subscription').on(table.subscriptionId, sql`${table.createdAt} DESC`),
    index('idx_payments_provider_id').on(table.providerPaymentId),
    // C9 (миг.0045): partial-unique provider_payment_id (NOT NULL) — детерминизм вебхука.
    uniqueIndex('uq_payments_provider_payment_id').on(table.providerPaymentId).where(sql`${table.providerPaymentId} IS NOT NULL`),
]);

export const usageCounters = pgTable('usage_counters', {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    /** First day of month, UTC midnight. */
    periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
    vehiclesCount: integer('vehicles_count').notNull().default(0),
    ordersCount: integer('orders_count').notNull().default(0),
    copilotMessagesCount: integer('copilot_messages_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    uniqueIndex('uniq_usage_counters_org_period').on(table.organizationId, table.periodStart),
]);

// ================================================================
// МЧД — Машиночитаемые Доверенности (Round: ЭТрН 01.09.2026)
// ================================================================
// Реестр МЧД для ЭТрН-подписания. Мы МЧД не выпускаем — клиент получает
// XML от ФНС/УЦ и загружает к нам; при подписании транспортной накладной
// мы подбираем активную МЧД по ИНН подписанта (физлица) внутри его
// организации. См. migration 0029.
export const mchd = pgTable('mchd', {
    id: uuid('id').primaryKey().defaultRandom(),
    // B7.1 (migration 0030): RESTRICT — юр-сила подписей, нельзя стирать.
    organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'restrict' }),
    /** Идентификатор МЧД от ФНС, например "АА-12345678". Глобально уникален. */
    // C9 (миг.0043): per-org unique (был глобальный .unique() → cross-tenant 409-oracle).
    mchdNumber: varchar('mchd_number', { length: 64 }).notNull(),
    // Доверитель (юр-лицо)
    granterInn: varchar('granter_inn', { length: 12 }).notNull(),
    granterName: varchar('granter_name', { length: 255 }).notNull(),
    granterOgrn: varchar('granter_ogrn', { length: 15 }),
    // Доверенный (физлицо)
    granteeFullName: varchar('grantee_full_name', { length: 255 }).notNull(),
    granteeInn: varchar('grantee_inn', { length: 12 }).notNull(),
    granteePassport: varchar('grantee_passport', { length: 20 }),
    /** Полномочия (текст-описание: подписывать ЭТрН/ПУД и т.д.). */
    scope: text('scope').notNull(),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    /** 'active' | 'revoked' | 'expired' */
    status: varchar('status', { length: 20 }).notNull().default('active'),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revocationReason: text('revocation_reason'),
    /** Полный XML МЧД от ФНС. Большой — не выбираем по умолчанию в списке. */
    certificateXml: text('certificate_xml').notNull(),
    /** SHA256(certificate_xml) для проверки целостности. */
    certificateXmlHash: varchar('certificate_xml_hash', { length: 64 }).notNull(),
    uploadedByUserId: uuid('uploaded_by_user_id').references(() => users.id),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    index('idx_mchd_org_status').on(table.organizationId, table.status),
    index('idx_mchd_grantee_inn').on(table.granteeInn),
    // C9 (миг.0043): per-org unique номера МЧД (закрывает cross-tenant 409-oracle).
    uniqueIndex('uq_mchd_org_number').on(table.organizationId, table.mchdNumber),
]);

// ============================================================
// DPA Acceptances (Data Processing Acceptances) — 152-ФЗ ст. 9
// ============================================================
// Запись о согласии user'а на обработку ПДн через конкретного провайдера
// (Контур.Диадок, Wialon, Госключ, ...). Текст согласия живёт в
// docs/legal/dpa/<provider_id>.md, на момент accept фиксируем version
// + sha256(content). Миграция 0032.
export const dpaAcceptances = pgTable('dpa_acceptances', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'restrict' }),
    /** ProviderName enum string (e.g. 'diadoc', 'wialon'). */
    providerId: varchar('provider_id', { length: 50 }).notNull(),
    /** Semver принятой версии из YAML frontmatter ('1.0', '1.1', '2.0', ...). */
    version: varchar('version', { length: 20 }).notNull(),
    /** SHA-256 от полного содержимого markdown-файла на момент accept (64 hex). */
    contentHash: varchar('content_hash', { length: 64 }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    uniqueIndex('uq_dpa_acceptances_user_org_provider_version')
        .on(table.userId, table.organizationId, table.providerId, table.version),
    index('idx_dpa_acceptances_user_org_provider')
        .on(table.userId, table.organizationId, table.providerId),
    index('idx_dpa_acceptances_org_accepted_at')
        .on(table.organizationId, sql`${table.acceptedAt} DESC`),
]);
