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
    WAYBILL_DRAFT: 'waybill_draft',
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
    DRAFT: 'draft',
    MEDICAL_CHECK: 'medical_check',
    TECHNICAL_CHECK: 'technical_check',
    ISSUED: 'issued',
    CLOSED: 'closed',
} as const;
export type WaybillStatus = (typeof WaybillStatus)[keyof typeof WaybillStatus];

// --- Решение осмотра ---
export const InspectionDecision = {
    APPROVED: 'approved',
    REJECTED: 'rejected',
} as const;
export type InspectionDecision = (typeof InspectionDecision)[keyof typeof InspectionDecision];

export const InspectionType = {
    PRE_TRIP: 'pre_trip',
    PERIODIC: 'periodic',
    POST_TRIP: 'post_trip',
} as const;
export type InspectionType = (typeof InspectionType)[keyof typeof InspectionType];

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

export const TransportDocumentType = {
    WAYBILL: 'waybill',
    DELIVERY_CONFIRMATION: 'delivery_confirmation',
    DOCUMENT_RETURN: 'document_return',
} as const;
export type TransportDocumentType = (typeof TransportDocumentType)[keyof typeof TransportDocumentType];

export const TransportDocumentStatus = {
    DRAFT: 'draft',
    READY: 'ready',
    SENT: 'sent',
    ACCEPTED: 'accepted',
    REJECTED: 'rejected',
    CORRECTED: 'corrected',
    COMPLETED: 'completed',
    PENDING: 'pending',
    RECEIVED: 'received',
    OVERDUE: 'overdue',
    ERROR: 'error',
} as const;
export type TransportDocumentStatus = (typeof TransportDocumentStatus)[keyof typeof TransportDocumentStatus];

export const TransportDocumentExchangeStatus = {
    QUEUED: 'queued',
    SENT: 'sent',
    ACKNOWLEDGED: 'acknowledged',
    DELIVERED: 'delivered',
    ACCEPTED: 'accepted',
    REJECTED: 'rejected',
    FAILED: 'failed',
} as const;
export type TransportDocumentExchangeStatus = (typeof TransportDocumentExchangeStatus)[keyof typeof TransportDocumentExchangeStatus];

export const TransportDocumentExchangeDirection = {
    OUTBOUND: 'outbound',
    INBOUND: 'inbound',
} as const;
export type TransportDocumentExchangeDirection = (typeof TransportDocumentExchangeDirection)[keyof typeof TransportDocumentExchangeDirection];

export const TransportDocumentReceiptType = {
    ACK: 'ack',
    ACCEPTANCE: 'acceptance',
    REJECTION: 'rejection',
    CORRECTION_REQUIRED: 'correction_required',
    REGISTRATION: 'registration',
    DELIVERY: 'delivery',
} as const;
export type TransportDocumentReceiptType = (typeof TransportDocumentReceiptType)[keyof typeof TransportDocumentReceiptType];
export const EtrnTitleType = {
    TITLE_01: 'title_01',
    TITLE_02: 'title_02',
    TITLE_03: 'title_03',
    TITLE_04: 'title_04',
    TITLE_05: 'title_05',
    TITLE_06: 'title_06',
    TITLE_07: 'title_07',
    TITLE_08: 'title_08',
} as const;
export type EtrnTitleType = (typeof EtrnTitleType)[keyof typeof EtrnTitleType];

export const EtrnTitleStatus = {
    MISSING: 'missing',
    DRAFT: 'draft',
    READY: 'ready',
    SENT: 'sent',
    ACCEPTED: 'accepted',
    REJECTED: 'rejected',
    CORRECTED: 'corrected',
    COMPLETED: 'completed',
    BLOCKED: 'blocked',
    NOT_APPLICABLE: 'not_applicable',
} as const;
export type EtrnTitleStatus = (typeof EtrnTitleStatus)[keyof typeof EtrnTitleStatus];

export const EtrnWorkflowStatus = {
    DRAFT: 'draft',
    PARTIAL: 'partial',
    IN_PROGRESS: 'in_progress',
    COMPLETE: 'complete',
    BLOCKED: 'blocked',
} as const;
export type EtrnWorkflowStatus = (typeof EtrnWorkflowStatus)[keyof typeof EtrnWorkflowStatus];

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

// --- Sprint 9: Инциденты ---
export const IncidentSeverity = {
    LOW: 'low',
    MEDIUM: 'medium',
    CRITICAL: 'critical',
} as const;
export type IncidentSeverity = (typeof IncidentSeverity)[keyof typeof IncidentSeverity];

export const IncidentStatus = {
    OPEN: 'open',
    INVESTIGATING: 'investigating',
    RESOLVED: 'resolved',
    DISMISSED: 'dismissed',
} as const;
export type IncidentStatus = (typeof IncidentStatus)[keyof typeof IncidentStatus];

export const IncidentType = {
    MED_INSPECTION: 'med_inspection',
    TECH_INSPECTION: 'tech_inspection',
    ROAD: 'road',
    CARGO: 'cargo',
    OTHER: 'other',
} as const;
export type IncidentType = (typeof IncidentType)[keyof typeof IncidentType];

