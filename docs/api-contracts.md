# TMS — API контракты между модулями

Этот файл описывает как модули вызывают друг друга.
Если ты создаёшь эндпоинт, которым будет пользоваться другой модуль — **задокументируй его здесь**.

---

## Агент 1 → Агент 2 (Заявки → Осмотры)
При назначении рейса диспетчером, ТС попадает в очередь на техосмотр, а водитель — на медосмотр.
```
Триггер: trip.status = 'assigned'
Результат:
  - ТС появляется в GET /api/inspections/tech/queue
  - Водитель появляется в GET /api/inspections/med/queue
Реализация: Агент 2 читает trips со status='assigned' и проверяет наличие допуска
```

## Агент 2 → Агент 1 (Осмотры → Рейсы)
При недопуске ТС или водителя → уведомление диспетчеру для замены.
```
Триггер: inspection.decision = 'rejected'
Событие: inspection.tech_completed / inspection.med_completed (decision='rejected')
Результат: Диспетчер видит предупреждение в панели рейса
```

## Агент 2 → Агент 3 (Осмотры → Ремонты)
При недопуске ТС → автоматическая заявка на ремонт.
```
Триггер: tech_inspection.decision = 'rejected'
Действие: POST /api/repairs (source='auto_inspection', inspectionId=...)
Реализация: Агент 2 вызывает API ремонтов или создаёт запись напрямую
```

## Агент 3 → Агент 1 (Автопарк → Рейсы)
Статусы ТС и сроки документов влияют на назначение.
```
GET /api/fleet/vehicles/:id → status, документы, пропуска
Диспетчер (Агент 1) проверяет:
  - vehicle.status === 'available'
  - Документы не просрочены
  - Пропуска для маршрута
```

## Агент 1 → Агент 5 (Рейсы → Финансы)
Завершённые рейсы — основа для тарификации.
```
GET /api/trips?status=completed&billed=false
Результат: Агент 5 берёт закрытые рейсы для расчёта стоимости
```

## Агент 5 → Агент 3 (Финансы → Автопарк)
Штрафы привязаны к ТС.
```
GET /api/fleet/fines?vehicleId=...
GET /api/fleet/vehicles/:id (для расчёта амортизации)
```

## Агент 5 (Финансы & KPI) Контракты
Эндпоинты предоставляемые модулем финансов:
```
- GET /api/finance/trips/:id/cost (Расчёт стоимости рейса по тарифу клиента)
- GET /api/finance/invoices (Список выставленных счетов)
- POST /api/finance/invoices (Генерация счёта за период — Zod validated)
- PUT /api/finance/invoices/:id/status (Смена статуса: draft→sent→paid/overdue/cancelled)
- GET /api/finance/fuel-analysis (План-факт анализ расхода ГСМ + коэффициенты)
- GET /api/finance/kpi (Данные для дашборда: выручка, маржа, светофоры)
- GET /api/finance/export/1c (Экспорт в 1С EnterpriseData JSON)
```

## Агент 1: доступные эндпоинты (Orders + Trips)

### Заявки
```
GET /api/orders                  — список заявок (фильтры: status, contractorId, dateFrom, dateTo, search, page, limit)
GET /api/orders/kanban           — заявки группированные по статусам
GET /api/orders/:id              — детали заявки
POST /api/orders                 — создание заявки (Zod: OrderCreateSchema)
PUT /api/orders/:id              — обновление заявки
POST /api/orders/:id/confirm     — подтверждение (draft→confirmed)
POST /api/orders/:id/cancel      — отмена (body: { reason })
POST /api/orders/from-template   — создание из шаблона (body: { templateOrderId, overrides })
```

### Рейсы
```
GET /api/trips                   — список рейсов (фильтры: status, vehicleId, driverId, dateFrom, dateTo, page, limit)
GET /api/trips/:id               — детали рейса + routePoints + linked orders
POST /api/trips                  — создание рейса (body: { orderIds?, vehicleId?, driverId?, ... })
PUT /api/trips/:id               — обновление рейса
POST /api/trips/:id/assign       — назначение ТС+водителя (body: { vehicleId, driverId })
                                   → 409 если hardBlock, + warnings[] для softBlocks
POST /api/trips/:id/status       — смена статуса (body: { status, odometerStart?, odometerEnd?, fuelEnd? })
POST /api/trips/:id/cancel       — отмена (body: { reason })
GET /api/trips/available-vehicles — свободные ТС (status=available, не архивные)
GET /api/trips/available-drivers — активные водители
```

### Маршрутные точки
```
GET /api/trips/:id/points            — список точек рейса
POST /api/trips/:id/points           — добавить точку
PUT /api/trips/:id/points/:pointId   — обновить точку (status, arrivedAt, completedAt, signatureUrl, photoUrls)
DELETE /api/trips/:id/points/:pointId — удалить точку
```

---

## Агент 3: доступные эндпоинты (Fleet + Repairs)

### Автопарк — Транспорт
```
GET /api/fleet/vehicles           — список ТС (фильтры: status, search, archived, page, limit)
GET /api/fleet/vehicles/:id       — карточка ТС (+ repairs, permits, fines, deadlines)
POST /api/fleet/vehicles          — создание ТС (валидация: VIN, госномер, дубликаты)
PUT /api/fleet/vehicles/:id       — обновление ТС
```

### Автопарк — Водители
```
GET /api/fleet/drivers            — список водителей (фильтры: search, active, page, limit)
GET /api/fleet/drivers/:id        — карточка водителя (+ fines)
POST /api/fleet/drivers           — создание водителя
PUT /api/fleet/drivers/:id        — обновление водителя
```

