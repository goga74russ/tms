// ============================================================
// labels.ts — КАНОН RU-переводов enum/статусов/ролей/типов ТрансПульт.
//
// Единственный источник правды для лейблов на ВСЕХ поверхностях (web, mobile,
// api print-формы). Цель — один статус переводится одинаково везде; конец
// разъезжающимся локальным мапам (STATUS_LABEL/STATUS_PILL/... в 30+ файлах).
//
// Спека: docs/design/i18n-glossary.md (Desing). Значения enum СВЕРЕНЫ с
// apps/api/src/db/schema.ts pgEnum (§9 — дока местами неполна/неточна, истина
// в БД). Род согласован с сущностью (§7): cancelled = «Отменена» для заявки,
// «Отменён» для рейса → словари привязаны к сущности, не один общий STATUS.
//
// Использование:
//   import { TRIP_STATUS, label } from '@tms/shared';
//   <Pill>{label(TRIP_STATUS, trip.status)}</Pill>
//
// Cross-role review (i18n cleanup):
// - [x] Desing    — 2026-06-04, спека (i18n-glossary.md)
// - [x] PM        — 2026-06-10, scope/dispute (тарифы → Marketing v1.1)
// - [x] TransPult — 2026-06-10, labels.ts (канон, enum сверены с DB)
// - [ ] QA        — adversarial smoke (0 сырых {x.status}/{x.type}/{x.role})
// - [ ] Marketing — финальная сверка формулировок в кадре демо
// ============================================================

/** Fallback: пусто → «—», неизвестное значение → сырое (не падаем, но видно). */
export function label(map: Record<string, string>, v: string | null | undefined): string {
    if (v === null || v === undefined || v === '') return '—';
    return map[v] ?? String(v);
}

// ============================================================
// СТАТУСЫ (класс B — главное)
// ============================================================

/** order_status (заявка — ж.р.). DB: draft,confirmed,assigned,in_transit,delivered,returned,cancelled */
export const ORDER_STATUS: Record<string, string> = {
    draft: 'Черновик',
    confirmed: 'Подтверждена',
    assigned: 'Назначена',
    in_transit: 'В пути',
    delivered: 'Доставлена',
    returned: 'Возврат',
    cancelled: 'Отменена',
};

/** trip_status (рейс — м.р.). DB: planning,assigned,waybill_draft,inspection,waybill_issued,loading,in_transit,completed,billed,cancelled */
export const TRIP_STATUS: Record<string, string> = {
    planning: 'Планирование',
    assigned: 'Назначен',
    waybill_draft: 'ПЛ черновик',
    inspection: 'Осмотр',
    waybill_issued: 'Путевой лист выдан',
    loading: 'Погрузка',
    in_transit: 'В пути',
    completed: 'Завершён',
    billed: 'Выставлен счёт',
    cancelled: 'Отменён',
};

/** waybill_status (путевой лист — м.р.). DB: draft,medical_check,technical_check,issued,closed */
export const WAYBILL_STATUS: Record<string, string> = {
    draft: 'Черновик',
    medical_check: 'Медосмотр',
    technical_check: 'Техосмотр',
    issued: 'Выдан',
    closed: 'Закрыт',
};

/** route_point_status (точка — ж.р.). DB: pending,arrived,completed,skipped */
export const ROUTE_POINT_STATUS: Record<string, string> = {
    pending: 'Ожидает',
    arrived: 'Прибытие',
    completed: 'Пройдена',
    skipped: 'Пропущена',
};

/** vehicle_status (ТС — ж.р.). DB: available,assigned,in_trip,maintenance,broken,blocked */
export const VEHICLE_STATUS: Record<string, string> = {
    available: 'Свободна',
    assigned: 'Назначена',
    in_trip: 'В рейсе',
    maintenance: 'На ТО',
    broken: 'Неисправна',
    blocked: 'Заблокирована',
};

/** invoice_status (счёт — м.р.). DB: draft,issued,paid_partial,paid_full,cancelled,corrected */
export const INVOICE_STATUS: Record<string, string> = {
    draft: 'Черновик',
    issued: 'Выпущен',
    paid_partial: 'Частично оплачен',
    paid_full: 'Оплачен',
    cancelled: 'Аннулирован',
    corrected: 'Исправлен',
};