// --- Sprint 9: Прицепы ---
export const TrailerType = {
    TENT: 'tent',
    BOARD: 'board',
    REFRIGERATOR: 'refrigerator',
    CISTERN: 'cistern',
    FLATBED: 'flatbed',
    CONTAINER: 'container',
    OTHER: 'other',
} as const;
export type TrailerType = (typeof TrailerType)[keyof typeof TrailerType];

// --- Sprint 9: Категории расходов ---
export const ExpenseCategory = {
    FUEL: 'fuel',
    PLATON: 'platon',
    PARKING: 'parking',
    FINE: 'fine',
    REPAIR: 'repair',
    TOLL: 'toll',
    OTHER: 'other',
} as const;
export type ExpenseCategory = (typeof ExpenseCategory)[keyof typeof ExpenseCategory];

// --- Sprint 13: Подтверждение доставки ---
export const ConfirmationMode = {
    NONE: 'none',
    OPTIONAL: 'optional',
    REQUIRED: 'required',
} as const;
export type ConfirmationMode = (typeof ConfirmationMode)[keyof typeof ConfirmationMode];

export const CargoCondition = {
    INTACT: 'intact',
    DAMAGED: 'damaged',
    PARTIAL: 'partial',
} as const;
export type CargoCondition = (typeof CargoCondition)[keyof typeof CargoCondition];

export const ForcedReason = {
    NO_MOBILE: 'no_mobile',
    RECIPIENT_REFUSED: 'recipient_refused',
    NO_INTERNET: 'no_internet',
    OTHER: 'other',
} as const;
export type ForcedReason = (typeof ForcedReason)[keyof typeof ForcedReason];

// --- Sprint 19: Причина корректировки счёта ---
export const AdjustmentReason = {
    RATE_CHANGE: 'rate_change',
    VOLUME_CHANGE: 'volume_change',
    PENALTY: 'penalty',
    DISCOUNT: 'discount',
    ERROR_CORRECTION: 'error_correction',
    OTHER: 'other',
} as const;
export type AdjustmentReason = (typeof AdjustmentReason)[keyof typeof AdjustmentReason];

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
    [TripStatus.ASSIGNED]: [TripStatus.WAYBILL_DRAFT, TripStatus.INSPECTION, TripStatus.CANCELLED],
    [TripStatus.WAYBILL_DRAFT]: [TripStatus.WAYBILL_ISSUED, TripStatus.CANCELLED],
    [TripStatus.INSPECTION]: [TripStatus.WAYBILL_ISSUED, TripStatus.CANCELLED],
    [TripStatus.WAYBILL_ISSUED]: [TripStatus.LOADING, TripStatus.CANCELLED],
    [TripStatus.LOADING]: [TripStatus.IN_TRANSIT, TripStatus.CANCELLED],
    [TripStatus.IN_TRANSIT]: [TripStatus.COMPLETED],
    [TripStatus.COMPLETED]: [TripStatus.BILLED],
    [TripStatus.BILLED]: [],
    [TripStatus.CANCELLED]: [],
};

// --- Privileged roles (L-2: single source of truth) ---
export const PRIVILEGED_ROLES: readonly string[] = [
    UserRole.ADMIN, UserRole.DISPATCHER, UserRole.LOGIST, UserRole.MANAGER,
    UserRole.MECHANIC, UserRole.MEDIC, UserRole.ACCOUNTANT, UserRole.REPAIR_SERVICE,
] as const;

export function hasPrivilege(roles: string[]): boolean {
    return roles.some(r => PRIVILEGED_ROLES.includes(r));
}

export const REPAIR_STATE_TRANSITIONS: Record<string, string[]> = {
    [RepairStatus.CREATED]: [RepairStatus.WAITING_PARTS, RepairStatus.IN_PROGRESS],
    [RepairStatus.WAITING_PARTS]: [RepairStatus.IN_PROGRESS],
    [RepairStatus.IN_PROGRESS]: [RepairStatus.DONE, RepairStatus.WAITING_PARTS],
    [RepairStatus.DONE]: [],
};

// Deep Fleet Operations
export const FuelType = {
    DIESEL: 'diesel',
    PETROL: 'petrol',
    GAS: 'gas',
    ADBLUE: 'adblue',
} as const;
export type FuelType = typeof FuelType[keyof typeof FuelType];

export const OdometerSource = {
    MANUAL: 'manual',
    GPS: 'gps',
    WAYBILL: 'waybill',
    INSPECTION: 'inspection',
} as const;
export type OdometerSource = typeof OdometerSource[keyof typeof OdometerSource];

export const DowntimeReason = {
    REPAIR: 'repair',
    WAITING_LOAD: 'waiting_load',
    WAITING_DOCS: 'waiting_docs',
    DRIVER_ABSENCE: 'driver_absence',
    WEATHER: 'weather',
    OTHER: 'other',
} as const;
export type DowntimeReason = typeof DowntimeReason[keyof typeof DowntimeReason];

export const MaintenanceType = {
    TO1: 'to1',
    TO2: 'to2',
    TO3: 'to3',
    SEASONAL: 'seasonal',
    OTHER: 'other',
} as const;
export type MaintenanceType = typeof MaintenanceType[keyof typeof MaintenanceType];

export const MaintenanceStatus = {
    PLANNED: 'planned',
    OVERDUE: 'overdue',
    DONE: 'done',
    CANCELLED: 'cancelled',
} as const;
export type MaintenanceStatus = typeof MaintenanceStatus[keyof typeof MaintenanceStatus];


