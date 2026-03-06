# Roadmap GPT Audit (3-Status Model)

> Дата аудита: 6 марта 2026
> Источник: `docs/roadmap.md`
> Статусы: `Implemented` (код есть), `Configured` (интеграция/ключи/домен), `Verified` (проверено тестом/прогоном)
> Обозначения: `✅ да`, `⚠️ частично`, `❌ нет`, `❓ не проверено`, `— не применимо`

## Факт прогона тестов (06.03.2026)
- Workspaces tests: **279 total / 253 passed / 26 failed** (7 файлов с падениями)

# 🗺️ Радар проекта TMS (Transport Management System)

> **Статус проекта:** ✅ Sprint 8 (частично) → моки/долги в бэклоге
> **Дата обновления:** 5 марта 2026 г.
> **Архитектура:** Monorepo (pnpm workspaces), Fastify + Drizzle, Next.js + shadcn/ui, React Native (Expo)
> **Тесты:** 279+ unit-тестов (100% pass rate)
> **Аудит:** 3 GPT-аудита — все CRIT/HIGH закрыты ✅
> **Готовность к MVP:** ~80% (backend ✅, frontend ✅, devops ✅, security ✅, GPS/интеграции 🔴)

---

## 📅 Спринт 1: Фундамент и Базовая Логика
- **Статус:** ✅ Завершён | **Агенты:** 0, 1, 2, 3, 4, 5 | Implemented: ✅ | Configured: — | Verified: ❓

- [x] Монорепо, PostgreSQL, Redis, JWT, RBAC (10 ролей), Event Journal (152-ФЗ) | Implemented: ✅ | Configured: — | Verified: ❓
- [x] Заявки + Рейсы (стейт-машины), Осмотры (чеклисты), Путевые листы | Implemented: ✅ | Configured: — | Verified: ❓
- [x] Автопарк (CRUD), Ремонты (Канбан), Мобилка водителя (offline-first) | Implemented: ✅ | Configured: — | Verified: ❓
- [x] Тарификация (7 модификаторов), Финансы, KPI (Recharts) | Implemented: ✅ | Configured: — | Verified: ❓

## 🛠️ Спринт 2 + 2.5: Интеграция и Хардеринг
- **Статус:** ✅ Завершён | **Агенты:** 6, 7 | Implemented: ✅ | Configured: — | Verified: ❓

- [x] E2E интеграция, оффлайн-синхронизация, картография (Leaflet) | Implemented: ✅ | Configured: — | Verified: ❓
- [x] Аудит 55 находок → 8/8 CRITICAL ✅, 16/21 HIGH ✅ | Implemented: ✅ | Configured: — | Verified: ❓
- [x] JWT fail-fast, transactions, N+1 JOIN, FOR UPDATE, Helmet, RBAC Contractor | Implemented: ✅ | Configured: — | Verified: ❓

## 🧪 QA: 167+ тестов
- **Статус:** ✅ | **Агент:** 10 | Implemented: ✅ | Configured: — | Verified: ❓

- [x] 11 файлов: auth, orders, trips, inspections, waybills, fleet, finance, sync, repairs, e2e, geo, xml | Implemented: ✅ | Configured: — | Verified: ❓
- [x] Стейт-машины, 152-ФЗ, тарификация math, integration mocks | Implemented: ⚠️ | Configured: ❌ | Verified: ❓

## 🔌 Спринт 3: Телематика & Интеграции
- **Статус:** ✅ Завершён | **Агенты:** 8, 9 | Implemented: ✅ | Configured: — | Verified: ❓

- [x] BullMQ + Redis, mock Wialon/ГИБДД/DaData/АЗС, auto-enrich контрагентов ⚠️ **ВСЕ 4 интеграции на моках** — нет реальных API | Implemented: ⚠️ | Configured: ❌ | Verified: ❓
- [x] 1С XML (CommerceML 2.10), геокодинг, Haversine, Leaflet маршруты | Implemented: ✅ | Configured: — | Verified: ❓

---

## ✅ Спринт 4.1: Frontend MVP (Волна 1)
- **Статус:** ✅ Завершён | **Агенты:** 0, 1, 2, 5 | **Дата:** 4 марта 2026 | Implemented: ✅ | Configured: — | Verified: ❓

