# 🗄️ TMS — Схема базы данных

> **ORM:** Drizzle | **Файл:** `apps/api/src/db/schema.ts` (594 строки)
> **Обновлено:** 05.03.2026

## Таблицы

### Пользователи и организации

| Таблица | Назначение | Ключевые поля |
|---------|-----------|---------------|
| `users` | Пользователи системы | email, passwordHash, roles[], organizationId, contractorId |
| `contractors` | Контрагенты (клиенты) | name, inn, kpp, ogrn, legalAddress, contactPerson |
| `contracts` | Договоры перевозки | contractorId, number, startDate, endDate, isActive |

### Тарификация

| Таблица | Назначение | Ключевые поля |
|---------|-----------|---------------|
| `tariffs` | Тарифы (привязаны к договору) | contractId, type, ratePerKm, ratePerTon, ratePerHour, fixedRate, модификаторы |

**Типы тарифов:** `per_km`, `per_ton`, `per_hour`, `fixed_route`, `combined`

**7 модификаторов:** idle, extraPoints, night, urgent, weekend, return, cancellation

### Автопарк

| Таблица | Назначение | Ключевые поля |
|---------|-----------|---------------|
| `vehicles` | Транспортные средства | plateNumber (unique), vin (unique), make, model, status, fuelNormPer100Km |
| `drivers` | Водители | userId, fullName, licenseNumber, licenseExpiry, phone |
| `permits` | Пропуска для зон | vehicleId, zone, number, validFrom, validTo |
| `fines` | Штрафы ГИБДД | vehicleId, driverId, number, amount, status (стейт-машина) |

**Статусы ТС:** `available`, `assigned`, `in_trip`, `maintenance`, `broken`

### Заявки и рейсы

| Таблица | Назначение | Ключевые поля |
|---------|-----------|---------------|
| `orders` | Заявки на перевозку | number (ORD-YYYY-NNNNN), contractorId, status, cargoDescription, addresses |
| `trips` | Рейсы | number (TRP-YYYY-NNNNN), vehicleId, driverId, status, distances, odometer |
| `route_points` | Маршрутные точки рейса | tripId, type (loading/unloading), lat/lon, address, status, sequence |

**Статусы заявок:** `draft` → `confirmed` → `assigned` → `in_transit` → `delivered` → `completed` / `cancelled`

**Статусы рейсов:** `planned` → `assigned` → `waybill_issued` → `in_transit` → `completed` / `cancelled`

### Осмотры и путевые листы

| Таблица | Назначение | Ключевые поля |
|---------|-----------|---------------|
| `tech_inspections` | Техосмотры (механик) | vehicleId, decision (approved/rejected), checklist, signature |
| `med_inspections` | Медосмотры (152-ФЗ) | driverId, decision, vitals (зашифрованы для не-медиков) |
| `med_access_log` | Лог доступа к медданным | userId, inspectionId, action, timestamp |
| `waybills` | Путевые листы | number (WB-YYYY-NNNNN), tripId, vehicleId, driverId, odometer, status |

### Ремонты

| Таблица | Назначение | Ключевые поля |
|---------|-----------|---------------|
| `repair_requests` | Заявки на ремонт | vehicleId, source, description, cost, status |

**Статусы:** `created` → `waiting_parts` → `in_progress` → `done`

**Источники:** `auto_inspection`, `driver`, `mechanic`, `scheduled`

### Финансы

| Таблица | Назначение | Ключевые поля |
|---------|-----------|---------------|
| `invoices` | Счета | number (INV-YYYY-NNNNN), contractorId, amount, status, periodStart/End |

**Статусы:** `draft` → `sent` → `paid` / `overdue` / `cancelled`

### Аудит и события

| Таблица | Назначение | Ключевые поля |
|---------|-----------|---------------|
| `events` | Журнал событий (append-only) | authorId, eventType, entityType, entityId, data (JSONB) |
| `checklist_templates` | Шаблоны чеклистов | type, version, name, items[] |

### Геозоны

| Таблица | Назначение | Ключевые поля |
|---------|-----------|---------------|
| `restriction_zones` | Зоны ограничений | name, geoJson (JSONB), restrictions, passes |

## Enum-ы (pgEnum)

| Enum | Значения |
|------|----------|
| `order_status` | draft, confirmed, assigned, in_transit, delivered, completed, cancelled |
| `trip_status` | planned, assigned, waybill_issued, in_transit, completed, cancelled |
| `vehicle_status` | available, assigned, in_trip, maintenance, broken |
| `repair_status` | created, waiting_parts, in_progress, done |
| `fine_status` | new, confirmed, paid, appealed |
| `waybill_status` | formed, open, closed |
| `inspection_decision` | approved, rejected |
| `tariff_type` | per_km, per_ton, per_hour, fixed_route, combined |
| `route_point_type` | loading, unloading |
| `route_point_status` | pending, arrived, completed, skipped |
| `repair_source` | auto_inspection, driver, mechanic, scheduled |

## Индексы

- `idx_users_email` — уникальный
- `idx_vehicles_plate`, `idx_vehicles_vin` — уникальные
- `idx_orders_number`, `idx_orders_status`, `idx_orders_contractor`
- `idx_trips_vehicle`, `idx_trips_driver`, `idx_trips_status`
- `idx_route_points_trip`
- `idx_events_entity`, `idx_events_type`, `idx_events_author`
- `idx_med_access_log` — 3 индекса (userId, inspectionId, timestamp)
- `idx_tariffs_contract`
- `idx_fines_vehicle`, `idx_fines_driver`

## Триггеры (append-only)

SQL-триггеры запрещают UPDATE/DELETE на:
- `events` — журнал событий
- `tech_inspections` — результаты техосмотров
- `med_inspections` — результаты медосмотров

Файл: `apps/api/src/db/triggers.ts`

## Денежные поля

Все финансовые поля используют `numeric(12,2)` (не float):
- `tariffs`: ratePerKm, ratePerTon, ratePerHour, fixedRate, cancellationFee, minTripCost
- `invoices`: totalAmount
- `fines`: amount
- `repair_requests`: estimatedCost, actualCost

Координаты и физические величины: `doublePrecision`
