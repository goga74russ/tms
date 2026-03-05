# 🔍 Full Project Audit — TMS (Transport Management System)

## Роль
Ты — Senior Backend Architect + Security Auditor. Проведи **полный аудит кодовой базы** TMS-системы управления грузоперевозками. Будь максимально жёстким и честным. Не молчи о проблемах.

## Технический стек
- **API:** Node.js + Fastify + Drizzle ORM + PostgreSQL + Redis/BullMQ
- **Web:** Next.js 15 (App Router) + React 19 + TypeScript
- **Mobile:** React Native / Expo (MVP)
- **Auth:** JWT (httpOnly cookies) + bcrypt + RBAC (roles: admin, logist, dispatcher, mechanic, medic, manager, accountant, driver, repair_service)
- **Monorepo:** pnpm workspaces (`apps/api`, `apps/web`, `apps/mobile`, `packages/shared`)

## Scope — что аудировать

### 1. Backend (apps/api/src/)
Пройди **каждый файл** в:
- `auth/` — аутентификация, JWT, bcrypt
- `db/` — schema.ts, connection.ts, seed.ts, triggers.ts
- `events/` — event journal
- `modules/orders/` — заявки (CRUD + state machine)
- `modules/trips/` — рейсы (CRUD + state machine + assignment)
- `modules/fleet/` — автопарк (vehicles, drivers, contractors, permits, fines)
- `modules/inspections/` — техосмотры, медосмотры
- `modules/waybills/` — путевые листы
- `modules/repairs/` — ремонтные заявки
- `modules/finance/` — тарификация, счета, 1С экспорт, топливо, KPI
- `modules/sync/` — offline sync для мобильного
- `server.ts` — точка входа Fastify
- `drizzle.config.ts` — конфиг миграций

### 2. Frontend (apps/web/src/)
- `lib/api.ts` — HTTP client
- `app/layout.tsx` — root layout + auth
- Страницы: logistics, dispatcher, fleet, inspections, finance, kpi
- Компоненты: KanbanBoard, VehiclesTable, DriversTable, модалки

### 3. Mobile (apps/mobile/)
- `app/` — Expo Router screens
- `api/` — auth, sync
- `components/` — screens for driver

### 4. Shared (packages/shared/)
- Zod schemas, types, constants

### 5. DevOps
- `docker-compose.yml`, `docker-compose.prod.yml`
- `Dockerfile` (apps/api, apps/web)
- `.env.example`

## Что искать — чеклист

### 🔴 CRITICAL (блокирует деплой)
- [ ] SQL injection / NoSQL injection
- [ ] Broken authentication (JWT leaks, weak secrets, missing validation)
- [ ] N+1 queries (SELECT in loop)
- [ ] Memory leaks (загрузка всех записей в RAM)
- [ ] Missing authorization checks (RBAC bypass)
- [ ] Race conditions (concurrent writes without transactions)
- [ ] Hardcoded secrets in source code

### 🟠 HIGH (важно для production)
- [ ] Missing database transactions (multi-step operations)
- [ ] Missing input validation (Zod schemas)
- [ ] CORS / Helmet / rate limiting misconfiguration
- [ ] Missing Row-Level Security (driver sees all data)
- [ ] `@ts-ignore` / `@ts-expect-error` usage
- [ ] Error handling (catch without proper response)
- [ ] Authentication token storage (localStorage vs httpOnly)

### 🟡 MEDIUM (quality / maintainability)
- [ ] Missing database indexes
- [ ] Hardcoded configuration values
- [ ] Dead code / unused imports
- [ ] Missing pagination limits
- [ ] Console.log in production code
- [ ] Missing error boundaries (React)
- [ ] State machine validation gaps

### 🟢 LOW (nice to have)
- [ ] Test coverage gaps
- [ ] Missing TypeScript strict mode
- [ ] CSS performance (transition: all)
- [ ] Accessibility issues
- [ ] Missing graceful shutdown

## Формат ответа

Для КАЖДОЙ найденной проблемы укажи:

```
### [SEVERITY] ID: Краткое описание
- **Файл:** `path/to/file.ts:LINE`
- **Проблема:** Что именно плохо
- **Риск:** Что может произойти
- **Fix:** Конкретный код-фикс или подход
```

В конце дай:
1. **Сводную таблицу** всех находок (ID | Severity | File | Description)
2. **Топ-5 приоритетов** — что фиксить первым
3. **Оценку production-readiness** (0-10) с обоснованием

## ⚠️ Важно
- НЕ хвали код — ищи проблемы
- НЕ пиши "всё выглядит хорошо" — копай глубже
- Проверяй КАЖДЫЙ файл, а не только очевидные
- Ищи проблемы на стыках модулей (cross-module issues)
- Обращай внимание на copy-paste баги (одинаковый код с разными entity но одинаковым eventType)
