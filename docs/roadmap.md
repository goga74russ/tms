# 🗺️ Радар проекта TMS (Transport Management System)

> **Статус проекта:** ✅ Sprint 8 (частично) → моки/долги в бэклоге
> **Дата обновления:** 5 марта 2026 г.
> **Архитектура:** Monorepo (pnpm workspaces), Fastify + Drizzle, Next.js + shadcn/ui, React Native (Expo)
> **Тесты:** 279+ unit-тестов (100% pass rate)
> **Аудит:** 3 GPT-аудита — все CRIT/HIGH закрыты ✅
> **Готовность к MVP:** ~80% (backend ✅, frontend ✅, devops ✅, security ✅, GPS/интеграции 🔴)

---

## 📅 Спринт 1: Фундамент и Базовая Логика
**Статус:** ✅ Завершён | **Агенты:** 0, 1, 2, 3, 4, 5

- [x] Монорепо, PostgreSQL, Redis, JWT, RBAC (10 ролей), Event Journal (152-ФЗ)
- [x] Заявки + Рейсы (стейт-машины), Осмотры (чеклисты), Путевые листы
- [x] Автопарк (CRUD), Ремонты (Канбан), Мобилка водителя (offline-first)
- [x] Тарификация (7 модификаторов), Финансы, KPI (Recharts)

## 🛠️ Спринт 2 + 2.5: Интеграция и Хардеринг
**Статус:** ✅ Завершён | **Агенты:** 6, 7

- [x] E2E интеграция, оффлайн-синхронизация, картография (Leaflet)
- [x] Аудит 55 находок → 8/8 CRITICAL ✅, 16/21 HIGH ✅
- [x] JWT fail-fast, transactions, N+1 JOIN, FOR UPDATE, Helmet, RBAC Contractor

## 🧪 QA: 167+ тестов
**Статус:** ✅ | **Агент:** 10

- [x] 11 файлов: auth, orders, trips, inspections, waybills, fleet, finance, sync, repairs, e2e, geo, xml
- [x] Стейт-машины, 152-ФЗ, тарификация math, integration mocks

## 🔌 Спринт 3: Телематика & Интеграции
**Статус:** ✅ Завершён | **Агенты:** 8, 9

- [x] BullMQ + Redis, mock Wialon/ГИБДД/DaData/АЗС, auto-enrich контрагентов ⚠️ **ВСЕ 4 интеграции на моках** — нет реальных API
- [x] 1С XML (CommerceML 2.10), геокодинг, Haversine, Leaflet маршруты

---

## ✅ Спринт 4.1: Frontend MVP (Волна 1)
**Статус:** ✅ Завершён | **Агенты:** 0, 1, 2, 5 | **Дата:** 4 марта 2026

- [x] Агент 1: Логист — убраны fallback моки, CreateTripModal, timeline из API, trip details
- [x] Агент 2: Путевые листы (/waybills), Sidebar role filtering (H-16), UserContext ⚠️ **Waybills таблица: UUID вместо госномера/ФИО**
- [x] Агент 5: Finance → live API, KPI → live API, экспорт 1С XML, страница тарифов ⚠️ **KPI: fallback «Смирнов/Козлов» если нет данных**
- [x] Агент 0: Pool таймауты, FOR UPDATE в транзакциях, триггеры при старте сервера

## ✅ Спринт 4.2: Security Sprint (Волна 2)
**Статус:** ✅ Завершён | **Агент:** 6 | **Дата:** 4 марта 2026

- [x] JWT → httpOnly cookie + Bearer fallback для мобилки
- [x] N+1 → `calculateBatchTripCosts()` (2 запроса вместо N)
- [x] RLS — driver видит только свои рейсы/путевые листы
- [x] Zod-валидация в 11 route handlers (fleet, repairs, trips)
- [x] CORS multi-origin + credentials

---