- [x] Агент 1: Логист — убраны fallback моки, CreateTripModal, timeline из API, trip details | Implemented: ⚠️ | Configured: ❌ | Verified: ❓
- [x] Агент 2: Путевые листы (/waybills), Sidebar role filtering (H-16), UserContext ⚠️ **Waybills таблица: UUID вместо госномера/ФИО** | Implemented: ✅ | Configured: — | Verified: ❓
- [x] Агент 5: Finance → live API, KPI → live API, экспорт 1С XML, страница тарифов ⚠️ **KPI: fallback «Смирнов/Козлов» если нет данных** | Implemented: ✅ | Configured: — | Verified: ❓
- [x] Агент 0: Pool таймауты, FOR UPDATE в транзакциях, триггеры при старте сервера | Implemented: ✅ | Configured: — | Verified: ❓

## ✅ Спринт 4.2: Security Sprint (Волна 2)
- **Статус:** ✅ Завершён | **Агент:** 6 | **Дата:** 4 марта 2026 | Implemented: ✅ | Configured: — | Verified: ❓

- [x] JWT → httpOnly cookie + Bearer fallback для мобилки | Implemented: ✅ | Configured: — | Verified: ❓
- [x] N+1 → `calculateBatchTripCosts()` (2 запроса вместо N) | Implemented: ✅ | Configured: — | Verified: ❓
- [x] RLS — driver видит только свои рейсы/путевые листы | Implemented: ✅ | Configured: — | Verified: ❓
- [x] Zod-валидация в 11 route handlers (fleet, repairs, trips) | Implemented: ✅ | Configured: — | Verified: ❓
- [x] CORS multi-origin + credentials | Implemented: ✅ | Configured: — | Verified: ❓

---

## 🚀 Спринт 5: DevOps + ЭПД Ресёрч (MVP Launch)
- **Статус:** ✅ Завершён | **Сроки:** 4 марта 2026 | Implemented: ✅ | Configured: — | Verified: ❓
**Агенты:** 0 (DevOps), 2 (Admin Panel), 8 (ЭПД Ресёрч), 10 (QA)
**Результат:** 279 тестов / 18 файлов / 100% pass / 3.46s

### DevOps ✅
- [x] Dockerfile api (multi-stage, non-root) + Dockerfile web (Next.js standalone) | Implemented: ✅ | Configured: — | Verified: ❓
- [x] docker-compose.prod.yml (PostgreSQL 16 + Redis 7 + API + Web) | Implemented: ✅ | Configured: — | Verified: ❓
- [x] CI/CD — `.github/workflows/ci.yml` (lint → test → build) | Implemented: ✅ | Configured: — | Verified: ❓
- [x] `.env.example`, `.dockerignore`, `deploy.sh` | Implemented: ✅ | Configured: — | Verified: ❓
- [x] `next.config.mjs` — `output: 'standalone'` | Implemented: ✅ | Configured: — | Verified: ❓
- [x] `workspace:*` protocol fix в package.json | Implemented: ✅ | Configured: — | Verified: ❓
- [x] Health check endpoint (`/api/health`) | Implemented: ✅ | Configured: — | Verified: ❓
- [ ] SSL/TLS (нужен домен) → Sprint 6 | Implemented: ❌ | Configured: ❌ | Verified: ❓
- [ ] Alerting (мониторинг) → Sprint 6 | Implemented: ❌ | Configured: — | Verified: ❓

### Admin Panel (Агент 2) ✅
- [x] `apps/web/src/app/admin/layout.tsx` — проверка роли admin + боковое меню | Implemented: ✅ | Configured: — | Verified: ✅
- [x] `apps/web/src/app/admin/users/page.tsx` — CRUD пользователей | Implemented: ✅ | Configured: — | Verified: ✅
- [x] `apps/web/src/app/admin/tariffs/page.tsx` — CRUD тарифов | Implemented: ✅ | Configured: — | Verified: ✅
- [x] `apps/web/src/app/admin/checklists/page.tsx` — CRUD шаблонов чек-листов | Implemented: ✅ | Configured: — | Verified: ✅
- [x] 9 API endpoints в `auth.ts` (users/tariffs/checklists CRUD) | Implemented: ✅ | Configured: — | Verified: ❓
- [x] Sidebar: «Настройки» → «Админ-панель» (`/admin/users`) | Implemented: ✅ | Configured: — | Verified: ❓

