# TransPult — code inventory, 2026-05-23

**Контекст**: сводная карта технического состояния кода TMS «ТрансПульт». Собрана 5 параллельными Explore-агентами по слоям: API modules, API providers, web pages+components, mobile, packages+schema. Дедуплицирована с 6 audit-отчётами от того же числа (security, multi-tenancy, ЭТрН, frontend, perf, ops).

**Цель**: 100% карта того, что нужно сделать в коде до production launch 01.09.2026. **Не план действий** — инвентарь.

**Замечания**:
- Файл `docs/tasks/_audit-2026-05-23.md` из инструкции партнёра — не существовал в репо. Я работал по 6 сегодняшним audit-отчётам, которые в моём контексте, но не выгружены в файл. Если нужна фиксированная база — попроси сначала собрать их в `_audit-2026-05-23.md`, потом этот документ обновлю с привязкой.
- Заявление партнёра «@tms/shared сломан — нет PLAN_IDS, TRIAL_DAYS, rublesToKopecks, classifyOsagoExpiry, PlanFeature, PlanId, formatKopecks» **не подтвердилось**. Все 7 символов экспортируются из `packages/shared/src/billing.ts` и `compliance.ts`, импорты в apps/api и apps/web находят их. Либо устаревший artefact (до rebuild), либо ошибка в исходных данных партнёра.

---

## 1. TL;DR

| Слой | Working | Partial | Stub/Broken | Missing | Dead | Heavy-debt |
|---|---|---|---|---|---|---|
| API modules (35) | 22 | 11 | 1 | 5 features | 0 | 5 files |
| API providers (29) | 2 mock + email/SMTP real | 5 (token mgmt only) | 18 (skeleton/throws) | 3 orphans | 3 | — |
| Web pages (53) | 53 (рендерятся) | 8 (UI готов, API недопилен) | 0 | Phase 2-7 roadmap | 0 | 4 monoliths |
| Web components (50) | 50 | — | — | — | 0 | dup `Combobox`/`combobox` |
| Mobile screens (10) | 8 | 2 | 0 | 0 | — | btoa offlineQueue |
| Packages (1) | shared OK | — | — | — | — | tsbuildinfo в git |

**Что в проде сейчас работает**: API/web/mobile — стабильно. Аутентификация, мультиарендность, demo-данные, основные операционные сценарии (рейсы, заявки, флот, водители, инспекции, биллинг через ЮKassa webhook). Поднимаются healthcheck'и.

**Что в проде работает, но опасно** (STUB-IN-PROD): все боевые провайдеры (signature, EDI, telematics, fuel-card, fines, marking, OFD, OSAGO) — `throw NotImplemented` или mock. `selectAdapter()` возвращает mock даже когда сохранены реальные ключи. Подписи ЭТрН не имеют юр. силы. Wialon-poll возвращает фейк-координаты.

**Что просто падает** (BROKEN): нет ни одного route, который сейчас 500'ит при стандартной нагрузке. Тесты apps/web — 0 unit, 1 advisory e2e. Edge-кейсы (двойной submit, race, large export) не покрыты.

**Какой объём работы до 01.09.2026**: оценка снизу — 12 рабочих недель одним senior backend + 2-3 недели юридической работы параллельно. Подробно в разделе 4.

---

## 2. По слоям

### 2.1. apps/api/src/modules — 35 модулей

**Working (22)**: audit, claims, contractors, copilot (mock-mode), demo, finance, fleet, geo (mock), import (частично с tx-fixes), inspections, mchd, onboarding, operational-core, operations, orders, repair, rto, scoring, settings, sync (только push.created), trips, uploads.

