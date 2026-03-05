# 🗺️ Радар проекта TMS (Transport Management System)

> **Статус проекта:** ✅ Sprint 5.8 завершён → Sprint 6 в работе
> **Дата обновления:** 5 марта 2026 г.
> **Архитектура:** Monorepo (pnpm workspaces), Fastify + Drizzle, Next.js + shadcn/ui, React Native (Expo)
> **Тесты:** 279+ unit-тестов (100% pass rate)
> **Аудит:** 3 GPT-аудита — все CRIT/HIGH закрыты ✅
> **Готовность к MVP:** ~90% (backend ✅, frontend 🟡, devops ✅, security ✅)

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
**Статус:** 🔄 В работе | **Сроки:** Март 2026
**Цель:** Закрыть разрыв с конкурентами (GPS, мобилка, уведомления) + ЭПД first-mover.

### Phase 1: Must-have (есть у ВСЕХ конкурентов) 🔴
- [x] **GPS/ГЛОНАСС real-time** — `@fastify/websocket` + `/ws/vehicles` + `useVehiclePositions` hook
  - ⚠️ **GPS = 100% мок** (WialonMock) — нет реального API Wialon/ГЛОНАСС
  - ⚠️ **WebSocket `/ws/vehicles` без аутентификации** — открыт для всех
  - ⚠️ **Hook `useVehiclePositions` не подключён** к DispatcherPage — карта статична
- [x] **Мобильное водителя MVP** — Expo + WatermelonDB + offline queue + trips API
  - ⚠️ **`/sync/pull` endpoint не существует** — WatermelonDB sync не работает
  - ⚠️ **Offline queue не тестирован** — нет тестов, нет UI индикатора
- [x] **Telegram-бот уведомления** — 12 типов событий, BullMQ, webhook routes
  - ⚠️ **Не настроен** — нет токена BotFather, нет TELEGRAM_BOT_TOKEN на VPS

### Phase 2: First-mover advantage 🟠
- [x] ЭПД MVP — ЭТрН API routes (Title 1 + Title 4 XML generation)
  - ⚠️ **Carrier захардкожен** — `ООО «ТМС Логистик»` / `ИНН 7700000000` в коде
- [x] WebSocket/SSE для real-time карты диспетчера *(см. Phase 1 — hook не подключён)*
- [x] SSL/TLS — nginx reverse proxy + Let's Encrypt (config + docs)
  - ⚠️ **Только конфиг** — домен не привязан, сертификат не получен

### Phase 3: Infrastructure 🟡
- [ ] S3/MinIO для файлов (фото осмотров, подписи)
- [ ] PostGIS для геозон (МКАД/ТТК/пропуска)
- [ ] Deferred audit items (console.log→fastify.log, shared types)

### ⚠️ Известные долги (из аудита 05.03.2026)
- [ ] 🔴 Подключить `useVehiclePositions` hook к DispatcherPage
- [ ] 🔴 Добавить JWT auth на WebSocket `/ws/vehicles`
- [ ] 🔴 Создать `/api/sync/pull` + `/api/sync/push` для WatermelonDB
- [ ] 🟡 Вынести carrier данные (ИНН/название) в `.env` / настройки организации
- [ ] 🟡 Убрать fallback данные из KPI (водители «Смирнов/Козлов»)
- [ ] 🟡 Waybills таблица: показать госномер/ФИО вместо UUID
- [ ] 🟡 Кнопка «Добавить ТС» — подключить modal
- [ ] 🟢 Создать бота @BotFather, добавить токен на VPS
- [ ] 🟢 Привязать домен, получить SSL сертификат
- [ ] 🟢 Тесты для offline queue мобилки

---

## 🌐 Спринт 7: Рост и Удержание (SHOULD)
**Статус:** ⏳ Бэклог | **Сроки:** Июнь–Июль 2026
**Цель:** Фичи для удержания клиентов и конкурентных преимуществ.

- [ ] **Мультитенантность:** `organizationId` на всех таблицах + middleware
- [ ] **Клиентский портал:** публичный трекинг по номеру заявки, портал клиента
- [ ] **Оптимизация маршрутов:** OSRM или Яндекс Маршрутизация API
- [ ] **Топливные карты:** Газпромнефть, Лукойл, Роснефть интеграции
- [ ] **Платон:** учёт в себестоимости для грузовиков >12т
- [ ] **Быстрый онбординг:** импорт Excel (ТС, водители, клиенты)

---

## 🏆 Спринт 8: Enterprise & Killer-фичи (COULD)
**Статус:** ⏳ Бэклог | **Сроки:** Август–Сентябрь 2026
**Цель:** Enterprise-уровень и уникальные конкурентные преимущества.

- [ ] **Аналитика:** предупреждение убыточного рейса, аномалии топлива, рейтинг водителей
- [ ] **Open API + Webhooks:** публичный REST API с ключами + вебхуки на события
- [ ] **White-label:** кастомизация бренда для крупных клиентов
- [ ] **Telegram Bot:** трекинг груза, утверждение счетов
- [ ] **Предиктивное ТО:** рекомендация ТО до поломки на основе пробега/даты
- [ ] **Экодрайвинг:** рейтинги водителей по экономии топлива

---

## 📊 Ресурсная сводка (скорректированная после аудита 05.03.2026)

| Компонент | Sprint 5.8 | Sprint 6 (факт) | Комментарий |
|-----------|------------|------------------|-------------|
| **Архитектура** | 97% | 97% | |
| **Бизнес-логика** | 98% | **90%** | sync endpoint нет, моки интеграций |
| **Безопасность** | 99.5% | **95%** | WS без auth |
| **Фронтенд** | 88% | **80%** | WS hook не подключён, кнопки без handler |
| **Mobile** | 70% | **40%** | sync не работает, offline не тестирован |
| **GPS** | — | **5%** | 100% мок |
| **Тесты** | 60% | 60% | |
| **DevOps** | 92% | 92% | |
| **Compliance (ЭПД)** | 15% | **25%** | генератор ✅, carrier hardcode |
| **ОБЩАЯ** | **~90%** | **~70%** | после честного аудита |

