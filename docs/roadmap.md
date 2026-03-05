# 🗺️ Радар проекта TMS (Transport Management System)

> **Статус проекта:** ✅ Sprint 5.6 завершён (Security Audit Final Fixes)
> **Дата обновления:** 4 марта 2026 г.
> **Архитектура:** Monorepo (pnpm workspaces), Fastify + Drizzle, Next.js + shadcn/ui, React Native (Expo)
> **Тесты:** 279+ unit-тестов (100% pass rate)
> **Аудит:** 57/67 находок закрыто ✅
> **Готовность к MVP:** ~85% (backend ✅, frontend 🟡, devops ✅)

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

- [x] BullMQ + Redis, mock Wialon/ГИБДД/DaData/АЗС, auto-enrich контрагентов
- [x] 1С XML (CommerceML 2.10), геокодинг, Haversine, Leaflet маршруты

---

## ✅ Спринт 4.1: Frontend MVP (Волна 1)
**Статус:** ✅ Завершён | **Агенты:** 0, 1, 2, 5 | **Дата:** 4 марта 2026

- [x] Агент 1: Логист — убраны fallback моки, CreateTripModal, timeline из API, trip details
- [x] Агент 2: Путевые листы (/waybills), Sidebar role filtering (H-16), UserContext
- [x] Агент 5: Finance → live API, KPI → live API, экспорт 1С XML, страница тарифов
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

---

## 🏛️ Спринт 6: ЭПД + Compliance (MUST — без этого не продать)
**Статус:** ⏳ Бэклог | **Сроки:** Апрель–Май 2026
**Цель:** Электронный путевой лист — главное УТП и законодательное требование.

- [ ] Интеграция с ГИС ЭПД (API Минтранса)
- [ ] Формирование ЭТрН в формате ФНС (XML)
- [ ] КЭП подписание через CryptoPro CSP
- [ ] Интеграция ЭДО (Диадок или СБИС — 1 оператор)
- [ ] Уведомления: SMS/push/email (BullMQ каналы)
- [ ] WebSocket/SSE для real-time карты диспетчера
- [ ] S3/MinIO для файлов
- [ ] PostGIS для геозон (МКАД/ТТК/пропуска)
- [ ] **Мультитенантность:** `organizationId` middleware
- [ ] **Deferred audit items:** S-1 (тесты-тавтологии), S-10 (full RLS),
  console.log→fastify.log, CRUD модалки, shared types, join-таблица invoices

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

## 📊 Ресурсная сводка

| Компонент | Sprint 1 | Sprint 2.5 | Sprint 4 | Sprint 5 | Sprint 5.6 |
|-----------|----------|------------|----------|----------|------------|
| **Архитектура** | 85% | 85% | 90% | 95% | 95% |
| **Бизнес-логика** | 75% | 90% | 92% | 95% | 97% |
| **Безопасность** | 30% | 80% | 90% | 95% | **98%** |
| **Фронтенд** | 40% | 45% | 75% | 85% | 88% |
| **Mobile** | 55% | 60% | 60% | 70% | 70% |
| **Тесты** | 15% | 30% | 35% | 60% | 60% |
| **DevOps** | 5% | 5% | 5% | 70% | 80% |
| **Compliance (ЭПД)** | 0% | 0% | 0% | 15% | 15% |
| **ОБЩАЯ** | **45%** | **~55%** | **~70%** | **~80%** | **~85%** |