**Partial (11)** — есть routes/service, но недопил:
- `billing` — webhook ЮKassa работает с HMAC, но `Idempotence-Key` использует `nanoid()` вместо `${orderId}:create` (P1, дубликаты при retry)
- `compliance/tachograph` — `ddd-parser.ts:18` heuristic, не валидирует СКЗИ CMAC, `signatureValid` всегда false
- `compliance/marking` — ЦРПТ mock возвращает `productName` при `valid=false` (несоответствие реальному API)
- `compliance/osago` — РСА-AIS SOAP-адаптер скелет
- `compliance/adr` — warn-only (должен блокировать)
- `documents` — есть routes, нет service-слоя
- `edi` — BullMQ mock работает; реальные адаптеры throws
- `integrations` — credentials encryption работает, но registry не инстанцирует real adapters (A-P0-4)
- `notifications` — Telegram OK; email/SMS-провайдеры нет
- `signatures` — Госключ deeplink собирается локально, реальный OAuth Госуслуг — нет; 3 других провайдера-скелеты
- `waybills` — core OK, ЭТрН-генератор пишет ФНС-нестандартные имена тегов

**Stub/Broken (1)**: `sprint9` — legacy, частично superseded by fleet+operational-core, висит для backward compat.

**Missing features** (обещано roadmap, не начато):
- Phase 2.4 — Tachograph DDD upload (есть только heuristic парсер)
- Phase 2.6 — 1С CommerceML two-way import (есть только export)
- Phase 4 — Repair inventory / stock / procurement
- Phase 4 — Cargo insurance per-shipment
- Phase 5 — Self-serve plan upgrade/downgrade UI

**Без тестов (✗test)**: geo, mchd, notifications, operations, settings, sync, uploads — 7 модулей.

**Heavy-debt files**:
- `apps/api/src/modules/trips/transport-documents.ts` — 1610 LOC
- `apps/api/src/modules/fleet/service.ts` — 1410 LOC
- `apps/api/src/modules/inspections/service.ts` — 1247 LOC
- `apps/api/src/modules/trips/transport-documents-store.ts` — 1143 LOC
- `apps/api/src/modules/finance/finance.service.ts` — 1070 LOC

### 2.2. apps/api/src/providers — 29 провайдеров

| Категория | Real | Stub/Skeleton | Throws | Mock |
|---|---|---|---|---|
| signature (5) | — | gosklyuch (deeplink only) | kontur_sign, sbis_sign, cadesplugin | mock |
| edi (5) | — | — | diadoc, kontur, sbis | mock + setTimeout legacy |
| telematics (4) | — | wialon (token), omnicomm (token), glonasssoft (token) | — | mock |
| fuel-card (5) | — | gazpromneft, lukoil, rosneft (OAuth), csv-import (no routes) | — | mock |
| fines (4) | — | gibdd, autocode, fssp | — | mock |
| payment (4) | yookassa HTTP+HMAC (webhook only) | tinkoff (sign logic), cloudpayments | — | mock |
| marking (2) | — | crpt (есть public verify, но шлёт OMS token зря) | — | mock |
| ofd (4) | — | ofd_ru | — | mock; **platforma_ofd, taxcom_kassa — orphans (export нет файла)** |
| osago (2) | — | rsa (вне основного registry) | — | mock |
| email (3) | smtp (cached, gated `SMTP_HOST`) | — | — | console; **unisender — orphan** |

**`providers/index.ts` real-factory registry**: gosklyuch, diadoc, wialon, omnicomm, glonasssoft, crpt, yookassa, mailru_smtp, smtp. Остальные `selectAdapter('foo', ...)` всегда возвращает mock.

**Worker hardcode (A-P1-9)**: `wialon.worker.ts` всегда зовёт WialonMock, не пробует real adapter даже когда creds активны.

**Effort estimates до production** (если есть sandbox-creds):
- Yookassa HMAC validate: S (≤1 день, код есть)
- Госключ sign + verify: M (3 дня), плюс получение sandbox через ЕСИА — недели календарно
- Diadoc send + getStatus: L (5 дней + sandbox)
- Wialon real positions + vehicles: M (5 дней)
- SBIS/Kontur EDI: L (5 дней каждый + sandbox)
- Fuel cards (Gazprom/Lukoil/Rosneft): L (7 дней + корпоративные контракты)
- Fines (GIBDD/Autocode): M (3 дня + API keys через api-cloud.ru)
- CRPT marking: S (2 дня — есть public endpoint)
- OFD.ru fiscal: M (3 дня)

**Итого**: ~8 недель календарных, если sandbox-доступы идут параллельно.