/** invoice_type. DB: payment,advance,sf,upd,corrective_sf,corrective_upd,act */
export const INVOICE_TYPE: Record<string, string> = {
    payment: 'Счёт на оплату',
    advance: 'Аванс (СФ)',
    sf: 'Счёт-фактура',
    upd: 'УПД',
    corrective_sf: 'Корректировочная СФ',
    corrective_upd: 'Корректировочный УПД',
    act: 'Акт',
};

/** invoice_correction_kind. DB: adjustment(КСФ),replacement(ИСФ) */
export const INVOICE_CORRECTION_KIND: Record<string, string> = {
    adjustment: 'Корректировочная СФ (КСФ)',
    replacement: 'Исправленная СФ (ИСФ)',
};

/** document_dossier_status (транспортный документ — м.р.). DB: missing,draft,sent,signed,received,accepted,rejected,exceptioned */
export const DOC_STATUS: Record<string, string> = {
    missing: 'Отсутствует',
    draft: 'Черновик',
    sent: 'Отправлен',
    signed: 'Подписан',
    received: 'Получен',
    accepted: 'Принят',
    rejected: 'Отклонён',
    exceptioned: 'Бумажное исключение',
};

/** shipment_lot_status (партия — ж.р.). DB: planned,assigned,loading,in_transit,delivered,partially_delivered,returned,cancelled */
export const LOT_STATUS: Record<string, string> = {
    planned: 'Запланирована',
    assigned: 'Назначена',
    loading: 'Погрузка',
    in_transit: 'В пути',
    delivered: 'Доставлена',
    partially_delivered: 'Доставлена частично',
    returned: 'Возврат',
    cancelled: 'Отменена',
};

/** trip_lot_assignment_status. DB: planned,loaded,in_transit,delivered,short,damaged,returned,cancelled */
export const LOT_ASSIGNMENT_STATUS: Record<string, string> = {
    planned: 'Запланирована',
    loaded: 'Загружена',
    in_transit: 'В пути',
    delivered: 'Доставлена',
    short: 'Недостача',
    damaged: 'Повреждение',
    returned: 'Возврат',
    cancelled: 'Отменена',
};

/** repair_status (заявка на ремонт — ж.р.). DB: created,waiting_parts,in_progress,done */
export const REPAIR_STATUS: Record<string, string> = {
    created: 'Новая',
    waiting_parts: 'Ожидает запчасти',
    in_progress: 'В работе',
    done: 'Выполнена',
};

/** fine_status (штраф — м.р.). DB: new,confirmed,paid,appealed */
export const FINE_STATUS: Record<string, string> = {
    new: 'Новый',
    confirmed: 'Подтверждён',
    paid: 'Оплачен',
    appealed: 'Обжалуется',
};

/** maintenance_status. DB: planned,overdue,done,cancelled */
export const MAINTENANCE_STATUS: Record<string, string> = {
    planned: 'Запланировано',
    overdue: 'Просрочено',
    done: 'Выполнено',
    cancelled: 'Отменено',
};

// ============================================================
// ТИПЫ / РОЛИ / ПРИОРИТЕТЫ
// ============================================================

/** user_role. DB: logist,dispatcher,manager,mechanic,medic,repair_service,driver,accountant,admin,client.
 *  carrier/super_admin не DB-роли, но встречаются в UI-контекстах — оставлены для совместимости. */
export const ROLE_LABELS: Record<string, string> = {
    admin: 'Администратор',
    dispatcher: 'Диспетчер',
    logist: 'Логист',
    manager: 'Менеджер',
    mechanic: 'Механик',
    medic: 'Медработник',
    medic_worker: 'Медработник',
    accountant: 'Бухгалтер',
    driver: 'Водитель',
    repair_service: 'Ремонтная служба',
    client: 'Клиент',
    carrier: 'Перевозчик',
    super_admin: 'Супер-администратор',
};

/** repair_priority / общий приоритет. DB: low,medium,high,critical */
export const PRIORITY_LABELS: Record<string, string> = {
    low: 'Низкий',
    medium: 'Средний',
    high: 'Высокий',
    critical: 'Критический',
};

