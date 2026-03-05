// ============================================================
// TMS — API Response DTO Types
// Lightweight types for frontend consumption.
// Full Zod schemas are in schemas.ts for validation.
// ============================================================

// Re-export everything from schemas and enums
export type {
    User, Vehicle, Driver, Order, Trip, RoutePoint,
    Contractor, Contract, Tariff, Waybill,
    TechInspection, MedInspection, RepairRequest,
    Permit, Fine, Invoice, TachographRecord,
    Event, RestrictionZone, ChecklistTemplate, Address,
    Pagination,
} from './schemas.js';

export type {
    UserRole, OrderStatus, TripStatus, VehicleStatus,
    RepairStatus, FineStatus, WaybillStatus,
    InspectionDecision, RoutePointType, RoutePointStatus,
    TariffType, EpdDocumentType, EventType,
    RestrictionZoneType, InvoicePaymentStatus,
} from './enums.js';

// ================================================================
// API Response DTOs — lighter types for frontend display
// These Omit sensitive or unnecessary fields
// ================================================================

import type { User, Vehicle, Driver, Order, Trip, Contractor, Invoice } from './schemas.js';

/** User без passwordHash — для отображения в UI */
export type UserDTO = Omit<User, 'passwordHash'>;

/** Vehicle краткий — для списков и карточек */
export type VehicleListItem = Pick<Vehicle,
    'id' | 'plateNumber' | 'make' | 'model' | 'year' | 'bodyType' |
    'status' | 'payloadCapacityKg' | 'currentOdometerKm'
>;

/** Driver краткий — для списков */
export type DriverListItem = Pick<Driver,
    'id' | 'fullName' | 'licenseNumber' | 'licenseCategories' |
    'licenseExpiry' | 'medCertificateExpiry' | 'isActive' | 'createdAt'
>;

/** Order краткий — для таблиц логиста */
export type OrderListItem = Pick<Order,
    'id' | 'number' | 'status' | 'contractorId' | 'cargoDescription' |
    'cargoWeightKg' | 'loadingAddress' | 'unloadingAddress' | 'createdAt'
>;

/** Trip краткий — для Kanban и таблиц */
export type TripListItem = Pick<Trip,
    'id' | 'number' | 'status' | 'vehicleId' | 'driverId' |
    'plannedDistanceKm' | 'plannedDepartureAt' | 'createdAt'
>;

/** Contractor краткий — для списков */
export type ContractorListItem = Pick<Contractor,
    'id' | 'name' | 'inn' | 'kpp' | 'phone' | 'email' | 'isArchived'
>;

/** Invoice краткий — для финансовых таблиц */
export type InvoiceListItem = Pick<Invoice,
    'id' | 'number' | 'contractorId' | 'type' | 'status' |
    'subtotal' | 'vatAmount' | 'total' | 'periodStart' | 'periodEnd' | 'paidAt'
>;

// ================================================================
// Analytics DTOs
// ================================================================

export interface MaintenanceAlert {
    vehicleId: string;
    plateNumber: string;
    make: string;
    model: string;
    type: string;
    severity: 'critical' | 'warning';
    message: string;
    daysLeft?: number;
    kmLeft?: number;
}

export interface TripProfitability {
    tripId: string;
    tripNumber: string;
    vehiclePlate: string;
    driverName: string;
    revenue: number;
    cost: number;
    margin: number;
    marginPercent: number;
}

export interface ProfitabilitySummary {
    totalTrips: number;
    totalRevenue: number;
    totalCost: number;
    totalMargin: number;
    avgMarginPercent: number;
}

// ================================================================
// Import DTOs
// ================================================================

export interface ImportResult {
    created: number;
    errors: Array<{ index: number; error: string }>;
}
