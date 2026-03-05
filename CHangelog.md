Агент 0 — Фундамент: Полностью готов и проверен ✅
Что создано
Монорепо (npm workspaces)
d:\Ai\TMS\
├── apps/api/         — Fastify backend (TypeScript)
├── apps/web/         — Next.js frontend (React 19 + Tailwind)
├── packages/shared/  — Zod schemas + enums
├── docker-compose.yml— PostgreSQL 16 + Redis 7
└── .agent/workflows/ — 5 workflows для параллельных агентов
База данных — 22 таблицы
users, contractors, contracts, tariffs, vehicles, drivers, orders, trips, route_points, tech_inspections, med_inspections, waybills, repair_requests, permits, fines, invoices, tachograph_records, restriction_zones, checklist_templates, addresses, events, med_access_log

Верификация ✅
PostgreSQL: localhost:5433 — 22 таблицы, append-only триггеры
Redis: localhost:6379
API: localhost:4000 — health ✅, login ✅ (JWT выдаётся)
Seed: 11 аккаунтов, 5 ТС, 3 контрагента, чек-листы
Тестовые аккаунты (пароль: password123)
Email	Роль
admin@tms.local
Администратор
logist@tms.local
Логист
dispatcher@tms.local
Диспетчер
mechanic@tms.local
Механик
medic@tms.local
Медик
manager@tms.local
Руководитель
accountant@tms.local
Бухгалтер
repair@tms.local
Ремонтная служба
driver1-3@tms.local
Водители
Запуск агентов 1–5
Открой 5 окон Antigravity → в каждом набери:

Окно	Команда
1	/agent-1
2	/agent-2
3	/agent-3
4	/agent-4
5	/agent-5


TMS — Мульти-агентная разработка
[x] Агент 0: Фундамент
 Монорепо (npm workspaces)
 Backend: Fastify + TypeScript
 Frontend: Next.js + Tailwind + sidebar + layout
 PostgreSQL: полная схема БД (20+ таблиц, Drizzle ORM)
 Zod-схемы для всех сущностей (shared package)
 Append-only event journal + SQL-триггеры
 RBAC (CASL, 10 ролей, 152-ФЗ)
 Auth: JWT login/me
 API client (frontend)
 Seed-данные (11 аккаунтов, 5 ТС, 3 контрагента)
 Docker Compose (PostgreSQL + Redis)
 npm install ✅ (281 пакетов)
[x] Агент 1: Заявки + Рейсы
 Backend API для Orders и Trips
 Логика назначения ТС и стейт-машина
 Дашборд логиста (Канбан)
 Дашборд диспетчера (Карта + Таймлайн)
[x] Агент 2: Осмотры + Путевые листы
 Backend API: tech_inspections, med_inspections (152-ФЗ), waybills
 Логика очередей ТС и водителей
 Авто-генерация путевых листов WB-YYYY-NNNNN
 Дашборды Механика и Медика (интерактивные чеклисты)
[x] Агент 3: Автопарк + Ремонты
 Backend API: fleet CRUD (ТС, водители, контрагенты, пропуска, штрафы)
 Модуль ремонтов со стейт-машиной
 Дашборды Автопарка (таблицы) и Ремонтов (Канбан)
 Интеграция светофоров по срокам действия документов
[x] Агент 4: Мобилка водителя
 Инициализация Expo + WatermelonDB (оффлайн-ферст)
 Экраны: Авторизация, Список рейсов, Маршрут, Чекпоинт, Одометр
 Фото груза и подпись на экране (signature-canvas)
 Sync API (append-only) на стороне сервера
[x] Агент 5: Финансы + KPI
 Backend: тарификация, счета, ГСМ-анализ, экспорт 1С
 Дашборд бухгалтера
 KPI Дашборд руководителя (Recharts)
[x] Спринт 2: Интеграция + E2E (Агент 6)
 Бесшовная E2E интеграция (фиксы разрывов данных и Drizzle багов)
 Оффлайн-синхронизация (/api/sync/events)
 Картография (Leaflet + Mock Geocoding)
 Унификация UI/UX (shadcn/ui масштабный рефакторинг)
 Playwright E2E базовые тесты (создание заявки)