### 2.3. apps/web — 53 страницы + 50 компонентов

**Working (53)**: все страницы рендерятся, fetch'ат данные, отображают UI. Включая 8 print-страниц с кириллицей.

**Partial — UI готов, API недопилен**:
- `/billing` — paymentMethod не exposed, нет self-serve setup-intent flow
- `/tariffs` — public-display only, кнопка "Coming soon" disabled
- `/admin/demo` — UI ok, но mocks всегда возвращаются вместо real keys (A-P0-4)
- `/admin/integrations` — UI для credentials есть, но real adapter не инстанцируется (A-P0-4)
- `/mechanic`, `/medic` — минимальные stub UI, workflows не интегрированы целиком
- `/admin/checklists` — CRUD работает, inspection approval использует append-only trigger
- `/repair` — RepairKanban.tsx (1397 LOC) deprecated, висит до миграции на generic `<KanbanBoard>`
- `/dispatcher` — 4 live-loop (WS + 30s poll + 60s cold-chain + 15m Wialon) без `visibilitychange` gate (P1-15, battery drain)

**Hardcoded test data** — 8 print-страниц (`/print/{act,invoice,ttn,etrn,claim-act,cancellation-act,signature-refusal,waybill}`) используют fallback `CARRIER.inn = "7701234567"` когда env unset. **Замена на `process.env.NEXT_PUBLIC_CARRIER_INN || 'НЕ УСТАНОВЛЕНО'` + fail loud — 1-line fix.**

**Дубль файла**: `apps/web/src/components/ui/Combobox.tsx` — реальный файл. `combobox.tsx` (lowercase) **не существует**, но test-файл назван `combobox.test.tsx`. Импорты используют `Combobox`. На case-sensitive FS (Linux CI) — потенциальный foot-gun, но сейчас не ломается.

**Monoliths**:
- `apps/web/src/app/trips/page.tsx` — 3263 LOC, 46 `any`
- `apps/web/src/app/waybills/page.tsx` — 1610 LOC, 22 `any`
- `apps/web/src/app/dispatcher/page.tsx` — 990 LOC
- `apps/web/src/app/finance/page.tsx` — 420 LOC

**Promised-not-delivered** (roadmap Phase 2-7):
- Phase 2: Signature provider abstraction (4 real adapters), DaData live, Diadoc EDI, Tachograph DDD, Wialon live, 1С CommerceML
- Phase 3: Self-serve onboarding integrations cabinet (UI есть, flow real нет)
- Phase 4: Compliance breadth (marking real API, OSAGO RSA real, ADR enforcement, EDI operators)
- Phase 5: Self-serve plan up/downgrade, paymentMethod UI
- Phase 7: Copilot production polish (export restrictions, cost dashboard, hallucination tests, YandexGPT/GigaChat fallback)

**Тесты**: 0 unit (Jest/Vitest), 1 Playwright e2e scaffold (4 soft-asserted, CI-advisory).

### 2.4. apps/mobile — 10 экранов

**Working (8)**: LoginScreen, TripListScreen, CheckpointScreen, TripCompletionScreen, DeliveryConfirmationScreen, MechanicInspectionScreen, MyWaybillScreen, MyHoursScreen, TemperatureLogScreen.

**Partial (2)**: TripDetailsScreen — TODO в коде, не прочитан полностью. CheckpointScreen — hardcoded `GPS ±5 м` (A-P1-19, не запрашивает реальную локацию).

**Critical gaps до mobile-pilot**:
- **A-P0-11** (Mobile sync) — `pushChanges` отправляет только `events.created`; `updated`/`deleted` игнорируются. Нет tombstones, нет `migrations.ts` → install v2 schema break.
- **A-P2-88** — JWT в URL PDF (`waybills.ts:90-94`), утечка через Referer/share-sheet/системные логи. **P0 security.**
- **A-P1-19** — fake GPS pill в CheckpointScreen
- **A-P1-22** — MyWaybillScreen/MyHoursScreen/MechanicInspectionScreen без offline cache
- **A-P1-18** — нет центрального authFetch с 401-handler. На любой 401 в фоне — silent logout.
- **app.json**: нет `eas.json` (P0-5) → нет build-профилей для EAS.

