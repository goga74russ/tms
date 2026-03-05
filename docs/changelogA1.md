# Changelog — Агент 1 (Заявки + Рейсы)

## [2026-03-04 15:00] Sprint 4.1 — Production-Ready

### Logist Dashboard
- Удалён `FALLBACK_ORDERS` mock — empty state + Retry при ошибке API
- Тип переименован: `MockOrder` → `Order`
- `KanbanBoard.tsx`: валидация переходов через `ORDER_STATE_TRANSITIONS`, shake-анимация при запрете, green/dim подсветка допустимых колонок
- `CreateTripModal.tsx` [NEW]: выбор ТС/водителя/заявок из API, overweight warning, POST /api/trips + assign, 409 обработка
- Toast-уведомления (success/error)

### Dispatcher Dashboard
- Удалён `TIMELINE_DATA` mock — timeline из `GET /api/trips`
- `buildTimelineData()` — построение сегментов из `plannedDepartureAt`/`completedAt`
- Trip Details Panel: номер, статус, прогресс-бар, водитель, ТС, мини-список точек маршрута
- Fixed: `RoutePoint.status` — `'arrived'` вместо `'in_progress'`

### OrderCard.tsx
- Тип `MockOrder` → `Order`, добавлен `onDragEnd` prop

## [2026-03-04 13:49] Интеграция улучшений безопасности и UI

### Новые компоненты
- `apps/web/src/components/ui/button.tsx` [NEW] — shadcn/ui-совместимый Button (variant, size)
- `apps/web/src/components/ui/card.tsx` [NEW] — shadcn/ui Card/CardHeader/CardContent/CardFooter

### Обновлён Logist Dashboard
- Подключение к API с polling каждые 30с (`/api/orders?limit=100`)
- Fallback на mock данные если API недоступен
- Оптимистичные обновления статусов через POST
- Динамический список контрагентов из данных
- Loading spinner в header
- Кнопка Refresh вызывает loadOrders()

### Принятые улучшения от аудита (Агент 7)
- `FOR UPDATE` для генерации номеров (race condition fix)
- Transactions в `changeOrderStatus`, `assignTrip`, `changeTripStatus`, `linkOrdersToTrip`
- Лимит пагинации ≤ 100
- Dispatcher: live API с polling 15с вместо mock

## [2026-03-04] Создание модулей Orders + Trips (Backend + Frontend)

### Backend — Orders (`apps/api/src/modules/orders/`)
- **service.ts**: CRUD, стейт-машина (draft→confirmed→assigned→in_transit→delivered/returned/cancelled), генерация номера ORD-YYYY-NNNNN, шаблоны, канбан-группировка, события
- **routes.ts**: GET /orders, GET /orders/kanban, GET /orders/:id, POST /orders, PUT /orders/:id, POST /orders/:id/confirm, POST /orders/:id/cancel, POST /orders/from-template
- RBAC: `requireAbility('read'|'create'|'update', 'Order')`

### Backend — Trips (`apps/api/src/modules/trips/`)
- **service.ts**: CRUD, стейт-машина (planning→assigned→inspection→waybill_issued→loading→in_transit→completed→billed/cancelled), назначение с проверками (вес, документы, пропуска, РТО), объединение заявок, маршрутные точки
- **routes.ts**: GET /trips, GET /trips/:id, POST /trips, PUT /trips/:id, POST /trips/:id/assign, POST /trips/:id/status, POST /trips/:id/cancel, CRUD точек маршрута, GET available-vehicles, GET available-drivers
- RBAC: `requireAbility('read'|'create'|'update', 'Trip')`

### Server Registration
- `server.ts`: раскомментированы orders + trips routes

### Frontend — Логист (`apps/web/src/app/logist/`)
- **page.tsx**: дашборд с канбан-доской, статистикой, фильтрами
- **KanbanBoard.tsx**: drag-and-drop по колонкам статусов
- **OrderCard.tsx**: карточка заявки с SLA-индикатором (зелёный/жёлтый/красный)
- **OrderFilters.tsx**: поиск, фильтр по клиенту, даты
- **CreateOrderModal.tsx**: модальное окно создания с валидацией

### Frontend — Диспетчер (`apps/web/src/app/dispatcher/`)
- **page.tsx**: дашборд со статистикой ТС, переключатель Карта/Таймлайн
- **DispatcherMap.tsx**: Leaflet карта с цветовыми маркерами ТС (🟢🟡🔴⚫)
- **AssignmentPanel.tsx**: панель назначения (заявки + свободные ТС)
- **VehicleTimeline.tsx**: горизонтальный таймлайн занятости ТС

### API Endpoints
| Метод | Путь | Описание |
|-------|------|----------|
| GET | /api/orders | Список заявок с пагинацией |
| GET | /api/orders/kanban | Заявки групп. по статусам |
| GET | /api/orders/:id | Детали заявки |
| POST | /api/orders | Создание заявки |
| PUT | /api/orders/:id | Обновление заявки |
| POST | /api/orders/:id/confirm | Подтверждение |
| POST | /api/orders/:id/cancel | Отмена |
| POST | /api/orders/from-template | Из шаблона |
| GET | /api/trips | Список рейсов |
| GET | /api/trips/:id | Детали рейса + точки + заявки |
| POST | /api/trips | Создание рейса |
| PUT | /api/trips/:id | Обновление рейса |
| POST | /api/trips/:id/assign | Назначение ТС+водителя |
| POST | /api/trips/:id/status | Смена статуса |
| POST | /api/trips/:id/cancel | Отмена |
| GET | /api/trips/:id/points | Точки маршрута |
| POST | /api/trips/:id/points | Добавить точку |
| PUT | /api/trips/:id/points/:pointId | Обновить точку |
| DELETE | /api/trips/:id/points/:pointId | Удалить точку |
| GET | /api/trips/available-vehicles | Свободные ТС |
| GET | /api/trips/available-drivers | Активные водители |

### Файлы
```
apps/api/src/modules/orders/service.ts    [NEW]
apps/api/src/modules/orders/routes.ts     [NEW]
apps/api/src/modules/trips/service.ts     [NEW]
apps/api/src/modules/trips/routes.ts      [NEW]
apps/api/src/server.ts                    [MODIFIED]
apps/web/src/app/logist/page.tsx          [NEW]
apps/web/src/app/logist/components/KanbanBoard.tsx      [NEW]
apps/web/src/app/logist/components/OrderCard.tsx         [NEW]
apps/web/src/app/logist/components/OrderFilters.tsx      [NEW]
apps/web/src/app/logist/components/CreateOrderModal.tsx  [NEW]
apps/web/src/app/dispatcher/page.tsx                     [NEW]
apps/web/src/app/dispatcher/components/DispatcherMap.tsx  [NEW]
apps/web/src/app/dispatcher/components/AssignmentPanel.tsx [NEW]
apps/web/src/app/dispatcher/components/VehicleTimeline.tsx [NEW]
```