[/] Спринт 2.5: Хардеринг по аудиту (55 находок)
 Агент 7: Полный аудит кодобазы (80+ файлов) → 
docs/audit-log.md
 Агент 6: JWT + Rate Limiting + Helmet ✅
 Агент 6: db.transaction() в 12 функциях ✅
 Агент 6: Zod-валидация в 17 роутах (H-4, отложено)
 Агент 6: State Machine валидация (вынесено в @tms/shared) ✅
 Агент 6: RBAC (Contractor subject, Sync ownership check) ✅
 Агент 6: N+1 → JOIN-ы, SELECT FOR UPDATE для номеров ✅
 Агент 6: Sidebar role filtering (H-16, отложено)
 Агент 1: API интеграция логиста/диспетчера (polling 30с/15с, shadcn кнопки) ✅
 Агент 5: Тарификация 7 модификаторов + KPI светофоры + AreaChart ✅
 Агент 4: UUID, фото загрузка, EXPO_PUBLIC_API_URL, Alert.alert ✅
[x] Спринт 3: Телематика и Интеграции (Агенты 8, 9) ✅
 Агент 8: BullMQ + Redis, 4 mock API (Wialon, ГИБДД, DaData, АЗС), 6 эндпоинтов
 Агент 8: Cron: Wialon sync 15мин, ГИБДД sync ежедневно 03:00
 Агент 8: Auto-enrich контрагентов из DaData по ИНН
 Агент 9: 1С XML экспорт (КоммерческаяИнформация 2.10) + 9 тестов
 Агент 9: Геокодинг (словарь РФ) + Haversine + distance matrix + 6 geo эндпоинтов + 20 тестов
 Агент 9: Leaflet маршруты (цветные полилинии по статусу, emoji маркеры)
[x] Тестовая инфраструктура (Агент 0)
 Vitest конфиг + глобальный setup с моками DB
 10 тестовых скелетов (85 тест-кейсов)
 npm scripts: test, test:watch, test:coverage
 Агент 10 (QA) workflow + workspace
[x] Агент 10: Заполнение тестов → 138 тестов ✅ (100% pass, 3.06s)
 JWT_SECRET перенесён в начало setup.ts (до импорта auth)
 Алиас @tms/shared в vitest.config.ts
 Стейт-машина: inspection (не inspection_pending), in_transit (не departed)
 Валидный ИНН (7707049388) для fleet тестов
 11 тест-файлов: auth, orders, trips, inspections, waybills, fleet, finance, sync, repairs, e2e-flow
[x] Спринт 4.1: Frontend MVP (Волна 1) ✅
 Агент 1: Убрал FALLBACK_ORDERS, CreateTripModal, timeline из API, trip details panel
 Агент 2: Экран путевых листов (/waybills), Sidebar role filtering (H-16), UserContext
 Агент 5: Finance → live API, KPI → live API, экспорт 1С XML, тарифы page
 Агент 0: Connection pool таймауты, FOR UPDATE в транзакциях, триггеры при старте
[x] Спринт 4.2: Security Sprint (Волна 2) ✅
 Агент 6: JWT → httpOnly cookie + Bearer fallback для мобилки
 Агент 6: N+1 → calculateBatchTripCosts() (2 запроса вместо N)
 Агент 6: RLS — driver видит только свои рейсы/ПЛ (client deferred — нужна миграция)
 Агент 6: Zod-валидация в 11 handlers (fleet 6, repairs 2, trips 1, +2)
 Агент 6: CORS multi-origin + credentials
 Агент 0: FOR UPDATE race condition fix, trigger application at startup
 Агент 10: RBAC тесты, Playwright E2E (перенесено в Спринт 5)