**Offline queue**: работает, но хранит payloads в AsyncStorage с btoa-obfuscation (не encryption), нет deduplication после replay, photo upload retry может fail.

**Тесты**: Jest установлен, есть 10+ test-файлов (auth, offlineQueue, sync, upload, LoginScreen, TripListScreen, ...). CI gate — `continue-on-error: true`, мобильные регрессии не блокируют merge.

### 2.5. packages/* + schema

**packages/shared** — единственный пакет, **ОК**. Все 7 символов из заявления партнёра экспортируются:

| Symbol | Location | Status |
|---|---|---|
| `PLAN_IDS` | `packages/shared/src/billing.ts:8` | ✅ |
| `TRIAL_DAYS` | `billing.ts:130` | ✅ |
| `rublesToKopecks` | `billing.ts:133` | ✅ |
| `formatKopecks` | `billing.ts:143` | ✅ |
| `classifyOsagoExpiry` | `compliance.ts` | ✅ |
| `PlanFeature` | `billing.ts:24` (type) | ✅ |
| `PlanId` | `billing.ts:6` (type) | ✅ |

**Schema** — 65 таблиц, drizzle config корректен. Нет неиспользуемых таблиц. ~15 jsonb-колонок без строгой Zod-валидации (P2 hygiene). Drizzle relations объявлены частично.

**Git tech-debt**: `apps/web/tsconfig.tsbuildinfo` закоммичен. Добавить `**/*.tsbuildinfo` в `.gitignore` + один `git rm --cached`.

---

## 3. Сквозные категории

### 3.1. BROKEN — что сейчас падает или badly works

| # | Где | Что |
|---|---|---|
| B1 | apps/api/src/integrations | `selectAdapter()` возвращает mock даже для активных credentials (A-P0-4). Клиент платит за интеграции, получает mock |
| B2 | wialon.worker.ts | Хардкодит WialonMock, не пробует real |
| B3 | apps/api/src/modules/sync | push игнорирует updated/deleted. Нет tombstones. Нет migrations.ts |
| B4 | apps/web/src/lib/api.ts | 401 → toast «Ошибка запроса HTTP 401», нет редиректа на /login |
| B5 | apps/mobile/src/context/AuthContext.tsx | Нет centralized 401-handler. На expired token в фоне — silent logout |
| B6 | apps/web/src/app/trips/page.tsx | Limit=100 захардкожен, нет пагинации — клиент не видит свой архив >100 рейсов |
| B7 | apps/api/src/modules/billing | `Idempotence-Key=nanoid()` вместо `${orderId}:create` — дубликаты платежей при retry |
| B8 | apps/api/src/auth/auth.ts:1183 | Signup может переписать passwordHash unverified user — security P0 (account takeover) |
| B9 | apps/api/src/modules/notifications/routes.ts:38 | `/start <userId>` Telegram — любой подписывается на чужие уведомления |
| B10 | apps/api/src/modules/edi/routes.ts:142 | Webhook unauthenticated, логирует full body — log poisoning + spoofing |
| B11 | docker-compose.prod.yml | Webhook HMAC `request.rawBody` — `fastify-raw-body` не зарегистрирован → все ЮKassa events fail closed |

### 3.2. STUB-IN-PROD — работает на mock, опасно с реальным клиентом

- **Все 4 signature-провайдера** (gosklyuch sign — stub deeplink, остальные — throws). Подписи ЭТрН без юридической силы.
- **Все 3 real EDI-провайдера** (diadoc/sbis/kontur sendDocument — throws). Документ никуда не уезжает.
- **Все 3 telematics** (wialon/omnicomm/glonasssoft positions/vehicles — throws/stub). GPS — фейк-координаты от mock.
- **Все 3 fuel-card** (gazpromneft/lukoil/rosneft) — stubs.
- **Все 3 fines** (gibdd/autocode/fssp) — stubs.
- **CRPT marking** — отправляет OMS token на public endpoint впустую.
- **OSAGO RSA** — вне основного registry, hardcoded `healthCheck: false`.
- **ЦРПТ marking mock** возвращает productName на invalid=false (расхождение с реальным API).
- **Tachograph DDD** — heuristic парсер, `signatureValid=false` всегда.
- **ETrN XML генератор** — пишет `<Отправитель>` вместо `<Грузоотправитель>` (ФНС-словарь). Diadoc отвергнет 100%. T01 в windows-1251, остальные в UTF-8.