### Автопарк — Контрагенты
```
GET /api/fleet/contractors        — список (фильтры: search, archived, page, limit)
POST /api/fleet/contractors       — создание (валидация: ИНН, дубликаты)
PUT /api/fleet/contractors/:id    — обновление
GET /api/fleet/contractors/lookup/:inn — DaData placeholder
```

### Автопарк — Пропуска
```
GET /api/fleet/permits            — список (фильтры: vehicleId, active, page, limit)
POST /api/fleet/permits           — создание
PUT /api/fleet/permits/:id        — обновление
```

### Автопарк — Штрафы
```
GET /api/fleet/fines              — список (фильтры: vehicleId, driverId, status, page, limit)
POST /api/fleet/fines             — создание
PUT /api/fleet/fines/:id          — обновление (стейт-машина: new→confirmed→paid/appealed)
GET /api/fleet/fines/analytics    — аналитика по штрафам
```

### Ремонты
```
GET /api/repairs                  — список (фильтры: status, vehicleId, search, dateFrom, dateTo, page, limit)
GET /api/repairs/:id              — детали заявки (+ vehicle info)
POST /api/repairs                 — создание (source: auto_inspection|driver|mechanic|scheduled)
PUT /api/repairs/:id              — обновление деталей
PUT /api/repairs/:id/status       — смена статуса (стейт-машина: created→waiting_parts→in_progress→done)
GET /api/repairs/analytics/by-status     — счётчики по статусам
GET /api/repairs/analytics/cost/:vehicleId — затраты на ремонт по ТС
```

## Агент 8: Интеграции с внешними API (Sprint 3)

### Телематика (Wialon)
```
POST /api/integrations/wialon/sync   — ручной запуск синхронизации одометров (BullMQ job)
```

### Штрафы (ГИБДД)
```
POST /api/integrations/fines/sync    — ручной запуск импорта штрафов (BullMQ job)
```

### DaData (Валидация ИНН / Адреса)
```
GET /api/integrations/dadata/lookup/:inn         — поиск компании по ИНН
GET /api/integrations/dadata/suggest-address?query= — подсказки адресов
```

### Топливные карты АЗС
```
GET /api/integrations/fuel/transactions/:vehicleId?days=30  — транзакции заправок + сводка
```

### Статус воркеров
```
GET /api/integrations/status         — здоровье очередей (waiting/active/completed/failed)
```

### Автоматическая интеграция
- `createContractor` автоматически обогащает данные из DaData по ИНН.
- BullMQ cron: Wialon sync каждые 15 мин, ГИБДД sync ежедневно в 03:00.

---

## Auth: дополнительные эндпоинты

```
POST /api/auth/login              — логин (rate-limited 5/мин)
POST /api/auth/logout             — логаут (clear cookie)
GET  /api/auth/me                 — текущий пользователь
GET  /api/auth/ws-token           — short-lived JWT (5мин) для WebSocket
GET  /api/auth/users              — список пользователей (admin)
POST /api/auth/users              — создание пользователя (admin)
PUT  /api/auth/users/:id          — обновление (admin, self-escalation guard)
GET  /api/auth/tariffs            — список тарифов (admin/accountant/manager)
POST /api/auth/tariffs            — создание тарифа (admin/accountant)
PUT  /api/auth/tariffs/:id        — обновление тарифа
GET  /api/auth/checklist-templates — шаблоны чеклистов (admin)
POST /api/auth/checklist-templates — создание шаблона
PUT  /api/auth/checklist-templates/:id — обновление шаблона
```

## Sync: мобильная синхронизация

```
GET  /api/sync/pull?lastSyncAt=<ISO>  — WatermelonDB pull (trips, vehicles, orders since date)
POST /api/sync/events                  — push events from mobile (max 100/batch)
```

## WebSocket: real-time позиции

```
WS   /api/ws/vehicles?token=<jwt>     — WebSocket stream (JWT auth через query param)
GET  /api/vehicles/positions           — REST fallback (cookie auth)
```

## ЭПД/ЭТрН: электронные документы

```
GET  /api/waybills/:id/etrn           — ЭТрН XML (Титул 1) для путевого листа
GET  /api/waybills/:id/etrn-title4    — ЭТрН XML (Титул 4)
```

## Health / Служебные

```
GET  /api/health/ready                — Readiness probe (DB + Redis)
GET  /api/integrations/status         — статус BullMQ workers
```

## Импорт данных (Sprint 7)

```
POST /api/import/vehicles             — массовый импорт ТС (JSON, до 200)
POST /api/import/drivers              — массовый импорт водителей
POST /api/import/contractors          — массовый импорт контрагентов
```

> Все эндпоинты требуют роль `admin` или `manager`.
> Принимают `{ items: [...] }`. Возвращают `{ created, errors[] }`.
> ⚠️ Drivers: userId = placeholder UUID, нужна привязка к аккаунтам.

## Аналитика (Sprint 8)

```
GET  /api/analytics/maintenance-alerts — алерты предиктивного ТО
GET  /api/analytics/profitability      — маржинальность рейсов
```

> `/maintenance-alerts` — дата-алерты (ТО/ОСАГО/техосмотр/тахограф) + одометр-алерты (до ТО < 2000 км).
> `/profitability` — revenue vs cost для каждого completed trip, % маржи, summary.
> ⚠️ Себестоимость упрощена (фиксированные коэф.), нет UI дашборда.

---

> **Правило**: Если модулю нужны данные из другого модуля — использовать ТОЛЬКО API или прямой SELECT из БД. НЕ импортировать код другого модуля.

