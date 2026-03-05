# Чейнджлог Агента 6 (E2E Интегратор и QA)

В этом файле фиксируются изменения, внесенные Агентом 6 в ходе склейки модулей и завершения Спринта 2.

## Изменения

### 1. Бесшовная E2E интеграция
- Исправлены разрывы в данных (ID, статусы).
- Исправлена проблема на бэкенде в модуле `finance.service.ts` с Drizzle ORM, где присоединялась неправильная схема при генерации счетов.

### 2. Оффлайн-синхронизация
- Настроен роут `POST /api/sync/events` в основном API (tms/api).
- Реализована базовая логика резолва конфликтов и обработки данных для оффлайн работы мобильного приложения.

### 3. Картография
- Добавлен моковый Geocoding сервис в приложении диспетчера.
- Реализована логика отображения маркеров на карте в `app/dispatcher/page.tsx` с использованием Leaflet.

### 4. Дизайн-система (UI/UX)
- Проведен масштабный рефакторинг UI/UX во всем веб-приложении.
- Установлены и интегрированы компоненты `shadcn/ui` (Button, Card, Table, Tabs, Badge и др.).
- Удалены кастомные стили и компоненты, все страницы приведены к единому дизайн-коду со светлой темой Tailwind.

### 5. Playwright E2E тестирование
- Установлен и настроен фреймворк `@playwright/test` в пакете `apps/web`.
- Написан базовый сквозной E2E-тест (`basic.spec.ts`) на процесс создания заявки логистом.

### 6. Спринт 2.5 — Аудит Фиксы (CRITICAL + HIGH)
- **C-1/C-2**: JWT hardcoded secret удалён, добавлен `process.exit(1)` при отсутствии `JWT_SECRET`. Rate limiting 5/мин на `/api/auth/login`.
- **C-3/C-5/H-7–H-11**: 12 функций обёрнуты в `db.transaction()` (finance, orders, trips, repairs, waybills).
- **C-4/C-6**: N+1 в `checkScheduledMaintenance()` — фильтрация на уровне БД вместо загрузки всех ТС.
- **C-7/C-8**: Sync RBAC: проверка роли `driver` + `verifyTripOwnership()` для всех событий.
- **H-1/M-1**: `@fastify/helmet` для security headers. Finance routes prefix `''` → `'/api'`.
- **H-5**: RBAC subject в contractor routes: `'Vehicle'` → `'Contractor'`. Добавлен `Contractor` в Subjects.
- **H-13/M-7**: Race condition в `generateOrderNumber` / `generateTripNumber` → `FOR UPDATE`.
- **H-18/M-19**: Экспорт `ORDER_STATE_TRANSITIONS`, `TRIP_STATE_TRANSITIONS`, `REPAIR_STATE_TRANSITIONS` из `@tms/shared`.
- **L-1**: Graceful shutdown (SIGINT/SIGTERM).
- Исправлена зависимость `@tms/shared` на `workspace:*` в `apps/api` и `apps/web`.

### 7. Security Sprint — Волна 2
- **H-15**: JWT → httpOnly cookie. `@fastify/cookie` registered, login sets `tms_token` cookie, `POST /api/auth/logout` clears cookie. Authenticate reads cookie-first with `Authorization: Bearer` fallback for mobile. Frontend `api.ts` uses `credentials: 'include'`.
- **C-3**: N+1 в `generateInvoices()` устранён. Добавлен `calculateBatchTripCosts()` — 2 запроса вместо N. Извлечён `computeTripCost()` для in-memory расчёта.
- **H-3**: Row-Level Security для водителей — `GET /trips` и `GET /waybills` фильтруют по `driverId` через `resolveDriverId(userId)`. Client RLS deferred (нет `contractorId` в users).
- **H-4**: Zod-валидация в 11 route handlers: fleet (vehicles/drivers/contractors create+update), repairs (create+update), trips (create). Добавлен `RepairRequestCreateSchema` в `@tms/shared`.
- **H-2**: CORS multi-origin через `CORS_ORIGIN.split(',')`.