## 🚀 Спринт 5: DevOps + ЭПД Ресёрч (MVP Launch)
**Статус:** ✅ Завершён | **Сроки:** 4 марта 2026
**Агенты:** 0 (DevOps), 2 (Admin Panel), 8 (ЭПД Ресёрч), 10 (QA)
**Результат:** 279 тестов / 18 файлов / 100% pass / 3.46s

### DevOps ✅
- [x] Dockerfile api (multi-stage, non-root) + Dockerfile web (Next.js standalone)
- [x] docker-compose.prod.yml (PostgreSQL 16 + Redis 7 + API + Web)
- [x] CI/CD — `.github/workflows/ci.yml` (lint → test → build)
- [x] `.env.example`, `.dockerignore`, `deploy.sh`
- [x] `next.config.mjs` — `output: 'standalone'`
- [x] `workspace:*` protocol fix в package.json
- [x] Health check endpoint (`/api/health`)
- [ ] SSL/TLS (нужен домен) → Sprint 6
- [ ] Alerting (мониторинг) → Sprint 6

### Admin Panel (Агент 2) ✅
- [x] `apps/web/src/app/admin/layout.tsx` — проверка роли admin + боковое меню
- [x] `apps/web/src/app/admin/users/page.tsx` — CRUD пользователей
- [x] `apps/web/src/app/admin/tariffs/page.tsx` — CRUD тарифов
- [x] `apps/web/src/app/admin/checklists/page.tsx` — CRUD шаблонов чек-листов
- [x] 9 API endpoints в `auth.ts` (users/tariffs/checklists CRUD)
- [x] Sidebar: «Настройки» → «Админ-панель» (`/admin/users`)

### ЭПД Ресёрч (Агент 8) ✅
- [x] `docs/epd-research.md` — API ГИС ЭПД, процесс подключения
- [x] `docs/edo-comparison.md` — Диадок vs СБИС vs Контур
- [x] `docs/kep-research.md` — CryptoPro CSP, облачная ЭП, стоимость
- [x] `apps/api/src/modules/waybills/etrn-generator.ts` — прототип ЭТрН XML

### QA (Агент 10) ✅
- [x] `rbac.test.ts` — 46 тестов (RBAC по ролям, driver/mechanic/admin)
- [x] `security.test.ts` — 20 тестов (JWT cookie, rate limit, Zod)
- [x] `regression.test.ts` — 15 тестов (Sprint 4 фиксы, batch costs, FOR UPDATE)
- [x] `etrn-generator.test.ts` — 18 тестов (ЭТрН XML валидация)

### Инфра
- [x] VPS: Timeweb `5.42.102.58` (4 vCPU / Ubuntu 24.04)
- [x] Client RLS: `contractorId` + `organizationId` в таблице users