/** severity события/гейта (close-gate, dossier item). Значения: critical,warning,info / blocking */
export const SEVERITY_LABELS: Record<string, string> = {
    critical: 'Критично',
    blocking: 'Блокер',
    warning: 'Предупреждение',
    info: 'Инфо',
};

/** incident_severity. DB: low,medium,critical */
export const INCIDENT_SEVERITY: Record<string, string> = {
    low: 'Низкая',
    medium: 'Средняя',
    critical: 'Критическая',
};

/** incident_status. DB: open,investigating,resolved,dismissed */
export const INCIDENT_STATUS: Record<string, string> = {
    open: 'Открыт',
    investigating: 'Расследуется',
    resolved: 'Решён',
    dismissed: 'Отклонён',
};

/** incident_type. DB: med_inspection,tech_inspection,road,cargo,other */
export const INCIDENT_TYPE: Record<string, string> = {
    med_inspection: 'Медосмотр',
    tech_inspection: 'Техосмотр',
    road: 'Дорожный',
    cargo: 'Груз',
    other: 'Прочее',
};

/** repair_source. DB: auto_inspection,driver,mechanic,scheduled. Fallback → «Прочее». */
export const REPAIR_SOURCE_LABELS: Record<string, string> = {
    auto_inspection: 'Авто-осмотр',
    driver: 'Водитель',
    mechanic: 'Механик',
    scheduled: 'Плановый',
};

/** Тип нарушения РТО (режим труда/отдыха). Значения из РТО-движка. */
export const BREACH_TYPE_LABELS: Record<string, string> = {
    daily_limit_exceeded: 'Превышен дневной лимит',
    weekly_limit_exceeded: 'Превышен недельный лимит',
    rest_violation: 'Нарушение режима отдыха',
};

/** Тип операционного исключения рейса. ⚠️ список best-effort — сверять с backend
 *  при добавлении новых; fallback мягкий. */
export const EXCEPTION_TYPE_LABELS: Record<string, string> = {
    OVERWEIGHT: 'Перегруз',
    TEMP_BREACH: 'Нарушение температуры',
    MISSING_DOCS: 'Отсутствие документов',
    ROUTE_DEVIATION: 'Отклонение от маршрута',
    DELAY: 'Опоздание',
};

/** Фаза документа/рейса (waybills phase). */
export const DOC_PHASE_LABELS: Record<string, string> = {
    planning: 'Планирование',
    active: 'Активен',
    completed: 'Завершён',
    archived: 'В архиве',
};

/** Источник замера температуры (odometer/reading source — temp). mock,sensor,manual */
export const READING_SOURCE_LABELS: Record<string, string> = {
    mock: 'Демо',
    sensor: 'Датчик',
    manual: 'Вручную',
};

/** odometer_source. DB: manual,gps,waybill,inspection */
export const ODOMETER_SOURCE_LABELS: Record<string, string> = {
    manual: 'Вручную',
    gps: 'GPS',
    waybill: 'Путевой лист',
    inspection: 'Осмотр',
};

/** trailer_type. DB: tent,board,refrigerator,cistern,flatbed,container,other */
export const TRAILER_TYPE_LABELS: Record<string, string> = {
    tent: 'Тент',
    board: 'Бортовой',
    refrigerator: 'Рефрижератор',
    cistern: 'Цистерна',
    flatbed: 'Площадка',
    container: 'Контейнеровоз',
    other: 'Прочий',
};

/** tariff_type. DB: per_km,per_ton,per_hour,fixed_route,combined */
export const TARIFF_TYPE_LABELS: Record<string, string> = {
    per_km: 'За км',
    per_ton: 'За тонну',
    per_hour: 'За час',
    fixed_route: 'Фикс. маршрут',
    combined: 'Комбинированный',
};

// ============================================================
// Audit log — сущности и события (§3.9, fallback мягкий)
// ============================================================

