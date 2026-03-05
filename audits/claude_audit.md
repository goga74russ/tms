# TMS — Сводный аудит кода (Claude Opus)

**Дата:** 2026-03-04
**Метод:** Чтение всех исходных файлов проекта (~110 файлов), без документации
**Аудиты:** Аудит #1 (предыдущая сессия) + Аудит #2 (текущая сессия, полный файл-по-файлу)

---

## Обозначения

- **S** — Critical / Security (безопасность, потеря данных)
- **H** — High (архитектурные проблемы, race conditions)
- **M** — Medium (качество кода, UX, производительность)
- **C** — Closed (подтверждено исправленным при чтении кода)

---

## S — CRITICAL

### S-1. ~20% тестов — тавтологии (всегда проходят)
- **Файлы:** `finance.test.ts`, `security.test.ts`, `regression.test.ts`, `auth.test.ts`, `e2e-flow.test.ts`
- **Суть:** ~40-50 тестов из ~238 проверяют локальные переменные, а не вызывают реальные сервисы.
  - `finance.test.ts`: `const cost = 480 * 50; expect(cost).toBe(24000)` — чистая арифметика, `tarificationService` не вызывается
  - `security.test.ts`: `const cookieOptions = { httpOnly: true }; expect(cookieOptions.httpOnly).toBe(true)` — всегда true
  - `auth.test.ts:67`: `expect(true).toBe(true)` — пустой тест rate-limit
  - `e2e-flow.test.ts:94,189,217,259`: `expect(assignTrip).toBeDefined()` — проверяет что функция существует, не вызывает её
  - `regression.test.ts`: inline-арифметика вместо вызова сервисов
- **Риск:** Иллюзия тестового покрытия. Реальные баги не ловятся. CI зелёный при сломанном коде.
- **Статус:** DEFERRED → Спринт 6 (требует полный рефакторинг тестовой инфраструктуры)

### S-2. sync/routes.ts — events: any[] без Zod-валидации
- **Файл:** `apps/api/src/modules/sync/routes.ts:11`
- **Код:** `const { events } = request.body as { events: any[] };`
- **Суть:** Мобильное приложение отправляет массив событий, которые десериализуются без Zod-валидации. Злоумышленник может передать произвольные данные в event journal.
- **Риск:** Injection в append-only журнал, невалидные данные в БД.
- **Статус:** CLOSED

### S-3. Geo-роуты без аутентификации
- **Файл:** `apps/api/src/modules/geo/routes.ts`
- **Суть:** Все 6 эндпоинтов (`/geo/geocode`, `/geo/distance`, `/geo/distance-matrix`, `/geo/nearest`, `/geo/reverse`, `/geo/geocode/batch`) не имеют `preHandler: [app.authenticate]`. Открыты для анонимного доступа.
- **Риск:** Любой может использовать API геокодирования без авторизации.
- **Статус:** CLOSED

### S-4. Redis password не передаётся в REDIS_URL
- **Файлы:** `docker-compose.yml:23`, `apps/api/src/integrations/redis.ts`
- **Суть:** Docker dev: Redis запускается с `--requirepass redis_dev_2026`, но `REDIS_URL` для API = `redis://redis:6379` без пароля. `redisConnectionConfig` парсит URL без пароля → подключение будет отклонено Redis.
- **Риск:** BullMQ воркеры не подключатся к Redis в dev.
- **Статус:** CLOSED

### S-5. Hardcoded company data в XML-export
- **Файл:** `apps/api/src/modules/finance/xml-export.service.ts`
- **Суть:** `DEFAULT_OPTIONS` содержит `ИНН 7701234567`, название и адрес тестовой компании. В production генерирует XML с тестовыми реквизитами для 1С.
- **Риск:** Некорректные документы для контрагентов.
- **Статус:** CLOSED

### S-6. CreateOrderModal генерирует номер заявки на клиенте
- **Файл:** `apps/web/src/app/logist/components/CreateOrderModal.tsx:49`
- **Код:** `number: \`ORD-\${year}-\${String(Math.floor(Math.random() * 99999)).padStart(5, '0')}\``
- **Суть:** Номер заявки генерируется `Math.random()` на фронтенде вместо серверного генератора с `FOR UPDATE`.
- **Риск:** Коллизии номеров при множестве пользователей.
- **Статус:** CLOSED