### 3.3. PROMISED-NOT-DELIVERED

Полная таблица в разделе 2.3. Сводно:
- **Phase 2 целиком** (real providers across all categories) — не начато.
- **Phase 4** — compliance breadth real APIs.
- **Phase 5** — self-serve billing (upgrade, downgrade, paymentMethod).
- **Phase 7** — Copilot production polish, secondary LLM fallback.
- **Mobile pilot scenarios** — частично: signature refusal только через damaged-condition; нет «отказа в расписке» как отдельного сценария.

### 3.4. DEAD-CODE

- `apps/api/src/providers/email/unisender.ts` — экспортируется, не используется.
- `apps/api/src/providers/ofd/{platforma_ofd,taxcom_kassa}.ts` — orphans (export но файлов нет/пусто).
- `apps/api/src/providers/fuel-card/csv-import.ts` — есть, но routes не подключены.
- `apps/web/src/components/RepairKanban.tsx` — 1397 LOC, deprecated, помечен заменой на `<KanbanBoard>`.
- `apps/web/src/components/ui/error-boundary.tsx` — нигде не импортируется.
- `apps/api/src/modules/sprint9/*` — legacy, parallel to fleet + operational-core.

### 3.5. PARTIAL (с оценкой % готовности)

- ЭТрН pipeline: 60% (validation gate, callback, pendingSignatures есть; реальные провайдеры — нет; ФНС-словарь — нет)
- МЧД registry: 70% (CRUD + find-for-signer; нет revocation check ФНС, нет parent_mchd, неполный паспорт поверенного, scope = свободный текст)
- Mobile offline sync: 40% (push.created work, updated/deleted skipped, no tombstones, no migrations)
- Self-serve billing: 50% (webhook + plan-guard работают; нет self-serve upgrade/downgrade UI, paymentMethod не exposed)
- Provider integrations cabinet: 50% (UI credentials есть, шифруются; backend `selectAdapter` всегда returns mock)
- Copilot: 30% (10 tools MVP, SSE; нет prod polish, нет cost-dashboard, нет hallucination tests, нет secondary LLM)
- 1С interop: 20% (export через finance/1c работает, импорт CommerceML — не начат)
- Compliance breadth: 30% (UI shells для marking/OSAGO/ADR; real APIs — нет)

### 3.6. HEAVY-DEBT — работает, но кричит на refactor

Backend files >1000 LOC: 5 (см. 2.1).
Frontend files >1500 LOC: 2 (trips/page.tsx 3263, waybills/page.tsx 1610).
107 `'use client'` файлов в apps/web — Server Components недоиспользованы.
68 `any` типов в trips+waybills.
0 unit-тестов для React-компонентов.

---

## 4. Effort estimate до 01.09.2026

**Сегодня → 01.09.2026** = ~14 рабочих недель. План снизу (один senior backend + 2 недели юр-работы параллельно):

### КРИТИЧНО — без чего нельзя запускаться

