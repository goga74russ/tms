# TMS — Архитектурные решения (ADR)

## ADR-001: pnpm workspaces
**Дата:** 2026-03-04
**Статус:** Принято (обновлено: npm → pnpm)
**Причина:** Изначально использовался npm workspaces, но позже мигрировали на pnpm для лучшей производительности и строгого разрешения зависимостей. `pnpm-workspace.yaml` + `workspace:*` protocol.

## ADR-002: PostgreSQL порт 5433
**Дата:** 2026-03-04
**Статус:** Принято
**Причина:** Порт 5432 занят существующим контейнером (chainwitness). TMS использует 5433.

## ADR-003: Append-only event journal
**Дата:** 2026-03-04
**Статус:** Принято
**Причина:** Требование ТЗ (Приложение Б). SQL-триггеры запрещают UPDATE/DELETE. Единственное исключение — поле `conflict` для оффлайн-синхронизации.

## ADR-004: CASL для RBAC
**Дата:** 2026-03-04
**Статус:** Принято
**Причина:** Гибкие, декларативные политики. Легко добавлять условия (например, "водитель видит только свои рейсы").

## ADR-005: Медданные — 152-ФЗ
**Дата:** 2026-03-04
**Статус:** Принято
**Причина:** Медданные (АД, пульс, температура) доступны ТОЛЬКО медику. Остальные видят только факт допуска. Каждый доступ логируется в `med_access_log`.

## ADR-006: Нумерация документов
**Дата:** 2026-03-04
**Статус:** Принято
**Формат:**
- Заявки: `ORD-2026-00001`
- Рейсы: `TRP-2026-00001`
- Путевые листы: `WB-2026-00001`
- Счета: `INV-2026-00001`
- Акты: `ACT-2026-00001`

## ADR-007: Аудит-driven разработка (Read-Only Аудитор)
**Дата:** 2026-03-04
**Статус:** Принято
**Причина:** Агент 7 работает в режиме Read-Only. Он не меняет код, а только пишет в `docs/audit-log.md`. Решение об исправлении принимает Оркестратор (Агент 0) совместно с руководителем. Это исключает неконтролируемый рефакторинг.

## ADR-008: Централизованные стейт-машины в shared
**Дата:** 2026-03-04
**Статус:** Принято
**Причина:** Аудит показал, что ни один модуль не валидирует переходы статусов. Решение: `STATE_TRANSITIONS` map-ы определяются в `@tms/shared` и валидируются на бэкенде перед каждой мутацией.

## ADR-009: httpOnly cookies вместо localStorage для JWT
**Дата:** 2026-03-04
**Статус:** Принято
**Причина:** Аудит S-9 выявил XSS-уязвимость при хранении JWT в памяти/localStorage. Web-клиент полностью перешёл на httpOnly cookies (`credentials: 'include'`). Методы `setToken/getToken/clearToken` удалены из `api.ts`. Mobile использует SecureStore.

## ADR-010: Next.js Error Boundary (`error.tsx`)
**Дата:** 2026-03-04
**Статус:** Принято
**Причина:** Аудит M-16 — отсутствие Error Boundary приводило к белому экрану при unhandled render error. Создан `apps/web/src/app/error.tsx` — глобальный Error Boundary Next.js с кнопкой "Попробовать снова".

## ADR-011: numeric(12,2) для денежных полей
**Дата:** 2026-03-05
**Статус:** Принято
**Причина:** GPT-аудит выявил использование `real` (float32) для денежных полей — потеря точности при финансовых вычислениях. Все 21 денежное поле (tariffs, invoices, fines, repairs) мигрированы на `numeric(12,2).$type<number>()`. Координаты и физические величины мигрированы на `doublePrecision`.

## ADR-012: Structured JSON logging в production
**Дата:** 2026-03-05
**Статус:** Принято
**Причина:** `pino-pretty` добавляет overhead и ломает JSON-парсинг в prod логах (ELK/Grafana). Теперь: production = raw JSON, development = pino-pretty с цветами.

## ADR-013: Readiness endpoint + Request-ID correlation
**Дата:** 2026-03-05
**Статус:** Принято
**Причина:** GPT-аудит — отсутствие readiness endpoint для оркестратора. `/api/health/ready` проверяет DB (`SELECT 1`) + Redis (ping). `x-request-id` header пробрасывается из запроса в ответ для трейсинга.

## ADR-014: Reproducible Docker builds
**Дата:** 2026-03-05
**Статус:** Принято
**Причина:** GPT-аудит — `pnpm@latest` и `pnpm install` без lockfile. Теперь: `pnpm@9.15.2` (pin) + `--frozen-lockfile` в обоих Dockerfile. Гарантирует идентичные сборки.

## ADR-015: WebSocket auth через ?token= query param
**Дата:** 2026-03-05
**Статус:** Принято
**Причина:** Browser WebSocket API не поддерживает custom headers и cookies. Решение: frontend получает short-lived JWT (5мин) через cookie-authenticated endpoint `/api/auth/ws-token`, затем передаёт его в `?token=` query param при подключении к `/ws/vehicles`. Backend проверяет через `jwt.verify()` и закрывает соединение с кодом 4401 при невалидном токене.

## ADR-016: WatermelonDB sync pull endpoint
**Дата:** 2026-03-05
**Статус:** Принято
**Причина:** Мобильное приложение использует WatermelonDB для offline-first. Для синхронизации нужен `GET /sync/pull?lastSyncAt=<ISO>`, который возвращает diff по `updatedAt > since`. Driver RLS: водители получают только свои рейсы. Push уже был через `POST /sync/events`.

## ADR-017: fuelNorm из таблицы vehicles вместо хардкода
**Дата:** 2026-03-05
**Статус:** Принято
**Причина:** `calculateTripCost` использовал `fuelNorm = 30` хардкод. Каждое ТС имеет `vehicles.fuelNormPer100Km`. Теперь: DB query → env fallback `FUEL_NORM_PER_100KM` → 30. Аналогично: `DRIVER_SALARY_PER_HOUR` (350), `AMORTIZATION_PER_KM` (3).