### S-7. raw fetch() без credentials в нескольких компонентах
- **Файлы:**
  - `apps/web/src/app/logist/components/CreateTripModal.tsx:57-59` (3 вызова)
  - `apps/web/src/app/dispatcher/page.tsx` (4 вызова)
  - `apps/web/src/app/logist/page.tsx:63` (1 вызов)
- **Суть:** Используют `fetch('/api/...')` вместо `api.get()` / `api.post()`. Не передают `credentials: 'include'` → httpOnly куки не отправляются → запросы не аутентифицированы.
- **Риск:** Сломанная аутентификация для ключевых функций (создание рейса, загрузка данных диспетчера, канбан логиста).
- **Статус:** CLOSED

### S-8. seed.ts печатает пароль в stdout
- **Файл:** `apps/api/src/db/seed.ts:241`
- **Суть:** `console.log` выводит SEED_PASSWORD при сидировании базы.
- **Риск:** Пароль в логах контейнера / CI.
- **Статус:** CLOSED

### S-9. JWT в localStorage (web) — XSS-уязвимость
- **Файл:** `apps/web/src/lib/api.ts` (из аудита #1)
- **Суть:** Хотя api.ts переделан на httpOnly cookies + credentials:'include', в коде есть fallback `setToken()/getToken()` в memory, а мобильное API всё ещё получает token в response body.
- **Риск:** При XSS — кража токена. Нужен полный переход на httpOnly cookie + CSRF token.
- **Статус:** CLOSED (убраны `setToken`/`getToken`/`clearToken` из web `api.ts`, web использует только httpOnly cookies)

### S-10. Нет Row-Level Security (RLS) для client/driver ролей
- **Файлы:** `orders/routes.ts`, `fleet/routes.ts`, `finance/routes.ts`
- **Суть:** Клиент видит все заявки, а не только свои. Водитель — все ТС. Нет фильтрации по userId на уровне запросов.
- **Исключения:** Trips и Waybills уже имеют RLS для driver (C-9, C-10).
- **Статус:** DEFERRED → Спринт 6 (требует миграцию БД + middleware организации)

---

## H — HIGH

### H-1. user-context.tsx — мёртвый код при httpOnly cookies
- **Файл:** `apps/web/src/lib/user-context.tsx:42-46`
- **Суть:** `api.getToken()` всегда `null` с httpOnly cookies → проверка `if (!token)` всегда true → `fetchUser()` не вызывается → пользователь не восстанавливается при перезагрузке страницы.
- **Статус:** CLOSED (уже исправлено: `user-context.tsx` вызывает `api.me()` напрямую через httpOnly cookie, без `getToken()` проверки)

### H-2. RepairKanban — нет валидации state machine на клиенте
- **Файл:** `apps/web/src/app/repair/components/RepairKanban.tsx:79`
- **Суть:** `changeStatus(dragging, newStatus)` позволяет перетащить карточку в любой столбец. В отличие от `KanbanBoard.tsx` (orders), где есть `ORDER_STATE_TRANSITIONS`, в RepairKanban нет аналога `REPAIR_STATE_TRANSITIONS`.
- **Статус:** CLOSED (добавлен `REPAIR_STATE_TRANSITIONS` в RepairKanban.tsx)

### H-3. Waybill number — race condition
- **Файл:** `apps/api/src/modules/waybills/service.ts`
- **Суть:** `generateWaybillNumber()` делает `SELECT ... ORDER BY number DESC` вне транзакции, без `FOR UPDATE`. Orders и Trips уже исправлены, Waybills — нет.
- **Статус:** CLOSED (подтверждено: `db.transaction()` + `FOR UPDATE` уже реализованы)

### H-4. repairs/service.ts — createRepair не в транзакции
- **Файл:** `apps/api/src/modules/repairs/service.ts`
- **Суть:** `INSERT repair` + `UPDATE vehicle.status='maintenance'` — 2 отдельных запроса. При краше между ними — ремонт создан, ТС не заблокировано.
- **Статус:** CLOSED (подтверждено: `db.transaction()` уже реализован)

### H-5. addRoutePoint — race condition на sequenceNumber
- **Файл:** `apps/api/src/modules/trips/service.ts`
- **Суть:** `sequenceNumber = SELECT MAX(sequence_number) + 1` без `FOR UPDATE` и не в транзакции → дубли sequenceNumber при параллельных запросах.
- **Статус:** CLOSED (подтверждено: `FOR UPDATE` + `db.transaction()` уже реализованы)

### H-6. inspections/routes.ts — ручная валидация вместо Zod
- **Файл:** `apps/api/src/modules/inspections/routes.ts`
- **Суть:** POST `/tech` и POST `/med` — ручные проверки полей (`if (!body.vehicleId)`) вместо Zod-схем. Нет `PermitCreateSchema` и `FineCreateSchema` в shared.
- **Статус:** DEFERRED → Спринт 6 (требует создание `PermitCreateSchema`/`FineCreateSchema` в shared)

### H-7. fines.worker.ts — N+1 при дедупликации штрафов
- **Файл:** `apps/api/src/integrations/workers/fines.worker.ts:47-56`
- **Суть:** Для каждого штрафа каждого ТС — `SELECT ... WHERE vehicleId AND resolutionNumber`. При 100 ТС × 3 штрафа = 300 запросов. Нужен batch-lookup.
- **Статус:** CLOSED

### H-8. wialon.worker.ts — N+1 UPDATE
- **Файл:** `apps/api/src/integrations/workers/wialon.worker.ts`
- **Суть:** `for (const v of vehicles) { db.update(vehicles).where(...) }` — индивидуальный UPDATE на каждое ТС вместо batch.
- **Статус:** CLOSED

### H-9. Tarification — hardcoded costs в batch-методе
- **Файл:** `apps/api/src/modules/finance/tarification.service.ts`
- **Суть:** `computeTripCost()` (private batch) использует `fuelPriceLiter=60`, `driverSalary=350/hr`, `amortization=3/km` — захардкожено. `calculateTripCost()` (single) берёт из `process.env`. Batch-расчёт для инвойсов использует неправильные цены.
- **Статус:** CLOSED (H-9 FIX: `computeTripCost()` теперь читает `FUEL_PRICE_PER_LITER`, `DRIVER_SALARY_PER_HOUR`, `AMORTIZATION_PER_KM` из `process.env`)

### H-10. ContractorsTable — нет debounce на поиск
- **Файл:** `apps/web/src/app/fleet/components/ContractorsTable.tsx:23`
- **Суть:** `useEffect(() => { loadContractors(); }, [search])` — каждый символ → запрос к API. В `VehiclesTable` и `DriversTable` уже исправлено (300ms debounce).
- **Статус:** CLOSED (добавлен 300ms debounce в ContractorsTable.tsx)

### H-11. Integration routes — нет RBAC на sync-эндпоинтах
- **Файл:** `apps/api/src/integrations/routes.ts`
- **Суть:** `POST /integrations/wialon/sync` и `POST /integrations/fines/sync` требуют `app.authenticate`, но нет проверки роли. Любой авторизованный пользователь (включая driver) может запустить полную синхронизацию.
- **Статус:** CLOSED (добавлен `app.requireRoles(['admin'])` на sync-эндпоинты)

### H-12. tariffs/page.tsx — полностью на mock данных
- **Файл:** `apps/web/src/app/tariffs/page.tsx`
- **Суть:** Вся страница тарифов использует `MOCK_TARIFFS` — статические данные. Нет API-интеграции. Пользователь видит фейковые тарифы.
- **Статус:** CLOSED

### H-13. kpi/page.tsx — hardcoded рейтинг водителей
- **Файл:** `apps/web/src/app/kpi/page.tsx`
- **Суть:** `driversFallback` — статический массив. При ошибке API → показываются фейковые данные вместо ошибки.
- **Статус:** CLOSED

### H-14. Zod `as any` на 17 route-обработчиках
- **Файлы:** `fleet/routes.ts` (permits, fines), `trips/routes.ts` (PUT), `finance/routes.ts` (PUT status), `geo/routes.ts` (POST ×4), `sync/routes.ts`
- **Суть:** Минимум 17 обработчиков используют `request.body as any` или `request.query as any` вместо Zod-валидации.
- **Статус:** CLOSED

### H-15. Нет admin self-escalation prevention
- **Файл:** `apps/api/src/auth/auth.ts`
- **Суть:** Admin POST/PUT routes используют `body as any`. Админ может назначить себе любую роль. Нет проверки на self-escalation.
- **Статус:** CLOSED (S-2 guard: запрет менять свои roles/isActive в PUT /auth/users/:id)

### H-16. GET /auth/users — нет пагинации
- **Файл:** `apps/api/src/auth/auth.ts`
- **Суть:** Список пользователей возвращает все записи без LIMIT/OFFSET.
- **Статус:** CLOSED (H-16 FIX: добавлены `?page=&limit=` параметры + `.limit()` + `.offset()`, cap 200)

### H-17. Med data unencrypted + нет индексов на medAccessLog
- **Файл:** `apps/api/src/db/schema.ts`
- **Суть:** Медицинские данные (давление, пульс, температура, алкоголь) хранятся в открытом виде. Комментарий упоминает pgcrypto, но шифрование не реализовано. Таблица `medAccessLog` не имеет индексов для аудита.
- **Статус:** CLOSED PARTIAL (добавлены индексы `idx_med_access_log_user/driver/accessed_at`;  шифрование pgcrypto → Спринт 7)

### H-18. getOrdersKanban загружает ВСЕ заявки
- **Файл:** `apps/api/src/modules/orders/service.ts`
- **Суть:** Канбан загружает все заявки без LIMIT. При тысячах заявок — OOM / timeout.
- **Статус:** CLOSED

### H-19. getEntityEvents без LIMIT
- **Файл:** `apps/api/src/events/journal.ts`
- **Суть:** Запрос истории событий для сущности не имеет LIMIT. При частых обновлениях — огромный resultset.
- **Статус:** CLOSED

### H-20. Waybill GET /:id — нет проверки владельца для driver
- **Файл:** `apps/api/src/modules/waybills/routes.ts`
- **Суть:** GET `/waybills` фильтрует по driver (RLS), но GET `/waybills/:id` — нет проверки ownership. Водитель может получить чужой путевой лист по ID.
- **Статус:** CLOSED (добавлена RLS-проверка driverId в GET /waybills/:id)

---

## M — MEDIUM

### M-1. ORDER_STATE_TRANSITIONS дублирован в KanbanBoard
- **Файл:** `apps/web/src/app/logist/components/KanbanBoard.tsx:7-15`
- **Суть:** Transitions инлайнены вместо импорта из `@tms/shared`. При изменении state machine → рассинхронизация.
- **Статус:** CLOSED

### M-2. finance/page.tsx — hardcoded UUID + getToken()
- **Файл:** `apps/web/src/app/finance/page.tsx`
- **Суть:** `handleGenerateInvoice` использует placeholder contractorId. `handleExport1C` вызывает `api.getToken()` → null с httpOnly → экспорт 1С сломан.
- **Статус:** CLOSED (M-2 FIX: `handleExport1C` использует `credentials:'include'` вместо `api.getToken()`, placeholder contractorId — by design, модалка сбора данных → Спринт 6 UI)

### M-3. AssignmentPanel — кнопка "Назначить" без API-вызова
- **Файл:** `apps/web/src/app/dispatcher/components/AssignmentPanel.tsx:28`
- **Суть:** Кнопка "Назначить" показывает success-уведомление, но не делает API-запрос. Назначение существует только в UI.
- **Статус:** CLOSED

### M-4. DispatcherMap — потенциальный XSS через Leaflet tooltip
- **Файл:** `apps/web/src/app/dispatcher/components/DispatcherMap.tsx:101-120`
- **Суть:** `v.plateNumber`, `v.make`, `v.model`, `v.driverName` вставляются в HTML через template literal без экранирования.
- **Статус:** CLOSED (добавлена функция `escapeHtml` для tooltips)

### M-5. TripRouteLayer — потенциальный XSS через tooltip
- **Файл:** `apps/web/src/app/dispatcher/components/TripRouteLayer.tsx:155-170`
- **Суть:** `point.address` вставляется в HTML tooltip без экранирования.
- **Статус:** CLOSED (добавлена функция `escapeHtml` для tooltips)

### M-6. console.log в production-коде
- **Файлы:** `queues.ts:58`, `redis.ts:33,37`, `fines.worker.ts:136,140,143`, `wialon.worker.ts`, `seed.ts:241`
- **Суть:** Emoji-логи через `console.log/error` вместо Fastify logger (`app.log.info/error`).
- **Статус:** DEFERRED → Спринт 6 (заменить `console.log` на `fastify.log` во всех воркерах)

### M-7. Mobile AuthContext — user.role строка, не массив
- **Файл:** `apps/mobile/src/context/AuthContext.tsx`
- **Суть:** `user.role` (string) не поддерживает мульти-роли. Backend возвращает `roles: string[]`.
- **Статус:** DEFERRED → Спринт 6 (мобильное приложение)

### M-8. Mobile sync — нет retry/backoff при ошибке сети
- **Файл:** `apps/mobile/src/api/sync.ts`
- **Суть:** При ошибке сети — только `Alert.alert()`. Нет exponential backoff, нет очереди повторов. Данные могут потеряться при плохой связи.
- **Статус:** DEFERRED → Спринт 6 (мобильное приложение)

### M-9. TripListScreen — N+1 observer (WatermelonDB)
- **Файл:** `apps/mobile/src/screens/TripListScreen.tsx:41`
- **Суть:** `database.collections.get('trips').query().observe()` (без фильтра) → при любом изменении любого рейса выполняется `fetchTrips()`. Нужен тот же query-фильтр.
- **Статус:** DEFERRED → Спринт 6 (мобильное приложение)

### M-10. WatermelonDB — JSI отключен
- **Файл:** `apps/mobile/src/database/index.ts:13`
- **Суть:** `jsi: false` — упущенная производительность. С Hermes можно включить `jsi: true`.
- **Статус:** DEFERRED → Спринт 6 (мобильное приложение)

### M-11. Geo routes — body as any × 4
- **Файл:** `apps/api/src/modules/geo/routes.ts:28,60,82,108`
- **Суть:** Все POST-роуты используют `request.body as any` вместо Zod-валидации. Входит в общий счёт H-14.
- **Статус:** CLOSED

### M-12. Leaflet SSR проблема в DispatcherMap
- **Файл:** `apps/web/src/app/dispatcher/components/DispatcherMap.tsx:4`
- **Суть:** `import L from 'leaflet'` на верхнем уровне → падает при SSR. Хотя dispatcher/page.tsx использует `dynamic(import, { ssr: false })`, сам компонент импортирует Leaflet напрямую.
- **Статус:** CLOSED (динамический import Leaflet для SSR-совместимости)

### M-13. Кнопки "Добавить" без обработчиков
- **Файлы:** `VehiclesTable.tsx:115`, `DriversTable.tsx:74`, `PermitsTable.tsx:54`, `FinesTable.tsx:82`, `ContractorsTable.tsx:51`
- **Суть:** `<button>` без `onClick` — кнопки ничего не делают. Нужны модалки создания.
- **Статус:** DEFERRED → Спринт 6 UI (требует создание модалок CRUD для каждой таблицы)

### M-14. Admin layout — redirect loop risk
- **Файл:** `apps/web/src/app/admin/layout.tsx:21`
- **Суть:** `router.push('/')` если не admin. Нет защиты от рендер-мерцания (flash of content before redirect).
- **Статус:** CLOSED

### M-15. Shared index.ts — минимальный реэкспорт
- **Файл:** `packages/shared/src/index.ts`
- **Суть:** Только `export * from './enums.js'; export * from './schemas.js'`. Нет utility types, common helpers, API response types.
- **Статус:** DEFERRED → Спринт 6 (расширение shared пакета: utility types, API response types)

### M-16. Нет React Error Boundary в layout.tsx
- **Файл:** `apps/web/src/app/layout.tsx`
- **Суть:** Нет Error Boundary → unhandled render error → белый экран у пользователя.
- **Статус:** CLOSED (M-16 FIX: создан `apps/web/src/app/error.tsx` — глобальный Error Boundary Next.js)

### M-17. restrictionZones.geoJson — plain JSONB без PostGIS
- **Файл:** `apps/api/src/db/schema.ts`
- **Суть:** Геозоны хранятся как JSONB вместо PostGIS geometry. Невозможны пространственные запросы (ST_Contains, ST_DWithin).
- **Статус:** DEFERRED → Спринт 6 (требует PostGIS extension + миграция)

### M-18. invoices.tripIds — JSONB массив вместо join-таблицы
- **Файл:** `apps/api/src/db/schema.ts`
- **Суть:** `tripIds` хранится как JSONB array → невозможны FK constraints, нет индекса для поиска инвойса по tripId.
- **Статус:** DEFERRED → Спринт 6 (требует миграция БД + FK constraints)

### M-19. finance/invoices — hardcoded limit:50
- **Файл:** `apps/api/src/modules/finance/finance.service.ts`
- **Суть:** Запрос инвойсов ограничен `limit(50)` без параметра пагинации.
- **Статус:** CLOSED (добавлена пагинация `?page=&limit=` + preload contractor)

### M-20. inspections — N+1 на access log INSERT в listMedInspections
- **Файл:** `apps/api/src/modules/inspections/service.ts`
- **Суть:** При листинге мед-осмотров записывается access log для каждой записи отдельным INSERT.
- **Статус:** CLOSED (batch INSERT вместо цикла INSERT по каждой записи)

### M-21. checkScheduledMaintenance — N+1
- **Файл:** `apps/api/src/modules/repairs/service.ts`
- **Суть:** Проверка планового ТО по каждому ТС отдельным запросом.
- **Статус:** CLOSED (batch load vehicle/driver data через `inArray()`)

### M-22. getExpiringMedCertificates — нет LIMIT
- **Файл:** `apps/api/src/modules/inspections/service.ts`
- **Суть:** Запрос истекающих медсправок без LIMIT.
- **Статус:** CLOSED (batch load driver data через `inArray()`)

### M-23. get1CExportData — as any[]
- **Файл:** `apps/api/src/modules/finance/finance.service.ts`
- **Суть:** `get1CExportData` и `export1CXml` используют `as any[]` при работе с данными инвойсов.
- **Статус:** CLOSED (убран `as any[]` cast в get1CExportData и export1CXml)

### M-24. event journal — misleading "idempotent" comment
- **Файл:** `apps/api/src/events/journal.ts`
- **Суть:** Комментарий говорит "idempotent", но дедупликации по eventId нет. Повторная отправка → дублирование событий.
- **Статус:** CLOSED

---

## C — CLOSED (подтверждено чтением кода)

| # | Описание | Файл | Доказательство |
|---|---|---|---|
| C-1 | generateOrderNumber — FOR UPDATE в транзакции | orders/service.ts | `db.transaction()` + `FOR UPDATE` |
| C-2 | generateTripNumber — FOR UPDATE в транзакции | trips/service.ts | `db.transaction()` + `FOR UPDATE` |
| C-3 | calculateBatchTripCosts — batch вместо N+1 | tarification.service.ts | `calculateBatchTripCosts()` метод |
| C-4 | inspections N+1 — JOIN вместо 3 SELECT | inspections/service.ts | batch queries в queue |
| C-5 | getNextInvoiceNumber — FOR UPDATE + tx | finance.service.ts | `getNextInvoiceNumber(tx)` |
| C-6 | CORS из env, не хардкод | server.ts:30 | `process.env.CORS_ORIGIN \|\| 'http://localhost:3000'` |
| C-7 | Bearer header на все запросы | api.ts:44-46 | `credentials: 'include'` + Bearer |
| C-8 | personalDataConsent блокирует мед-осмотр | inspections:434 + medic/page:153 | Backend + Frontend проверки |
| C-9 | Driver RLS на GET /trips | trips/routes.ts | `where(eq(trips.driverId, user.userId))` |
| C-10 | Driver RLS на GET /waybills | waybills/routes.ts | `where(eq(waybills.driverId, user.userId))` |
| C-11 | VehiclesTable/DriversTable debounce | VehiclesTable.tsx, DriversTable.tsx | `setTimeout(() => setDebouncedSearch(search), 300)` |
| C-12 | Admin layout — role check | admin/layout.tsx | `user.roles.includes('admin')` |
| C-13 | ЭТрН — XML escaping | etrn-generator.ts | `escapeXml()` для всех user input |
| C-14 | 1C XML — processEntities:true | xml-export.service.ts | `fast-xml-parser XMLBuilder` |
| C-15 | Pool config — idle/connect timeouts | connection.ts | `idle_timeout:20, connect_timeout:10, max_lifetime:1800` |
| C-16 | Sidebar role filtering | sidebar.tsx | Роли корректно фильтруют меню |
| C-17 | Append-only triggers applied at startup | server.ts:90 | `await applyAppendOnlyTriggers()` |
| C-18 | Multi-stage Dockerfiles | api/Dockerfile, web/Dockerfile | Non-root user, standalone output |
| C-19 | Graceful shutdown | server.ts | `process.on('SIGINT', ...)` |
| C-20 | BullMQ queues — retry + backoff | queues.ts | `attempts: 3, backoff: { type: 'exponential' }` |
| C-21 | Fleet validators (INN, VIN, plate) | fleet/validators.ts | Контрольная сумма ИНН, формат VIN, госномер |
| C-22 | Haversine distance + distance matrix | geo/distance.service.ts | Корректная формула, detour factor 1.3 |
| C-23 | Geocoding service с dictionary + mock | geo/geocoding.service.ts | Нормализация, partial match, deterministic mock |

---

## Качество тестов — сводка

| Метрика | Значение |
|---|---|
| Всего тест-файлов | 18 |
| Всего тест-кейсов | ~238 |
| Отличные (чистые функции, реальные вызовы) | 4: xml-export, geo, etrn-generator, rbac |
| Хорошие (реальные вызовы + mock DB) | 5: tarification.test, waybills, sync, orders, fleet |
| Слабые (тавтологии, structural checks) | 5: finance, security, regression, auth, e2e-flow |
| Средние | 4: inspections, trips, repairs, integrations |
| Тестов-тавтологий (всегда проходят) | ~40-50 (~20%) |
| Тесты с production DB | 0% — всё замокано ✅ |
| Frontend тестов (Playwright) | 0 |
| Mobile тестов | 0 |

---

## Отсутствующие модули (по ТЗ)

| Модуль | Статус | Срочность |
|---|---|---|
| Клиентский портал | Не реализован | Средняя |
| ЭПД (электронные перевозочные документы) | Не реализован | Критическая (дедлайн Сент 2026) |
| S3 хранилище (фото, подписи) | Не реализован — локальный storage | Высокая |
| CI/CD pipeline | Отсутствует | Высокая |
| SSL/TLS | Не настроен | Высокая для production |
| Rate limiting (production) | Не реализован | Средняя |

---

## Итоговая готовность

| Компонент | Готовность | Основные блокеры |
|---|---|---|
| Backend API | 90% | S-2, S-3, H-3, H-4, H-5, H-14 |
| Frontend Web | 75% | S-6, S-7, H-1, H-12, M-3, M-13 |
| Mobile | 70% | M-7, M-8, M-9 |
| Shared | 95% | Нет PermitSchema, FineSchema |
| Тесты | 65% | S-1 (20% тавтологий), 0 frontend тестов |
| DevOps | 80% | S-4, S-5, M-6, нет CI/CD |
| **Общее** | **~78%** | |

---

## ТОП-10 для немедленного исправления

1. **S-7** — Заменить raw `fetch()` на `api.get/post()` (8 мест, 3 файла) — ломает аутентификацию
2. **S-3** — Добавить `preHandler: [app.authenticate]` в geo routes (1 файл)
3. **S-2** — Добавить Zod-схему для sync events (1 файл)
4. **H-1** — Исправить user-context.tsx — `GET /auth/me` вместо `getToken()` check
5. **H-3** — generateWaybillNumber в транзакцию с FOR UPDATE
6. **H-4** — createRepair обернуть в `db.transaction()`
7. **S-1** — Переписать ~40 тавтологических тестов на реальные вызовы сервисов
8. **H-14** — Добавить Zod-схемы для оставшихся 17 обработчиков
9. **S-5** — XML-export: company data из конфига/БД, не hardcode
10. **H-12** — tariffs/page.tsx: подключить API вместо MOCK_TARIFFS