### ЭПД Ресёрч (Агент 8) ✅
- [x] `docs/epd-research.md` — API ГИС ЭПД, процесс подключения | Implemented: ✅ | Configured: — | Verified: ❓
- [x] `docs/edo-comparison.md` — Диадок vs СБИС vs Контур | Implemented: ✅ | Configured: — | Verified: ❓
- [x] `docs/kep-research.md` — CryptoPro CSP, облачная ЭП, стоимость | Implemented: ✅ | Configured: — | Verified: ❓
- [x] `apps/api/src/modules/waybills/etrn-generator.ts` — прототип ЭТрН XML | Implemented: ✅ | Configured: — | Verified: ✅

### QA (Агент 10) ✅
- [x] `rbac.test.ts` — 46 тестов (RBAC по ролям, driver/mechanic/admin) | Implemented: ✅ | Configured: — | Verified: ✅
- [x] `security.test.ts` — 20 тестов (JWT cookie, rate limit, Zod) | Implemented: ✅ | Configured: — | Verified: ✅
- [x] `regression.test.ts` — 15 тестов (Sprint 4 фиксы, batch costs, FOR UPDATE) | Implemented: ✅ | Configured: — | Verified: ✅
- [x] `etrn-generator.test.ts` — 18 тестов (ЭТрН XML валидация) | Implemented: ✅ | Configured: — | Verified: ✅

### Инфра
- [x] VPS: Timeweb `5.42.102.58` (4 vCPU / Ubuntu 24.04) | Implemented: ✅ | Configured: — | Verified: ❓
- [x] Client RLS: `contractorId` + `organizationId` в таблице users | Implemented: ✅ | Configured: — | Verified: ❓

