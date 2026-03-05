// ============================================================
// TMS — Enums & Constants
// Все статусы, роли, типы из §4.2 ТЗ
// ============================================================

// --- Роли (Приложение А) ---
export const UserRole = {
    LOGIST: 'logist',
    DISPATCHER: 'dispatcher',
    MANAGER: 'manager',
    MECHANIC: 'mechanic',
    MEDIC: 'medic',
    REPAIR_SERVICE: 'repair_service',
    DRIVER: 'driver',
    ACCOUNTANT: 'accountant',
    ADMIN: 'admin',
    CLIENT: 'client',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

// --- Статусы заявки (§4.2) ---
export const OrderStatus = {
    DRAFT: 'draft',
    CONFIRMED: 'confirmed',
    ASSIGNED: 'assigned',
    IN_TRANSIT: 'in_transit',
    DELIVERED: 'delivered',
    RETURNED: 'returned',
    CANCELLED: 'cancelled',
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

// --- Статусы рейса (§4.2) ---
export const TripStatus = {
    PLANNING: 'planning',
    ASSIGNED: 'assigned',
    INSPECTION: 'inspection',
    WAYBILL_ISSUED: 'waybill_issued',
    LOADING: 'loading',
    IN_TRANSIT: 'in_transit',
    COMPLETED: 'completed',
    BILLED: 'billed',
    CANCELLED: 'cancelled',
} as const;
export type TripStatus = (typeof TripStatus)[keyof typeof TripStatus];

// --- Статусы ТС (§4.2) ---
export const VehicleStatus = {
    AVAILABLE: 'available',
    ASSIGNED: 'assigned',
    IN_TRIP: 'in_trip',
    MAINTENANCE: 'maintenance',
    BROKEN: 'broken',
    BLOCKED: 'blocked',
} as const;
export type VehicleStatus = (typeof VehicleStatus)[keyof typeof VehicleStatus];

// --- Статусы ремонта (§4.2) ---
export const RepairStatus = {
    CREATED: 'created',
    WAITING_PARTS: 'waiting_parts',
    IN_PROGRESS: 'in_progress',
    DONE: 'done',
} as const;
export type RepairStatus = (typeof RepairStatus)[keyof typeof RepairStatus];

// --- Статусы штрафа (§4.2) ---
export const FineStatus = {
    NEW: 'new',
    CONFIRMED: 'confirmed',
    PAID: 'paid',
    APPEALED: 'appealed',
} as const;
export type FineStatus = (typeof FineStatus)[keyof typeof FineStatus];

// --- Статусы путевого листа (§4.2) ---
export const WaybillStatus = {
    FORMED: 'formed',
    OPEN: 'open',
    CLOSED: 'closed',
} as const;
export type WaybillStatus = (typeof WaybillStatus)[keyof typeof WaybillStatus];

// --- Решение осмотра ---
export const InspectionDecision = {
    APPROVED: 'approved',
    REJECTED: 'rejected',
} as const;
export type InspectionDecision = (typeof InspectionDecision)[keyof typeof InspectionDecision];

// --- Тип точки маршрута ---
export const RoutePointType = {
    LOADING: 'loading',
    UNLOADING: 'unloading',
} as const;
export type RoutePointType = (typeof RoutePointType)[keyof typeof RoutePointType];

// --- Статус точки маршрута ---
export const RoutePointStatus = {
    PENDING: 'pending',
    ARRIVED: 'arrived',
    COMPLETED: 'completed',
    SKIPPED: 'skipped',
} as const;
export type RoutePointStatus = (typeof RoutePointStatus)[keyof typeof RoutePointStatus];

// --- Типы тарифов (§3.9) ---
export const TariffType = {
    PER_KM: 'per_km',
    PER_TON: 'per_ton',
    PER_HOUR: 'per_hour',
    FIXED_ROUTE: 'fixed_route',
    COMBINED: 'combined',
} as const;
export type TariffType = (typeof TariffType)[keyof typeof TariffType];

// --- Типы документов ЭПД ---
export const EpdDocumentType = {
    ETRN: 'etrn',
    WAYBILL: 'waybill',
    ACT: 'act',
    UPD: 'upd',
} as const;
export type EpdDocumentType = (typeof EpdDocumentType)[keyof typeof EpdDocumentType];

// --- Типы событий (Приложение Б) ---
export const EventType = {
    // Заявки
    ORDER_CREATED: 'order.created',
    ORDER_CONFIRMED: 'order.confirmed',
    ORDER_ASSIGNED: 'order.assigned',
    ORDER_IN_TRANSIT: 'order.in_transit',
    ORDER_DELIVERED: 'order.delivered',
    ORDER_RETURNED: 'order.returned',
    ORDER_CANCELLED: 'order.cancelled',
    // Рейсы
    TRIP_CREATED: 'trip.created',
    TRIP_ASSIGNED: 'trip.assigned',
    TRIP_VEHICLE_CLEARED: 'trip.vehicle_cleared',
    TRIP_DRIVER_CLEARED: 'trip.driver_cleared',
    TRIP_WAYBILL_ISSUED: 'trip.waybill_issued',
    TRIP_LOADING_COMPLETE: 'trip.loading_complete',
    TRIP_DEPARTED: 'trip.departed',
    TRIP_CHECKPOINT_ARRIVED: 'trip.checkpoint_arrived',
    TRIP_CHECKPOINT_COMPLETED: 'trip.checkpoint_completed',
    TRIP_ROUTE_DEVIATION: 'trip.route_deviation',
    TRIP_SCHEDULE_DELAY: 'trip.schedule_delay',
    TRIP_RTO_WARNING: 'trip.rto_warning',
    TRIP_COMPLETED: 'trip.completed',
    TRIP_CLOSED: 'trip.closed',
    TRIP_CANCELLED: 'trip.cancelled',
    // Осмотры
    INSPECTION_TECH_STARTED: 'inspection.tech_started',
    INSPECTION_TECH_COMPLETED: 'inspection.tech_completed',
    INSPECTION_MED_STARTED: 'inspection.med_started',
    INSPECTION_MED_COMPLETED: 'inspection.med_completed',
    // Документы
    DOCUMENT_CREATED: 'document.created',
    DOCUMENT_SIGNED: 'document.signed',
    DOCUMENT_SENT: 'document.sent',
    DOCUMENT_ACCEPTED: 'document.accepted',
    DOCUMENT_REJECTED: 'document.rejected',
    DOCUMENT_CORRECTED: 'document.corrected',
    // Автопарк
    VEHICLE_STATUS_CHANGED: 'vehicle.status_changed',
    VEHICLE_DOCUMENT_EXPIRING: 'vehicle.document_expiring',
    REPAIR_CREATED: 'repair.created',
    REPAIR_STATUS_CHANGED: 'repair.status_changed',
    REPAIR_COMPLETED: 'repair.completed',
    // Финансы
    FINE_REGISTERED: 'fine.registered',
    FINE_PAID: 'fine.paid',
    INVOICE_CREATED: 'invoice.created',
    INVOICE_PAID: 'invoice.paid',
    // Телеметрия
    TELEMETRY_POSITION: 'telemetry.position',
    TACHOGRAPH_DATA: 'tachograph.data',
} as const;
export type EventType = (typeof EventType)[keyof typeof EventType];

// --- Зоны ограничений (§3.13) ---
export const RestrictionZoneType = {
    MKAD: 'mkad',
    TTK: 'ttk',
    CITY: 'city',
} as const;
export type RestrictionZoneType = (typeof RestrictionZoneType)[keyof typeof RestrictionZoneType];

// --- Статус оплаты счёта ---
export const InvoicePaymentStatus = {
    DRAFT: 'draft',
    SENT: 'sent',
    PAID: 'paid',
    OVERDUE: 'overdue',
    CANCELLED: 'cancelled',
} as const;
export type InvoicePaymentStatus = (typeof InvoicePaymentStatus)[keyof typeof InvoicePaymentStatus];

// ================================================================
// State Machine Transitions (H-18, M-19 — canonical maps for reuse)
// ================================================================

export const ORDER_STATE_TRANSITIONS: Record<string, string[]> = {
    [OrderStatus.DRAFT]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
    [OrderStatus.CONFIRMED]: [OrderStatus.ASSIGNED, OrderStatus.CANCELLED],
    [OrderStatus.ASSIGNED]: [OrderStatus.IN_TRANSIT, OrderStatus.CANCELLED],
    [OrderStatus.IN_TRANSIT]: [OrderStatus.DELIVERED, OrderStatus.RETURNED],
    [OrderStatus.DELIVERED]: [],
    [OrderStatus.RETURNED]: [],
    [OrderStatus.CANCELLED]: [],
};

export const TRIP_STATE_TRANSITIONS: Record<string, string[]> = {
    [TripStatus.PLANNING]: [TripStatus.ASSIGNED, TripStatus.CANCELLED],
    [TripStatus.ASSIGNED]: [TripStatus.INSPECTION, TripStatus.CANCELLED],
    [TripStatus.INSPECTION]: [TripStatus.WAYBILL_ISSUED, TripStatus.CANCELLED],
    [TripStatus.WAYBILL_ISSUED]: [TripStatus.LOADING, TripStatus.CANCELLED],
    [TripStatus.LOADING]: [TripStatus.IN_TRANSIT, TripStatus.CANCELLED],
    [TripStatus.IN_TRANSIT]: [TripStatus.COMPLETED],
    [TripStatus.COMPLETED]: [TripStatus.BILLED],
    [TripStatus.BILLED]: [],
    [TripStatus.CANCELLED]: [],
};

export const REPAIR_STATE_TRANSITIONS: Record<string, string[]> = {
    [RepairStatus.CREATED]: [RepairStatus.WAITING_PARTS, RepairStatus.IN_PROGRESS],
    [RepairStatus.WAITING_PARTS]: [RepairStatus.IN_PROGRESS],
    [RepairStatus.IN_PROGRESS]: [RepairStatus.DONE, RepairStatus.WAITING_PARTS],
    [RepairStatus.DONE]: [],
};