### Отложено → Sprint 6
- [ ] SSL/TLS (Let's Encrypt — нужен домен)
- [ ] S3/MinIO для файлов (фото осмотров, подписи)
- [ ] Alerting / мониторинг нагрузки

## 🔒 Спринт 5.5: Security & Architecture Audit
**Статус:** ✅ Завершён | **Дата:** 4 марта 2026

- [x] user-context.tsx → httpOnly cookies fix (разлогин по F5)
- [x] Next.js middleware.ts (редирект неавторизованных)
- [x] Zod-валидация в API routes, Self-Escalation guard
- [x] Race conditions: транзакции waybills, repairs, routes
- [x] RLS для roles driver и client

## 🛡️ Спринт 5.6: Claude Audit Final Fixes
**Статус:** ✅ Завершён | **Дата:** 4 марта 2026
**Результат:** 57/67 аудит-находок подтверждено исправленными

- [x] **S-9**: Удалён dead token code из web `api.ts` → полный переход на httpOnly cookies
- [x] **H-1**: `user-context.tsx` → `api.me()` напрямую (без getToken)
- [x] **H-9**: `computeTripCost()` batch — цены из `process.env` (не hardcode)
- [x] **H-10/H-11**: ContractorsTable debounce 300ms + sync RBAC admin-only
- [x] **H-15/H-16**: Admin self-escalation guard + users пагинация (cap 200)
- [x] **H-17**: medAccessLog — 3 индекса для 152-ФЗ аудита
- [x] **H-20**: GET /waybills/:id — RLS проверка driverId
- [x] **M-2**: Finance export → `credentials:'include'`
- [x] **M-4/M-5**: XSS-защита `escapeHtml` в Leaflet tooltips
- [x] **M-16**: Global Error Boundary (`error.tsx`)
- [x] **M-19–M-23**: Пагинация invoices, batch queries, убраны `as any[]`
- [x] **M-24**: Дедупликация event journal
- 📋 12 пунктов DEFERRED → Sprint 6 (mobile, PostGIS, CRUD модалки, shared types)

## 🔐 Спринт 5.7: GPT Audit Hardening
**Статус:** ✅ Завершён | **Дата:** 5 марта 2026
**Источник:** `audits/gpt0503.md` → 15 CRIT/HIGH/MED находок

### Phase 1: Repo Hygiene ✅
- [x] Удалены 5 `.js` дублёров из `apps/api/src/` (auth, connection, schema, seed, triggers)
- [x] `.gitignore` → `apps/api/src/**/*.js`
- [x] Root `test` script: `pnpm -r --if-present test`
- [x] Dockerfiles: `pnpm@9.15.2` (pin) + `--frozen-lockfile`

### Phase 2: Docker/Compose Security ✅
- [x] Закрыты порты Postgres/Redis в `docker-compose.prod.yml` (internal network only)
- [x] Fail-fast секреты `${VAR:?Set VAR}` — нет дефолтных паролей
- [x] Redis auth: `--requirepass` + пароль в `REDIS_URL`
- [x] `.github/workflows/ci.yml` — валидный CI (checkout → build → test → compose validate)

### Phase 3: Security ✅
- [x] Append-only триггер: проверка ВСЕХ полей (`author_role`, `entity_type`, `version`, `offline_created_at`)
- [x] Cookie `secure: true` всегда в production (без зависимости от `HTTPS` env)
- [x] Structured JSON logging в prod (pino-pretty только в dev)

### Phase 4: DB Types ✅
- [x] Денежные поля: `real` → `numeric(12,2).$type<number>()` (21 колонка)
- [x] Координаты: `real` → `doublePrecision` (lat/lon)
- [x] Физические величины: `real` → `doublePrecision` (вес, объём, пробег, топливо)

### Phase 5: Observability ✅
- [x] Readiness endpoint `/api/health/ready` (проверка DB + Redis)
- [x] Correlation header `x-request-id`

### Phase 6: Env Standardization ✅
- [x] `.env.example` — prod шаблон с `REDIS_PASSWORD`
- [x] `.env.local.example` — dev шаблон (пароли синхронизированы с compose)
- [x] `deploy.sh` — автомиграция существующего `.env` (добавление `REDIS_PASSWORD`)

### Bonus: Redis Auth Fix ✅
- [x] `redis.ts` — `testRedisConnection()` передаёт пароль

---

## 🔐 Спринт 5.8: GPT Audit 3 — Post-Fix Deep Audit
**Статус:** ✅ Завершён | **Дата:** 5 марта 2026
**Источник:** `audits/gpt0503(3).md` — 8 CRIT/HIGH находок

### CRIT ✅
- [x] Finance IDOR: client видел все invoices → contractor filter + 403 на export
- [x] Fleet PII: driver видел всех водителей → self-only RLS + 403

### HIGH ✅
- [x] Trips: client видел все trips → filter через orders→contractorId
- [x] System user FK crash → UUID `00000000...` в seed
- [x] Event journal externalId → миграция `ALTER TABLE` на VPS
- [x] Waybill не идемпотентен → check existing + 409
- [x] Invoice JOIN дубли → `selectDistinct` + query inside tx
- [x] Repair done → available без проверки → агрегация активных ремонтов

---

## 🚀 Спринт 6: Конкурентоспособность + Compliance (MUST)
**Статус:** ✅ Phase 1-2 завершены | **Сроки:** Март 2026
**Цель:** Закрыть разрыв с конкурентами (GPS, мобилка, уведомления) + ЭПД first-mover.

### Phase 1: Must-have ✅
- [x] **GPS/ГЛОНАСС real-time** — WS + JWT auth + useVehiclePositions на карте
  - ⚠️ **GPS = 100% мок** (WialonMock) — нужен API ключ Wialon
- [x] **Мобильное водителя** — `/sync/pull` endpoint (WatermelonDB, driver RLS)
  - ⚠️ **Offline queue не тестирован** — нет тестов
- [x] **Telegram-бот** — 12 типов, BullMQ, webhook routes
  - ⚠️ **Не настроен** — нужен @BotFather → TELEGRAM_BOT_TOKEN

### Phase 2: First-mover ✅
- [x] ЭПД MVP — ЭТрН XML (Title 1+4), carrier из `.env`, кнопка «Скачать ЭТрН»
  - ⚠️ **ЭДО не интегрирован** — нужен оператор + КЭП
- [x] SSL/TLS — nginx + Let's Encrypt (config ready)
  - ⚠️ **Нужен домен** + A-запись

### Phase 3: Infrastructure 🟡
- [x] **AddVehicleModal** — полная форма + POST /fleet/vehicles ✅
- [ ] S3/MinIO для файлов
- [ ] PostGIS для геозон

### ⚠️ Нерешённые долги Sprint 6
- [ ] 🔴 GPS мок → нужен Wialon API  
- [ ] 🔴 Telegram → @BotFather  
- [ ] 🟡 SSL → домен  
- [ ] 🟡 Тесты offline queue  
- [ ] 🟡 ЭДО интеграция  

---

## 🌐 Спринт 7: Рост и Удержание (SHOULD)
**Статус:** 🔄 Частично | **Обновлено:** 05.03.2026
**Цель:** Удержание клиентов + конкурентные преимущества.

- [x] **Клиентский портал** `/client` — заявки + счета, стат-карты, sidebar ✅
  - ✅ Backend RLS фильтрует по `contractorId`
- [x] **Импорт данных** — `POST /import/vehicles|drivers|contractors` (до 200/batch)
  - ⚠️ **Drivers** — userId placeholder (нужна привязка к аккаунту)
  - ⚠️ **Нет UI** — нужна страница с drag-n-drop Excel
- [ ] **Мультитенантность:** `organizationId` middleware
- [ ] **Маршрутизация:** OSRM Docker или Яндекс API
  - ⚠️ Нужен OSRM (2-3 GB RAM) или API ключ
- [ ] **Топливные карты** — нужны API ключи АЗС
- [ ] **Платон** — учёт для грузовиков >12т

---

## 🏆 Спринт 8: Enterprise & Killer-фичи (COULD)
**Статус:** 🔄 Частично | **Обновлено:** 05.03.2026
**Цель:** Enterprise + уникальные преимущества.

- [x] **Предиктивное ТО** `GET /analytics/maintenance-alerts`
  - ✅ Дата: ТО/ОСАГО/техосмотр/тахограф (critical <7д, warning <30д)
  - ✅ Одометр: предупреждение за 2000 км
  - ✅ **UI дашборд** `/analytics` — таблица + стат-карты
- [x] **Маржинальность** `GET /analytics/profitability`
  - ✅ Revenue vs Cost, % маржи, summary
  - ✅ **UI дашборд** `/analytics` — таблица + margin bars
  - ⚠️ **Себестоимость упрощена** — не из tarification.service
- [x] **Open API / Swagger** — `/api/docs` (русский UI, OAS 3.0, 14 тегов)
- [ ] **White-label**
- [ ] **Telegram трекинг** — нужен настроенный бот
- [ ] **Экодрайвинг** — нужны реальные GPS

---

## 📦 Спринт 9: Операционный процесс и Диспетчерская (IN PROGRESS)
**Статус:** 🟢 Phase 1+2 готовы | **Обновлено:** 12.03.2026
**Цель:** Привести систему к реальным операционным процессам перевозчика — путевые листы, заявки, диспетчерская.

> [!NOTE]
> Phase 1 (простые поля) и Phase 2 (новые таблицы) выполнены. Phase 3 (ломающие изменения) — требуют обсуждения.

### ✅ 1. Расширение карточки заявки — грузовые параметры
Добавлено в модель и UI заявки:
- **Количество мест** (`cargoPlaces`) — уже было в schema
- **Объём груза** (`cargoVolumeM3`, м³) — уже было в schema
- **Разрешение грузить 2-3 ярус** (`multiTierAllowed`, boolean + `maxTiers`: 1/2/3)
- **Данные по прицепу** → вынесены в отдельную таблицу `trailers` (п.13)

> ✅ Schema: `multiTierAllowed`, `maxTiers` | Zod: validated | UI: CreateOrderModal

### ✅ 2. Окно на день (дневное планирование)
- Добавлено поле `loadingDate` (single date picker) вместо date range в CreateOrderModal

### ✅ 3. Статус заявки: «Подтверждена → В работе»
- Label переименован в 3 файлах: logist/page.tsx, KanbanBoard.tsx, client/page.tsx

> 💡 Сейчас стейт-машина заявок: `new → assigned → in_transit → delivered → completed / cancelled`.

### ✅ 4. Инцидент по мед/техосмотру
- Таблица `incidents` — тип (med_inspection/tech_inspection/road/cargo/other), severity (low/medium/critical), связь с `inspections`, `vehicles`, `drivers`, `trips`
- Поле `blocksRelease` — блокирует ли выпуск на линию
- Enum: `IncidentSeverity`, `IncidentStatus`, `IncidentType`

> ✅ Schema + enum + migration. API routes и UI — Phase 3.

### 5. Техосмотр → предрейсовый осмотр
- Разделить понятия:
  - **Техосмотр** (`technical_inspection`) — периодический (ТО, диагностическая карта, ГИБДД)
  - **Предрейсовый осмотр** (`pre_trip_inspection`) — ежедневный перед выходом на линию
- Предрейсовый осмотр = часть процесса выпуска: механик осматривает ТС → ОК/не ОК → привязка к путевому листу
- Чеклист предрейсового осмотра (шины, тормоза, огни, документы, аптечка и т.п.)

> 💡 Сейчас есть единая модель `inspections` с чек-листами. Нужно типизировать на `pre_trip` и `periodic`.

### ✅ 6. Топливная карта, пропуск, транспондер
Добавлены поля:
- **Vehicles:** `fuelCardNumber`, `transponderNumber`, `hasHydraulicLift`
- **Drivers:** `fuelCardNumber`, `powerOfAttorneyNumber`, `powerOfAttorneyExpiry`

> ✅ Schema + Zod. Пропуска (`permits`) уже были в Sprint 3.

### 7. Путевой лист ДО мед/техосмотра
- Изменить бизнес-процесс: **путевой лист создаётся ДО прохождения мед- и техосмотра**
- Процесс: Путевой → Медосмотр → Техосмотр → Выпуск на линию
- Путевой лист becomes документом, к которому привязываются результаты осмотров
- Статусы путевого: `draft` → `medical_check` → `technical_check` → `issued` → `closed`

> 💡 Сейчас путевой создаётся после рейса. Нужно инвертировать — путевой = основной документ рейса с самого начала.

### ✅ 8. Несколько водителей на 1 путевом листе
- Таблица `waybill_drivers` (many-to-many): `waybillId`, `driverId`, `shiftStart`, `shiftEnd`, `isPrimary`

> ✅ Schema + FK + indexes. API routes — следующий спринт.

### 9. 2 заявки в 1 машину (консолидация) + привязка к логину
- **Консолидация заявок** — несколько заявок объединяются в один рейс (одна машина возит грузы нескольких клиентов)
- Связь `trip_orders` (many-to-many): tripId ↔ orderId
- **Привязка ТС к пользователю** — у водителя в профиле указаны «назначенные машины» (`user_vehicles`: userId ↔ vehicleId)
- При логине водитель видит только свои назначенные ТС

> 💡 Сейчас 1 trip = 1 order. Нужна связь many-to-many + UI объединения заявок.

### 10. Скан/чек к путевому листу
- Возможность прикрепить **сканы и чеки** к путевому листу:
  - Фото чека АЗС
  - Скан путевого листа (подписанный)
  - Квитанции (Платон, стоянка, штраф и т.п.)
- Модель `waybill_attachments`: `waybillId`, `fileType` (scan/receipt/photo), `fileUrl`, `uploadedBy`, `uploadedAt`
- Хранение: S3/MinIO (из Sprint 6 бэклога)
- Загрузка из мобильного (фото с камеры) и из веба (drag-n-drop)

> 💡 Зависит от S3/MinIO (Sprint 6 — пока не реализовано).

### ✅ 11. Все расходы на путевом листе
- Таблица `waybill_expenses`: `waybillId`, `category` (fuel/platon/parking/fine/repair/toll/other), `plannedAmount`, `actualAmount`, `description`, `receiptUrl`
- Enum: `ExpenseCategory`

> ✅ Schema + enum + indexes. API — следующий этап.

### 12. Диспетчерская — улучшение поиска
Улучшить UX диспетчерской страницы:
- **Поиск авто** — выпадающий список (autocomplete/combobox) с подставлением данных ТС (госномер, марка, грузоподъёмность, текущий водитель)
- **Поиск по населённому пункту** — autocomplete по базе городов (DaData или локальная БД ФИАС)
- При выборе ТС — автоподставление связанных данных (водитель, прицеп, статус)
- При выборе населённого пункта — фильтрация заявок по маршруту

> 💡 Сейчас диспетчерская работает с ручным вводом. Нужны combobox-компоненты + API поиска.

### ✅ 13. Прицепы как отдельная сущность
- Таблица `trailers`: госномер, VIN, тип (tent/board/refrigerator/cistern/flatbed/container/other), грузоподъёмность, объём, ТО/ОСАГО
- FK `currentVehicleId` → привязка к тягачу
- Enum: `TrailerType` (7 типов)

> ✅ Schema + enum + indexes.

### ✅ 14. Температурный режим (рефрижераторы)
- Добавлены поля: `temperatureMin`, `temperatureMax` (°C) в orders
- Zod-валидация + UI (два input-поля в CreateOrderModal)

> ✅ Schema + Zod + UI.

### ✅ 15. Тип загрузки/разгрузки
- Поля: `loadingType` (rear/side/top), `hydraulicLiftRequired` в orders
- Поле: `hasHydraulicLift` в vehicles
- UI: select + checkbox в CreateOrderModal

> ✅ Schema + Zod + UI.

### ✅ 16. Доверенность водителя
- Поля: `powerOfAttorneyNumber`, `powerOfAttorneyExpiry` в drivers
- Zod-валидация в shared schemas

> ✅ Schema + Zod.

### 17. Клиентский трекинг (read-only)
Клиент через **клиентский портал** (`/client`) может только **смотреть** статус своего груза:
- Текущий статус заявки (в пути / доставлен / задержка)
- Местоположение ТС на карте (когда будет GPS)
- Ориентировочное время прибытия (ETA)
- Историю статусов и уведомления

> ⚠️ Клиент **НЕ создаёт** заявки — всё создаёт **логист**. Клиент = read-only просмотр своих заявок и грузов (фильтрация по `contractorId`). Частично реализовано в Sprint 7 (`/client`).

---

## 📑 Спринт 10: Финансово-учётный контур и Документооборот (DISCUSS)
**Статус:** 🟡 Бэклог / Требует обсуждения
**Цель:** Закрыть разрыв между диспетчеризацией и реальной бухгалтерией (зарплаты, ТТН, ГСМ, субподряд).

### 1. Документооборот: ТТН и Акты приёма-передачи
- Создание сущности **Транспортный документ** (`transport_documents`)
- Типы: ТТН (1-Т), Транспортная накладная, Акт приёма-передачи груза
- Статусы: Сформирован → Подписан отправителем → Подписан получателем → Оригинал сдан в офис
- **Без подписанной ТТН нельзя выставить счёт клиенту!**

### 2. Зарплата водителей и Взаиморасчёты (Payroll)
- Настройка тарифов для зарплат (за км, за рейс, фикс в день/смену)
- Надбавки (ночные, простой по вине клиента, растентовка)
- Удержания/Штрафы (пережог топлива, ПДД, опоздания)
- Формирование ведомости на выплату (`payroll_statements`)

### 3. Детальный учёт ГСМ (Заправки)
- Сущность **Заправка** (`fuel_transactions`): дата, АЗС, объём (л), сумма, топливная карта
- Источники: ручной ввод водителем (чек) + импорт от топливных провайдеров (API/Excel)
- Автоматический расчёт: План (по норме) / Факт (по заправкам) / Отклонение (экономия/пережог)

### 4. Рекламации и Претензионная работа
- Сущность **Рекламация** (`claims`): клиент, рейс, причина (опоздание, порча груза), сумма ущерба
- Статусы: Открыта → В работе → Удовлетворена / Отклонена
- Влияние на выплату зарплаты водителю и счёт клиенту

### 5. Смены водителей и учёт РТО (Режим Труда и Отдыха)
- Расписание смен (кто когда работает)
- Контроль РТО по тахографу (не более 9ч за рулём в сутки, обязательные паузы 45 мин)
- Блокировка назначения в рейс, если водитель исчерпал лимит РТО

### 6. Печатные формы (PDF)
- Генерация PDF-документов: Путевой лист (форма 4-С/4-П), Заявка-договор, Счёт, Акт, ТТН.
- Возможность массовой печати для диспетчера.

### 7. Привлечённый транспорт (Субподряд)
- Регистрация наёмных машин и сторонних водителей
- Договоры с перевозчиками-субподрядчиками
- Раздельный учёт маржи: (Тариф клиенту) минус (Ставка субподрядчику)

---

## 🚀 Спринт 11: Enterprise автопарк (DISCUSS)
**Статус:** 🟡 Дальний бэклог (когда автопарк > 50 ТС)

### 1. Учёт шин и АКБ
- Жизненный цикл каждой шины (номер, ось, пробег, износ, сезонность).
- Для крупных парков это критичная статья расходов.

### 2. Склад и запчасти
- Учёт поступления запчастей и расходников на склад.
- Списание под конкретный ремонт-заявку (`repair_requests`).

### 3. Страхование (ОСГОП, CMR)
- Учёт страховых полисов на груз и ответственность перевозчика.

### 4. Весогабаритный контроль
- Учёт нагрузки по осям, планирование расстановки груза в кузове для избежания штрафов на рамках весогабаритного контроля.

---

## 📊 Ресурсная сводка (обновлено 05.03.2026 12:30)

| Компонент | Sprint 5.8 | Sprint 8 (факт) | Моки/Долги |
|-----------|:---:|:---:|-------------|
| **Архитектура** | 97% | **98%** | +analytics, +import |
| **Бизнес-логика** | 98% | **95%** | sync ✅, fuelNorm ✅, моки интеграций |
| **Безопасность** | 99.5% | **99%** | WS JWT ✅ |
| **Фронтенд** | 88% | **95%** | +analytics UI, +import UI, +client ✅ |
| **Mobile** | 70% | **55%** | sync pull ✅, offline tests 🔴 |
| **GPS** | — | **5%** | 🔴 100% мок |
| **Тесты** | 60% | 60% | |
| **DevOps** | 92% | **93%** | docs ✅ |
| **ЭПД** | 15% | **30%** | XML ✅, ЭДО 🔴 |
| **Analytics** | — | **80%** | API ✅, UI ✅, себестоимость упрощ. |
| **Import** | — | **85%** | API ✅, UI ✅, Excel drag-n-drop 🟡 |
| **ОБЩАЯ** | **~90%** | **~83%** | честная оценка |