| # | Задача | Effort |
|---|---|---|
| 1 | Provider registry — `selectAdapter` инстанцирует real adapters (A-P0-4) | 1 нед |
| 2 | ЭТрН XML генератор → ФНС-словарь (`<Грузоотправитель>` etc) | 1 нед |
| 3 | Подключить **хотя бы один** EDI-оператор (Diadoc) с sandbox | 1-2 нед + sandbox-доступ |
| 4 | Госключ real sign + retrieve через ЕСИА | 2 нед + sandbox |
| 5 | xmllint-wasm + реальные XSD ФНС | 3 дня |
| 6 | МЧД-расширение (granter cert serial, parent_mchd, scope codes, паспорт), revocation check cron | 1 нед |
| 7 | Signup hijack closure (auth.ts:1183) + Telegram bot identity-stealing + EDI webhook auth | 3 дня |
| 8 | Mobile JWT в URL PDF → Authorization header | 2 дня |
| 9 | Performance P0 (statement_timeout, dossier consolidate, PDF в worker, vehicle_positions retention, pool tune) | 1 нед |
| 10 | DB tx wrapping (signup, gosklyuch-callback, /incidents/PUT, lot allocation) | 3 дня |
| 11 | CASCADE→RESTRICT для mchd, events (audit retention) | 1 день |
| 12 | Idempotence-Key fix в ЮKassa + fastify-raw-body registration | 1 день |
| 13 | 152-ФЗ: signup consent чекбокс + soft-delete users/drivers + Roskomnadzor notice | 2 нед (1 код, 1 юр) |
| 14 | Rollback-prod.sh fix (/opt/transpult + MinIO + git tag rollback) + DR-drill verified once | 3 дня |
| 15 | Backup encryption (gpg -c AES256, off-host key) | 1 день |
| 16 | Внешний uptime monitoring (Healthchecks.io + Telegram alert на BardinGD) | 1 день |
| 17 | Mobile sync tombstones + migrations.ts | 1 нед |
| 18 | Frontend 401 → /login redirect + BroadcastChannel multi-tab logout | 2 дня |
| 19 | Pre-pilot SLA-документ + customer-onboarding.md | 3 дня (Jurist + PM) |

**Сумма критичного**: ~10-11 недель чистого backend + 2 недели юр-работы. Запас тонкий.

### ЖЕЛАТЕЛЬНО — улучшит, не блокер

- 2-3 ещё EDI-оператора (SBIS, Kontur) — клиент выбора
- Wialon real positions/vehicles
- Tachograph DDD real parser с CMAC
- Self-serve billing UI (upgrade/downgrade)
- Trips/waybills monolith split на feature-folders
- 24/7 monitoring stack (Prometheus + Grafana)
- READ-audit для PII
- BroadcastChannel auth sync

### ОТЛОЖИТЬ post-launch

- Phase 7 Copilot production polish
- Fuel-cards real (нужны контракты)
- Fines real (api-cloud.ru contract)
- Marking real (CRPT)
- OFD real (54-ФЗ — нужно только если приём от физлиц)
- 1С CommerceML two-way import
- Mobile push (FCM/APNS)
- App refactor (React Server Components, react-query, code-split)
- Multi-instance scaling (WebSocket в Redis, sticky LB)

---

## 5. Что не TransPult-домен

Передать в соответствующие роли (по списку партнёра «7 ролей»):

- **/jurist**: 152-ФЗ signup consent text + локальный нормативный акт + уведомление РКН + DPO email + право на удаление SOP + SLA-договор пилотный + ЭТрН-юр-сила без real оператора (что писать клиенту в договоре)
- **/pm**: приоретизация 19 critical items на 14 недель (что параллелится, что блокирует, sandbox sequencing — Диадок/Госключ заявки занимают недели календарно)
- **/desing**: UI для 401-handler (toast vs redirect UX), баннер «организация без интеграций — работаете в demo-режиме» для STUB-IN-PROD периода, mobile EAS build profiles
- **/qa**: 0 unit-тестов для apps/web — нужна стратегия (Vitest + RTL minimum)
- **/devops**: rollback-prod.sh, DR-drill, backup encryption, external uptime monitor — кто owner-ит и поддерживает
- **/marketing**: roadmap.md vs landing — синхронизация (что мы реально продаём в pilot)

---

## 6. Confidence

- **HIGH confidence** в инвентаре providers, modules, packages — прочитаны исходники.
- **MEDIUM** в web pages — много страниц, breadth-focus.
- **MEDIUM** в mobile — TripDetailsScreen не прочитан до конца агентом.
- **LOW** в effort estimates — без знания sandbox-availability (Диадок/Госключ — могут затянуться календарно вне нашего контроля).

Документ — снимок состояния на 2026-05-23. После любых крупных коммитов — пересматривать.