// Сверено с backend recordEvent entityType. Покрывает все значения, иначе
// audit-log течёт сырым (tech_inspection/med_inspection/route_point и т.п.).
export const ENTITY_LABELS: Record<string, string> = {
    trip: 'Рейс',
    order: 'Заявка',
    user: 'Пользователь',
    vehicle: 'ТС',
    invoice: 'Счёт',
    waybill: 'Путевой лист',
    driver: 'Водитель',
    contractor: 'Контрагент',
    incident: 'Инцидент',
    organization: 'Организация',
    claim: 'Претензия',
    document: 'Документ',
    document_return: 'Возврат документов',
    fine: 'Штраф',
    med_inspection: 'Медосмотр',
    tech_inspection: 'Техосмотр',
    repair: 'Ремонт',
    repair_request: 'Заявка на ремонт',
    repair_part_catalog: 'Каталог запчастей',
    route_point: 'Точка маршрута',
    shipment_fact: 'Факт отгрузки',
    shipment_lot: 'Партия груза',
    thing: 'Объект',
};

/** Полный словарь событий audit-log. Ключи сверены с backend recordEvent
 *  (apps/api/src — eventType:'...'). Прямой словарь, а не композиция «entity
 *  action» — иначе грамматика кривая («Рейс статус изменён»). */
export const EVENT_LABELS: Record<string, string> = {
    // trip
    'trip.created': 'Рейс создан',
    'trip.assigned': 'Рейс назначен',
    'trip.started': 'Рейс начат',
    'trip.finished': 'Рейс завершён',
    'trip.completed': 'Рейс завершён',
    'trip.cancelled': 'Рейс отменён',
    'trip.closed': 'Рейс закрыт',
    'trip.departed': 'Рейс отправлен',
    'trip.status_changed': 'Статус рейса изменён',
    'trip.waybill_issued': 'Путевой лист выдан',
    'trip.eta_updated': 'Прибытие обновлено',
    'trip.adr_warning': 'ADR-предупреждение по рейсу',
    'trip.carrier_cost_changed': 'Стоимость перевозчика изменена',
    'trip.driver_cleared': 'Водитель снят с рейса',
    'trip.route_points_sorted': 'Точки маршрута отсортированы',
    'trip.route.readdressed': 'Переадресация маршрута',
    'trip.point.downtime_recorded': 'Простой на точке записан',
    'trip.disruption.breakdown': 'Поломка в рейсе',
    'trip.resource.replaced': 'Замена ресурса в рейсе',
    'trip.crew.rest_plan_recorded': 'План отдыха экипажа записан',
    'trip.post_trip.return_recorded': 'Возврат после рейса записан',
    'trip.cancellation.after_arrival': 'Отмена рейса после подачи',
    'trip.volume_overflow_overridden': 'Перегруз по объёму подтверждён',
    // order
    'order.created': 'Заявка создана',
    'order.assigned': 'Заявка назначена',
    'order.in_transit': 'Заявка в пути',
    'order.delivered': 'Заявка доставлена',
    'order.split_lots': 'Заявка разбита на партии',
    'order.customer_price_changed': 'Цена клиента изменена',
    // inspection
    'inspection.completed': 'Осмотр завершён',
    'inspection.decision_changed': 'Решение по осмотру изменено',
    'inspection.med_started': 'Медосмотр начат',
    'inspection.med_completed': 'Медосмотр завершён',
    'inspection.tech_started': 'Техосмотр начат',
    'inspection.tech_completed': 'Техосмотр завершён',
    // invoice
    'invoice.created': 'Счёт создан',
    'invoice.draft_created': 'Создан черновик счёта',
    'invoice.auto_created': 'Счёт создан автоматически',
    'invoice.issued': 'Счёт выпущен',
    'invoice.cancelled': 'Счёт аннулирован',
    'invoice.correction_issued': 'Выпущена корректировка счёта',
    'invoice.payment_registered': 'Оплата зарегистрирована',
    'invoice.partial_payment.recorded': 'Частичная оплата записана',
    'invoice.additional_service.added': 'Доп. услуга добавлена в счёт',
    // document / signature
    'document.created': 'Документ создан',
    'document.signed': 'Документ подписан',
    'document_return.created': 'Возврат документов создан',
    'document_return.updated': 'Возврат документов обновлён',
    'signature_recorded': 'Подпись зафиксирована',
    'signature_refused': 'Отказ от подписи',
    'signed': 'Подписано',
    'signed_by_carrier': 'Подписано перевозчиком',
    'provider_callback': 'Колбэк провайдера',
    'provider_send': 'Отправка провайдеру',
    'retry_requested': 'Запрошена повторная отправка',
    // fleet / repair / fine
    'vehicle.created': 'ТС создано',
    'vehicle.status_changed': 'Статус ТС изменён',
    'driver.created': 'Водитель добавлен',
    'contractor.created': 'Контрагент создан',
    'fine.registered': 'Штраф зарегистрирован',
    'fine.auto_imported': 'Штраф импортирован автоматически',
    'repair.created': 'Заявка на ремонт создана',
    'repair.catalog_item_created': 'Позиция каталога ремонта создана',
    'repair.catalog_item_updated': 'Позиция каталога ремонта обновлена',
    'repair.catalog_item_archived': 'Позиция каталога ремонта архивирована',
    // claims
    'claim_created': 'Претензия создана',
    'claim_resolved': 'Претензия урегулирована',
    'claim_status_changed': 'Статус претензии изменён',
    // shipment / temperature / rto
    'shipment_lot.assigned_to_trip': 'Партия назначена на рейс',
    'temperature.recorded': 'Замер температуры записан',
    'temperature.breach': 'Нарушение температуры',
    'rto.breach': 'Нарушение режима труда и отдыха',
    // org / integration / sync / demo / misc
    'organization.tax_regime_changed': 'Налоговый режим изменён',
    'integration.wialon_sync': 'Синхронизация Wialon',
    'integration.fines_sync': 'Синхронизация штрафов',
    'integration.billing_daily': 'Дневной биллинг',
    'sync.conflict': 'Конфликт синхронизации',
    'sync.event_processed': 'Событие синхронизации обработано',
    'synced': 'Синхронизировано',
    'demo.generated': 'Демо-данные сгенерированы',
    'demo.cleanup': 'Демо-данные очищены',
    'created': 'Создано',
    'registered': 'Зарегистрировано',
    'status_changed': 'Статус изменён',
    'status_updated': 'Статус обновлён',
    'mystery.unknown': 'Неизвестное событие',
};