[x] Спринт 5: DevOps + ЭПД ресёрч (Неделя 1-4) ✅
 Dockerfile api + web (multi-stage)
 docker-compose.prod.yml, CI/CD (GitHub Actions)
 .env.example, .dockerignore, deploy.sh
 Next.js standalone output
 Workspace protocol fix (workspace:*)
 Admin panel: users CRUD, tariffs CRUD, checklists CRUD (Agent 2)
 ЭПД ресёрч: ГИС ЭПД, Диадок/СБИС, ЭТрН XML прототип (Agent 8)
 Client RLS: contractorId + organizationId в users
 Agent 10: RBAC тесты (46), Security тесты (20), Regression (15), ЭТрН (18)
 VPS: Timeweb 5.42.102.58 (4 vCPU / Ubuntu 24.04)
 279 тестов / 18 файлов / 100% pass / 3.46s
[x] Спринт 5.5: Security & Architecture Audit (Критичные правки) ✅
 Ошибка S-6: Fix frontend user-context.tsx httpOnly cookies (разлогин по F5)
 Ошибка M-3: Next.js middleware.ts (автоматический редирект неавторизованных)
 Ошибки S-1/S-2/H-1..H-4: Зод-валидация, Self-Escalation guard
 Ошибки S-3/S-4/S-5: Race conditions транзакции (waybills, repairs, routes)
 Ошибки H-5/H-6: RLS для roles driver и client
[x] Спринт 5.6: Claude Audit Final Fixes ✅ (57/67 аудит-находок закрыто)
 ✅ S-9: Удалены dead setToken/getToken/clearToken из web api.ts → полный httpOnly
 ✅ H-1: user-context.tsx вызывает api.me() напрямую (без getToken)
 ✅ H-2: RepairKanban — добавлен REPAIR_STATE_TRANSITIONS
 ✅ H-9: computeTripCost() batch — цены из process.env (не hardcode)
 ✅ H-10: ContractorsTable — debounce 300ms
 ✅ H-11: Integration sync — RBAC requireRoles(['admin'])
 ✅ H-15: Admin self-escalation guard в PUT /auth/users/:id
 ✅ H-16: GET /auth/users — пагинация LIMIT/OFFSET (cap 200)
 ✅ H-17: medAccessLog — 3 индекса для 152-ФЗ аудита
 ✅ H-20: GET /waybills/:id — RLS проверка driverId
 ✅ M-2: finance export — credentials:'include' вместо сломанного getToken()
 ✅ M-4/M-5: XSS-защита escapeHtml в Leaflet tooltips
 ✅ M-12: Leaflet SSR-совместимый import
 ✅ M-16: Global Error Boundary — error.tsx (Next.js)
 ✅ M-19: Пагинация invoices ?page=&limit=
 ✅ M-20: Batch INSERT access log в inspections
 ✅ M-21: Batch load в checkScheduledMaintenance
 ✅ M-22: Batch load в getExpiringMedCertificates
 ✅ M-23: Убраны as any[] в finance.service.ts
 ✅ M-24: Дедупликация event journal
 📋 DEFERRED → Спринт 6: S-1 (тесты), S-10 (RLS), H-6 (Zod inspections),
 M-6 (console.log), M-7-10 (mobile), M-13 (CRUD модалки),
 M-15 (shared types), M-17 (PostGIS), M-18 (join-таблица)
[ ] Спринт 6: Мультитенантность + Инфра (Неделя 6-8)
 organizationId на 22 таблицах + middleware
 WebSocket/SSE для real-time карты
 S3/MinIO для файлов
 SMS/push уведомления (BullMQ)
 PostGIS для геозон
[ ] Спринт 7: ЭПД полная реализация (Неделя 9-12)
 ГИС ЭПД интеграция
 КЭП подписание (CryptoPro CSP)
 ЭДО интеграция (1 оператор)
 UI: кнопка "Отправить ЭПД"
[ ] Спринт 8: Рост и Enterprise (Неделя 13-20)
 Клиентский портал + трекинг
 Оптимизация маршрутов (OSRM)
 Импорт Excel (онбординг)
 Open API + Webhooks
 White-label
 Telegram Bot