### Отложено → Sprint 6
- [ ] SSL/TLS (Let's Encrypt — нужен домен) | Implemented: ❌ | Configured: ❌ | Verified: ❓
- [ ] S3/MinIO для файлов (фото осмотров, подписи) | Implemented: ❌ | Configured: — | Verified: ❓
- [ ] Alerting / мониторинг нагрузки | Implemented: ❌ | Configured: — | Verified: ❓

## 🔒 Спринт 5.5: Security & Architecture Audit
- **Статус:** ✅ Завершён | **Дата:** 4 марта 2026 | Implemented: ✅ | Configured: — | Verified: ❓

- [x] user-context.tsx → httpOnly cookies fix (разлогин по F5) | Implemented: ✅ | Configured: — | Verified: ❓
- [x] Next.js middleware.ts (редирект неавторизованных) | Implemented: ✅ | Configured: — | Verified: ❓
- [x] Zod-валидация в API routes, Self-Escalation guard | Implemented: ✅ | Configured: — | Verified: ❓
- [x] Race conditions: транзакции waybills, repairs, routes | Implemented: ✅ | Configured: — | Verified: ❓
- [x] RLS для roles driver и client | Implemented: ✅ | Configured: — | Verified: ❓

## 🛡️ Спринт 5.6: Claude Audit Final Fixes
- **Статус:** ✅ Завершён | **Дата:** 4 марта 2026 | Implemented: ✅ | Configured: — | Verified: ❓
**Результат:** 57/67 аудит-находок подтверждено исправленными

- [x] **S-9**: Удалён dead token code из web `api.ts` → полный переход на httpOnly cookies | Implemented: ✅ | Configured: — | Verified: ❓
- [x] **H-1**: `user-context.tsx` → `api.me()` напрямую (без getToken) | Implemented: ✅ | Configured: — | Verified: ❓
- [x] **H-9**: `computeTripCost()` batch — цены из `process.env` (не hardcode) | Implemented: ✅ | Configured: — | Verified: ❓
- [x] **H-10/H-11**: ContractorsTable debounce 300ms + sync RBAC admin-only | Implemented: ✅ | Configured: — | Verified: ❓
- [x] **H-15/H-16**: Admin self-escalation guard + users пагинация (cap 200) | Implemented: ✅ | Configured: — | Verified: ❓
- [x] **H-17**: medAccessLog — 3 индекса для 152-ФЗ аудита | Implemented: ✅ | Configured: — | Verified: ❓
- [x] **H-20**: GET /waybills/:id — RLS проверка driverId | Implemented: ✅ | Configured: — | Verified: ❓
- [x] **M-2**: Finance export → `credentials:'include'` | Implemented: ✅ | Configured: — | Verified: ❓
- [x] **M-4/M-5**: XSS-защита `escapeHtml` в Leaflet tooltips | Implemented: ✅ | Configured: — | Verified: ❓
- [x] **M-16**: Global Error Boundary (`error.tsx`) | Implemented: ✅ | Configured: — | Verified: ❓
- [x] **M-19–M-23**: Пагинация invoices, batch queries, убраны `as any[]` | Implemented: ✅ | Configured: — | Verified: ❓
- [x] **M-24**: Дедупликация event journal | Implemented: ✅ | Configured: — | Verified: ❓
- 📋 12 пунктов DEFERRED → Sprint 6 (mobile, PostGIS, CRUD модалки, shared types)

## 🔐 Спринт 5.7: GPT Audit Hardening
- **Статус:** ✅ Завершён | **Дата:** 5 марта 2026 | Implemented: ✅ | Configured: — | Verified: ❓
**Источник:** `audits/gpt0503.md` → 15 CRIT/HIGH/MED находок

### Phase 1: Repo Hygiene ✅
- [x] Удалены 5 `.js` дублёров из `apps/api/src/` (auth, connection, schema, seed, triggers) | Implemented: ✅ | Configured: — | Verified: ❓
- [x] `.gitignore` → `apps/api/src/**/*.js` | Implemented: ✅ | Configured: — | Verified: ❓
- [x] Root `test` script: `pnpm -r --if-present test` | Implemented: ✅ | Configured: — | Verified: ✅
- [x] Dockerfiles: `pnpm@9.15.2` (pin) + `--frozen-lockfile` | Implemented: ✅ | Configured: — | Verified: ❓

### Phase 2: Docker/Compose Security ✅
- [x] Закрыты порты Postgres/Redis в `docker-compose.prod.yml` (internal network only) | Implemented: ✅ | Configured: — | Verified: ❓
- [x] Fail-fast секреты `${VAR:?Set VAR}` — нет дефолтных паролей | Implemented: ✅ | Configured: — | Verified: ❓
- [x] Redis auth: `--requirepass` + пароль в `REDIS_URL` | Implemented: ✅ | Configured: — | Verified: ❓
- [x] `.github/workflows/ci.yml` — валидный CI (checkout → build → test → compose validate) | Implemented: ✅ | Configured: — | Verified: ❓

### Phase 3: Security ✅
- [x] Append-only триггер: проверка ВСЕХ полей (`author_role`, `entity_type`, `version`, `offline_created_at`) | Implemented: ✅ | Configured: — | Verified: ❓
- [x] Cookie `secure: true` всегда в production (без зависимости от `HTTPS` env) | Implemented: ✅ | Configured: — | Verified: ❓
- [x] Structured JSON logging в prod (pino-pretty только в dev) | Implemented: ✅ | Configured: — | Verified: ❓

### Phase 4: DB Types ✅
- [x] Денежные поля: `real` → `numeric(12,2).$type<number>()` (21 колонка) | Implemented: ✅ | Configured: — | Verified: ❓
- [x] Координаты: `real` → `doublePrecision` (lat/lon) | Implemented: ✅ | Configured: — | Verified: ❓
- [x] Физические величины: `real` → `doublePrecision` (вес, объём, пробег, топливо) | Implemented: ✅ | Configured: — | Verified: ❓

### Phase 5: Observability ✅
- [x] Readiness endpoint `/api/health/ready` (проверка DB + Redis) | Implemented: ✅ | Configured: — | Verified: ❓
- [x] Correlation header `x-request-id` | Implemented: ✅ | Configured: — | Verified: ❓

### Phase 6: Env Standardization ✅
- [x] `.env.example` — prod шаблон с `REDIS_PASSWORD` | Implemented: ✅ | Configured: — | Verified: ❓
- [x] `.env.local.example` — dev шаблон (пароли синхронизированы с compose) | Implemented: ✅ | Configured: — | Verified: ❓
- [x] `deploy.sh` — автомиграция существующего `.env` (добавление `REDIS_PASSWORD`) | Implemented: ✅ | Configured: — | Verified: ❓

### Bonus: Redis Auth Fix ✅
- [x] `redis.ts` — `testRedisConnection()` передаёт пароль | Implemented: ✅ | Configured: — | Verified: ❓

---

## 🔐 Спринт 5.8: GPT Audit 3 — Post-Fix Deep Audit
- **Статус:** ✅ Завершён | **Дата:** 5 марта 2026 | Implemented: ✅ | Configured: — | Verified: ❓
**Источник:** `audits/gpt0503(3).md` — 8 CRIT/HIGH находок

### CRIT ✅
- [x] Finance IDOR: client видел все invoices → contractor filter + 403 на export | Implemented: ✅ | Configured: — | Verified: ❓
- [x] Fleet PII: driver видел всех водителей → self-only RLS + 403 | Implemented: ✅ | Configured: — | Verified: ❓

### HIGH ✅
- [x] Trips: client видел все trips → filter через orders→contractorId | Implemented: ✅ | Configured: — | Verified: ❓
- [x] System user FK crash → UUID `00000000...` в seed | Implemented: ✅ | Configured: — | Verified: ❓
- [x] Event journal externalId → миграция `ALTER TABLE` на VPS | Implemented: ✅ | Configured: — | Verified: ❓
- [x] Waybill не идемпотентен → check existing + 409 | Implemented: ✅ | Configured: — | Verified: ❓
- [x] Invoice JOIN дубли → `selectDistinct` + query inside tx | Implemented: ✅ | Configured: — | Verified: ❓
- [x] Repair done → available без проверки → агрегация активных ремонтов | Implemented: ✅ | Configured: — | Verified: ❓

---

## 🚀 Спринт 6: Конкурентоспособность + Compliance (MUST)
- **Статус:** ✅ Phase 1-2 завершены | **Сроки:** Март 2026 | Implemented: ✅ | Configured: — | Verified: ❓
**Цель:** Закрыть разрыв с конкурентами (GPS, мобилка, уведомления) + ЭПД first-mover.

### Phase 1: Must-have ✅
- [x] **GPS/ГЛОНАСС real-time** — WS + JWT auth + useVehiclePositions на карте | Implemented: ✅ | Configured: — | Verified: ❓
  - ⚠️ **GPS = 100% мок** (WialonMock) — нужен API ключ Wialon | Implemented: ⚠️ | Configured: ❌ | Verified: ❓
- [x] **Мобильное водителя** — `/sync/pull` endpoint (WatermelonDB, driver RLS) | Implemented: ✅ | Configured: — | Verified: ❓
  - ⚠️ **Offline queue не тестирован** — нет тестов | Implemented: ⚠️ | Configured: ❌ | Verified: ❓
- [x] **Telegram-бот** — 12 типов, BullMQ, webhook routes | Implemented: ✅ | Configured: — | Verified: ❓
  - ⚠️ **Не настроен** — нужен @BotFather → TELEGRAM_BOT_TOKEN | Implemented: ⚠️ | Configured: ❌ | Verified: ❓

### Phase 2: First-mover ✅
- [x] ЭПД MVP — ЭТрН XML (Title 1+4), carrier из `.env`, кнопка «Скачать ЭТрН» | Implemented: ✅ | Configured: — | Verified: ❓
  - ⚠️ **ЭДО не интегрирован** — нужен оператор + КЭП | Implemented: ⚠️ | Configured: ❌ | Verified: ❓
- [x] SSL/TLS — nginx + Let's Encrypt (config ready) | Implemented: ✅ | Configured: ⚠️ | Verified: ❓
  - ⚠️ **Нужен домен** + A-запись | Implemented: ⚠️ | Configured: ❌ | Verified: ❓

### Phase 3: Infrastructure 🟡
- [x] **AddVehicleModal** — полная форма + POST /fleet/vehicles ✅ | Implemented: ✅ | Configured: — | Verified: ❓
- [ ] S3/MinIO для файлов | Implemented: ❌ | Configured: — | Verified: ❓
- [ ] PostGIS для геозон | Implemented: ❌ | Configured: — | Verified: ❓

### ⚠️ Нерешённые долги Sprint 6
- [ ] 🔴 GPS мок → нужен Wialon API   | Implemented: ❌ | Configured: ❌ | Verified: ❓
- [ ] 🔴 Telegram → @BotFather   | Implemented: ❌ | Configured: — | Verified: ❓
- [ ] 🟡 SSL → домен   | Implemented: ❌ | Configured: — | Verified: ❓
- [ ] 🟡 Тесты offline queue   | Implemented: ❌ | Configured: — | Verified: ❓
- [ ] 🟡 ЭДО интеграция   | Implemented: ❌ | Configured: ❌ | Verified: ❓

---

## 🌐 Спринт 7: Рост и Удержание (SHOULD)
- **Статус:** 🔄 Частично | **Обновлено:** 05.03.2026 | Implemented: ✅ | Configured: — | Verified: ❓
**Цель:** Удержание клиентов + конкурентные преимущества.

- [x] **Клиентский портал** `/client` — заявки + счета, стат-карты, sidebar ✅ | Implemented: ✅ | Configured: — | Verified: ✅
  - ✅ Backend RLS фильтрует по `contractorId` | Implemented: ✅ | Configured: — | Verified: ❓
- [x] **Импорт данных** — `POST /import/vehicles|drivers|contractors` (до 200/batch) | Implemented: ✅ | Configured: ⚠️ | Verified: ✅
  - ⚠️ **Drivers** — userId placeholder (нужна привязка к аккаунту) | Implemented: ⚠️ | Configured: — | Verified: ❓
  - ⚠️ **Нет UI** — нужна страница с drag-n-drop Excel | Implemented: ⚠️ | Configured: — | Verified: ❌ (есть /import page, но без Excel drag-n-drop)
- [ ] **Мультитенантность:** `organizationId` middleware | Implemented: ❌ | Configured: — | Verified: ❓
- [ ] **Маршрутизация:** OSRM Docker или Яндекс API | Implemented: ❌ | Configured: — | Verified: ❓
  - ⚠️ Нужен OSRM (2-3 GB RAM) или API ключ | Implemented: ⚠️ | Configured: — | Verified: ❓
- [ ] **Топливные карты** — нужны API ключи АЗС | Implemented: ❌ | Configured: — | Verified: ❓
- [ ] **Платон** — учёт для грузовиков >12т | Implemented: ❌ | Configured: — | Verified: ❓

---

## 🏆 Спринт 8: Enterprise & Killer-фичи (COULD)
- **Статус:** 🔄 Частично | **Обновлено:** 05.03.2026 | Implemented: ✅ | Configured: — | Verified: ❓
**Цель:** Enterprise + уникальные преимущества.

- [x] **Предиктивное ТО** `GET /analytics/maintenance-alerts` | Implemented: ✅ | Configured: ⚠️ | Verified: ✅
  - ✅ Дата: ТО/ОСАГО/техосмотр/тахограф (critical <7д, warning <30д) | Implemented: ✅ | Configured: — | Verified: ❓
  - ✅ Одометр: предупреждение за 2000 км | Implemented: ✅ | Configured: — | Verified: ❓
  - ✅ **UI дашборд** `/analytics` — таблица + стат-карты | Implemented: ✅ | Configured: — | Verified: ❓
- [x] **Маржинальность** `GET /analytics/profitability` | Implemented: ✅ | Configured: ⚠️ | Verified: ✅
  - ✅ Revenue vs Cost, % маржи, summary | Implemented: ✅ | Configured: — | Verified: ❓
  - ✅ **UI дашборд** `/analytics` — таблица + margin bars | Implemented: ✅ | Configured: — | Verified: ❓
  - ⚠️ **Себестоимость упрощена** — не из tarification.service | Implemented: ⚠️ | Configured: — | Verified: ❓
- [x] **Open API / Swagger** — `/api/docs` (русский UI, OAS 3.0, 14 тегов) | Implemented: ✅ | Configured: ⚠️ | Verified: ✅
- [ ] **White-label** | Implemented: ❌ | Configured: — | Verified: ❓
- [ ] **Telegram трекинг** — нужен настроенный бот | Implemented: ❌ | Configured: — | Verified: ❓
- [ ] **Экодрайвинг** — нужны реальные GPS | Implemented: ❌ | Configured: — | Verified: ❓

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

## Ключевые расхождения
- Тесты в шапке roadmap заявлены как 100% pass, но текущий прогон 06.03.2026 показывает 253/279.
- Import: в Sprint 7 есть пункт "Нет UI", но в сводке указано "UI ✅".
- Sprint 6 отмечен как завершенный по фазам, но operational config по внешним интеграциям не завершен (Wialon, Telegram, domain/SSL, ЭДО).