// Композиция для НЕизвестных entity.action (fallback перед мягким).
const ENTITY_PHRASE: Record<string, string> = {
    ...ENTITY_LABELS, inspection: 'Осмотр', claim: 'Претензия', document: 'Документ',
    fine: 'Штраф', repair: 'Ремонт', temperature: 'Температура', signature: 'Подпись',
};
const ACTION_VERBS: Record<string, string> = {
    created: 'создан', updated: 'изменён', deleted: 'удалён', signed: 'подписан',
    issued: 'выпущен', cancelled: 'отменён', completed: 'завершён', assigned: 'назначен',
    started: 'начат', finished: 'завершён', registered: 'зарегистрирован',
    status_changed: 'изменён', recorded: 'записан',
};

/** Событие audit-log → русская фраза. Прямой словарь (81 backend-событие);
 *  затем композиция entity+action; затем мягкий fallback (не сырой английский id). */
export function eventLabel(event: string | null | undefined): string {
    if (!event) return '—';
    if (EVENT_LABELS[event]) return EVENT_LABELS[event];
    const [entity, action] = event.split('.');
    if (entity && action && ENTITY_PHRASE[entity] && ACTION_VERBS[action]) {
        return `${ENTITY_PHRASE[entity]} ${ACTION_VERBS[action]}`;
    }
    // Неизвестное — нейтральная русская обёртка + машинный id (для трассировки),
    // НЕ де-пунктуированный английский (раньше выдавал «Trip status changed»).
    return `Событие: ${event}`;
}

// ============================================================
// Тарифные планы — Marketing v1.1 (PM-call: НЕ LEAVE, переименовать).
// Перебивает i18n-glossary §4.1. enterprise — мой дефолт «Корпоративный»
// (Marketing v1.1 §6.6 русифицировал Free/Pro/Business; enterprise не назвал
// → флаг для Marketing).
// ============================================================
export const PLAN_LABELS: Record<string, string> = {
    free: 'Бесплатный',
    pro: 'Старт',
    business: 'Парк',
    enterprise: 'Корпоративный',
};

// ============================================================
// Брендовые/продуктовые константы (§4)
// ============================================================
/** AI Co-pilot → единое «ИИ-помощник» (§4.2, дефолт Desing, подтв. PM). */
export const AI_ASSISTANT_LABEL = 'ИИ-помощник';
